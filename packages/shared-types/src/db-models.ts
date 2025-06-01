// This file will contain shared type definitions for database models,
import { ServerType, ServerStatus } from './api-contracts'; // Import shared enums

export interface ManagedMcpServer {
  id: string; // Primary Key, e.g., UUID
  name: string;
  description?: string;
  serverType: ServerType;
  // Store connection details securely, potentially encrypted or referencing a secrets manager
  connectionDetails: { // Mirrored from RegisterServerRequest for consistency
    url?: string; // For http, sse, websocket. Could be encrypted.
    command?: string; // For stdio
    args?: string[]; // For stdio
    workingDirectory?: string; // For stdio
    env?: Record<string, string>; // For stdio, sensitive values should be handled carefully
  };
  mcpOptions?: string; // JSON string of Record<string, any>, consider if this needs to be structured or encrypted
  status: ServerStatus; // Denormalized status for quick lookups, updated by the service
  isEnabled: boolean; // If the server is actively managed/proxied
  tags?: string; // JSON string of string[] for easier DB querying if not using JSON type
  createdAt: Date;
  updatedAt: Date;
  lastPingedAt?: Date; // For health checks
  lastError?: string; // Store last error message for troubleshooting
}

export interface TrafficLog {
  id: string; // Primary Key, e.g., UUID
  serverId: string; // Foreign key to ManagedMcpServer.id
  timestamp: Date;
  // MCP specific fields
  mcpMethod: string;
  mcpRequestId?: string;
  mcpSessionId?: string; // Added for session tracking
  gatewayRequestId?: string; // Added for gateway's internal request tracking
  // HTTP specific fields for the gateway interaction
  sourceIp?: string;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
  httpStatus?: number; // Status code of the gateway response to the client
  targetServerHttpStatus?: number; // Status code from the target MCP server (if applicable)
  isSuccess: boolean; // Based on MCP response or HTTP status
  durationMs: number; // Total duration for MCP Pro to handle and proxy the request
  apiKeyId?: string; // Foreign key to ApiKey.id, if an API key was used for the gateway
  errorMessage?: string; // If an error occurred
  transportType?: 'http_post' | 'sse_init' | 'sse_stream' | 'http_post_error' | 'sse_init_error'; // Added for clarity
}

export interface ApiKey {
  id: string; // Primary Key, e.g., UUID
  name: string;
  hashedApiKey: string; // Store only the securely hashed and salted API key
  salt: string; // Salt used for hashing this specific key
  prefix: string; // A few characters of the original key for identification (e.g., "mcp_abc...") - NOT the key itself
  scopes?: string; // JSON string of string[], e.g., ["server:read", "server:manage:*", "apikey:manage"]
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date; // Instead of deleting, mark as revoked
  createdAt: Date;
  updatedAt: Date;
}

// Future table for Marketplace Extension installations per server
export interface ServerExtensionInstallation {
  id: string; // Primary Key
  serverId: string; // Foreign Key to ManagedMcpServer.id
  extensionId: string; // Marketplace Extension ID
  installedAt: Date;
  version: string;
  config?: string; // JSON string for extension-specific configuration
  isEnabled: boolean;
}
