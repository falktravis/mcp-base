import { EventEmitter } from 'events';
import { ChildProcess, spawn } from 'child_process';
import { ManagedMcpServer } from 'shared-types/db-models';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Tool, CallToolRequest, CallToolResult, ListToolsResult, ListToolsRequest } from '@modelcontextprotocol/sdk/types.js';

// Adjust import paths for shared-types
import { ServerStatus, McpRequestPayload, McpResponsePayload, ServerType, McpError, McpErrorCode } from 'shared-types/api-contracts';

const CONNECTION_TIMEOUT_MS = 30000; // 30 seconds connection timeout

// Define the type for the callback function that forwards messages to the SSE client
export type ServerInitiatedMessageCallback = (targetServerId: string, message: McpResponsePayload | McpRequestPayload) => void;

// Define more specific types for events if needed
export interface McpConnectionWrapperEvents {
  on(event: 'statusChange', listener: (status: ServerStatus, serverId: string, details?: string) => void): this;
  on(event: 'message', listener: (message: any, serverId: string) => void): this;
  on(event: 'error', listener: (error: Error, serverId: string) => void): this;
  on(event: 'close', listener: (serverId: string, code?: number, reason?: string) => void): this;
  on(event: 'toolsChanged', listener: (serverId: string, tools: Tool[]) => void): this;
}

/**
 * @class McpConnectionWrapper
 * @description Wraps the MCP SDK's Client to manage a single MCP server connection,
 *              handle its lifecycle, and emit relevant events.
 *              Uses real MCP SDK instead of mock implementations.
 */
export class McpConnectionWrapper extends EventEmitter implements McpConnectionWrapperEvents {
  private mcpClient: Client | null = null;
  private transport: Transport | null = null;
  private currentStatus: ServerStatus = 'stopped';
  private lastError: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // ms
  private isExplicitlyClosed: boolean = false;
  private connectTimeoutId: NodeJS.Timeout | null = null;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private serverInitiatedMessageCallback?: ServerInitiatedMessageCallback;
  private cachedTools: Tool[] = [];

  constructor(
    public readonly serverId: string,
    private serverConfig: ManagedMcpServer,
    private stdioProcess?: ChildProcess,
    serverInitiatedMessageCallback?: ServerInitiatedMessageCallback
  ) {
    super();
    this.serverInitiatedMessageCallback = serverInitiatedMessageCallback;
    this.updateStatus('stopped');
  }

  private updateStatus(status: ServerStatus, details?: string): void {
    const oldStatus = this.currentStatus;
    if (oldStatus !== status || (details && this.lastError !== details)) {
      this.currentStatus = status;
      this.lastError = status === 'error' ? details || this.lastError || 'Unknown error' : null;
      
      if (status === 'error') {
        console.error(`[MCPConnectionWrapper-${this.serverId}] Status changed from ${oldStatus} to ${status}: ${this.lastError}`);
      } else {
        console.log(`[MCPConnectionWrapper-${this.serverId}] Status changed from ${oldStatus} to ${status}${details ? ": " + details : ""}`);
      }
      this.emit('statusChange', status, this.serverId, this.lastError || details);
    }
  }

  public getStatus(): { status: ServerStatus; error?: string | null } {
    return { status: this.currentStatus, error: this.lastError };
  }

  public getServerConfig(): ManagedMcpServer {
    return this.serverConfig;
  }

  public getCachedTools(): Tool[] {
    return [...this.cachedTools];
  }

  public updateServerConfig(newConfig: ManagedMcpServer, newStdioProcess?: ChildProcess): void {
    const wasRunning = this.currentStatus === 'running' || this.currentStatus === 'starting';
    const oldServerType = this.serverConfig.serverType;
    const oldConnectionDetails = JSON.stringify(this.serverConfig.connectionDetails);
    const oldMcpOptions = this.serverConfig.mcpOptions;

    this.serverConfig = newConfig;
    let stdioChanged = false;

    if (newConfig.serverType === 'stdio') {
        if (newStdioProcess && this.stdioProcess !== newStdioProcess) {
            this.stdioProcess = newStdioProcess;
            stdioChanged = true;
            console.log(`[MCPConnectionWrapper-${this.serverId}] STDIO process updated (PID: ${newStdioProcess.pid}).`);
        } else if (!newStdioProcess && this.stdioProcess) {
            console.warn(`[MCPConnectionWrapper-${this.serverId}] STDIO server config updated, but no new STDIO process provided. Old process (PID: ${this.stdioProcess.pid}) might still be linked.`);
        } else if (newStdioProcess && !this.stdioProcess) {
            this.stdioProcess = newStdioProcess;
            stdioChanged = true;
            console.log(`[MCPConnectionWrapper-${this.serverId}] New STDIO process provided (PID: ${newStdioProcess.pid}).`);
        }
    } else if (oldServerType === 'stdio') {
        this.stdioProcess = undefined;
        stdioChanged = true;
        console.log(`[MCPConnectionWrapper-${this.serverId}] Server type changed from STDIO. STDIO process unlinked.`);
    }

    const connectionConfigChanged = oldServerType !== newConfig.serverType || 
                                  JSON.stringify(newConfig.connectionDetails) !== oldConnectionDetails ||
                                  newConfig.mcpOptions !== oldMcpOptions;

    if ((connectionConfigChanged || stdioChanged) && wasRunning) {
      console.log(`[MCPConnectionWrapper-${this.serverId}] Server config or STDIO process changed significantly. Reconnecting...`);
      this.stop(true);
      setTimeout(() => this.connect(), stdioChanged ? 100 : 0);
    } else if (stdioChanged && newConfig.serverType === 'stdio' && !wasRunning) {
        console.log(`[MCPConnectionWrapper-${this.serverId}] STDIO process updated while server was stopped. Will use new process on next connect.`);
    }
  }

  public async connect(): Promise<void> {
    if (this.mcpClient && (this.currentStatus === 'running' || this.currentStatus === 'starting')) {
      console.warn(`[MCPConnectionWrapper-${this.serverId}] Connection attempt while already ${this.currentStatus}.`);
      return;
    }
    if (this.isExplicitlyClosed && this.currentStatus === 'stopped') {
        console.log(`[MCPConnectionWrapper-${this.serverId}] Explicitly closed. Will not auto-connect.`);
        return;
    }

    this.clearConnectTimeout();
    this.clearReconnectTimeout();
    this.isExplicitlyClosed = false;
    this.lastError = null;

    try {
      // Parse connection details
      let parsedConnectionConfigs: any[] = [];
      if (typeof this.serverConfig.connectionDetails === 'string') {
        try {
          parsedConnectionConfigs = JSON.parse(this.serverConfig.connectionDetails);
          if (!Array.isArray(parsedConnectionConfigs)) {
            parsedConnectionConfigs = parsedConnectionConfigs ? [parsedConnectionConfigs] : []; 
          }
        } catch (e: any) {
          console.error(`[MCPConnectionWrapper-${this.serverId}] Failed to parse connectionDetails JSON:`, e.message);
          this.updateStatus('error', `Invalid connectionDetails JSON: ${e.message}`);
          if (!this.isExplicitlyClosed) {
            this.scheduleReconnect();
          }
          return;
        }
      } else if (Array.isArray(this.serverConfig.connectionDetails)) {
          parsedConnectionConfigs = this.serverConfig.connectionDetails;
      } else if (this.serverConfig.connectionDetails) { 
          parsedConnectionConfigs = [this.serverConfig.connectionDetails];
      }

      // Parse MCP options
      let parsedMcpOptions: Record<string, any> = {};
      if (this.serverConfig.mcpOptions) {
        try {
          parsedMcpOptions = JSON.parse(this.serverConfig.mcpOptions);
        } catch (e: any) {
          console.warn(`[MCPConnectionWrapper-${this.serverId}] Failed to parse mcpOptions JSON:`, e.message, `. Using defaults.`);
        }
      }

      // Create transport based on server type
      this.transport = await this.createTransport(parsedConnectionConfigs[0] || {});
      if (!this.transport) {
        return; // Error already logged in createTransport
      }

      // Create MCP client
      this.mcpClient = new Client({
        name: `mcp-pro-gateway-client-${this.serverId}`,
        version: "1.0.0"
      }, {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      });

      this.updateStatus('starting', `Initializing connection. Type: ${this.serverConfig.serverType}`);

      // Set up client event handlers
      this.setupClientEventHandlers();

      // Set connection timeout
      this.connectTimeoutId = setTimeout(() => {
        if (this.currentStatus === 'starting') { 
          const timeoutMessage = `Connection attempt timed out after ${CONNECTION_TIMEOUT_MS / 1000}s.`;
          console.error(`[MCPConnectionWrapper-${this.serverId}] ${timeoutMessage}`);
          this.updateStatus('error', timeoutMessage);
          this.lastError = timeoutMessage; 
          this.emit('error', new Error(timeoutMessage), this.serverId); 
          
          if (this.transport) {
            this.transport.close();
          }
          
          if (!this.isExplicitlyClosed) {
            this.scheduleReconnect();
          }
        }
      }, CONNECTION_TIMEOUT_MS);      // Connect to transport
      await this.mcpClient.connect(this.transport);
      
      // Connection successful
      this.clearConnectTimeout();
      this.reconnectAttempts = 0;
      this.updateStatus('running', 'Connection established.');
      
      // Immediately discover tools
      await this.discoverTools();

    } catch (error: any) {
      this.clearConnectTimeout(); 
      console.error(`[MCPConnectionWrapper-${this.serverId}] Failed to connect:`, error.message);
      this.lastError = error.message;
      if (this.currentStatus !== 'error' && this.currentStatus !== 'reconnecting' && this.currentStatus !== 'stopped') {
         this.updateStatus('error', `Connection failed: ${error.message}`);
      }
      this.emit('error', error, this.serverId); 
      if (!this.isExplicitlyClosed) {
        this.scheduleReconnect();
      }
    }
  }
  private async createTransport(connectionConfig: any): Promise<Transport | null> {
    try {
      switch (this.serverConfig.serverType) {
        case 'stdio':
          if (!this.stdioProcess) {
            this.updateStatus('error', 'STDIO process not available');
            if (!this.isExplicitlyClosed) this.scheduleReconnect();
            return null;
          }
          return new StdioClientTransport({
            command: connectionConfig.command || 'node',
            args: connectionConfig.args || [],
            env: connectionConfig.env || process.env,
            cwd: connectionConfig.cwd
          });

        case 'streamable-http':
          if (!connectionConfig.url) {
            this.updateStatus('error', 'URL not configured for streamable-http server.');
            if (!this.isExplicitlyClosed) this.scheduleReconnect();
            return null;
          }
          return new StreamableHTTPClientTransport(new URL(connectionConfig.url), {
            requestInit: connectionConfig.requestInit || {}
          });

        case 'websocket':
          if (!connectionConfig.url) {
            this.updateStatus('error', 'URL not configured for websocket server.');
            if (!this.isExplicitlyClosed) this.scheduleReconnect();
            return null;
          }
          return new WebSocketClientTransport(new URL(connectionConfig.url));

        case 'sse':
          if (!connectionConfig.url) {
            this.updateStatus('error', 'URL not configured for SSE server.');
            if (!this.isExplicitlyClosed) this.scheduleReconnect();
            return null;
          }
          return new SSEClientTransport(new URL(connectionConfig.url), {
            requestInit: connectionConfig.requestInit || {}
          });

        default:
          this.updateStatus('error', `Unsupported server type: ${this.serverConfig.serverType}`);
          if (!this.isExplicitlyClosed) this.scheduleReconnect();
          return null;
      }
    } catch (error: any) {
      this.updateStatus('error', `Failed to create transport: ${error.message}`);
      if (!this.isExplicitlyClosed) this.scheduleReconnect();
      return null;
    }
  }
  private setupClientEventHandlers(): void {
    if (!this.mcpClient || !this.transport) return;

    // Set up transport event handlers
    this.transport.onclose = () => {
      console.log(`[MCPConnectionWrapper-${this.serverId}] Transport disconnected`);
      this.clearConnectTimeout();
      
      if (this.currentStatus !== 'stopped' && this.currentStatus !== 'error') {
        if (!this.isExplicitlyClosed) {
          this.updateStatus('reconnecting', 'Connection lost, will attempt to reconnect');
          this.scheduleReconnect();
        } else {
          this.updateStatus('stopped', 'Connection closed');
        }
      } else if (this.isExplicitlyClosed && this.currentStatus !== 'stopped') {
        this.updateStatus('stopped', 'Connection closed');
      }
      
      this.emit('close', this.serverId);
      this.mcpClient = null;
      this.transport = null;
    };

    // Handle transport errors
    this.transport.onerror = (error: Error) => {
      console.error(`[MCPConnectionWrapper-${this.serverId}] Transport Error: ${error.message}`, error);
      this.lastError = error.message;
      if (this.currentStatus === 'running' || this.currentStatus === 'starting') {
        this.updateStatus('error', `Transport Error: ${error.message}`);
      }
      this.emit('error', error, this.serverId);
      if (!this.isExplicitlyClosed) {
        this.scheduleReconnect();
      }
    };

    // Handle successful connection - we'll set this after the connect call
  }

  private async discoverTools(): Promise<void> {
    if (!this.mcpClient || this.currentStatus !== 'running') {
      return;
    }

    try {
      const result = await this.mcpClient.listTools();
      this.cachedTools = result.tools || [];
      console.log(`[MCPConnectionWrapper-${this.serverId}] Discovered ${this.cachedTools.length} tools`);
      this.emit('toolsChanged', this.serverId, this.cachedTools);
    } catch (error: any) {
      console.error(`[MCPConnectionWrapper-${this.serverId}] Failed to discover tools:`, error.message);
      this.cachedTools = [];
      this.emit('toolsChanged', this.serverId, this.cachedTools);
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId) {
        clearTimeout(this.connectTimeoutId);
        this.connectTimeoutId = null;
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimeout();
    if (this.isExplicitlyClosed || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log(`[MCPConnectionWrapper-${this.serverId}] Max reconnect attempts reached. Will not try again.`);
        this.updateStatus('error', `Failed to connect after ${this.maxReconnectAttempts} attempts. ${this.lastError || ''}`.trim());
      } else {
        console.log(`[MCPConnectionWrapper-${this.serverId}] Explicitly closed. No reconnect scheduled.`);
        if (this.currentStatus !== 'stopped') {
            this.updateStatus('stopped', 'Explicitly closed, reconnection cancelled.');
        }
      }
      return;
    }

    this.reconnectAttempts++;
    const baseDelay = this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 4));
    const jitter = Math.random() * 1000; 
    const actualDelay = Math.min(baseDelay + jitter, 60000);

    console.log(`[MCPConnectionWrapper-${this.serverId}] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(actualDelay / 1000)}s...`);
    this.updateStatus('stopped', `Reconnecting attempt ${this.reconnectAttempts} scheduled`); 
    
    this.reconnectTimeoutId = setTimeout(() => {
      if (!this.isExplicitlyClosed && this.currentStatus !== 'running' && this.currentStatus !== 'starting') {
        console.log(`[MCPConnectionWrapper-${this.serverId}] Executing scheduled reconnect attempt ${this.reconnectAttempts}.`);
        this.connect();
      } else {
        console.log(`[MCPConnectionWrapper-${this.serverId}] Scheduled reconnect attempt ${this.reconnectAttempts} aborted (isExplicitlyClosed: ${this.isExplicitlyClosed}, currentStatus: ${this.currentStatus}).`);
      }
    }, actualDelay);
  }

  public async sendRequest(payload: McpRequestPayload): Promise<McpResponsePayload> {
    if (!this.mcpClient || this.currentStatus !== 'running') {
      const errorMsg = `[MCPConnectionWrapper-${this.serverId}] Cannot send request: Connection not running or not initialized. Status: ${this.currentStatus}`;
      console.error(errorMsg);
      return {
        mcp_version: payload.mcp_version,
        request_id: payload.request_id,
        error: {
          code: McpErrorCode.SERVER_CONNECTION_ERROR,
          message: `Connection to server ${this.serverId} is not active. Status: ${this.currentStatus}`,
        },
      };
    }

    try {
      console.log(`[MCPConnectionWrapper-${this.serverId}] Sending request: Method ${payload.method}, ID ${payload.request_id}`);
      
      // Handle different MCP methods
      let result: any;
      switch (payload.method) {
        case 'tools/list':
          result = await this.mcpClient.listTools();
          break;
          
        case 'tools/call':
          const callParams = payload.params as { name: string; arguments?: any };
          result = await this.mcpClient.callTool({
            name: callParams.name,
            arguments: callParams.arguments || {}
          });
          break;
          
        case 'resources/list':
          result = await this.mcpClient.listResources();
          break;
          
        case 'resources/read':
          const readParams = payload.params as { uri: string };
          result = await this.mcpClient.readResource({ uri: readParams.uri });
          break;
          
        case 'prompts/list':
          result = await this.mcpClient.listPrompts();
          break;
          
        case 'prompts/get':
          const promptParams = payload.params as { name: string; arguments?: any };
          result = await this.mcpClient.getPrompt({
            name: promptParams.name,
            arguments: promptParams.arguments || {}
          });
          break;
          
        default:
          throw new Error(`Unsupported method: ${payload.method}`);
      }

      return {
        mcp_version: payload.mcp_version,
        request_id: payload.request_id,
        result: result,
      };

    } catch (error: any) {
      console.error(`[MCPConnectionWrapper-${this.serverId}] Error sending request ID ${payload.request_id}:`, error);
      return { 
        mcp_version: payload.mcp_version,
        request_id: payload.request_id,
        error: {
          code: McpErrorCode.SERVER_ERROR,
          message: `Error from server ${this.serverId}: ${error.message}`,
        },
      };
    }
  }

  public async sendNotification(payload: McpRequestPayload): Promise<void> {
    if (!this.mcpClient || this.currentStatus !== 'running') {
      console.warn(`[MCPConnectionWrapper-${this.serverId}] MCP connection is not active (status: ${this.currentStatus}). Cannot send notification.`);
      return; 
    }

    try {
        // Send notification via client (notifications don't expect responses)
        console.log(`[MCPConnectionWrapper-${this.serverId}] Sending notification: Method ${payload.method}`);
        // Note: The MCP SDK Client might not have a direct sendNotification method
        // This would typically be handled through the transport layer for server-initiated notifications
        console.warn(`[MCPConnectionWrapper-${this.serverId}] Notification sending not implemented for client-side`);
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[MCPConnectionWrapper-${this.serverId}] Error sending notification:`, errorMessage);
        this.emit('error', error, this.serverId);
    }
  }

  public stop(isRestarting: boolean = false): void {
    console.log(`[MCPConnectionWrapper-${this.serverId}] Stopping connection. IsRestarting: ${isRestarting}, Current Status: ${this.currentStatus}`);
    this.clearConnectTimeout();
    this.clearReconnectTimeout();

    if (!isRestarting) {
        this.isExplicitlyClosed = true; 
    }

    if (this.mcpClient) {
      this.mcpClient.close();
      // mcpClient will be set to null in the close event handler
    } else {
      if (this.currentStatus !== 'stopped') {
        this.updateStatus('stopped', isRestarting ? 'Restarting' : 'Explicitly stopped (no active connection)');
      }
    }

    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
  }
}
