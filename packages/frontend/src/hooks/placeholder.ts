// packages/frontend/src/hooks/placeholder.ts
import { useState, useEffect } from 'react';
import { ApiResponse } from '@shared-types/api-contracts';

/**
 * @file placeholder.ts
 * @description This file serves as a placeholder for custom React hooks.
 * Hooks are reusable functions that let you "hook into" React state and lifecycle features
 * from function components.
 */

/**
 * @hook usePlaceholderData
 * @description An example custom hook that simulates fetching data.
 * @param {string} endpoint - A dummy endpoint to fetch from.
 * @returns {{ data: T | null, loading: boolean, error: Error | null }}
 */
export const usePlaceholderData = <T>(endpoint: string): {
  data: T | null;
  loading: boolean;
  error: Error | null;
} => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    console.log(`usePlaceholderData: Fetching data from dummy endpoint: ${endpoint}`);
    setLoading(true);
    const timer = setTimeout(() => {
      try {
        // Simulate API call        
        if (endpoint === 'example/success') {
          // Using ApiResponse structure from shared-types
          const apiResponse: ApiResponse<T> = {
            success: true,
            data: {
              message: 'This is placeholder data from a custom hook!',
              timestamp: new Date().toISOString(),
            } as T
          };
          setData(apiResponse.data || null);
          setError(null);
        } else if (endpoint === 'example/error') {
          const apiResponse: ApiResponse = {
            success: false,
            error: {
              message: 'Simulated API error in custom hook.',
              code: 'SIMULATED_ERROR'
            }
          };
          throw new Error(apiResponse.error?.message);} else {
          setData(null); // Or some default data
        }
      } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.error(`usePlaceholderData: Error fetching data from ${endpoint}`, e);
        setError(e);
        setData(null);
      } finally {
        setLoading(false);
      }
    }, 1000); // Simulate network delay

    return () => clearTimeout(timer); // Cleanup timeout on unmount
  }, [endpoint]);

  return { data, loading, error };
};

/**
 * @hook useToggle
 * @description A simple hook for managing a boolean toggle state.
 * @param {boolean} initialValue - The initial state of the toggle.
 * @returns {[boolean, () => void]}
 */
export const useToggle = (initialValue: boolean = false): [boolean, () => void] => {
  const [value, setValue] = useState<boolean>(initialValue);
  const toggle = () => setValue(prev => !prev);
  console.log(`useToggle: Initialized with ${initialValue}. Current value: ${value}`);
  return [value, toggle];
};

// Add more custom hooks as the application develops.
// For example:
// - useAuth: For managing authentication state and user info.
// - useFormInput: For handling form input state and validation.
// - useLocalStorage: For interacting with localStorage.

console.log('Placeholder hooks module loaded');
