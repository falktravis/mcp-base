import { EventEmitter } from 'events';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport, StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { 
    Tool, 
    CallToolRequest, 
    CallToolResult, 
    Request as McpSdkRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { ManagedServerService } from './ManagedServerService';
import { ApiKeyService } from './ApiKeyService';
import { TrafficMonitoringService } from './TrafficMonitoringService';
import { v4 as uuidv4 } from 'uuid';
import { McpErrorCode, McpRequestPayload, McpResponsePayload } from 'shared-types/api-contracts';
import { TrafficLog } from 'shared-types/db-models';

// Session and tool interfaces
interface SessionApiKey {
  id: string;
  name: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface McpSession {
  sessionId: string;
  apiKey: SessionApiKey;
  scopes: string[];
  createdAt: Date;
  lastActivity: Date;
  clientInfo: Record<string, any>;
  capabilities: Record<string, any>;
  allowedServers?: string[];
}

interface AggregatedToolMapping {
  originalToolName: string;
  serverId: string;
  serverName: string;
  originalToolDefinition: Tool;
}

/**
 * Central MCP Gateway Service - single, clean implementation
 */
export class CentralGatewayMCPService extends EventEmitter {
  public readonly instanceId: string;
  private mcpServer: Server | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
  private managedServerService: ManagedServerService;
  private apiKeyService: ApiKeyService;
  private trafficMonitoringService: TrafficMonitoringService;

  // Aggregated tool and session state
  private aggregatedTools: Map<string, AggregatedToolMapping> = new Map();
  private activeSessions: Map<string, McpSession> = new Map();
  private isGatewayInitialized = false;
  private sessionCleanupInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_TIMEOUT_MS = 1000 * 60 * 60; // 1 hour
  private readonly CLEANUP_INTERVAL_MS = 1000 * 60 * 10; // 10 min

  constructor(
    managedServerService: ManagedServerService,
    apiKeyService: ApiKeyService,
    trafficMonitoringService: TrafficMonitoringService
  ) {
    super();
    this.managedServerService = managedServerService;
    this.apiKeyService = apiKeyService;
    this.trafficMonitoringService = trafficMonitoringService;
    this.instanceId = uuidv4();
    console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] Created.`);
  }

  public async initialize(): Promise<void> {
    console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] Attempting to initialize...`);
    try {
      this.mcpServer = new Server({
        name: 'MCP Pro Central Gateway',
        version: '1.0.0',
        capabilities: {
          tools: { 
            listChanged: true 
          }, 
          logging: {},
        },
        initialize: async (request: McpSdkRequest, context?: any): Promise<any> => {
          const sessionId = context?.sessionId || uuidv4(); 
          const requestId = context?.requestId || (request as any).id || uuidv4();

          console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] SDK SERVER HOOK: 'initialize' called. SID: ${sessionId}, ReqID: ${requestId}, Params: ${JSON.stringify(request.params)}, Context: ${JSON.stringify(context)}`);

          try {
            const params = request.params as { clientInfo?: { apiKey?: string }, apiKey?: string, [key: string]: any };
            const clientInfo = params?.clientInfo;
            const apiKeyValue = clientInfo?.apiKey || params?.apiKey;

            let apiKey: SessionApiKey | null = null;
            console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] Initialize: MCP_GATEWAY_AUTH_BYPASS = ${process.env.MCP_GATEWAY_AUTH_BYPASS}`);

            if (process.env.MCP_GATEWAY_AUTH_BYPASS !== 'true') {
              if (!apiKeyValue) {
                console.warn(`[CentralGatewayMCPService] Initialize: API key missing. RequestId: ${requestId}, SessionId: ${sessionId}`);
                throw {
                  code: McpErrorCode.UNAUTHENTICATED,
                  message: "API key is required for gateway access.",
                  data: { requestId }
                };
              }

              const validatedApiKey = await this.apiKeyService.validateApiKey(apiKeyValue);
              if (!validatedApiKey) {
                console.warn(`[CentralGatewayMCPService] Initialize: Invalid API key. Key prefix: ${apiKeyValue.substring(0, 5)}... RequestId: ${requestId}, SessionId: ${sessionId}`);
                throw {
                  code: McpErrorCode.AUTHENTICATION_FAILED,
                  message: "Invalid or expired API key.",
                  data: { requestId }
                };
              }
              
              // Ensure scopes is always string[]
              let scopes: string[];
              if (typeof validatedApiKey.scopes === 'string') {
                scopes = [validatedApiKey.scopes];
              } else if (Array.isArray(validatedApiKey.scopes)) {
                scopes = validatedApiKey.scopes;
              } else {
                scopes = ['mcp:connect']; // Default if validatedApiKey.scopes is undefined or invalid type
              }

              const requiredScopes = ['mcp:connect'];
              const hasRequiredScopes = requiredScopes.every(scope => scopes.includes(scope));
              
              if (!hasRequiredScopes) {
                console.warn(`[CentralGatewayMCPService] Initialize: Insufficient scopes for key ${validatedApiKey.id}. RequestId: ${requestId}, SessionId: ${sessionId}`);
                throw {
                  code: McpErrorCode.AUTHENTICATION_FAILED, // Using AUTHENTICATION_FAILED for scope issues for now
                  message: "Insufficient permissions. Required scopes: " + requiredScopes.join(', '),
                  data: { requestId, requiredScopes, userScopes: scopes }
                };
              }

              apiKey = {
                id: validatedApiKey.id,
                name: validatedApiKey.name,
                expiresAt: validatedApiKey.expiresAt ? validatedApiKey.expiresAt.toISOString() : null,
                lastUsedAt: validatedApiKey.lastUsedAt ? validatedApiKey.lastUsedAt.toISOString() : null,
                revokedAt: validatedApiKey.revokedAt ? validatedApiKey.revokedAt.toISOString() : null,
                createdAt: validatedApiKey.createdAt.toISOString(),
                updatedAt: validatedApiKey.updatedAt.toISOString()
              };
            } else {
              console.log(`[CentralGatewayMCPService] Initialize: MCP_GATEWAY_AUTH_BYPASS is true. Bypassing API key validation for session ${sessionId}.`);
              apiKey = {
                id: 'dev-session-auth-bypassed',
                name: 'Auth Bypassed Development Key',
                expiresAt: null,
                lastUsedAt: null,
                revokedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
            }

            let sessionScopes: string[];
            if (process.env.MCP_GATEWAY_AUTH_BYPASS === 'true') {
                sessionScopes = ['mcp:connect', 'tools:call', 'tools:list', 'admin:all']; // Grant all scopes if auth is bypassed
            } else {
                // Ensure apiKey is not null when auth is not bypassed
                if (!apiKey) { // This should ideally not be reached if logic is correct, but as a safeguard
                    console.error("[CentralGatewayMCPService] Initialize: apiKey is null after validation attempted. This indicates a logic flaw.");
                    throw {
                        code: McpErrorCode.INTERNAL_ERROR,
                        message: "Internal server error during API key processing.",
                        data: { requestId }
                    };
                }
                const validatedApiKeyScopes = (apiKey as any).scopes; // Assuming validatedApiKey would have populated apiKey here
                if (typeof validatedApiKeyScopes === 'string') {
                  sessionScopes = [validatedApiKeyScopes];
                } else if (Array.isArray(validatedApiKeyScopes)) {
                  sessionScopes = validatedApiKeyScopes;
                } else {
                  sessionScopes = ['mcp:connect']; 
                }
            }

            const session: McpSession = {
              sessionId: sessionId,
              apiKey: apiKey,
              scopes: sessionScopes,
              createdAt: new Date(),
              lastActivity: new Date(),
              clientInfo: clientInfo || {},
              capabilities: {}, 
              allowedServers: undefined
            };
            
            this.activeSessions.set(session.sessionId, session);
            console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] SDK SERVER HOOK: 'initialize' SUCCESS. Session ${session.sessionId} created/validated for API key ${apiKey?.name} (ID: ${apiKey?.id}). Returning session info.`);

            const gatewayCapabilitiesResponse = { 
              tools: { list: true, call: true, listChanged: true }, 
              logging: { log: true }
            };
            session.capabilities = gatewayCapabilitiesResponse;

            return {
              serverInfo: {
                name: "MCP Pro Central Gateway",
                version: "1.0.0",
                description: "MCP Pro Central Gateway - Unified interface for multiple MCP servers"
              },
              sessionId: session.sessionId,
              capabilities: gatewayCapabilitiesResponse, 
              instructions: "MCP Pro Central Gateway. Use serverName__toolName format for tools.",
              metadata: {
                gatewayVersion: "1.0.0",
                activeManagedServers: await this.managedServerService.getActiveServerCount?.() ?? 0,
                initialAggregatedTools: this.aggregatedTools.size 
              }
            };

          } catch (error: any) {
            console.error(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] SDK SERVER HOOK: 'initialize' FAILED. SID: ${sessionId}, ReqID: ${requestId}. Error Code: ${error.code}, Msg: ${error.message}`, error);
            if (error.code && error.message) {
              throw error; 
            }
            throw {
              code: McpErrorCode.INTERNAL_ERROR,
              message: "Gateway internal error during session initialization: " + (error.message || 'Unknown internal error during initialize.'),
              data: { requestId }
            };
          }
        },
        tools: async () => {
          console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] SDK SERVER HOOK: 'tools' called.`);
          return Array.from(this.aggregatedTools.values()).map(t => ({
            ...t.originalToolDefinition,
            name: this.getGatewayToolName(t.serverName, t.originalToolName),
            annotations: {
              ...t.originalToolDefinition.annotations,
              originServerId: t.serverId,
              originServerName: t.serverName,
              gatewayAggregated: true,
            },
          }));
        },
        callTool: async (sdkRequest: CallToolRequest, context?: any): Promise<CallToolResult> => {
          const params = sdkRequest.params;
          const toolName = params.name;
          const sessionId = context?.sessionId;
          const requestId = context?.requestId || (sdkRequest as any).id || uuidv4();
          console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] SDK SERVER HOOK: 'callTool' called. Tool: ${toolName}, SID: ${sessionId}, ReqID: ${requestId}, Context: ${JSON.stringify(context)}`);

          if (!sessionId) {
             console.error(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] SDK SERVER HOOK: 'callTool' - SessionId missing from context. Tool: ${toolName}, ReqID: ${requestId}.`);
             return { content: [], error: { code: McpErrorCode.AUTHENTICATION_FAILED, message: "Session ID is missing."}};
          }
          const session = this.validateSession(sessionId);
          if (!session) {
            console.warn(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] SDK SERVER HOOK: 'callTool' - Session ${sessionId} not found/expired. Tool: ${toolName}, ReqID: ${requestId}.`);
            return { 
                content: [], 
                error: { code: McpErrorCode.AUTHENTICATION_FAILED, message: "Session not found or expired for tools/call" } 
            };
          }
          
          console.log(`[CentralGatewayMCPService] Server constructor 'callTool' for tool: ${toolName}. Session: ${sessionId}, Request: ${requestId}.`);

          const mapping = this.getAggregatedToolMappingByGatewayName(toolName);
          if (!mapping) {
            console.warn(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] SDK SERVER HOOK: 'callTool' - Tool ${toolName} not found. SID: ${sessionId}, ReqID: ${requestId}.`);
            return { 
              content: [], 
              error: { code: McpErrorCode.METHOD_NOT_FOUND, message: `Tool ${toolName} not found via gateway.` } 
            };
          }
          
          session.lastActivity = new Date();

          return this.callDownstreamTool(mapping.serverId, mapping.originalToolName, params.arguments || {}, session, requestId);
        },
      });

      this.setupMcpServerHandlers();
      
      const transportOptions: StreamableHTTPServerTransportOptions = {
        sessionIdGenerator: () => uuidv4(),
      };
      this.transport = new StreamableHTTPServerTransport(transportOptions);
      await this.mcpServer.connect(this.transport);
      
      await this.refreshAggregatedTools(); 

      this.startSessionCleanup();
      this.setupDownstreamServerEventHandlers();

      this.isGatewayInitialized = true;
      console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] Gateway initialized and ready. isGatewayInitialized = true`);

    } catch (err: any) { 
      console.error(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] Main initialize() method failed:`, err);
      this.isGatewayInitialized = false;
      console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] Set isGatewayInitialized = false due to initialization error.`);
      this.emit('gatewayError', err); 
      throw err;
    }
  }

  public getTransport(): StreamableHTTPServerTransport | null {
    return this.transport;
  }

  private async refreshAggregatedTools(): Promise<void> {
    this.aggregatedTools.clear();
    const servers = await this.managedServerService.getAllManagedServers?.() || [];
    let newToolsCount = 0;
    for (const server of servers) {
      if (server.isEnabled && server.id) { 
        try {
          const tools = await this.managedServerService.listTools(server.id);
          for (const tool of tools) {
            const gatewayToolName = this.getGatewayToolName(server.name || server.id, tool.name);
            this.aggregatedTools.set(gatewayToolName, {
              originalToolName: tool.name,
              serverId: server.id,
              serverName: server.name || server.id,
              originalToolDefinition: tool,
            });
            newToolsCount++;
          }
        } catch (err: any) {
          console.error(`[CentralGatewayMCPService] Failed to aggregate tools from server ${server.name || server.id} (ID: ${server.id}):`, err.message);
        }
      }
    }
    console.log(`[CentralGatewayMCPService] Aggregated tools refreshed: ${newToolsCount} tools from ${servers.length} configured servers.`);
  }

  private getGatewayToolName(serverNameOrId: string, toolName: string): string {
    const prefix = serverNameOrId.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    return `${prefix}__${toolName}`;
  }

  private getAggregatedToolMappingByGatewayName(gatewayToolName: string): AggregatedToolMapping | undefined {
    return this.aggregatedTools.get(gatewayToolName);
  }

  private setupMcpServerHandlers(): void {
    if (!this.mcpServer) return;

    console.log("[CentralGatewayMCPService] setupMcpServerHandlers: Core handlers (initialize, tools/list, tools/call) are managed by Server constructor. Additional handlers can be set here.");
  }

  private validateSession(sessionId?: string): McpSession | null {
    if (!sessionId) {
      console.warn("[CentralGatewayMCPService] validateSession: Called with no sessionId.");
      return null;
    }
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn(`[CentralGatewayMCPService] validateSession: Session ${sessionId} not found in active sessions.`);
      return null;
    }
    
    const now = new Date();
    if (now.getTime() - session.lastActivity.getTime() > this.SESSION_TIMEOUT_MS) {
      this.activeSessions.delete(sessionId);
      console.log(`[CentralGatewayMCPService] validateSession: Session ${sessionId} expired and removed.`);
      return null;
    }
    return session;
  }

  private async callDownstreamTool(
    serverId: string, 
    toolName: string, 
    args: any, 
    session: McpSession,
    clientRequestId?: string
  ): Promise<CallToolResult> {
    const startTime = Date.now();
    const downstreamRequestId = uuidv4();
    let responsePayload: McpResponsePayload | null = null;
    
    try {
      console.log(`[CentralGatewayMCPService] Calling tool ${toolName} on server ${serverId} for session ${session.sessionId}. Downstream Req ID: ${downstreamRequestId}, Client Req ID: ${clientRequestId || 'N/A'}`);
      
      const requestPayloadForDownstream: McpRequestPayload = {
        mcp_version: "1.0",
        request_id: downstreamRequestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      responsePayload = await this.managedServerService.forwardRequestToServer(serverId, requestPayloadForDownstream);
      const duration = Date.now() - startTime;
      
      const logData: Omit<TrafficLog, "id" | "timestamp"> = { 
        serverId,
        mcpMethod: 'tools/call', 
        mcpRequestId: downstreamRequestId,
        mcpSessionId: session.sessionId,
        sourceIp: 'gateway-session',
        durationMs: duration, 
        isSuccess: !responsePayload.error, 
        httpStatus: responsePayload.error ? ( (responsePayload.error.code === McpErrorCode.METHOD_NOT_FOUND) ? 404 : 500) : 200,
        errorMessage: responsePayload.error?.message || undefined, 
        apiKeyId: session.apiKey.id,
      };
      this.trafficMonitoringService.logRequest(logData).catch(err => console.error("[CentralGatewayMCPService] Error logging request to TrafficMonitoringService:", err));
      
      if (responsePayload.error) {
        console.warn(`[CentralGatewayMCPService] Downstream server error for tool ${toolName} on server ${serverId} (Req ID: ${downstreamRequestId}): ${responsePayload.error.message}`);
        return { content: [], error: responsePayload.error }; 
      }
      
      const result = responsePayload.result;
      if (result && typeof result === 'object' && 'content' in result && Array.isArray((result as any).content)) {
         return result as CallToolResult;
      } else {
         console.warn(`[CentralGatewayMCPService] Unexpected result structure from downstream server ${serverId} for tool ${toolName} (Req ID: ${downstreamRequestId}). Wrapping into a text content part. Result:`, JSON.stringify(result));
         return {
            content: [{ type: "text", text: JSON.stringify(result ?? "No content") }]
         };
      }

    } catch (error: any) {
      console.error(`[CentralGatewayMCPService] Gateway-level error calling downstream tool ${toolName} on server ${serverId} (Req ID: ${downstreamRequestId}):`, error.message, error.stack);
      const duration = Date.now() - startTime;
      
      const errorLogData: Omit<TrafficLog, "id" | "timestamp"> = { 
        serverId,
        mcpMethod: 'tools/call',
        mcpRequestId: downstreamRequestId,
        mcpSessionId: session.sessionId,
        sourceIp: 'gateway-session',
        durationMs: duration,
        isSuccess: false,
        httpStatus: 500,
        errorMessage: `Gateway error: ${error.message}`,
        apiKeyId: session.apiKey.id,
      };
      this.trafficMonitoringService.logRequest(errorLogData).catch(err => console.error("[CentralGatewayMCPService] Error logging failure request to TrafficMonitoringService:", err));

      return { 
        content: [], 
        error: { 
          code: McpErrorCode.SERVER_ERROR,
          message: error.message || `Gateway failed to process call to downstream tool ${toolName} on server ${serverId}`
        } 
      };
    }
  }

  private setupDownstreamServerEventHandlers(): void {
    if (!this.managedServerService) {
        console.warn("[CentralGatewayMCPService] ManagedServerService not available. Cannot setup downstream event handlers.");
        return;
    }
    this.managedServerService.on('toolsChanged', async (serverId: string) => {
      console.log(`[CentralGatewayMCPService] Event: Tools changed for server ${serverId}, refreshing aggregated tools.`);
      await this.refreshAggregatedTools();
    });

    this.managedServerService.on('serverStatusChanged', async (serverId: string, status: string) => {
      console.log(`[CentralGatewayMCPService] Event: Server ${serverId} status changed to ${status}. Refreshing aggregated tools.`);
      await this.refreshAggregatedTools();
    });
  }

  private startSessionCleanup(): void {
    if (this.sessionCleanupInterval) { 
        clearInterval(this.sessionCleanupInterval);
    }
    this.sessionCleanupInterval = setInterval(() => {
      const now = new Date();
      let expiredCount = 0;
      for (const [sessionId, session] of this.activeSessions.entries()) {
        if (now.getTime() - session.lastActivity.getTime() > this.SESSION_TIMEOUT_MS) {
          this.activeSessions.delete(sessionId);
          console.log(`[CentralGatewayMCPService] Cleaned up expired session ${sessionId}`);
          expiredCount++;
        }
      }
      if (expiredCount > 0) {
        console.log(`[CentralGatewayMCPService] Session cleanup: Removed ${expiredCount} expired sessions.`);
      }
    }, this.CLEANUP_INTERVAL_MS);
    console.log(`[CentralGatewayMCPService] Session cleanup task started. Timeout: ${this.SESSION_TIMEOUT_MS / (60 * 1000)} min, Interval: ${this.CLEANUP_INTERVAL_MS / (60*1000)} min.`);
  }

  public getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  public getAggregatedToolCount(): number {
    return this.aggregatedTools.size;
  }

  public async cleanup(): Promise<void> {
    console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] Initiating cleanup...`);
    
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
      this.sessionCleanupInterval = null;
      console.log('[CentralGatewayMCPService] Stopped session cleanup interval.');
    }

    if (this.mcpServer) {
      await this.mcpServer.close();
      this.mcpServer = null;
      console.log('[CentralGatewayMCPService] MCP Server closed.');
    }

    if (this.transport) {
      this.transport.close();
      this.transport = null;
      console.log('[CentralGatewayMCPService] MCP Transport closed.');
    }

    this.activeSessions.clear();
    this.aggregatedTools.clear();
    this.isGatewayInitialized = false;
    console.log(`[CentralGatewayMCPService INSTANCE ${this.instanceId}] Cleared active sessions, aggregated tools, and reset initialization state. isGatewayInitialized = false`);
  }

  public isReady(): boolean {
    return this.isGatewayInitialized;
  }
}