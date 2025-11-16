// ============================================================================
// EventService - Event discovery and integration
// ============================================================================
// Supports multiple event sources with locale-aware selection

import { Event, SearchEventsRequest, LocaleInfo } from '../types/index.js';
import { LocaleService } from './localeService.js';

export class EventService {
  private localeService: LocaleService;

  constructor(localeService: LocaleService) {
    this.localeService = localeService;
  }

  /**
   * Search for events based on location, date, and preferences
   */
  async searchEvents(request: SearchEventsRequest): Promise<Event[]> {
    try {
      // Detect locale to determine which event sources to use
      const locale = await this.localeService.detectLocale(request.lat, request.lon);

      const events: Event[] = [];

      // Use locale-appropriate event sources
      for (const source of locale.eventSources) {
        try {
          const sourceEvents = await this.searchEventSource(source, request);
          events.push(...sourceEvents);
        } catch (error) {
          console.error(`Error searching ${source}:`, error);
          // Continue with other sources
        }
      }

      // Deduplicate and sort by date
      const uniqueEvents = this.deduplicateEvents(events);
      uniqueEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

      return uniqueEvents;
    } catch (error) {
      console.error('Error searching events:', error);
      return [];
    }
  }

  /**
   * Get event details by ID
   */
  async getEventDetails(eventId: string): Promise<Event | null> {
    // In a real implementation, this would fetch from the appropriate source
    // For now, return null
    console.warn('getEventDetails not fully implemented');
    return null;
  }

  /**
   * Search events from a specific source
   */
  private async searchEventSource(
    source: string,
    request: SearchEventsRequest
  ): Promise<Event[]> {
    switch (source) {
      case 'tapahtumainfo':
        return this.searchTapahtumaInfo(request);
      case 'eventbrite':
        return this.searchEventbrite(request);
      default:
        return [];
    }
  }

  /**
   * Search Tapahtumainfo.fi (Finland)
   */
  private async searchTapahtumaInfo(request: SearchEventsRequest): Promise<Event[]> {
    // Mock implementation - replace with actual API integration
    // API key would be in environment: process.env.TAPAHTUMAINFO_API_KEY
    
    console.log('Tapahtumainfo search not fully implemented - returning empty array');
    
    // Return empty array until real API is implemented
    // This prevents fake events from appearing in itineraries
    return [];
  }

  /**
   * Search Eventbrite (Global)
   */
  private async searchEventbrite(request: SearchEventsRequest): Promise<Event[]> {
    // Mock implementation - replace with actual API integration
    // API key would be in environment: process.env.EVENTBRITE_API_KEY
    
    console.log('Eventbrite search not fully implemented - returning empty array');
    
    // Return empty array until real API is implemented
    // This prevents fake events from appearing in itineraries
    return [];
  }

  /**
   * Deduplicate events that appear in multiple sources
   */
  private deduplicateEvents(events: Event[]): Event[] {
    const seen = new Map<string, Event>();

    for (const event of events) {
      // Create a key based on name, date, and approximate location
      const key = `${event.name.toLowerCase()}-${event.startDate.toDateString()}-${Math.round(event.location.lat * 100)}`;
      
      if (!seen.has(key)) {
        seen.set(key, event);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Determine if events should be prioritized based on day of week
   */
  shouldPrioritizeEvents(dayOfWeek: string): boolean {
    return ['Friday', 'Saturday', 'Sunday'].includes(dayOfWeek);
  }
}
