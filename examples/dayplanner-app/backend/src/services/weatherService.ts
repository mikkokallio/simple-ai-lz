// ============================================================================
// WeatherService - Weather forecast integration
// ============================================================================
// Uses Open-Meteo API (free, no API key required)

import { WeatherInfo, HourlyWeather } from '../types/index.js';

export class WeatherService {
  private baseUrl = 'https://api.open-meteo.com/v1/forecast';

  /**
   * Get weather forecast for a location and date
   */
  async getForecast(lat: number, lon: number, date: Date): Promise<WeatherInfo> {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const url = `${this.baseUrl}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,weather_code&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      const hourlyForecast: HourlyWeather[] = data.hourly.time.map((time: string, index: number) => ({
        time,
        temperature: data.hourly.temperature_2m[index],
        precipitation: data.hourly.precipitation[index],
        condition: this.getWeatherCondition(data.hourly.weather_code[index]),
      }));

      // Calculate average temperature and total precipitation
      const avgTemperature = hourlyForecast.reduce((sum, h) => sum + h.temperature, 0) / hourlyForecast.length;
      const totalPrecipitation = hourlyForecast.reduce((sum, h) => sum + h.precipitation, 0);

      // Determine overall condition (use midday condition as representative)
      const middayIndex = Math.floor(hourlyForecast.length / 2);
      const condition = hourlyForecast[middayIndex]?.condition || 'Unknown';

      return {
        temperature: Math.round(avgTemperature),
        condition,
        precipitation: totalPrecipitation,
        hourlyForecast,
      };
    } catch (error) {
      console.error('Error fetching weather forecast:', error);
      // Return default weather data
      return {
        temperature: 20,
        condition: 'Partly cloudy',
        precipitation: 0,
        hourlyForecast: [],
      };
    }
  }

  /**
   * Interpret WMO weather codes
   * https://open-meteo.com/en/docs
   */
  private getWeatherCondition(code: number): string {
    const conditionMap: Record<number, string> = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Foggy',
      48: 'Foggy',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Heavy drizzle',
      61: 'Light rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      71: 'Light snow',
      73: 'Moderate snow',
      75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Light rain showers',
      81: 'Moderate rain showers',
      82: 'Heavy rain showers',
      85: 'Light snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with hail',
      99: 'Thunderstorm with hail',
    };

    return conditionMap[code] || 'Unknown';
  }

  /**
   * Check if weather is suitable for outdoor activities
   */
  isGoodForOutdoor(weather: WeatherInfo): boolean {
    const badConditions = ['Heavy rain', 'Thunderstorm', 'Heavy snow', 'Moderate rain'];
    return !badConditions.some(c => weather.condition.includes(c)) && weather.precipitation < 5;
  }

  /**
   * Get weather-appropriate activity suggestions
   */
  getActivitySuggestions(weather: WeatherInfo): string[] {
    if (weather.temperature < 0) {
      return ['indoor', 'museum', 'cafe', 'shopping'];
    }
    
    if (weather.precipitation > 5 || weather.condition.includes('rain')) {
      return ['indoor', 'museum', 'cafe', 'cinema', 'shopping'];
    }

    if (weather.temperature > 25 && weather.precipitation < 2) {
      return ['outdoor', 'beach', 'park', 'picnic', 'swimming'];
    }

    return ['outdoor', 'sightseeing', 'walking', 'cafe'];
  }
}
