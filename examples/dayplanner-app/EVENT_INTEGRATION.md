# Event Integration Strategy - Funday

## Overview
Funday dynamically integrates with locale-specific event services to discover concerts, festivals, exhibitions, and other happenings. The system automatically detects the user's region and selects the most appropriate event API(s) for that location.

## Locale Detection

### Detection Flow
```
User Location (lat, lon)
    ↓
Reverse Geocoding
    ↓
Country Code Detection (e.g., "FI", "SE", "US")
    ↓
Region/State Detection (e.g., "Uusimaa", "California")
    ↓
Event API Source Selection
```

### Implementation
```typescript
interface LocaleInfo {
  countryCode: string;      // ISO 3166-1 alpha-2 (e.g., "FI")
  countryName: string;      // e.g., "Finland"
  region?: string;          // State/province
  city?: string;            // Detected city
  timezone: string;         // IANA timezone (e.g., "Europe/Helsinki")
  eventSources: string[];   // Applicable event API sources
}

async function detectLocale(lat: number, lon: number): Promise<LocaleInfo> {
  // Use reverse geocoding API (e.g., OpenStreetMap Nominatim)
  const geoData = await reverseGeocode(lat, lon);
  
  // Determine applicable event sources based on country
  const eventSources = getEventSourcesForCountry(geoData.countryCode);
  
  return {
    countryCode: geoData.countryCode,
    countryName: geoData.countryName,
    region: geoData.state,
    city: geoData.city,
    timezone: geoData.timezone,
    eventSources
  };
}
```

## Event Source Registry

### Supported Event APIs by Region

| Region | Primary API | Fallback API | Coverage | API Key Required |
|--------|-------------|--------------|----------|------------------|
| **Finland** | Tapahtumainfo.fi | Eventbrite | Excellent for FI | Yes (free registration) |
| **Nordic Countries** | Eventbrite | Meetup | Good | Yes (free tier) |
| **Europe** | Eventbrite | Meetup | Good | Yes (free tier) |
| **North America** | Eventbrite | Ticketmaster | Excellent | Yes (free tier) |
| **Global Fallback** | Eventbrite | Web scraping | Variable | Yes (free tier) |

### Event Source Configuration
```typescript
interface EventSourceConfig {
  id: string;
  name: string;
  apiUrl: string;
  countryCodes: string[];      // ISO codes this source covers
  categories: string[];        // Supported event categories
  requiresApiKey: boolean;
  apiKeyEnvVar?: string;
  rateLimit: number;           // requests per minute
  searchRadius: number;        // max search radius in km
}

const EVENT_SOURCES: EventSourceConfig[] = [
  {
    id: 'tapahtumainfo',
    name: 'Tapahtumainfo.fi',
    apiUrl: 'https://api.tapahtumat.net/v1',
    countryCodes: ['FI'],
    categories: ['music', 'festivals', 'exhibitions', 'sports', 'theater', 'family'],
    requiresApiKey: true,
    apiKeyEnvVar: 'TAPAHTUMAINFO_API_KEY',
    rateLimit: 60,
    searchRadius: 100
  },
  {
    id: 'eventbrite',
    name: 'Eventbrite',
    apiUrl: 'https://www.eventbriteapi.com/v3',
    countryCodes: ['*'], // Global
    categories: ['music', 'business', 'food', 'health', 'sports', 'travel', 'community'],
    requiresApiKey: true,
    apiKeyEnvVar: 'EVENTBRITE_API_KEY',
    rateLimit: 1000,
    searchRadius: 50
  },
  {
    id: 'meetup',
    name: 'Meetup',
    apiUrl: 'https://api.meetup.com/gql',
    countryCodes: ['*'], // Global
    categories: ['tech', 'social', 'health', 'sports', 'food', 'community'],
    requiresApiKey: true,
    apiKeyEnvVar: 'MEETUP_API_KEY',
    rateLimit: 200,
    searchRadius: 50
  }
];
```

## Finland: Tapahtumainfo.fi Integration

### About Tapahtumainfo.fi
- **Official Site**: https://tapahtumainfo.fi / https://evenemang.info
- **Coverage**: Comprehensive Finnish event database
- **Languages**: Finnish, Swedish, English
- **Categories**: Concerts, festivals, exhibitions, sports, theater, family events, guided tours
- **Data Quality**: High - many municipal and cultural organizations contribute
- **API**: RESTful API with JSON responses
- **Registration**: Free registration required for API access

### API Endpoints
```
GET /events/search
  - location: lat,lon
  - radius: in kilometers
  - start_date: ISO 8601 date
  - end_date: ISO 8601 date
  - category: event category
  - keywords: search terms
  - language: fi, sv, en

GET /events/{id}
  - Detailed event information
  - Includes: description, location, time, organizer, ticket links, images

GET /categories
  - List all available event categories

GET /locations
  - List popular event locations
```

### Example Implementation
```typescript
interface TapahtumaInfoEvent {
  id: string;
  name: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  location: {
    name: string;
    address: string;
    lat: number;
    lon: number;
  };
  organizer: string;
  ticketUrl?: string;
  ticketPrice?: string;
  isFree: boolean;
  imageUrl?: string;
  websiteUrl?: string;
  language: string;
}

async function searchTapahtumaInfo(
  lat: number,
  lon: number,
  radius: number,
  date: Date,
  categories?: string[]
): Promise<TapahtumaInfoEvent[]> {
  const apiKey = process.env.TAPAHTUMAINFO_API_KEY;
  
  const params = new URLSearchParams({
    location: `${lat},${lon}`,
    radius: radius.toString(),
    start_date: date.toISOString().split('T')[0],
    end_date: date.toISOString().split('T')[0],
    language: 'fi'
  });
  
  if (categories && categories.length > 0) {
    params.append('category', categories.join(','));
  }
  
  const response = await fetch(
    `https://api.tapahtumat.net/v1/events/search?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const data = await response.json();
  return data.events;
}
```

## Event Search Strategy

### Multi-Source Search Flow
```
1. Detect user locale from coordinates
2. Determine applicable event sources (e.g., Tapahtumainfo for FI)
3. Search primary source with user preferences
4. If results < 5, search fallback sources
5. Merge and deduplicate results
6. Rank by relevance and distance
7. Return top N events
```

### Implementation
```typescript
interface EventSearchParams {
  lat: number;
  lon: number;
  radius: number;
  date: Date;
  categories?: string[];
  keywords?: string[];
  maxResults: number;
}

async function searchEvents(params: EventSearchParams): Promise<Event[]> {
  // Detect locale
  const locale = await detectLocale(params.lat, params.lon);
  
  // Get applicable event sources for this locale
  const sources = getEventSources(locale.countryCode);
  
  let allEvents: Event[] = [];
  
  // Search primary source first
  const primarySource = sources[0];
  const primaryEvents = await searchEventSource(primarySource, params);
  allEvents.push(...primaryEvents);
  
  // If insufficient results, search fallback sources
  if (allEvents.length < 5 && sources.length > 1) {
    for (let i = 1; i < sources.length; i++) {
      const fallbackEvents = await searchEventSource(sources[i], params);
      allEvents.push(...fallbackEvents);
    }
  }
  
  // Deduplicate (same event from multiple sources)
  allEvents = deduplicateEvents(allEvents);
  
  // Rank by relevance
  allEvents = rankEventsByRelevance(allEvents, params);
  
  // Return top N
  return allEvents.slice(0, params.maxResults);
}
```

## Event Deduplication

### Matching Strategy
Events from different sources may represent the same real-world event. Deduplicate using:

1. **Name similarity** (Levenshtein distance < 3)
2. **Location proximity** (within 100m)
3. **Time overlap** (same day and similar start time)

```typescript
function deduplicateEvents(events: Event[]): Event[] {
  const unique: Event[] = [];
  
  for (const event of events) {
    const duplicate = unique.find(e => 
      similarStrings(e.name, event.name, 0.9) &&
      distance(e.location, event.location) < 100 && // meters
      Math.abs(e.startTime.getTime() - event.startTime.getTime()) < 3600000 // 1 hour
    );
    
    if (!duplicate) {
      unique.push(event);
    } else {
      // Merge information from both sources
      unique[unique.indexOf(duplicate)] = mergeEventData(duplicate, event);
    }
  }
  
  return unique;
}
```

## Event Integration with AI

### Function Definition for AI
```typescript
{
  name: "search_events",
  description: "Search for local events happening on the specified date within the given radius",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "object",
        properties: {
          lat: { type: "number" },
          lon: { type: "number" }
        }
      },
      date: { type: "string", format: "date" },
      radius: { type: "number", description: "Search radius in kilometers" },
      categories: {
        type: "array",
        items: { type: "string" },
        description: "Event categories: concerts, festivals, exhibitions, sports, theater, family, food"
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Keywords to search for in event names/descriptions"
      }
    },
    required: ["location", "date"]
  }
}
```

### AI Prompt Integration
```
When the user mentions wanting to do activities, ALWAYS check for local events using search_events.

Examples of when to search events:
- User says "find something fun today"
- User mentions interest in music, concerts, festivals
- It's a weekend or holiday (events are more common)
- User asks for entertainment or cultural activities

Consider event timing when building itineraries:
- Events with fixed start times are NON-NEGOTIABLE anchor points
- Build other activities around event schedules
- Suggest arriving early for popular events
- Include travel time to event locations

Alert users about interesting events:
- "There's a jazz festival today at 3 PM - would you like to include it?"
- "I found a food market nearby - perfect for lunch!"
```

## Day-of-Week Considerations

### Event Patterns by Day
```typescript
const DAY_PATTERNS = {
  Monday: {
    eventLikelihood: 'low',
    typicalCategories: ['sports', 'fitness', 'education'],
    note: 'Fewer events; many weekly events start on Mondays'
  },
  Tuesday: {
    eventLikelihood: 'low',
    typicalCategories: ['sports', 'education', 'community'],
    note: 'Mid-week events are less common'
  },
  Wednesday: {
    eventLikelihood: 'medium',
    typicalCategories: ['music', 'trivia', 'networking'],
    note: 'Hump day specials and mid-week concerts'
  },
  Thursday: {
    eventLikelihood: 'medium',
    typicalCategories: ['music', 'art', 'nightlife'],
    note: 'Pre-weekend events begin'
  },
  Friday: {
    eventLikelihood: 'high',
    typicalCategories: ['music', 'nightlife', 'food', 'theater'],
    note: 'Peak event day - concerts, shows, markets'
  },
  Saturday: {
    eventLikelihood: 'very-high',
    typicalCategories: ['festivals', 'markets', 'sports', 'family', 'music'],
    note: 'Most events happen on Saturdays'
  },
  Sunday: {
    eventLikelihood: 'high',
    typicalCategories: ['family', 'markets', 'culture', 'brunch'],
    note: 'Family-oriented events, afternoon concerts'
  }
};
```

### AI Day-Aware Event Suggestions
```typescript
function shouldPrioritizeEvents(dayOfWeek: string): boolean {
  return ['Friday', 'Saturday', 'Sunday'].includes(dayOfWeek);
}

function getEventSearchPriority(dayOfWeek: string): number {
  // Higher number = search events more aggressively
  const priorities = {
    Saturday: 10,
    Sunday: 9,
    Friday: 8,
    Thursday: 5,
    Wednesday: 4,
    Tuesday: 2,
    Monday: 2
  };
  return priorities[dayOfWeek] || 3;
}
```

## Caching Strategy

### Event Data Caching
Events don't change frequently - cache to reduce API calls:

```typescript
interface EventCache {
  key: string;              // Hash of search params
  events: Event[];
  fetchedAt: Date;
  expiresAt: Date;
}

const CACHE_DURATION = {
  sameDay: 3600000,        // 1 hour (events today)
  future: 86400000,        // 24 hours (future events)
  past: 604800000          // 7 days (past events for history)
};

async function getCachedEvents(params: EventSearchParams): Promise<Event[] | null> {
  const cacheKey = hashSearchParams(params);
  const cached = await blobStorage.get(`event-cache/${cacheKey}`);
  
  if (cached && cached.expiresAt > new Date()) {
    return cached.events;
  }
  
  return null;
}
```

## Error Handling

### Graceful Degradation
```typescript
async function searchEventsWithFallback(params: EventSearchParams): Promise<Event[]> {
  try {
    // Try primary source
    const locale = await detectLocale(params.lat, params.lon);
    const primarySource = getEventSources(locale.countryCode)[0];
    
    const events = await searchEventSource(primarySource, params);
    return events;
    
  } catch (primaryError) {
    console.error(`Primary event source failed: ${primaryError.message}`);
    
    try {
      // Fallback to Eventbrite (global)
      const events = await searchEventbrite(params);
      return events;
      
    } catch (fallbackError) {
      console.error(`Fallback event source failed: ${fallbackError.message}`);
      
      // Return empty array - continue with non-event activities
      return [];
    }
  }
}
```

## Testing Event Integration

### Test Cases
1. **Locale Detection**
   - Test with coordinates from Finland, Sweden, US, etc.
   - Verify correct event source selection

2. **Event Search**
   - Search with various categories and keywords
   - Test date filtering (today, tomorrow, next week)
   - Test radius filtering

3. **Deduplication**
   - Same event from multiple sources
   - Similar but different events

4. **AI Integration**
   - User requests with implicit event interest
   - Itinerary generation with fixed-time events
   - Day-of-week event prioritization

5. **Error Handling**
   - API key missing
   - API rate limit exceeded
   - Network failure
   - No events found

### Example Test
```typescript
describe('Event Integration', () => {
  it('should use Tapahtumainfo for Finnish location', async () => {
    const locale = await detectLocale(60.1695, 24.9354); // Helsinki
    expect(locale.countryCode).toBe('FI');
    expect(locale.eventSources).toContain('tapahtumainfo');
  });
  
  it('should find events on Saturday', async () => {
    const saturday = getNextSaturday();
    const events = await searchEvents({
      lat: 60.1695,
      lon: 24.9354,
      radius: 10,
      date: saturday,
      maxResults: 10
    });
    
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty('startTime');
    expect(events[0]).toHaveProperty('category');
  });
});
```

## Future Enhancements

1. **User Preferences Learning**
   - Track which event categories users prefer
   - Personalized event recommendations

2. **Event Notifications**
   - Alert users about upcoming events in their saved locations
   - "There's a jazz festival next Saturday in your area!"

3. **Ticket Integration**
   - Direct ticket purchase from itinerary cards
   - Price comparison across ticket sellers

4. **Social Features**
   - Share events with friends
   - See which events friends are attending
   - Group itinerary planning

5. **Multi-Day Festivals**
   - Suggest itineraries around multi-day events
   - Accommodation recommendations near festival venues

---

**Document Version**: 1.0  
**Date**: November 15, 2025  
**Status**: Specification Complete
