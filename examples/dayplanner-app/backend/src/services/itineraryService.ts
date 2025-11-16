// ============================================================================
// ItineraryService - Core itinerary generation with Azure OpenAI
// ============================================================================
// Uses function calling to integrate weather, events, places, and day context

import { CosmosClient, Container } from '@azure/cosmos';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import {
  Itinerary,
  Activity,
  GenerateItineraryRequest,
  Location,
} from '../types/index.js';
import { WeatherService } from './weatherService.js';
import { EventService } from './eventService.js';
import { PlaceService } from './placeService.js';
import { LocaleService } from './localeService.js';

export class ItineraryService {
  private container: Container;
  private openaiClient: OpenAI;
  private weatherService: WeatherService;
  private eventService: EventService;
  private placeService: PlaceService;
  private localeService: LocaleService;

  constructor(
    cosmosClient: CosmosClient,
    databaseName: string,
    openaiClient: OpenAI,
    weatherService: WeatherService,
    eventService: EventService,
    placeService: PlaceService,
    localeService: LocaleService
  ) {
    this.openaiClient = openaiClient;
    this.weatherService = weatherService;
    this.eventService = eventService;
    this.placeService = placeService;
    this.localeService = localeService;

    // Initialize Cosmos DB container
    const database = cosmosClient.database(databaseName);
    this.container = database.container('itineraries');
  }

  /**
   * Initialize database and containers
   */
  async initialize(): Promise<void> {
    try {
      const database = this.container.database;
      await database.containers.createIfNotExists({
        id: 'itineraries',
        partitionKey: { paths: ['/userId'] },
      });
      console.log('Cosmos DB container initialized');
    } catch (error) {
      console.error('Error initializing Cosmos DB:', error);
    }
  }

  /**
   * Generate new itinerary from user input
   */
  async generateItinerary(request: GenerateItineraryRequest): Promise<Itinerary> {
    console.log('Generating itinerary for user:', request.userId);

    // 1. Detect locale
    const locale = await this.localeService.detectLocale(request.location.lat, request.location.lon);
    console.log('Detected locale:', locale.countryCode);

    // 2. Get day context
    const dayContext = await this.localeService.getDayContext(request.date, locale.countryCode);
    console.log('Day context:', dayContext.dayOfWeek, dayContext.specialConsiderations);

    // 3. Get weather forecast
    const weather = await this.weatherService.getForecast(
      request.location.lat,
      request.location.lon,
      request.date
    );
    console.log('Weather:', weather.condition, `${weather.temperature}°C`);

    // 4. Use AI to generate itinerary with function calling
    const itinerary = await this.generateWithAI(request, locale, dayContext, weather);

    // 5. Save to database
    await this.saveItinerary(itinerary);

    return itinerary;
  }

  /**
   * Generate itinerary using Azure OpenAI with function calling
   */
  private async generateWithAI(
    request: GenerateItineraryRequest,
    locale: any,
    dayContext: any,
    weather: any
  ): Promise<Itinerary> {
    const systemPrompt = `You are Funday, an expert AI activity planner. Create personalized day itineraries based on user preferences, weather, day context, and local events.

Current context:
- Location: ${request.location.address}
- Date: ${request.date.toDateString()} (${dayContext.dayOfWeek})
- Weather: ${weather.condition}, ${weather.temperature}°C
- Day notes: ${dayContext.specialConsiderations.join('; ')}
- Is weekend: ${dayContext.isWeekend}
- Is holiday: ${dayContext.isHoliday}

When creating itineraries:
1. Consider weather for outdoor activities
2. Account for day-specific constraints (Sunday closures, holiday hours)
3. Look for relevant local events
4. Optimize route to minimize travel time
5. Balance activity types
6. Suggest specific venues with details
7. Alert about special considerations proactively

Return a structured itinerary with 4-7 activities.`;

    const userMessage = `User request: "${request.userInput}"

Location: ${request.location.lat}, ${request.location.lon}
Radius: ${request.radius} km
Transport modes: ${request.preferences.transportModes?.join(', ') || 'any'}

Please create a fun day itinerary!`;

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        functions: this.getFunctionDefinitions(request),
        function_call: 'auto',
        temperature: 0.7,
        max_tokens: 2000,
      });

      // Handle function calls
      const message = response.choices[0]?.message;
      if (message?.function_call) {
        await this.handleFunctionCall(message.function_call, request);
        // In a real implementation, continue the conversation with function results
      }

      // For now, generate a basic itinerary structure
      const itinerary: Itinerary = {
        id: uuidv4(),
        userId: request.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        name: `Day Plan - ${request.date.toDateString()}`,
        startLocation: {
          ...request.location,
          locale: locale.countryCode,
          timezone: locale.timezone,
        },
        radius: request.radius,
        date: request.date,
        dayContext,
        preferences: {
          transportModes: request.preferences.transportModes || ['walk'],
          activityTypes: request.preferences.activityTypes || [],
          cuisineTypes: request.preferences.cuisineTypes || [],
          minRating: request.preferences.minRating || 0,
          priceRange: request.preferences.priceRange || [],
          dietary: request.preferences.dietary || [],
          includeEvents: request.preferences.includeEvents !== false,
        },
        activities: await this.generateActivities(request, dayContext, weather),
        weather,
        totalDistance: 0,
        totalDuration: 0,
        status: 'draft',
      };

      // Calculate totals
      this.calculateTotals(itinerary);

      return itinerary;
    } catch (error) {
      console.error('Error in AI generation:', error);
      throw error;
    }
  }

  /**
   * Generate sample activities (simplified for MVP)
   */
  private async generateActivities(
    request: GenerateItineraryRequest,
    dayContext: any,
    weather: any
  ): Promise<Activity[]> {
    const activities: Activity[] = [];

    // Search for places
    const places = await this.placeService.searchPlaces({
      lat: request.location.lat,
      lon: request.location.lon,
      radius: request.radius,
      type: 'restaurant',
    });

    // Search for events
    const events = await this.eventService.searchEvents({
      lat: request.location.lat,
      lon: request.location.lon,
      radius: request.radius,
      date: request.date,
    });

    let currentTime = new Date(request.date);
    currentTime.setHours(10, 0, 0, 0); // Start at 10 AM

    // Add walking activity
    activities.push({
      id: uuidv4(),
      type: 'outdoor',
      name: 'Morning Walk',
      description: 'Start your day with a scenic walk',
      location: {
        lat: request.location.lat + 0.01,
        lon: request.location.lon + 0.01,
        address: 'Nearby park or waterfront',
      },
      startTime: new Date(currentTime),
      duration: 45,
      weatherDependent: true,
    });

    currentTime = new Date(currentTime.getTime() + 45 * 60 * 1000);

    // Add restaurant/cafe
    if (places.length > 0) {
      const place = places[0];
      activities.push({
        id: uuidv4(),
        type: 'dining',
        name: place.name,
        description: 'Enjoy a delicious meal',
        location: place.location,
        startTime: new Date(currentTime),
        duration: 90,
        placeId: place.id,
        rating: place.rating,
        priceLevel: place.priceLevel,
        weatherDependent: false,
      });

      currentTime = new Date(currentTime.getTime() + 90 * 60 * 1000);
    }

    // Add event if available
    if (events.length > 0) {
      const event = events[0];
      activities.push({
        id: uuidv4(),
        type: 'event',
        name: event.name,
        description: event.description,
        location: event.location,
        startTime: event.startDate,
        duration: 120,
        eventId: event.id,
        eventDetails: {
          category: event.category,
          organizer: event.organizer,
          ticketUrl: event.ticketUrl,
          ticketPrice: event.ticketPrice,
          isFixedTime: true,
        },
        weatherDependent: false,
      });
    }

    // Calculate travel between activities
    for (let i = 0; i < activities.length - 1; i++) {
      const from = activities[i].location;
      const to = activities[i + 1].location;
      const distance = this.calculateDistance(from, to);
      
      activities[i].travelToNext = {
        mode: 'walk',
        distance: distance * 1000, // convert to meters
        duration: Math.round((distance / 5) * 60), // 5 km/h walking speed
      };
    }

    return activities;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(loc1: Location, loc2: Location): number {
    const R = 6371; // Earth radius in km
    const dLat = this.deg2rad(loc2.lat - loc1.lat);
    const dLon = this.deg2rad(loc2.lon - loc1.lon);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(loc1.lat)) *
        Math.cos(this.deg2rad(loc2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Calculate total distance and duration
   */
  private calculateTotals(itinerary: Itinerary): void {
    let totalDistance = 0;
    let totalDuration = 0;

    for (const activity of itinerary.activities) {
      totalDuration += activity.duration;
      if (activity.travelToNext) {
        totalDistance += activity.travelToNext.distance;
        totalDuration += activity.travelToNext.duration;
      }
    }

    itinerary.totalDistance = totalDistance;
    itinerary.totalDuration = totalDuration;
  }

  /**
   * Function definitions for AI
   */
  private getFunctionDefinitions(request: GenerateItineraryRequest): any[] {
    return [
      {
        name: 'search_events',
        description: 'Search for local events on the specified date',
        parameters: {
          type: 'object',
          properties: {
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Event categories: music, festivals, food, sports, etc.',
            },
          },
        },
      },
      {
        name: 'search_places',
        description: 'Search for restaurants, cafes, attractions',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Place type: restaurant, cafe, museum, park, etc.',
            },
            query: {
              type: 'string',
              description: 'Search query',
            },
          },
        },
      },
    ];
  }

  /**
   * Handle AI function calls
   */
  private async handleFunctionCall(functionCall: any, request: GenerateItineraryRequest): Promise<any> {
    const name = functionCall.name;
    const args = JSON.parse(functionCall.arguments);

    console.log(`AI called function: ${name}`, args);

    switch (name) {
      case 'search_events':
        return await this.eventService.searchEvents({
          lat: request.location.lat,
          lon: request.location.lon,
          radius: request.radius,
          date: request.date,
          categories: args.categories,
        });
      
      case 'search_places':
        return await this.placeService.searchPlaces({
          lat: request.location.lat,
          lon: request.location.lon,
          radius: request.radius,
          type: args.type,
          query: args.query,
        });

      default:
        return null;
    }
  }

  /**
   * Save itinerary to Cosmos DB
   */
  private async saveItinerary(itinerary: Itinerary): Promise<void> {
    try {
      await this.container.items.create(itinerary);
      console.log('Itinerary saved:', itinerary.id);
    } catch (error) {
      console.error('Error saving itinerary:', error);
      throw error;
    }
  }

  /**
   * Get itinerary by ID
   */
  async getItinerary(userId: string, itineraryId: string): Promise<Itinerary | null> {
    try {
      const { resource } = await this.container.item(itineraryId, userId).read<Itinerary>();
      return resource || null;
    } catch (error) {
      console.error('Error getting itinerary:', error);
      return null;
    }
  }

  /**
   * Update itinerary
   */
  async updateItinerary(userId: string, itineraryId: string, updates: Partial<Itinerary>): Promise<Itinerary> {
    try {
      const existing = await this.getItinerary(userId, itineraryId);
      if (!existing) {
        throw new Error('Itinerary not found');
      }

      const updated = {
        ...existing,
        ...updates,
        updatedAt: new Date(),
      };

      const { resource } = await this.container.item(itineraryId, userId).replace(updated);
      return resource as Itinerary;
    } catch (error) {
      console.error('Error updating itinerary:', error);
      throw error;
    }
  }

  /**
   * Delete itinerary
   */
  async deleteItinerary(userId: string, itineraryId: string): Promise<void> {
    try {
      await this.container.item(itineraryId, userId).delete();
      console.log('Itinerary deleted:', itineraryId);
    } catch (error) {
      console.error('Error deleting itinerary:', error);
      throw error;
    }
  }

  /**
   * List user's itineraries
   */
  async listItineraries(userId: string): Promise<Itinerary[]> {
    try {
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
        parameters: [{ name: '@userId', value: userId }],
      };

      const { resources } = await this.container.items.query<Itinerary>(querySpec).fetchAll();
      return resources;
    } catch (error) {
      console.error('Error listing itineraries:', error);
      return [];
    }
  }

  /**
   * Refine itinerary with additional input
   */
  async refineItinerary(userId: string, itineraryId: string, additionalInput: string): Promise<Itinerary> {
    const existing = await this.getItinerary(userId, itineraryId);
    if (!existing) {
      throw new Error('Itinerary not found');
    }

    // In a full implementation, use AI to refine based on additional input
    console.log('Refining itinerary with input:', additionalInput);

    // For now, just update the timestamp
    return this.updateItinerary(userId, itineraryId, {
      updatedAt: new Date(),
    });
  }
}
