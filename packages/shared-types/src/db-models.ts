// This file will contain shared type definitions for database models,

export interface ManagedMcpServer {
  id: string;
  name: string;
  url: string;
  type: string; // e.g., 'sse', 'streamable-http', 'stdio'
  apiKey?: string; // Encrypted
  credentials?: string; // Encrypted JSON blob for other auth types
  description?: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrafficLog {
  id: string;
  serverId: string; // Foreign key to ManagedMcpServer
  timestamp: Date;
  requestType: 'tool_call' | 'resource_access' | 'prompt_request';
  targetTool?: string;
  targetResourceUri?: string;
  targetPromptName?: string;
  requestPayload: unknown; // JSON blob
  responsePayload?: unknown; // JSON blob
  isSuccess: boolean;
  durationMs: number;
  clientIp?: string;
  apiKeyId?: string; // If request used an API key (references ApiKey.id)
}

export interface ApiKey {
  id: string;
  hashedKey: string; // Store only the hash
  prefix: string; // For display, e.g., "mcp_abc..."
  name?: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
