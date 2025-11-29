import { useState, useEffect, useCallback } from 'react';
import { adventureAPI } from '@/lib/api';

/**
 * Custom hook that replaces useKV from @github/spark
 * Stores data in backend API (Cosmos DB) instead of Spark's KV store
 * 
 * Usage: Same API as useKV
 * const [value, setValue] = useAdventure<T>('key', defaultValue)
 */
export function useAdventure<T>(key: string, defaultValue: T): [T, (value: T) => void, boolean, (id: string) => Promise<void>] {
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
  const setValue = useCallback(async (newValue: T | ((prev: T) => T)) => {
    // Handle function updates
    const resolvedValue = typeof newValue === 'function' 
      ? (newValue as (prev: T) => T)(value)
      : newValue;
    
    setValueState(resolvedValue);

    try {
      if (key === 'current-adventure' && resolvedValue) {
        const adventure = resolvedValue as any;
        
        // Always use the adventure's own ID - it's the source of truth
        const id = adventure.id;
        
        if (!id) {
          console.error('Adventure has no ID, cannot save');
          return;
        }
        
        // Check if this adventure already exists in the backend
        if (adventureId === id) {
          // Update existing adventure
          console.log('Updating adventure:', id);
          await adventureAPI.update(id, adventure);
        } else {
          // This is either a new adventure or we're switching adventures
          // Try to update first, if it fails (404), create it
          try {
            console.log('Attempting to update adventure:', id);
            await adventureAPI.update(id, adventure);
            setAdventureId(id);
          } catch (updateError: any) {
            if (updateError.message?.includes('not found') || updateError.message?.includes('404')) {
              console.log('Adventure not found, creating new:', id);
              await adventureAPI.create(adventure);
              setAdventureId(id);
            } else {
              throw updateError;
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to save adventure:', error);
    }
  }, [key, adventureId, value]);

  const loadAdventure = useCallback(async (id: string) => {
    try {
      console.log('Loading adventure:', id);
      const adventure = await adventureAPI.get(id);
      setValueState(adventure as T);
      setAdventureId(adventure.id);
    } catch (error) {
      console.error('Failed to load adventure:', error);
    }
  }, []);

  return [value, setValue, isLoading, loadAdventure];
}
