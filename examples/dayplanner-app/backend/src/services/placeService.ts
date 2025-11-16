// ============================================================================
// PlaceService - Points of Interest and venue search
// ============================================================================
// Uses Overpass API (OpenStreetMap) - free, no API key required
// For production, consider Google Places API for richer data

import { Place, SearchPlacesRequest, Location } from '../types/index.js';

export class PlaceService {
  private overpassUrl = 'https://overpass-api.de/api/interpreter';

  /**
   * Search for places/venues
   */
  async searchPlaces(request: SearchPlacesRequest): Promise<Place[]> {
    try {
      // Convert radius from km to meters for Overpass query
      const radiusMeters = request.radius * 1000;

      // Build Overpass query based on type or query
      const query = this.buildOverpassQuery(request, radiusMeters);

      const response = await fetch(this.overpassUrl, {
        method: 'POST',
        body: query,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return this.parseOverpassResponse(data);
    } catch (error) {
      console.error('Error searching places:', error);
      // Return mock data for demonstration
      return this.getMockPlaces(request);
    }
  }

  /**
   * Get place details by ID
   */
  async getPlaceDetails(placeId: string): Promise<Place | null> {
    // In a real implementation, fetch detailed info from OSM or Google Places
    console.warn('getPlaceDetails not fully implemented');
    return null;
  }

  /**
   * Build Overpass QL query
   */
  private buildOverpassQuery(request: SearchPlacesRequest, radiusMeters: number): string {
    const { lat, lon, type, query } = request;

    // Map common types to OSM tags
    const typeMapping: Record<string, string> = {
      restaurant: 'amenity=restaurant',
      cafe: 'amenity=cafe',
      museum: 'tourism=museum',
      park: 'leisure=park',
      attraction: 'tourism=attraction',
      beach: 'natural=beach',
    };

    const osmTag = type && typeMapping[type] ? typeMapping[type] : 'amenity=restaurant';

    // Overpass QL query
    return `[out:json][timeout:25];
(
  node[${osmTag}](around:${radiusMeters},${lat},${lon});
  way[${osmTag}](around:${radiusMeters},${lat},${lon});
);
out center;`;
  }

  /**
   * Parse Overpass API response into Place objects
   */
  private parseOverpassResponse(data: any): Place[] {
    const places: Place[] = [];

    for (const element of data.elements || []) {
      const tags = element.tags || {};
      
      if (!tags.name) continue;

      const lat = element.lat || element.center?.lat;
      const lon = element.lon || element.center?.lon;

      if (!lat || !lon) continue;

      places.push({
        id: `osm-${element.id}`,
        name: tags.name,
        type: tags.amenity || tags.tourism || tags.leisure || 'place',
        location: {
          lat,
          lon,
          address: this.formatAddress(tags),
        },
        phone: tags.phone,
        website: tags.website,
        openingHours: tags.opening_hours ? [tags.opening_hours] : undefined,
      });
    }

    return places;
  }

  /**
   * Format OSM address tags
   */
  private formatAddress(tags: any): string {
    const parts = [];
    if (tags['addr:street']) parts.push(tags['addr:street']);
    if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
    if (tags['addr:city']) parts.push(tags['addr:city']);
    return parts.length > 0 ? parts.join(', ') : tags.name || 'Unknown address';
  }

  /**
   * Mock places for development/fallback
   */
  private getMockPlaces(request: SearchPlacesRequest): Place[] {
    return [
      {
        id: 'mock-place-1',
        name: 'Seaside Bistro',
        type: 'restaurant',
        location: {
          lat: request.lat + 0.01,
          lon: request.lon + 0.01,
          address: '123 Beach Road',
        },
        rating: 4.5,
        priceLevel: 2,
      },
      {
        id: 'mock-place-2',
        name: 'Central Park',
        type: 'park',
        location: {
          lat: request.lat + 0.02,
          lon: request.lon - 0.01,
          address: 'City Center',
        },
      },
      {
        id: 'mock-place-3',
        name: 'Art Museum',
        type: 'museum',
        location: {
          lat: request.lat - 0.01,
          lon: request.lon + 0.02,
          address: '456 Culture Street',
        },
        rating: 4.8,
        priceLevel: 1,
      },
    ];
  }
}
