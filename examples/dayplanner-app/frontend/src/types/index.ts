// Frontend type definitions matching backend types
export interface Location {
  lat: number;
  lon: number;
  address: string;
}

export interface Activity {
  id: string;
  type: string;
  name: string;
  description: string;
  location: Location;
  startTime: string;
  duration: number;
  rating?: number;
  priceLevel?: number;
  weatherDependent: boolean;
  travelToNext?: {
    mode: string;
    distance: number;
    duration: number;
  };
  daySpecificHours?: {
    open: string;
    close: string;
    isClosed: boolean;
    specialNote?: string;
  };
  eventDetails?: {
    category: string;
    ticketUrl?: string;
    ticketPrice?: string;
  };
}

export interface Itinerary {
  id: string;
  name: string;
  date: string;
  activities: Activity[];
  weather: {
    temperature: number;
    condition: string;
    precipitation: number;
  };
  dayContext: {
    dayOfWeek: string;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName?: string;
    specialConsiderations: string[];
  };
  totalDistance: number;
  totalDuration: number;
}
