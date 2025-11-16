// ============================================================================
// LocaleService - Location and locale detection
// ============================================================================
// Uses OpenStreetMap Nominatim for geocoding (free, no API key required)
// Detects country, region, timezone, and applicable event sources

import { LocaleInfo, DayContext, Location } from '../types/index.js';

export class LocaleService {
  private nominatimBaseUrl = 'https://nominatim.openstreetmap.org';
  
  /**
   * Detect locale information from coordinates
   */
  async detectLocale(lat: number, lon: number): Promise<LocaleInfo> {
    try {
      const response = await fetch(
        `${this.nominatimBaseUrl}/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Funday-App/1.0',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      const address = data.address || {};

      const countryCode = address.country_code?.toUpperCase() || 'XX';
      const countryName = address.country || 'Unknown';

      return {
        countryCode,
        countryName,
        region: address.state || address.region,
        city: address.city || address.town || address.village,
        timezone: this.getTimezoneFromCountry(countryCode),
        eventSources: this.getEventSourcesForCountry(countryCode),
      };
    } catch (error) {
      console.error('Error detecting locale:', error);
      // Return default locale
      return {
        countryCode: 'FI',
        countryName: 'Finland',
        timezone: 'Europe/Helsinki',
        eventSources: ['tapahtumainfo', 'eventbrite'],
      };
    }
  }

  /**
   * Geocode address to coordinates
   */
  async geocode(address: string): Promise<Location> {
    try {
      const response = await fetch(
        `${this.nominatimBaseUrl}/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: {
            'User-Agent': 'Funday-App/1.0',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
      }

      const data = await response.json() as any[];
      
      if (!data || data.length === 0) {
        throw new Error('Address not found');
      }

      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        address: result.display_name,
      };
    } catch (error) {
      console.error('Error geocoding address:', error);
      throw error;
    }
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(lat: number, lon: number): Promise<Location> {
    try {
      const response = await fetch(
        `${this.nominatimBaseUrl}/reverse?format=json&lat=${lat}&lon=${lon}`,
        {
          headers: {
            'User-Agent': 'Funday-App/1.0',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      return {
        lat,
        lon,
        address: data.display_name || `${lat}, ${lon}`,
      };
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      throw error;
    }
  }

  /**
   * Get day context (day of week, holidays, special considerations)
   */
  async getDayContext(date: Date, countryCode: string): Promise<DayContext> {
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';

    // Check for public holidays using Nager.Date API (free, no key required)
    let isHoliday = false;
    let holidayName: string | undefined;

    try {
      const year = date.getFullYear();
      const response = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`
      );

      if (response.ok) {
        const holidays = await response.json() as any[];
        const dateStr = date.toISOString().split('T')[0];
        const holiday = holidays.find((h: any) => h.date === dateStr);
        
        if (holiday) {
          isHoliday = true;
          holidayName = holiday.name;
        }
      }
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }

    // Generate special considerations
    const specialConsiderations: string[] = [];

    if (dayOfWeek === 'Sunday') {
      specialConsiderations.push('Sunday - many shops and businesses close early or are closed');
      specialConsiderations.push('Public transport may have reduced schedules');
    }

    if (isHoliday) {
      specialConsiderations.push(`Public holiday (${holidayName}) - expect closures and limited services`);
    }

    if (dayOfWeek === 'Saturday') {
      specialConsiderations.push('Saturday - peak activity day, popular venues may be busy');
    }

    if (dayOfWeek === 'Monday') {
      specialConsiderations.push('Monday - some museums and attractions may be closed');
    }

    return {
      dayOfWeek,
      isWeekend,
      isHoliday,
      holidayName,
      specialConsiderations,
    };
  }

  /**
   * Get event sources for a country
   */
  private getEventSourcesForCountry(countryCode: string): string[] {
    const sourceMap: Record<string, string[]> = {
      FI: ['tapahtumainfo', 'eventbrite'],
      SE: ['eventbrite'],
      NO: ['eventbrite'],
      DK: ['eventbrite'],
      US: ['eventbrite'],
      GB: ['eventbrite'],
      DE: ['eventbrite'],
      FR: ['eventbrite'],
      ES: ['eventbrite'],
      IT: ['eventbrite'],
    };

    return sourceMap[countryCode] || ['eventbrite'];
  }

  /**
   * Get IANA timezone from country code
   */
  private getTimezoneFromCountry(countryCode: string): string {
    const timezoneMap: Record<string, string> = {
      FI: 'Europe/Helsinki',
      SE: 'Europe/Stockholm',
      NO: 'Europe/Oslo',
      DK: 'Europe/Copenhagen',
      US: 'America/New_York', // Default to Eastern
      GB: 'Europe/London',
      DE: 'Europe/Berlin',
      FR: 'Europe/Paris',
      ES: 'Europe/Madrid',
      IT: 'Europe/Rome',
    };

    return timezoneMap[countryCode] || 'UTC';
  }
}
