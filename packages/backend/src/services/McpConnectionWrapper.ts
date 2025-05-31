import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';

// Placeholder types for @mcp/sdk
interface MCPMessage {
  id: string;
  method: string;
  params?: any;
  result?: any;
  error?: any;
  jsonrpc?: string;
}

interface MCPConnectionOptions {
  serverType: 'stdio' | 'websocket' | 'sse' | 'streamable-http';
  logger?: any;
  requestTimeoutMs?: number;
  stdin?: NodeJS.WritableStream;
  stdout?: NodeJS.ReadableStream;
  url?: string;
}

class MCPConnection extends EventEmitter {
  constructor(options: MCPConnectionOptions) {
    super();
    // Mock implementation
  }
  connect(): Promise<void> { return Promise.resolve(); }
  close(code?: number, reason?: string): void {}
  sendRequest(message: MCPMessage): Promise<MCPMessage> { return Promise.resolve({} as MCPMessage); }
  sendNotification(message: MCPMessage): Promise<void> { return Promise.resolve(); }
  static generateRequestId(): string { return Math.random().toString(36).substring(2); }
}
// End placeholder types for @mcp/sdk
// Adjust import paths for shared-types
import { ManagedMcpServer } from '@shared-types/db-models';
import { ServerStatus, McpRequestPayload, McpResponsePayload } from '@shared-types/api-contracts'; // Import McpResponsePayload

// Define more specific types for events if needed
export interface McpConnectionWrapperEvents {
  on(event: 'statusChange', listener: (status: ServerStatus, serverId: string, details?: string) => void): this;
  on(event: 'message', listener: (message: MCPMessage, serverId: string) => void): this;
  on(event: 'error', listener: (error: Error, serverId: string) => void): this;
  on(event: 'close', listener: (serverId: string, code?: number, reason?: string) => void): this;
  // Add other relevant events: 'notification', 'request', etc.
}

/**
 * @class McpConnectionWrapper
 * @description Wraps the MCP-SDK's MCPConnection to manage a single MCP server connection,
 *              handle its lifecycle, and emit relevant events.
 *              Inspired by mcp-hub/src/MCPConnection.js
 */
export class McpConnectionWrapper extends EventEmitter implements McpConnectionWrapperEvents {
  private sdkConnection: MCPConnection | null = null;
  private currentStatus: ServerStatus = 'stopped';
  private lastError: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5; // Configurable
  private reconnectDelay: number = 5000; // Configurable, ms
  private isExplicitlyClosed: boolean = false;
  private connectTimeoutId: NodeJS.Timeout | null = null;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;


  constructor(
    public readonly serverId: string,
    private serverConfig: ManagedMcpServer, // From DB
    private stdioProcess?: ChildProcess // For stdio connections
  ) {
    super();
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

  public updateServerConfig(newConfig: ManagedMcpServer, newStdioProcess?: ChildProcess): void {
    const wasRunning = this.currentStatus === 'running' || this.currentStatus === 'starting';
    const oldServerType = this.serverConfig.serverType;
    const oldConnectionDetails = JSON.stringify(this.serverConfig.connectionDetails);
    const oldMcpOptions = this.serverConfig.mcpOptions;

    this.serverConfig = newConfig;
    let stdioChanged = false;
    if (newConfig.serverType === 'stdio') {
        if (newStdioProcess && this.stdioProcess !== newStdioProcess) {
            // If there was an old stdio process, ensure it's handled (e.g., listeners removed or killed if appropriate)
            // This example doesn't explicitly kill the old one here, assuming the caller manages it or it's already gone.
            this.stdioProcess = newStdioProcess;
            stdioChanged = true;
            console.log(`[MCPConnectionWrapper-${this.serverId}] STDIO process updated (PID: ${newStdioProcess.pid}).`);
        } else if (!newStdioProcess && this.stdioProcess) {
            console.warn(`[MCPConnectionWrapper-${this.serverId}] STDIO server config updated, but no new STDIO process provided. Old process (PID: ${this.stdioProcess.pid}) might still be linked.`);
            // this.stdioProcess = undefined; // Or handle more gracefully
            // stdioChanged = true; // if removing the old process is considered a change
        } else if (newStdioProcess && !this.stdioProcess) {
            this.stdioProcess = newStdioProcess;
            stdioChanged = true;
            console.log(`[MCPConnectionWrapper-${this.serverId}] New STDIO process provided (PID: ${newStdioProcess.pid}).`);
        }
    } else if (oldServerType === 'stdio') { // Simplified condition: if old was stdio and new is not (guaranteed by else path)
        // Transitioning away from STDIO
        this.stdioProcess = undefined;
        stdioChanged = true; // Or connectionConfigChanged will cover it
        console.log(`[MCPConnectionWrapper-${this.serverId}] Server type changed from STDIO. STDIO process unlinked.`);
    }

    const connectionConfigChanged = oldServerType !== newConfig.serverType || 
                                  JSON.stringify(newConfig.connectionDetails) !== oldConnectionDetails ||
                                  newConfig.mcpOptions !== oldMcpOptions; // Check mcpOptions string directly

    if ((connectionConfigChanged || stdioChanged) && wasRunning) {
      console.log(`[MCPConnectionWrapper-${this.serverId}] Server config or STDIO process changed significantly. Reconnecting...`);
      this.stop(true); // Stop without marking as explicitly closed for reconnect
      setTimeout(() => this.connect(), stdioChanged ? 100 : 0);
    } else if (stdioChanged && newConfig.serverType === 'stdio' && !wasRunning) {
        console.log(`[MCPConnectionWrapper-${this.serverId}] STDIO process updated while server was stopped. Will use new process on next connect.`);
    }
  }

  public async connect(): Promise<void> {
    if (this.sdkConnection && (this.currentStatus === 'running' || this.currentStatus === 'starting')) {
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
    this.updateStatus('starting');
    this.lastError = null;

    let parsedMcpOptions: Record<string, any> = {};
    if (this.serverConfig.mcpOptions) {
      try {
        parsedMcpOptions = JSON.parse(this.serverConfig.mcpOptions);
      } catch (e) {
        console.error(`[MCPConnectionWrapper-${this.serverId}] Failed to parse mcpOptions JSON:`, this.serverConfig.mcpOptions, e);
        // Decide if this is a fatal error for connection attempt or proceed with defaults
      }
    }

    const options: MCPConnectionOptions = {
      serverType: this.serverConfig.serverType as 'stdio' | 'websocket' | 'sse' | 'streamable-http', 
      logger: console, 
      requestTimeoutMs: parsedMcpOptions?.requestTimeoutMs || 30000, 
    };

    try {
      switch (this.serverConfig.serverType) {
        case 'stdio':
          if (!this.stdioProcess || this.stdioProcess.killed) {
            // Attempt to get a fresh process if one is expected but missing/killed
            // This part depends on how stdio processes are managed externally (e.g. by a service that calls updateServerConfig)
            // For now, we throw if it's not usable.
            throw new Error('STDIO process is not available, not running, or has been killed.');
          }
          if (!this.stdioProcess.stdin || !this.stdioProcess.stdout) {
            throw new Error('STDIO process stdin or stdout is not available.');
          }
          options.stdin = this.stdioProcess.stdin;
          options.stdout = this.stdioProcess.stdout;
          
          // Remove previous listeners to avoid duplicates if reconnecting with the same process object
          this.stdioProcess.removeAllListeners('exit'); 
          this.stdioProcess.once('exit', (code, signal) => {
            // Check if this specific stdioProcess instance is still the active one for this wrapper
            if (this.stdioProcess && this.stdioProcess.pid === (options.stdin as any)?.writableHighWaterMark && !this.isExplicitlyClosed && this.currentStatus !== 'stopped') {
                const message = `STDIO process for ${this.serverId} (PID: ${this.stdioProcess.pid}) exited unexpectedly with code ${code}, signal ${signal}.`;
                console.error(message);
                this.updateStatus('error', message);
                this.sdkConnection?.close(); 
                this.scheduleReconnect();
            } else if (!this.isExplicitlyClosed) {
                 console.log(`[MCPConnectionWrapper-${this.serverId}] An old or unlinked STDIO process exited. Code: ${code}, Signal: ${signal}. No action taken for current connection.`);
            }
          });
          break;
        case 'websocket':
        case 'sse':
        case 'streamable-http': 
          if (!this.serverConfig.connectionDetails?.url) { // Added optional chaining for connectionDetails
            throw new Error(`URL is required for ${this.serverConfig.serverType} connection.`);
          }
          options.url = this.serverConfig.connectionDetails.url;
          break;
        default:
          // This should ideally be caught by TypeScript if serverType is a strict union
          const exhaustiveCheck: never = this.serverConfig.serverType;
          throw new Error(`Unsupported server type: ${exhaustiveCheck}`);
      }

      this.sdkConnection = new MCPConnection(options);

      this.sdkConnection.on('open', () => {
        this.clearConnectTimeout();
        this.updateStatus('running');
        this.reconnectAttempts = 0;
      });

      this.sdkConnection.on('message', (message: MCPMessage) => {
        this.emit('message', message, this.serverId);
      });

      this.sdkConnection.on('error', (error: Error) => {
        console.error(`[MCPConnectionWrapper-${this.serverId}] SDK Error:`, error.message);
        this.emit('error', error, this.serverId);
      });

      this.sdkConnection.on('close', (code?: number, reason?: string) => {
        this.clearConnectTimeout();
        const wasConnected = this.currentStatus === 'running';
        const closeReason = `Connection closed. Code: ${code}, Reason: ${reason || 'N/A'}`;
        console.log(`[MCPConnectionWrapper-${this.serverId}] ${closeReason}`);
        
        this.sdkConnection = null; 
        this.emit('close', this.serverId, code, reason);

        if (!this.isExplicitlyClosed) {
          this.updateStatus(wasConnected ? 'stopped' : 'error', closeReason);
          this.scheduleReconnect();
        } else {
          this.updateStatus('stopped', 'Connection explicitly closed by client.');
        }
      });

      this.connectTimeoutId = setTimeout(() => {
        if (this.currentStatus === 'starting') {
            const timeoutMessage = `Connection attempt to ${this.serverId} timed out.`;
            console.error(`[MCPConnectionWrapper-${this.serverId}] ${timeoutMessage}`);
            if (this.sdkConnection) { // Syntax Fix: Add parentheses
                this.sdkConnection.close(); 
            }
            this.updateStatus('error', timeoutMessage);
            if (!this.isExplicitlyClosed) {
                this.scheduleReconnect();
            }
        }
      }, options.requestTimeoutMs); // Use configured timeout or default

      await this.sdkConnection.connect();

    } catch (error: any) {
      this.clearConnectTimeout();
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MCPConnectionWrapper-${this.serverId}] Failed to initialize or connect:`, errorMessage);
      this.updateStatus('error', errorMessage);
      this.sdkConnection = null;
      if (!this.isExplicitlyClosed) {
        this.scheduleReconnect();
      }
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
        const maxAttemptsMessage = 'Max reconnect attempts reached.';
        console.error(`[MCPConnectionWrapper-${this.serverId}] ${maxAttemptsMessage}`);
        // Ensure status reflects this final error state if not already 'error'
        if (this.currentStatus !== 'error' || this.lastError !== maxAttemptsMessage) {
            this.updateStatus('error', maxAttemptsMessage);
        }
      }
      return;
    }

    this.reconnectAttempts++;
    const baseDelay = this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 4)); // Max backoff factor 2^4 = 16
    const jitter = Math.random() * 1000; 
    const actualDelay = Math.min(baseDelay + jitter, 60000); // Cap max delay at 60s
    
    console.log(`[MCPConnectionWrapper-${this.serverId}] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(actualDelay / 1000)}s...`);
    // Update status to 'stopped' or 'reconnecting' to indicate it's not actively trying at this exact moment
    // but is planned. 'stopped' with a reason might be clearer.
    this.updateStatus('stopped', `Reconnecting attempt ${this.reconnectAttempts} scheduled`); 
    
    this.reconnectTimeoutId = setTimeout(() => {
      // Check status again before connecting, in case it was explicitly stopped or connected by other means
      if (!this.isExplicitlyClosed && this.currentStatus !== 'running' && this.currentStatus !== 'starting') {
        console.log(`[MCPConnectionWrapper-${this.serverId}] Executing scheduled reconnect attempt ${this.reconnectAttempts}.`);
        this.connect();
      } else {
        console.log(`[MCPConnectionWrapper-${this.serverId}] Scheduled reconnect attempt ${this.reconnectAttempts} aborted (isExplicitlyClosed: ${this.isExplicitlyClosed}, currentStatus: ${this.currentStatus}).`);
      }
    }, actualDelay);
  }

  public async sendRequest(payload: McpRequestPayload): Promise<McpResponsePayload> { // Changed return type
    if (!this.sdkConnection || this.currentStatus !== 'running') {
      throw new Error(`[MCPConnectionWrapper-${this.serverId}] MCP connection is not active (status: ${this.currentStatus}). Cannot send request.`);
    }
    
    // The payload is already McpRequestPayload, which should be compatible with MCPMessage structure for request
    // The mock SDKConnection.sendRequest returns a Promise<MCPMessage>.
    // We need to ensure this MCPMessage can be cast or mapped to McpResponsePayload.
    // For the mock, we assume the MCPMessage returned by sendRequest has the necessary fields.
    const messageToSend: MCPMessage = {
        id: payload.request_id, // MCPMessage uses id, McpRequestPayload uses request_id
        method: payload.method,
        params: payload.params,
        jsonrpc: payload.mcp_version === '2.0' ? '2.0' : undefined // Example mapping
    };

    try {
        const responseMessage = await this.sdkConnection.sendRequest(messageToSend);
        
        // Map MCPMessage back to McpResponsePayload
        // This is a direct cast for the mock. A real SDK might require more transformation.
        const responsePayload: McpResponsePayload = {
            mcp_version: payload.mcp_version, // Assuming response version matches request version for mock
            request_id: responseMessage.id,    // MCPMessage uses id for response tracking
            result: responseMessage.result,
            error: responseMessage.error ? { 
                code: responseMessage.error.code || -32000, 
                message: responseMessage.error.message || 'Unknown SDK error',
                data: responseMessage.error.data 
            } : undefined,
        };
        return responsePayload;
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[MCPConnectionWrapper-${this.serverId}] Error sending request (ID: ${payload.request_id}):`, errorMessage);
        this.emit('error', error, this.serverId);
        // Construct an McpResponsePayload error
        return {
            mcp_version: payload.mcp_version,
            request_id: payload.request_id,
            error: {
                code: error.code || -32000, // Or a specific error code for send failure
                message: `Failed to send request: ${errorMessage}`,
                data: error.data
            }
        };
    }
  }

  public async sendNotification(payload: Omit<MCPMessage, 'id'>): Promise<void> {
    if (!this.sdkConnection || this.currentStatus !== 'running') {
      console.warn(`[MCPConnectionWrapper-${this.serverId}] MCP connection is not active (status: ${this.currentStatus}). Cannot send notification.`);
      return; 
    }
    // Notifications don't typically have IDs in the same way requests do, but MCPMessage requires it.
    // If the underlying SDK handles ID-less notifications, this might need adjustment.
    // For now, assume an ID is needed or the SDK handles its absence.
    const messageToSend: MCPMessage = { ...payload, id: MCPConnection.generateRequestId() } as MCPMessage;
    try {
        await this.sdkConnection.sendNotification(messageToSend);
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

    if (this.sdkConnection) {
      // The SDK's close method might be synchronous or asynchronous
      // It should trigger the 'close' event listener we've set up
      this.sdkConnection.close(); 
      // Status update to 'stopped' will typically happen in the 'close' event handler
    } else {
      // If no SDK connection, ensure status is updated if not already stopped
      if (this.currentStatus !== 'stopped') {
        this.updateStatus('stopped', 'Connection stopped (no active SDK instance).');
      }
    }
    
    // If it's an STDIO connection and we are explicitly stopping (not for restart),
    // the associated process might need to be killed.
    // This wrapper currently does not kill the stdioProcess itself, assuming external management.
    // If this wrapper *should* kill its stdioProcess on explicit stop, add logic here:
    // if (this.serverConfig.serverType === 'stdio' && this.stdioProcess && !this.stdioProcess.killed && this.isExplicitlyClosed) {
    //   console.log(`[MCPConnectionWrapper-${this.serverId}] Killing associated STDIO process (PID: ${this.stdioProcess.pid}) due to explicit stop.`);
    //   this.stdioProcess.kill();
    //   this.stdioProcess = undefined;
    // }
  }
}
