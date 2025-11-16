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

    // Comprehensive mapping of activity types to OSM tags
    const typeMapping: Record<string, string> = {
      // Food & Drink
      restaurant: 'amenity=restaurant',
      cafe: 'amenity=cafe',
      bar: 'amenity=bar',
      pub: 'amenity=pub',
      nightclub: 'amenity=nightclub',
      fast_food: 'amenity=fast_food',
      food_court: 'amenity=food_court',
      ice_cream: 'amenity=ice_cream',
      
      // Shopping
      shop: 'shop',
      mall: 'shop=mall',
      shopping: 'shop',
      shopping_centre: 'shop=mall',
      supermarket: 'shop=supermarket',
      bookshop: 'shop=books',
      clothing: 'shop=clothes',
      
      // Entertainment & Culture
      cinema: 'amenity=cinema',
      theatre: 'amenity=theatre',
      museum: 'tourism=museum',
      gallery: 'tourism=gallery',
      art_gallery: 'tourism=gallery',
      library: 'amenity=library',
      music_venue: 'amenity=music_venue',
      casino: 'amenity=casino',
      
      // Nature & Outdoors
      park: 'leisure=park',
      garden: 'leisure=garden',
      nature_reserve: 'leisure=nature_reserve',
      beach: 'natural=beach',
      viewpoint: 'tourism=viewpoint',
      picnic_site: 'tourism=picnic_site',
      
      // Sports & Recreation
      sports_centre: 'leisure=sports_centre',
      swimming_pool: 'leisure=swimming_pool',
      fitness_centre: 'leisure=fitness_centre',
      gym: 'leisure=fitness_centre',
      stadium: 'leisure=stadium',
      
      // Tourism & Attractions
      attraction: 'tourism=attraction',
      monument: 'historic=monument',
      castle: 'historic=castle',
      church: 'amenity=place_of_worship',
      zoo: 'tourism=zoo',
      aquarium: 'tourism=aquarium',
      theme_park: 'tourism=theme_park',
      
      // Services
      hotel: 'tourism=hotel',
      spa: 'leisure=spa',
      
      // Default fallback
      default: 'amenity',
    };

    const osmTag = type && typeMapping[type] ? typeMapping[type] : typeMapping['default'];

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
