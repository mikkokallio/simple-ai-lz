import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import { DefaultAzureCredential } from '@azure/identity';
import { CosmosClient } from '@azure/cosmos';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { ItineraryService } from './services/itineraryService.js';
import { WeatherService } from './services/weatherService.js';
import { EventService } from './services/eventService.js';
import { PlaceService } from './services/placeService.js';
import { LocaleService } from './services/localeService.js';

// Environment variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3000;
const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT || '';
const COSMOS_DATABASE_NAME = process.env.COSMOS_DATABASE_NAME || 'dayplanner-db';
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY || '';
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';

// Static user ID for demo (following pattern from other apps)
const STATIC_USER_ID = 'demo-user';

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
};
app.use(cors(corsOptions));

// Initialize Azure services
let cosmosClient: CosmosClient;
let openaiClient: OpenAI;
let itineraryService: ItineraryService;
let weatherService: WeatherService;
let eventService: EventService;
let placeService: PlaceService;
let localeService: LocaleService;

// Initialize services
async function initializeServices() {
  console.log('Initializing Azure services...');
  
  // Cosmos DB client with Managed Identity
  if (NODE_ENV === 'production') {
    const credential = new DefaultAzureCredential();
    cosmosClient = new CosmosClient({
      endpoint: COSMOS_ENDPOINT,
      aadCredentials: credential,
    });
  } else {
    // Local development with connection string
    const connString = process.env.COSMOS_CONNECTION_STRING || '';
    if (connString) {
      cosmosClient = new CosmosClient(connString);
    } else {
      console.warn('COSMOS_CONNECTION_STRING not set for local development');
    }
  }

  // Azure OpenAI client
  if (AZURE_OPENAI_KEY) {
    openaiClient = new OpenAI({
      apiKey: AZURE_OPENAI_KEY,
      baseURL: `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}`,
      defaultQuery: { 'api-version': '2024-08-01-preview' },
      defaultHeaders: { 'api-key': AZURE_OPENAI_KEY },
    });
    console.log('OpenAI client initialized with API key');
  } else {
    console.warn('AZURE_OPENAI_KEY not set');
  }

  // Initialize service classes
  weatherService = new WeatherService();
  localeService = new LocaleService();
  eventService = new EventService(localeService);
  placeService = new PlaceService();
  
  if (cosmosClient && openaiClient) {
    itineraryService = new ItineraryService(
      cosmosClient,
      COSMOS_DATABASE_NAME,
      openaiClient,
      weatherService,
      eventService,
      placeService,
      localeService
    );
    await itineraryService.initialize();
  }

  console.log('Services initialized successfully');
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'funday-backend',
  });
});

// ============================================================================
// ITINERARY ENDPOINTS
// ============================================================================

// Generate new itinerary from user input
app.post('/api/itinerary/generate', async (req: Request, res: Response) => {
  try {
    const { userInput, location, radius, date, preferences } = req.body;

    if (!userInput || !location || !location.lat || !location.lon) {
      return res.status(400).json({ error: 'Missing required fields: userInput, location (lat, lon)' });
    }

    const itinerary = await itineraryService.generateItinerary({
      userId: STATIC_USER_ID,
      userInput,
      location,
      radius: radius || 5,
      date: date ? new Date(date) : new Date(),
      preferences: preferences || {},
    });

    res.json(itinerary);
  } catch (error: any) {
    console.error('Error generating itinerary:', error);
    res.status(500).json({ error: 'Failed to generate itinerary', details: error.message });
  }
});

// Refine existing itinerary with additional input
app.post('/api/itinerary/refine', async (req: Request, res: Response) => {
  try {
    const { itineraryId, additionalInput } = req.body;

    if (!itineraryId || !additionalInput) {
      return res.status(400).json({ error: 'Missing required fields: itineraryId, additionalInput' });
    }

    const itinerary = await itineraryService.refineItinerary(STATIC_USER_ID, itineraryId, additionalInput);
    res.json(itinerary);
  } catch (error: any) {
    console.error('Error refining itinerary:', error);
    res.status(500).json({ error: 'Failed to refine itinerary', details: error.message });
  }
});

// Get saved itinerary
app.get('/api/itinerary/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const itinerary = await itineraryService.getItinerary(STATIC_USER_ID, id);
    
    if (!itinerary) {
      return res.status(404).json({ error: 'Itinerary not found' });
    }

    res.json(itinerary);
  } catch (error: any) {
    console.error('Error getting itinerary:', error);
    res.status(500).json({ error: 'Failed to get itinerary', details: error.message });
  }
});

// Update itinerary
app.put('/api/itinerary/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const itinerary = await itineraryService.updateItinerary(STATIC_USER_ID, id, updates);
    res.json(itinerary);
  } catch (error: any) {
    console.error('Error updating itinerary:', error);
    res.status(500).json({ error: 'Failed to update itinerary', details: error.message });
  }
});

// Delete itinerary
app.delete('/api/itinerary/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await itineraryService.deleteItinerary(STATIC_USER_ID, id);
    res.json({ success: true, message: 'Itinerary deleted' });
  } catch (error: any) {
    console.error('Error deleting itinerary:', error);
    res.status(500).json({ error: 'Failed to delete itinerary', details: error.message });
  }
});

// List user's itineraries
app.get('/api/itinerary/list', async (req: Request, res: Response) => {
  try {
    const itineraries = await itineraryService.listItineraries(STATIC_USER_ID);
    res.json(itineraries);
  } catch (error: any) {
    console.error('Error listing itineraries:', error);
    res.status(500).json({ error: 'Failed to list itineraries', details: error.message });
  }
});

// ============================================================================
// WEATHER ENDPOINTS
// ============================================================================

app.get('/api/weather', async (req: Request, res: Response) => {
  try {
    const { lat, lon, date } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing required parameters: lat, lon' });
    }

    const forecast = await weatherService.getForecast(
      parseFloat(lat as string),
      parseFloat(lon as string),
      date ? new Date(date as string) : new Date()
    );

    res.json(forecast);
  } catch (error: any) {
    console.error('Error getting weather:', error);
    res.status(500).json({ error: 'Failed to get weather forecast', details: error.message });
  }
});

// ============================================================================
// EVENT ENDPOINTS
// ============================================================================

app.get('/api/events/search', async (req: Request, res: Response) => {
  try {
    const { lat, lon, radius, date, categories } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing required parameters: lat, lon' });
    }

    const events = await eventService.searchEvents({
      lat: parseFloat(lat as string),
      lon: parseFloat(lon as string),
      radius: radius ? parseFloat(radius as string) : 10,
      date: date ? new Date(date as string) : new Date(),
      categories: categories ? (categories as string).split(',') : undefined,
    });

    res.json(events);
  } catch (error: any) {
    console.error('Error searching events:', error);
    res.status(500).json({ error: 'Failed to search events', details: error.message });
  }
});

app.get('/api/events/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const event = await eventService.getEventDetails(id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error: any) {
    console.error('Error getting event details:', error);
    res.status(500).json({ error: 'Failed to get event details', details: error.message });
  }
});

// ============================================================================
// PLACE ENDPOINTS
// ============================================================================

app.get('/api/places/search', async (req: Request, res: Response) => {
  try {
    const { query, lat, lon, radius, type } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing required parameters: lat, lon' });
    }

    const places = await placeService.searchPlaces({
      query: query as string,
      lat: parseFloat(lat as string),
      lon: parseFloat(lon as string),
      radius: radius ? parseFloat(radius as string) : 5,
      type: type as string,
    });

    res.json(places);
  } catch (error: any) {
    console.error('Error searching places:', error);
    res.status(500).json({ error: 'Failed to search places', details: error.message });
  }
});

app.get('/api/places/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const place = await placeService.getPlaceDetails(id);
    
    if (!place) {
      return res.status(404).json({ error: 'Place not found' });
    }

    res.json(place);
  } catch (error: any) {
    console.error('Error getting place details:', error);
    res.status(500).json({ error: 'Failed to get place details', details: error.message });
  }
});

// ============================================================================
// LOCATION ENDPOINTS
// ============================================================================

app.post('/api/location/geocode', async (req: Request, res: Response) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Missing required field: address' });
    }

    const result = await localeService.geocode(address);
    res.json(result);
  } catch (error: any) {
    console.error('Error geocoding address:', error);
    res.status(500).json({ error: 'Failed to geocode address', details: error.message });
  }
});

app.post('/api/location/reverse', async (req: Request, res: Response) => {
  try {
    const { lat, lon } = req.body;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing required fields: lat, lon' });
    }

    const result = await localeService.reverseGeocode(lat, lon);
    res.json(result);
  } catch (error: any) {
    console.error('Error reverse geocoding:', error);
    res.status(500).json({ error: 'Failed to reverse geocode', details: error.message });
  }
});

app.get('/api/location/detect', async (req: Request, res: Response) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing required parameters: lat, lon' });
    }

    const locale = await localeService.detectLocale(
      parseFloat(lat as string),
      parseFloat(lon as string)
    );

    res.json(locale);
  } catch (error: any) {
    console.error('Error detecting locale:', error);
    res.status(500).json({ error: 'Failed to detect locale', details: error.message });
  }
});

// ============================================================================
// CALENDAR ENDPOINTS
// ============================================================================

app.get('/api/calendar/context', async (req: Request, res: Response) => {
  try {
    const { date, lat, lon } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Missing required parameter: date' });
    }

    const locale = lat && lon 
      ? await localeService.detectLocale(parseFloat(lat as string), parseFloat(lon as string))
      : { countryCode: 'FI' }; // Default to Finland

    const context = await localeService.getDayContext(new Date(date as string), locale.countryCode);
    res.json(context);
  } catch (error: any) {
    console.error('Error getting day context:', error);
    res.status(500).json({ error: 'Failed to get day context', details: error.message });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const startServer = async () => {
  try {
    await initializeServices();
    
    app.listen(PORT, () => {
      console.log(`🎉 Funday backend server running on port ${PORT}`);
      console.log(`   Environment: ${NODE_ENV}`);
      console.log(`   Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
