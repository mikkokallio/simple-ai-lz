// ============================================================================
// Funday Types - Core data structures
// ============================================================================

export interface Location {
  lat: number;
  lon: number;
  address: string;
}

export interface LocaleInfo {
  countryCode: string;
  countryName: string;
  region?: string;
  city?: string;
  timezone: string;
  eventSources: string[];
}

export interface DayContext {
  dayOfWeek: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  specialConsiderations: string[];
}

export interface WeatherInfo {
  temperature: number;
  condition: string;
  precipitation: number;
  hourlyForecast: HourlyWeather[];
}

export interface HourlyWeather {
  time: string;
  temperature: number;
  condition: string;
  precipitation: number;
}

export interface Activity {
  id: string;
  type: 'travel' | 'dining' | 'sightseeing' | 'entertainment' | 'outdoor' | 'culture' | 'event';
  name: string;
  description: string;
  location: Location;
  startTime: Date;
  endTime?: Date;
  duration: number; // minutes
  placeId?: string;
  eventId?: string;
  rating?: number;
  priceLevel?: number;
  imageUrl?: string;
  website?: string;
  phone?: string;
  openingHours?: string[];
  daySpecificHours?: {
    open: string;
    close: string;
    isClosed: boolean;
    specialNote?: string;
  };
  eventDetails?: {
    category: string;
    organizer: string;
    ticketUrl?: string;
    ticketPrice?: string;
    isFixedTime: boolean;
    performers?: string[];
  };
  weatherDependent: boolean;
  travelToNext?: {
    mode: 'walk' | 'bike' | 'transit';
    distance: number; // meters
    duration: number; // minutes
    instructions?: string;
  };
}

export interface Itinerary {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  startLocation: Location & {
    locale: string;
    timezone: string;
  };
  radius: number;
  date: Date;
  dayContext: DayContext;
  preferences: {
    transportModes: string[];
    activityTypes: string[];
    cuisineTypes: string[];
    minRating: number;
    priceRange: string[];
    dietary: string[];
    includeEvents: boolean;
    eventCategories?: string[];
  };
  activities: Activity[];
  weather: WeatherInfo;
  totalDistance: number;
  totalDuration: number;
  status: 'draft' | 'finalized' | 'completed';
}

export interface Event {
  id: string;
  name: string;
  description: string;
  category: string;
  startDate: Date;
  endDate: Date;
  location: Location;
  organizer: string;
  ticketUrl?: string;
  ticketPrice?: string;
  isFree: boolean;
  imageUrl?: string;
  websiteUrl?: string;
  source: string; // 'tapahtumainfo', 'eventbrite', etc.
}

export interface Place {
  id: string;
  name: string;
  type: string;
  location: Location;
  rating?: number;
  priceLevel?: number;
  openingHours?: string[];
  phone?: string;
  website?: string;
  imageUrl?: string;
}

export interface GenerateItineraryRequest {
  userId: string;
  userInput: string;
  location: Location;
  radius: number;
  date: Date;
  preferences: Partial<Itinerary['preferences']>;
}

export interface SearchEventsRequest {
  lat: number;
  lon: number;
  radius: number;
  date: Date;
  categories?: string[];
  keywords?: string[];
}

export interface SearchPlacesRequest {
  query?: string;
  lat: number;
  lon: number;
  radius: number;
  type?: string;
}
