# Funday - AI Day Planner App - Requirements Specification

## Overview
An AI-powered activity planning application that creates personalized day itineraries based on user preferences, location, weather conditions, day of week, local events, and real-time data from multiple sources. The app intelligently adapts to regional event services and calendar context to generate logistically optimized routes with activities such as dining, sightseeing, outdoor activities, entertainment, and local events.

## Target Azure Resource Group
**rg-ailz-lab** (existing resources will be reused where applicable)

## Core Features

### 1. Location Services
- **Starting Point Selection**
  - Interactive map interface for manual location selection
  - Automatic geolocation with user permission (default)
  - Address search functionality
  - Saved location bookmarks for frequent starting points

### 2. User Input Methods
- **Text Input**
  - Natural language processing for activity preferences
  - Rich text input field with auto-suggestions
  - Multi-line input support for detailed requests
  
- **Voice Input**
  - Azure Speech Services integration for speech-to-text
  - Real-time transcription display
  - Language detection and multi-language support
  - Voice activity detection

### 3. Planning Parameters
- **Transportation Modes**
  - Walking
  - Cycling
  - Public transport (bus, tram, metro, train)
  - Combination of modes
  - Time estimates per mode
  
- **Search Radius**
  - Configurable kilometer radius (default: 5km)
  - Visual radius indicator on map
  - Adjustable via slider (1-50km range)
  
- **Activity Preferences**
  - Nature & Outdoors: scenery, picnic spots, forests, beaches, parks, hiking trails
  - Dining: restaurants, cafes, food trucks
  - Entertainment: karaoke, cinemas, theaters, live music venues
  - Culture: museums, galleries, historical sites, architecture
  - Sports & Recreation: swimming, sports facilities, playgrounds
  - Shopping: markets, boutiques, malls
  
- **Filtering Options**
  - Restaurant filters:
    - Cuisine type (e.g., Nepalese, Italian, Japanese)
    - Rating threshold (1-5 stars)
    - Price range ($, $$, $$$, $$$$)
    - Dietary restrictions (vegetarian, vegan, halal, gluten-free)
  - Activity filters:
    - Accessibility requirements
    - Indoor/outdoor preference
    - Family-friendly options
    - Pet-friendly locations

### 4. AI-Powered Itinerary Generation
- **Intent Analysis**
  - Parse user input to extract activities, preferences, and constraints
  - Identify implicit preferences (e.g., "relaxing day" → parks, cafes)
  - Detect time constraints and priorities
  
- **Data Integration**
  - **Weather API** (Open-Meteo or similar)
    - Current conditions
    - Hourly forecast
    - Weather-appropriate activity suggestions
    - Rain/snow alerts affecting outdoor activities
  
  - **Calendar & Day Context**
    - Day of week awareness (weekday vs weekend)
    - Local holiday calendar integration
    - Sunday/holiday restrictions (closed shops, limited transit)
    - Opening hours validation per day
    - Special day considerations (e.g., early closing on Saturdays)
  
  - **Event Services (Locale-Aware)**
    - Dynamic event API integration based on user location
    - Finland: Tapahtumainfo.fi API
    - Generic fallback: Eventbrite API, Meetup API
    - Filter events by:
      - Date and time
      - Category (concerts, exhibitions, festivals, sports)
      - Distance from starting point
      - Ticket availability
    - Integrate events seamlessly into itinerary timeline
  
  - **Restaurant/Venue APIs**
    - Google Places API or equivalent
    - Yelp/TripAdvisor ratings
    - Day-specific opening hours and reservation status
    - Holiday/Sunday closure detection
  
  - **Public Transport APIs**
    - Real-time schedules with day-of-week variations
    - Route planning with weekend/holiday schedules
    - Delays and service updates
    - Reduced service warnings on Sundays/holidays
  
  - **Points of Interest (POI) Databases**
    - Sightseeing locations with operating days
    - Natural landmarks (always accessible)
    - Cultural venues with calendar-specific hours
    - Museum night events, special exhibitions
  
- **Route Optimization**
  - Logical activity ordering based on:
    - Geographic proximity
    - Day-specific opening hours (considering day of week)
    - Travel time between locations
    - Weather forecast timing (rain windows, temperature changes)
    - Activity duration estimates
    - Event start times (concerts, shows, guided tours)
    - Sunday/holiday constraints (closed venues)
  - Minimize backtracking and travel time
  - Balance activity types throughout the day
  - Prioritize time-critical activities (events with fixed start times)- **Clarification Dialog**
  - AI may ask follow-up questions if input is ambiguous
  - Present multiple options for user selection
  - Confirm key assumptions before finalizing plan

### 5. Itinerary Presentation
- **Card-Based UI**
  - Sequential activity cards displaying:
    1. **Activity Type** (icon + label: 🎪 event, 🍽️ dining, 🏛️ sightseeing, etc.)
    2. **Location Name** with address
    3. **Estimated Time** (duration and/or time of day)
    4. **Travel Details** (mode, distance, duration to next activity)
    5. **Key Information** (ratings, price, weather, special notes)
    6. **Event-Specific Info** (start time, ticket link, performer/artist)
    7. **Day Context Indicators** (⚠️ "Closes at 2 PM today", 🎉 "Live music at 8 PM")
    8. **Action Buttons** (navigate, call, reserve, remove, reorder, buy tickets)
  
- **Map Integration**
  - Display full route on interactive map
  - Highlight each location as card is selected
  - Show travel paths between activities
  - Real-time user location tracking (optional)
  
- **Timeline View**
  - Visual timeline with estimated times
  - Color-coded activity types
  - Duration indicators
  - Weather overlay

### 6. Itinerary Management
- **Editing Capabilities**
  - Drag-and-drop to reorder activities
  - Remove activities
  - Add alternative activities
  - Modify time allocations
  - Change transportation modes
  
- **Alternative Suggestions**
  - "Similar activities nearby" for each card
  - "Alternative restaurants" with comparable ratings/cuisine
  - Fallback options for weather-dependent activities
  
- **Export & Sharing**
  - Export to calendar (iCal format)
  - Share via link (read-only view)
  - PDF export with map and details
  - Email itinerary summary

### 7. Persistence & History
- **Save Plans**
  - Store completed itineraries in Cosmos DB
  - User-specific plan history
  - Favorite plans for reuse
  
- **Plan Templates**
  - Save successful plans as templates
  - Community-shared templates (optional future feature)

## Technical Architecture

### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: TailwindCSS or Material UI
- **Mapping**: Leaflet or Mapbox GL JS
- **State Management**: React Query + Zustand
- **Voice Input**: Azure Speech SDK (browser)
- **Components**:
  - MapSelector
  - VoiceInputPanel
  - ActivityPreferenceForm
  - ItineraryCardList
  - ItineraryMap
  - TimelineView
  - ActivityCard (with edit capabilities)

### Backend
- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express.js
- **AI Integration**: Azure OpenAI (GPT-4o or GPT-4o-mini)
  - Function calling for structured data extraction
  - Tool integration for API calls
  - Context-aware prompting with day/weather/event information
- **Speech Services**: Azure Speech Services (server-side processing if needed)
- **External APIs** (Locale-Aware):
  - **Weather**: Open-Meteo API (free, no key required)
  - **Places/Restaurants**: Google Places API or Overpass API (OpenStreetMap)
  - **Public Transport**: Region-specific APIs
    - Finland: HSL API (Helsinki), Waltti API (other cities)
    - Generic: Google Directions API (fallback)
  - **Ratings**: TripAdvisor API or Yelp Fusion API
  - **Events** (Dynamic by Location):
    - **Finland**: Tapahtumainfo.fi API
    - **Generic**: Eventbrite API, Meetup API, Eventful API
    - **Fallback**: Web scraping of local event calendars
  - **Calendar/Holidays**: 
    - Public holiday APIs (e.g., Nager.Date API)
    - Regional holiday calendars

### Azure Services (Existing Resources in rg-ailz-lab)
- **Azure Container Apps (ACA)**
  - Frontend container: `aca-dayplanner-frontend-{suffix}`
  - Backend container: `aca-dayplanner-backend-{suffix}`
  - Existing ACA environment
  
- **Azure Cosmos DB**
  - New database: `dayplanner-db`
  - Containers:
    - `plans` - User itineraries
    - `preferences` - User preferences and favorites
    - `templates` - Saved plan templates
  - Partition key: `/userId`
  
- **Azure Blob Storage**
  - Existing storage account
  - New container: `dayplanner-data`
  - Store: exported PDFs, cached API responses, user uploads
  
- **Azure OpenAI**
  - Existing service connection
  - Model: gpt-4o or gpt-4o-mini
  - Function calling for structured itinerary generation
  
- **Azure Speech Services**
  - Existing service
  - Speech-to-text for voice input
  - Multi-language support (starting with English, Finnish)
  
- **Azure AI Foundry** (Optional)
  - New project (NOT hub): `dayplanner-project`
  - Agent configuration for itinerary planning
  - Tool definitions for external API integrations

### API Endpoints

#### Backend REST API
```
POST   /api/itinerary/generate      # Generate itinerary from user input
POST   /api/itinerary/refine        # Refine itinerary with additional input
GET    /api/itinerary/:id           # Retrieve saved itinerary
PUT    /api/itinerary/:id           # Update itinerary
DELETE /api/itinerary/:id           # Delete itinerary
GET    /api/itinerary/list          # List user's saved itineraries
POST   /api/itinerary/:id/export    # Export itinerary (PDF/iCal)

POST   /api/speech/transcribe       # Transcribe audio to text
POST   /api/location/geocode        # Convert address to coordinates
POST   /api/location/reverse        # Convert coordinates to address
GET    /api/location/detect         # Detect locale/region from coordinates

GET    /api/weather                 # Get weather forecast for location
GET    /api/places/search           # Search for places/restaurants
GET    /api/places/:id              # Get place details
GET    /api/transit/route           # Get public transport route

GET    /api/events/search           # Search events by location/date/category
GET    /api/events/:id              # Get event details
GET    /api/events/sources          # Get available event sources for region

GET    /api/calendar/holidays       # Get public holidays for date/region
GET    /api/calendar/context        # Get day context (day of week, special considerations)
```

### Data Models

#### Itinerary (Cosmos DB)
```typescript
{
  id: string;                    // UUID
  userId: string;                // Partition key
  createdAt: Date;
  updatedAt: Date;
  name: string;                  // User-provided or auto-generated
  startLocation: {
    lat: number;
    lon: number;
    address: string;
    locale: string;              // Detected region (e.g., "FI", "SE", "US-NY")
    timezone: string;            // IANA timezone (e.g., "Europe/Helsinki")
  };
  radius: number;                // in kilometers
  date: Date;                    // planned date
  dayContext: {
    dayOfWeek: string;           // "Monday", "Sunday", etc.
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName?: string;        // e.g., "Midsummer Eve"
    specialConsiderations: string[]; // e.g., ["Sunday - limited shopping", "Holiday transit schedule"]
  };
  preferences: {
    transportModes: string[];
    activityTypes: string[];
    cuisineTypes: string[];
    minRating: number;
    priceRange: string[];
    dietary: string[];
    includeEvents: boolean;      // Whether to search for events
    eventCategories?: string[];  // e.g., ["concerts", "festivals", "sports"]
  };
  activities: Activity[];
  weather: WeatherInfo;
  totalDistance: number;
  totalDuration: number;
  status: 'draft' | 'finalized' | 'completed';
}
```

#### Activity
```typescript
{
  id: string;
  type: 'travel' | 'dining' | 'sightseeing' | 'entertainment' | 'outdoor' | 'culture' | 'event';
  name: string;
  description: string;
  location: {
    lat: number;
    lon: number;
    address: string;
  };
  startTime: Date;
  endTime?: Date;                // For events with fixed end times
  duration: number;              // minutes
  placeId?: string;              // External API place ID
  eventId?: string;              // Event API ID (if type is 'event')
  rating?: number;
  priceLevel?: number;
  imageUrl?: string;
  website?: string;
  phone?: string;
  openingHours?: string[];
  daySpecificHours?: {           // Hours for this specific day
    open: string;                // e.g., "10:00"
    close: string;               // e.g., "18:00"
    isClosed: boolean;
    specialNote?: string;        // e.g., "Closes early on Sundays"
  };
  eventDetails?: {               // Only for type='event'
    category: string;            // "concert", "festival", "sports", etc.
    organizer: string;
    ticketUrl?: string;
    ticketPrice?: string;
    isFixedTime: boolean;        // Whether this is time-critical
    performers?: string[];       // For concerts, shows
  };
  weatherDependent: boolean;     // Whether activity should be skipped if weather is bad
  travelToNext?: {
    mode: 'walk' | 'bike' | 'transit';
    distance: number;            // meters
    duration: number;            // minutes
    instructions?: string;
  };
}
```

#### User Preferences
```typescript
{
  id: string;
  userId: string;                // Partition key
  favoriteLocations: Location[];
  defaultRadius: number;
  defaultTransportModes: string[];
  dietaryRestrictions: string[];
  savedTemplates: string[];      // Template IDs
  activityHistory: string[];     // Activity type preferences
}
```

## AI Prompt Engineering

### System Prompt
```
You are Funday, an expert AI activity planner. Your goal is to create personalized, 
logistically optimized itineraries based on user preferences, weather conditions, 
day of the week, local events, and real-time data.

When generating itineraries:
1. Prioritize user's stated preferences
2. Consider weather appropriateness (outdoor activities on sunny days, indoor alternatives for rain)
3. Account for day-specific constraints:
   - Sunday/holiday closures and limited hours
   - Weekend vs. weekday activity availability
   - Public transport schedule variations
4. Integrate relevant local events (concerts, festivals, exhibitions)
5. Optimize route to minimize travel time while respecting event start times
6. Balance activity types throughout the day
7. Respect opening hours specific to the day of the week
8. Include travel time and method between activities
9. Suggest specific venues with ratings when available
10. Ask clarifying questions if user intent is ambiguous
11. Alert users about day-specific considerations proactively

Available tools:
- get_weather_forecast(lat, lon, date)
- get_day_context(date, location) # Returns day of week, holidays, special considerations
- search_places(query, location, radius, type, date) # Date for day-specific hours
- get_place_details(place_id, date)
- search_events(location, date, radius, categories) # Find local events
- get_event_details(event_id)
- calculate_route(origin, destination, mode, time) # Time for day-specific transit
- get_transit_schedule(origin, destination, time)
- detect_locale(lat, lon) # Returns region code for event API selection
```

### Function Definitions for AI
- `get_weather_forecast`: Returns hourly weather for planning
- `get_day_context`: Returns day of week, holiday status, and constraints
- `search_places`: Find restaurants, POIs, etc. (with day-specific hours)
- `get_place_details`: Detailed info for specific venues including today's hours
- `search_events`: Find local events using locale-appropriate API
- `get_event_details`: Detailed event info including tickets and timing
- `calculate_route`: Distance and time between points (considering day/time)
- `get_transit_schedule`: Public transport options with day-specific schedules
- `detect_locale`: Determine region for event API selection (e.g., "FI" → use Tapahtumainfo.fi)

## User Stories

1. **As a tourist**, I want to explore Helsinki's highlights in one day using public transport, so I can see the most popular sights efficiently.

2. **As a local resident**, I want to find outdoor activities within cycling distance on a sunny day, so I can enjoy good weather with physical activity.

3. **As a food enthusiast**, I want to discover highly-rated restaurants of various cuisines in my area, organized in a walking route, so I can have a progressive dining experience.

4. **As a parent**, I want to plan a family-friendly day with playgrounds, ice cream shops, and a picnic spot, accessible by walking, so my children stay entertained.

5. **As someone with dietary restrictions**, I want to filter restaurants that accommodate my vegan diet and see them integrated into an itinerary, so I don't have to worry about food options.

6. **As a spontaneous planner**, I want to speak my day preferences and have an instant itinerary generated, so I can start my adventure quickly.

7. **As a music lover on a Sunday**, I want Funday to find a jazz festival happening today and build activities around it, while warning me that shops close early.

8. **As someone planning a rainy day**, I want Funday to suggest indoor activities like museums and cafes, and include an art exhibition that starts at 2 PM.

9. **As a visitor during a local holiday**, I want to be informed which attractions are closed and have alternatives suggested automatically.

10. **As an event-goer**, I want Funday to discover a food truck festival near me and organize my day around attending it with other complementary activities.

## Success Criteria

### Functional Requirements
- ✅ User can input preferences via text or voice
- ✅ System generates logically ordered itinerary with 3-8 activities
- ✅ Each activity has complete information (name, location, timing, travel)
- ✅ Map displays full route with all locations
- ✅ User can edit, reorder, and save itineraries
- ✅ Weather data influences activity suggestions
- ✅ Restaurant filtering by cuisine, rating, and dietary needs works
- ✅ Public transport integration provides realistic routes

### Non-Functional Requirements
- **Performance**: Itinerary generation completes within 10 seconds
- **Usability**: Mobile-responsive design for on-the-go planning
- **Accuracy**: Routes reflect actual travel times (±10% margin)
- **Availability**: 99.5% uptime (leveraging ACA and Azure services)
- **Security**: User data encrypted at rest and in transit
- **Scalability**: Support 100+ concurrent users initially

## Implementation Phases

### Phase 1: MVP (Core Features)
- Basic text input for preferences
- Location selection via map or geolocation
- Simple activity types (dining, sightseeing, outdoor)
- Weather API integration
- Day of week awareness and basic opening hours
- GPT-4o powered itinerary generation
- Card-based itinerary display
- Map visualization with Leaflet
- Cosmos DB persistence

### Phase 2: Enhanced Features
- Voice input via Azure Speech Services
- Public transport integration with day-specific schedules
- Public holiday calendar integration
- Advanced filtering (cuisine, rating, dietary)
- Drag-and-drop reordering
- Alternative activity suggestions
- Export to calendar/PDF
- Event API integration (starting with Finland/Tapahtumainfo.fi)
- Sunday/holiday constraint warnings

### Phase 3: Advanced Features
- Real-time plan updates during the day
- Community templates
- Multi-day itinerary planning
- Collaborative planning (multiple users)
- Integration with booking services
- Offline mode with cached data
- Multi-region event API support (expand beyond Finland)
- Dynamic event source detection based on location
- Ticket purchasing integration
- Event recommendations based on user preferences

## External API Requirements

### Required APIs (with fallbacks)
1. **Weather**: Open-Meteo API (free, no key) or Azure Weather API
2. **Places/POI**: 
   - Primary: Google Places API (requires billing)
   - Fallback: Overpass API (OpenStreetMap, free)
3. **Ratings**: 
   - TripAdvisor API or Yelp Fusion API (both require keys)
   - Fallback: OpenStreetMap data (limited)
4. **Public Transport**:
   - Region-specific (e.g., HSL API for Helsinki, Waltti for other Finnish cities - free)
   - Generic: Google Directions API (requires billing)
5. **Events** (Locale-Aware):
   - **Finland**: Tapahtumainfo.fi API (free, registration required)
   - **Generic**: Eventbrite API (free tier available)
   - **Fallback**: Meetup API, Eventful API
6. **Holidays/Calendar**:
   - Nager.Date API (free, no key)
   - Calendarific API (free tier available)

### API Key Management
- Store in Azure Key Vault
- Access via Managed Identity from ACA backend
- Rate limiting and caching to minimize costs

## Development Setup

### Prerequisites
- Node.js 20+
- Docker Desktop
- Azure CLI
- Access to rg-ailz-lab resource group

### Local Development
```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev

# Docker Compose (full stack)
docker-compose up
```

### Environment Variables
```env
# Backend
AZURE_OPENAI_ENDPOINT=<from-existing>
AZURE_OPENAI_KEY=<from-key-vault>
AZURE_SPEECH_KEY=<from-key-vault>
COSMOS_DB_ENDPOINT=<from-existing>
COSMOS_DB_KEY=<from-key-vault>
BLOB_STORAGE_CONNECTION=<from-existing>
GOOGLE_PLACES_API_KEY=<from-key-vault>
OPENMETEO_API_URL=https://api.open-meteo.com/v1/forecast
TAPAHTUMAINFO_API_KEY=<from-key-vault>
EVENTBRITE_API_KEY=<from-key-vault>
NAGER_DATE_API_URL=https://date.nager.at/api/v3

# Frontend
VITE_BACKEND_URL=http://localhost:3000
VITE_MAPBOX_TOKEN=<optional>
```

## Deployment

### Infrastructure (Bicep)
- Reuse existing ACA environment, Cosmos DB, Blob Storage
- Create new Cosmos DB database and containers
- Create new blob container
- Deploy frontend and backend as separate container apps
- Configure managed identity for Azure service access
- Set up environment variables from Key Vault references

### CI/CD
- GitHub Actions or Azure DevOps pipeline
- Build and push Docker images to existing ACR
- Deploy to ACA with zero-downtime updates
- Automated testing before deployment

## Testing Strategy

### Unit Tests
- AI prompt parsing and intent extraction
- Route optimization algorithms
- Activity filtering logic

### Integration Tests
- External API mocking
- Cosmos DB operations
- Azure OpenAI function calling

### E2E Tests
- Full itinerary generation flow
- Map and UI interactions
- Voice input processing

### User Acceptance Testing
- Test with real users in different scenarios
- Validate itinerary quality and accuracy
- Measure user satisfaction

## Future Enhancements
- Machine learning for personalized recommendations based on history
- Social features: share and collaborate on plans
- Integration with booking platforms (restaurants, tickets)
- Gamification: badges for completed activities
- Augmented reality navigation
- Integration with calendar and reminder apps
- Multi-city trip planning
- Budget tracking and cost estimation

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| External API rate limits | High | Implement caching, use multiple API sources |
| Inaccurate travel times | Medium | Use historical data, add buffer times |
| Poor AI suggestions | High | Extensive prompt engineering, user feedback loop |
| Weather API downtime | Low | Cache forecasts, graceful degradation |
| High Azure costs | Medium | Monitor usage, optimize API calls, set budget alerts |
| Complex UI on mobile | Medium | Mobile-first design, progressive enhancement |

## Success Metrics
- **User Engagement**: Average session duration > 5 minutes
- **Plan Completion**: 60%+ of generated plans saved by users
- **Accuracy**: 80%+ user satisfaction with route logistics
- **Performance**: 95% of itineraries generated in < 10 seconds
- **Retention**: 40%+ weekly active users return within 30 days

---

**Document Version**: 1.0  
**Date**: November 15, 2025  
**Author**: AI Assistant  
**Status**: Draft - Ready for Review
