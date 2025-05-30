// packages/frontend/src/contexts/placeholder.tsx
import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';

/**
 * @file placeholder.tsx
 * @description This file serves as a placeholder for React Contexts.
 * Context provides a way to pass data through the component tree without having to pass props down manually at every level.
 */

// 1. Define the shape of the context data
interface IPlaceholderContext {
  message: string;
  setMessage: Dispatch<SetStateAction<string>>;
  count: number;
  incrementCount: () => void;
}

// 2. Create the Context with a default value (can be undefined or a default object)
// It's good practice to provide a default that matches the interface, or null/undefined
// and handle the null case in the custom hook.
const PlaceholderContext = createContext<IPlaceholderContext | undefined>(undefined);

// 3. Create a Provider component
interface PlaceholderProviderProps {
  children: ReactNode;
  initialMessage?: string;
}

export const PlaceholderProvider: React.FC<PlaceholderProviderProps> = ({ children, initialMessage = "Hello from Placeholder Context!" }) => {
  const [message, setMessage] = useState<string>(initialMessage);
  const [count, setCount] = useState<number>(0);

  const incrementCount = () => {
    setCount(prevCount => prevCount + 1);
    console.log('PlaceholderContext: Count incremented');
  };

  console.log('PlaceholderProvider: Rendering with message:', message, 'and count:', count);

  return (
    <PlaceholderContext.Provider value={{ message, setMessage, count, incrementCount }}>
      {children}
    </PlaceholderContext.Provider>
  );
};

// 4. Create a custom hook to consume the context easily
export const usePlaceholder = (): IPlaceholderContext => {
  const context = useContext(PlaceholderContext);
  if (context === undefined) {
    throw new Error('usePlaceholder must be used within a PlaceholderProvider');
  }
  console.log('usePlaceholder: Consuming context');
  return context;
};

// Example of how to use this context in _app.tsx or a layout component:
// <PlaceholderProvider initialMessage="Welcome to MCP Pro!">
//   <Component {...pageProps} />
// </PlaceholderProvider>

// Add more contexts as needed, for example:
// - AuthContext: For global authentication state and user information.
// - ThemeContext: For managing application theme (light/dark mode).
// - SettingsContext: For user-specific application settings.

console.log('Placeholder context module loaded');
