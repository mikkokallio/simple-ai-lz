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
   * Get season based on date (for Northern Hemisphere)
   */
  private getSeason(date: Date): string {
    const month = date.getMonth(); // 0-11
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Autumn';
    return 'Winter';
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
    const month = request.date.toLocaleString('en-US', { month: 'long' });
    const season = this.getSeason(request.date);
    
    const systemPrompt = `You are Funday, an expert AI activity planner. Create personalized day itineraries that STRICTLY match user preferences and current conditions.

CRITICAL CONTEXT:
- Location: ${request.location.address}
- Date: ${request.date.toDateString()} (${dayContext.dayOfWeek})
- Month: ${month} (${season})
- Current Weather: ${weather.condition}, ${weather.temperature}°C
- Day constraints: ${dayContext.specialConsiderations.join('; ')}
- Is weekend: ${dayContext.isWeekend}
- Is holiday: ${dayContext.isHoliday}

MANDATORY RULES:
1. ACTIVITY DIVERSITY: Create a VARIED itinerary matching the user's theme. For "urban day with shopping, cinema, nightclubbing" → search for shops/malls, cinemas, bars/nightclubs. For "nature and coffee" → parks, nature reserves, viewpoints, cafes. For "cultural day" → museums, galleries, theatres. DO NOT default to just walking + restaurant unless that's what the user wants.

2. USE APPROPRIATE SEARCH TYPES: You have access to these place types:
   - Entertainment: cinema, theatre, nightclub, bar, pub, music_venue, casino
   - Shopping: shop, mall, clothing, bookshop
   - Culture: museum, gallery, library, monument, castle, church
   - Nature: park, garden, beach, viewpoint, nature_reserve
   - Sports: gym, swimming_pool, sports_centre, stadium
   - Food: restaurant, cafe, fast_food
   - Attractions: zoo, aquarium, theme_park, spa
   Match your searches to the user's request!

3. SEASON APPROPRIATENESS: It's ${month} (${season}) - ABSOLUTELY NO outdoor festivals, concerts, or summer events. NO beach, swimming, or water activities if temperature is below 15°C.

4. USER INTENT MATCHING: ONLY suggest activities DIRECTLY matching user's request. Analyze keywords: "shopping" → malls/shops, "cinema" → cinemas, "nightlife" → bars/nightclubs, "culture" → museums/galleries, "nature" → parks/trails.

5. TEMPERATURE AWARENESS: ${weather.temperature}°C - If below 10°C, prioritize indoor venues (museums, cinemas, malls, cafes, gyms). Outdoor activities only if explicitly requested and weather-appropriate.

6. DAY CONSTRAINTS: ${dayContext.dayOfWeek} - Respect opening hours and day-specific closures

7. NO FAKE EVENTS: Do NOT invent events. Only suggest permanent venues you can search for.

8. ROUTE OPTIMIZATION: Minimize travel distance within ${request.radius}km radius

CRITICAL: User wants "${request.userInput}" - analyze this carefully and search for RELEVANT place types. Don't default to generic walking + eating!

WORKFLOW:
1. Call search_places multiple times (3-5 times) with DIFFERENT types to gather diverse options
   - Example for "urban day": search for 'mall', then 'cinema', then 'nightclub', then 'restaurant'
   - Example for "nature day": search for 'park', then 'viewpoint', then 'cafe', then 'nature_reserve'
2. Aim for VARIETY - each search should be a different place type
3. Call search_events to check for relevant events (but remember: no fake events!)
4. Once you have diverse search results from multiple types, the system will create a balanced itinerary

FINAL RESPONSE FORMAT:
When you're ready to create the itinerary, respond with a JSON object:
{
  "activities": [
    {
      "name": "Activity name",
      "description": "Brief description",
      "type": "dining|entertainment|culture|outdoor|shopping|sport",
      "location": { "lat": number, "lon": number, "address": "address" },
      "startTime": "HH:MM",
      "duration": number (minutes),
      "weatherDependent": boolean
    }
  ]
}

Start times should be realistic (e.g., 10:00, 12:30, 15:00, 18:30) and activities should be in chronological order.`;

    const userMessage = `Create a day plan for: "${request.userInput}"

Location: ${request.location.lat}, ${request.location.lon}
Search radius: ${request.radius} km
Transport: ${request.preferences.transportModes?.join(', ') || 'walking'}

Remember: It's ${month} (${season}), ${weather.temperature}°C. Only suggest seasonally appropriate activities that match my interests!`;

    try {
      // Make initial AI call with function definitions
      const functions = this.getFunctionDefinitions(request);
      
      let response = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        functions,
        function_call: 'auto',
        max_completion_tokens: 2000,
      });

      let message = response.choices[0]?.message;
      
      // Execute function calls and collect results
      const searchResults: any = {
        places: [],
        events: [],
      };

      // If AI wants to call functions, execute them
      // Note: We'll do up to 5 function calls to gather data
      for (let i = 0; i < 5 && message?.function_call; i++) {
        const functionResult = await this.handleFunctionCall(message.function_call, request);
        
        // Store results by type
        if (message.function_call.name === 'search_places') {
          searchResults.places.push(...(functionResult || []));
        } else if (message.function_call.name === 'search_events') {
          searchResults.events.push(...(functionResult || []));
        }

        // Make another AI call to see if it wants to search more DIFFERENT types
        const uniqueTypes = [...new Set(searchResults.places.map((p: any) => p.type))];
        response = await this.openaiClient.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
            { role: 'assistant', content: null, function_call: message.function_call },
            { role: 'user', content: `Found ${(functionResult || []).length} results of type "${message.function_call.arguments ? JSON.parse(message.function_call.arguments).type : 'unknown'}". Already searched types: ${uniqueTypes.join(', ')}. Search for DIFFERENT types to create a diverse itinerary.` },
          ],
          functions,
          function_call: 'auto',
          max_completion_tokens: 2000,
        });

        message = response.choices[0]?.message;
      }

      // Now generate activities using the search results
      console.log(`Collected ${searchResults.places.length} places and ${searchResults.events.length} events`);
      const activities = await this.generateActivitiesFromResults(request, searchResults, dayContext, weather);

      // Generate itinerary structure
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
        activities,
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
   * Generate activities from search results
   */
  private async generateActivitiesFromResults(
    request: GenerateItineraryRequest,
    searchResults: any,
    dayContext: any,
    weather: any
  ): Promise<Activity[]> {
    const activities: Activity[] = [];
    let currentTime = new Date(request.date);
    currentTime.setHours(10, 0, 0, 0); // Start at 10 AM

    // Use places from search results
    const places = searchResults.places || [];
    const events = searchResults.events || [];

    console.log(`Generating activities from ${places.length} places and ${events.length} events`);

    // Group places by type for diversity
    const placesByType = new Map<string, any[]>();
    for (const place of places) {
      const type = place.type;
      if (!placesByType.has(type)) {
        placesByType.set(type, []);
      }
      placesByType.get(type)!.push(place);
    }

    console.log(`Found ${placesByType.size} different place types: ${Array.from(placesByType.keys()).join(', ')}`);

    // Select places with diversity - one from each type first
    const selectedPlaces: any[] = [];
    const typeEntries = Array.from(placesByType.entries());
    
    // First pass: one from each type
    for (const [type, typePlaces] of typeEntries) {
      if (selectedPlaces.length < 5) {
        selectedPlaces.push(typePlaces[0]);
      }
    }

    // Second pass: if we still need more, add second items from each type
    if (selectedPlaces.length < 5) {
      for (const [type, typePlaces] of typeEntries) {
        if (selectedPlaces.length < 5 && typePlaces.length > 1) {
          selectedPlaces.push(typePlaces[1]);
        }
      }
    }

    console.log(`Selected ${selectedPlaces.length} diverse places: ${selectedPlaces.map((p: any) => `${p.name} (${p.type})`).join(', ')}`);

    // Add places as activities
    for (let i = 0; i < selectedPlaces.length; i++) {
      const place = selectedPlaces[i];
      
      activities.push({
        id: uuidv4(),
        type: this.mapPlaceTypeToActivityType(place.type),
        name: place.name,
        description: place.description || `Visit ${place.name}`,
        location: {
          lat: place.location?.lat || request.location.lat,
          lon: place.location?.lon || request.location.lon,
          address: place.location?.address || place.name,
        },
        startTime: new Date(currentTime),
        duration: 60, // Default 60 minutes
        weatherDependent: place.type === 'park' || place.type === 'outdoor',
      });

      currentTime = new Date(currentTime.getTime() + 90 * 60 * 1000); // 60 min activity + 30 min travel
    }

    // Add events if any
    for (const event of events.slice(0, 2)) {
      activities.push({
        id: uuidv4(),
        type: 'entertainment',
        name: event.name,
        description: event.description || 'Local event',
        location: {
          lat: event.location?.lat || request.location.lat,
          lon: event.location?.lon || request.location.lon,
          address: event.location?.address || 'Event location',
        },
        startTime: event.startTime ? new Date(event.startTime) : new Date(currentTime),
        duration: event.duration || 120,
        weatherDependent: false,
      });
    }

    // If no results, use fallback
    if (activities.length === 0) {
      console.log('No search results, using fallback activities');
      return this.generateActivities(request, dayContext, weather);
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
   * Map place type to activity type
   */
  private mapPlaceTypeToActivityType(placeType: string): 'dining' | 'entertainment' | 'culture' | 'outdoor' | 'sightseeing' | 'event' | 'travel' {
    const mapping: Record<string, any> = {
      restaurant: 'dining',
      cafe: 'dining',
      bar: 'dining',
      pub: 'dining',
      museum: 'culture',
      gallery: 'culture',
      theatre: 'entertainment',
      cinema: 'entertainment',
      nightclub: 'entertainment',
      park: 'outdoor',
      garden: 'outdoor',
      beach: 'outdoor',
      gym: 'outdoor',
      swimming_pool: 'outdoor',
      shop: 'sightseeing',
      mall: 'sightseeing',
      spa: 'sightseeing',
    };

    return mapping[placeType] || 'sightseeing';
  }

  /**
   * Parse AI's final response to extract activities (legacy fallback)
   */
  private async parseAIResponse(response: any, request: GenerateItineraryRequest): Promise<Activity[]> {
    try {
      if (!response || !response.content) {
        console.log('No AI response content, using fallback');
        return this.generateActivities(request, {}, {});
      }

      // Try to parse JSON from AI response
      const content = response.content.trim();
      let parsedData: any;

      // Look for JSON object in the response
      const jsonMatch = content.match(/\{[\s\S]*"activities"[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        console.log('No JSON found in AI response, using fallback');
        return this.generateActivities(request, {}, {});
      }

      if (!parsedData.activities || !Array.isArray(parsedData.activities)) {
        console.log('Invalid activities format, using fallback');
        return this.generateActivities(request, {}, {});
      }

      // Convert AI's structured activities to Activity objects
      const activities: Activity[] = [];
      const baseDate = new Date(request.date);

      for (const actData of parsedData.activities) {
        const [hours, minutes] = actData.startTime.split(':').map(Number);
        const startTime = new Date(baseDate);
        startTime.setHours(hours, minutes, 0, 0);

        activities.push({
          id: uuidv4(),
          type: actData.type || 'other',
          name: actData.name,
          description: actData.description,
          location: {
            lat: actData.location.lat,
            lon: actData.location.lon,
            address: actData.location.address,
          },
          startTime,
          duration: actData.duration,
          weatherDependent: actData.weatherDependent !== false,
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

      console.log(`Parsed ${activities.length} activities from AI response`);
      return activities;
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return this.generateActivities(request, {}, {});
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
        description: 'Search for venues and places. Use this for: restaurants, cafes, bars, nightclubs, shops, malls, cinemas, theatres, museums, galleries, parks, beaches, gyms, swimming pools, monuments, churches, viewpoints, hotels, spas, and more.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'restaurant', 'cafe', 'bar', 'pub', 'nightclub', 'fast_food',
                'shop', 'mall', 'shopping', 'supermarket', 'bookshop', 'clothing',
                'cinema', 'theatre', 'museum', 'gallery', 'library', 'music_venue', 'casino',
                'park', 'garden', 'nature_reserve', 'beach', 'viewpoint',
                'sports_centre', 'swimming_pool', 'fitness_centre', 'gym', 'stadium',
                'attraction', 'monument', 'castle', 'church', 'zoo', 'aquarium', 'theme_park',
                'hotel', 'spa'
              ],
              description: 'Specific place type to search for',
            },
            query: {
              type: 'string',
              description: 'Additional search terms or keywords',
            },
          },
          required: ['type'],
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
