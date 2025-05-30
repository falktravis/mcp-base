// This file will contain shared type definitions for API requests and responses.

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

// Example type for a request body
export interface CreateServerPayload {
  name: string;
  url: string;
  type: 'sse' | 'streamable-http' | 'stdio'; // Example MCP server types
  // Add other relevant fields for server configuration
}

// Example type for a response
export interface ServerDetails {
  id: string;
  name: string;
  url: string;
  status: string;
  // Add other relevant fields
}
