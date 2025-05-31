// This file will contain shared type definitions for API requests and responses.

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string; // e.g., 'VALIDATION_ERROR', 'NOT_FOUND'
    details?: unknown; // Additional error details
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// --- Server Management ---

export type ServerType = 'sse' | 'streamable-http' | 'stdio' | 'websocket'; // Added websocket
export type ServerStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown';

export interface RegisterServerRequest {
  name: string;
  description?: string;
  serverType: ServerType;
  connectionDetails: { // Type-specific connection details
    url?: string; // For http, sse, websocket
    command?: string; // For stdio
    args?: string[]; // For stdio
    workingDirectory?: string; // For stdio
    env?: Record<string, string>; // For stdio
  };
  // mcpOptions might include things like supported mcp_versions, etc.
  mcpOptions?: Record<string, any>;
  // Any other relevant fields for server configuration
  tags?: string[];
}

export interface ManagedMcpServerDetails {
  id: string;
  name: string;
  description?: string;
  serverType: ServerType;
  connectionDetails: RegisterServerRequest['connectionDetails'];
  mcpOptions?: Record<string, any>;
  status: ServerStatus;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
  tags?: string[];
  // Potentially add last seen, error messages, etc.
}

export interface UpdateServerConfigRequest {
  name?: string;
  description?: string;
  serverType?: ServerType;
  connectionDetails?: RegisterServerRequest['connectionDetails'];
  mcpOptions?: Record<string, any>;
  tags?: string[];
}

export interface ServerStatusResponse {
  serverId: string;
  status: ServerStatus;
  timestamp: string; // ISO 8601 date string
  details?: string; // e.g., error message if status is 'error'
}

export interface ServerLogEntry {
  timestamp: string; // ISO 8601 date string
  level: 'info' | 'error' | 'debug';
  message: string;
}

export interface ServerLogsResponse {
  serverId: string;
  logs: ServerLogEntry[];
  nextToken?: string; // For pagination of logs
}

// --- API Key Management ---

export interface CreateApiKeyRequest {
  name: string;
  expiresAt?: string; // ISO 8601 date string, optional
  // Future: scopes/permissions
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string; // The actual API key - show only on creation
  createdAt: string; // ISO 8601 date string
  expiresAt?: string; // ISO 8601 date string
}

export interface ApiKeyDetails {
  id: string;
  name: string;
  createdAt: string; // ISO 8601 date string
  expiresAt?: string; // ISO 8601 date string
  lastUsedAt?: string; // ISO 8601 date string
  // Future: scopes/permissions
}

export interface ListApiKeysResponse {
  apiKeys: ApiKeyDetails[];
}

// --- Traffic Monitoring ---

export interface TrafficStats {
  totalRequests: number;
  failedRequests: number;
  successRate: number;
  // averageResponseTimeMs: number; // This was in the original plan but not in the current service impl.
  // Potentially data in/out
}

export interface TrafficStatsResponse {
  // The service returns a single stats object based on filters, not an array of stats for different periods/servers.
  stats: TrafficStats; 
}

// --- Marketplace ---

export interface MarketplaceExtension {
  id: string;
  name: string;
  version: string;
  publisher: string;
  shortDescription: string;
  // Add other relevant fields like icon URL, categories, etc.
}

export interface MarketplaceExtensionDetails extends MarketplaceExtension {
  longDescription: string;
  readme: string; // Markdown content
  // releaseNotes, dependencies, etc.
}

export interface InstallExtensionRequest {
  serverId: string; // ID of the server to install the extension on
  // Potentially version, configuration options for the extension
}

// --- MCP Gateway API ---
// MCP Request and Response types are generic as they depend on the specific MCP method.
// These are placeholders and might be more detailed if specific MCP versions/dialects are targeted.

export interface McpRequestPayload {
  mcp_version: string;
  request_id: string;
  method: string;
  params?: any;
  // Could include auth tokens if the target server expects them in-band
  // authorization?: { scheme: string; token: string };
}

export interface McpError {
  code: number; // MCP error code
  message: string;
  data?: any;
}

export interface McpResponsePayload {
  mcp_version: string;
  request_id: string;
  result?: any;
  error?: McpError | null;
}

// General error structure for API responses (alternative to ApiResponse.error)
export interface ErrorResponse {
  error: {
    code: string; // e.g., 'UNAUTHORIZED', 'INVALID_INPUT', 'SERVER_ERROR'
    message: string;
    target?: string; // Field that caused the error
    details?: Array<{ code: string; message: string; target?: string }>; // For multiple validation errors
  };
}
