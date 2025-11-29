import { useState, useEffect, useCallback } from 'react';
import { adventureAPI } from '@/lib/api';

/**
 * Custom hook that replaces useKV from @github/spark
 * Stores data in backend API (Cosmos DB) instead of Spark's KV store
 * 
 * Usage: Same API as useKV
 * const [value, setValue] = useAdventure<T>('key', defaultValue)
 */
export function useAdventure<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValueState] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);
  const [adventureId, setAdventureId] = useState<string | null>(null);

  // Load adventure from backend on mount
  useEffect(() => {
    async function loadAdventure() {
      try {
        // For 'current-adventure' key, try to load from backend
        if (key === 'current-adventure') {
          const adventures = await adventureAPI.list();
          if (adventures.length > 0) {
            // Load most recent adventure
            const latest = adventures[0];
            setValueState(latest as T);
            setAdventureId(latest.id);
          }
        }
      } catch (error) {
        console.error('Failed to load adventure:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadAdventure();
  }, [key]);

  // Save adventure to backend
  const setValue = useCallback(async (newValue: T) => {
    setValueState(newValue);

    try {
      if (key === 'current-adventure' && newValue) {
        const adventure = newValue as any;
        
        if (adventureId) {
          // Update existing adventure
          await adventureAPI.update(adventureId, adventure);
        } else {
          // Create new adventure
          const created = await adventureAPI.create(adventure);
          setAdventureId(created.id);
        }
      }
    } catch (error) {
      console.error('Failed to save adventure:', error);
    }
  }, [key, adventureId]);

  return [value, setValue];
}
