import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process'; // Added for stdioProcess type
import { ManagedMcpServer } from 'shared-types/db-models'; // Added for serverConfig type

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
  constructor(private options: MCPConnectionOptions) { // Store options
    super();
    // For STDIO, if stdout is provided, listen to it for messages from the downstream server
    if (this.options.serverType === 'stdio' && this.options.stdout) {
      let buffer = '';
      this.options.stdout.on('data', (data: Buffer) => {
        buffer += data.toString();
        let boundary;
        while ((boundary = buffer.indexOf('\n')) !== -1) {
          const messageStr = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 1);
          try {
            const message = JSON.parse(messageStr);
            // TODO: Differentiate between responses and server-initiated notifications/requests
            // For now, assume all messages from stdout are responses or events to be forwarded.
            console.log(`[MockMCPConnection/stdio] Received message from stdout:`, message);
            this.emit('message', message); // Emit parsed message
          } catch (e) {
            console.error('[MockMCPConnection/stdio] Error parsing JSON from stdout:', e, `Data: "${messageStr}"`);
          }
        }
      });
      this.options.stdout.on('error', (err) => {
        console.error('[MockMCPConnection/stdio] stdout error:', err);
        this.emit('error', err);
      });
      this.options.stdout.on('close', () => {
        console.log('[MockMCPConnection/stdio] stdout closed.');
        // this.emit('close'); // Potentially emit close, or handle based on specific logic
      });
    }
  }
  connect(): Promise<void> { 
    // Simulate asynchronous connection
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(`[MockMCPConnection] Emitting 'open' for ${this.options.serverType}`);
        this.emit('open');
        resolve();
      }, 100); 
    });
  }
  close(code?: number, reason?: string): void {
    console.log(`[MockMCPConnection] Close called. Emitting 'close'. Code: ${code}, Reason: ${reason}`);
    this.emit('close', code, reason);
  }

  sendRequest(message: MCPMessage): Promise<void> { // Return Promise<void> as it's just sending
    console.log(`[MockMCPConnection] sendRequest called: ID=${message.id}, Method=${message.method}`);
    if (this.options.serverType === 'stdio' && this.options.stdin) {
      try {
        const messageString = JSON.stringify(message) + '\n';
        this.options.stdin.write(messageString, (err) => {
          if (err) {
            console.error(`[MockMCPConnection/stdio] Error writing to stdin:`, err);
            // Optionally emit an error or reject a promise if this method returned one for this specific send.
          } else {
            console.log(`[MockMCPConnection/stdio] Successfully wrote to stdin: ID=${message.id}`);
          }
        });
      } catch (e) {
        console.error(`[MockMCPConnection/stdio] Error stringifying message for stdin:`, e);
      }
    } else if (this.options.serverType !== 'stdio') {
      // For non-stdio types, simulate a response if it's a mock.
      // A real SDK would handle HTTP/WebSocket communication here.
      console.log(`[MockMCPConnection] Simulating response for non-stdio type for method: ${message.method}, ID: ${message.id}`);
      setTimeout(() => {
        let responsePayload: any = {
          jsonrpc: '2.0',
          id: message.id, // Crucially, echo the ID back
        };
        if (message.method === 'initialize') {
          responsePayload.result = {
            status: 'initialized by mock',
            capabilities: { streamable_http_transport: true, other_mock_capability: 'yes' },
            server_id: 'mock-server-id-for-non-stdio'
          };
        } else {
          responsePayload.result = { data: `Mocked result for ${message.method}` };
        }
        console.log(`[MockMCPConnection] Emitting simulated 'message' (response) for ID ${message.id}:`, responsePayload);
        this.emit('message', responsePayload);
      }, 150); // Simulate network delay
    }
    return Promise.resolve(); // Acknowledge the send operation
  }

  sendNotification(message: MCPMessage): Promise<void> {
    console.log(`[MockMCPConnection] sendNotification called: Method=${message.method}`);
     if (this.options.serverType === 'stdio' && this.options.stdin) {
      try {
        const messageString = JSON.stringify(message) + '\n';
        this.options.stdin.write(messageString);
      } catch (e) {
        console.error(`[MockMCPConnection/stdio] Error stringifying notification for stdin:`, e);
      }
    }
    // Notifications don't expect a response tied to their ID.
    return Promise.resolve();
  }
  static generateRequestId(): string { return Math.random().toString(36).substring(2); }
}
// End placeholder types for @mcp/sdk
// Adjust import paths for shared-types
import { ServerStatus, McpRequestPayload, McpResponsePayload, ServerType, McpError, McpErrorCode } from 'shared-types/api-contracts'; // Import McpErrorCode

const CONNECTION_TIMEOUT_MS = 30000; // 30 seconds connection timeout

// Define the type for the callback function that forwards messages to the SSE client
// This callback is ultimately McpGatewayController.forwardMessageToClientSession
// It expects (mcpSessionId: string, message: any, serverId: string)
// McpConnectionWrapper itself is not multi-session aware for a single serverId connection.
// It will call this with its serverId. The actual mcpSessionId will be determined by the caller (CentralGatewayMCPService)
// when relaying server-initiated messages to potentially multiple client sessions.
export type ServerInitiatedMessageCallback = (targetServerId: string, message: McpResponsePayload | McpRequestPayload) => void;


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
  private serverInitiatedMessageCallback?: ServerInitiatedMessageCallback;
  private pendingRequestIds: Set<string> = new Set();


  constructor(
    public readonly serverId: string,
    private serverConfig: ManagedMcpServer, // From DB
    private stdioProcess?: ChildProcess, // For stdio connections
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
    // this.updateStatus('starting'); // Moved after config parsing and SDK instantiation
    this.lastError = null;

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


    let parsedMcpOptions: Record<string, any> = {};
    if (this.serverConfig.mcpOptions) {
      try {
        parsedMcpOptions = JSON.parse(this.serverConfig.mcpOptions);
      } catch (e: any) {
        console.warn(`[MCPConnectionWrapper-${this.serverId}] Failed to parse mcpOptions JSON:`, e.message, `. Using defaults.`);
      }
    }
    
    const mcpConnectionOptions: MCPConnectionOptions = {
      serverType: this.serverConfig.serverType as ServerType, // Cast to narrow type
      logger: console, 
      requestTimeoutMs: parsedMcpOptions.requestTimeoutMs || 30000, // Use from options or default
      ...parsedMcpOptions,
    };

    if (this.serverConfig.serverType === 'stdio' && this.stdioProcess) {
      const stdioDetails = parsedConnectionConfigs.find(c => c.type === 'stdio') || {}; // Assuming details might be in an array
      mcpConnectionOptions.stdin = this.stdioProcess.stdin as NodeJS.WritableStream;
      mcpConnectionOptions.stdout = this.stdioProcess.stdout as NodeJS.ReadableStream;
      // Add command, args, cwd, env from serverConfig.connectionDetails if the SDK expects them here
      // This mock SDKConnection takes stdin/stdout directly.
    } else if (this.serverConfig.serverType === 'websocket' || this.serverConfig.serverType === 'sse' || this.serverConfig.serverType === 'streamable-http') {
      // Assuming connectionDetails (or parsedConnectionConfigs[0]) contains { url: string }
      const httpDetails = parsedConnectionConfigs[0] || {};
      if (!httpDetails.url) {
        this.updateStatus('error', `URL not configured for ${this.serverConfig.serverType} server.`);
        if (!this.isExplicitlyClosed) this.scheduleReconnect();
        return;
      }
      mcpConnectionOptions.url = httpDetails.url;
    }
    // TODO: Add handling for other server types if necessary

    this.sdkConnection = new MCPConnection(mcpConnectionOptions);
    this.updateStatus('starting', `Initializing connection. Type: ${this.serverConfig.serverType}`);


    if (this.sdkConnection) { // Ensure sdkConnection is not null
      this.sdkConnection.on('open', () => {
        this.clearConnectTimeout(); // Clear connection timeout on successful open
        this.reconnectAttempts = 0;
        this.updateStatus('running', 'Connection established.');
        // Initialize request logic (if any) can go here or be triggered externally
      });

      this.sdkConnection.on('message', (message: MCPMessage) => {
        console.log(`[MCPConnectionWrapper-${this.serverId}] SDK Message: ID ${message.id}, Method ${message.method || 'N/A'}`);
        
        if (message.id && this.pendingRequestIds.has(message.id)) {
          return;
        }

        let adaptedMessage: McpResponsePayload | McpRequestPayload;

        if (message.method && message.method !== '$/cancelRequest') { 
          adaptedMessage = {
            mcp_version: message.jsonrpc === '2.0' ? '1.0' : '1.0', 
            request_id: message.id || MCPConnection.generateRequestId(), 
            method: message.method,
            params: message.params
          };
        } else { 
          adaptedMessage = {
            mcp_version: message.jsonrpc === '2.0' ? '1.0' : '1.0', 
            request_id: message.id, 
            result: message.result,
            error: message.error ? { 
              code: message.error.code || McpErrorCode.INTERNAL_ERROR, 
              message: message.error.message || 'Unknown error from server',
              data: message.error.data 
            } as McpError : undefined
          };
        }
        
        this.emit('message', message, this.serverId); 

        if (this.serverInitiatedMessageCallback && (!message.id || !this.pendingRequestIds.has(message.id))) {
          console.log(`[MCPConnectionWrapper-${this.serverId}] Forwarding server-initiated/unsolicited message (method: ${message.method}, id: ${message.id}) via callback.`);
          this.serverInitiatedMessageCallback(this.serverId, adaptedMessage);
        } else if ((!message.id || !this.pendingRequestIds.has(message.id)) && !this.serverInitiatedMessageCallback) {
          console.warn(`[MCPConnectionWrapper-${this.serverId}] serverInitiatedMessageCallback not set. Cannot forward server-initiated/unsolicited message.`);
        }
      });

      this.sdkConnection.on('error', (error: Error) => {
        console.error(`[MCPConnectionWrapper-${this.serverId}] SDK Connection Error: ${error.message}`, error);
        this.lastError = error.message;
        if (this.currentStatus === 'running' || this.currentStatus === 'starting') {
          this.updateStatus('error', `SDK Error: ${error.message}`);
        }
        this.emit('error', error, this.serverId);
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      });

      this.sdkConnection.on('close', (code?: number, reason?: string) => {
        const logMessage = `SDK Connection Closed. ServerId: ${this.serverId}, Code: ${code === undefined ? 'N/A' : code}, Reason: ${reason || 'N/A'}`;
        console.log(`[MCPConnectionWrapper-${this.serverId}] ${logMessage}`);
        this.clearConnectTimeout(); 

        if (this.currentStatus !== 'stopped' && this.currentStatus !== 'error') {
          if (!this.isExplicitlyClosed) {
            this.updateStatus('reconnecting', logMessage);
            this.scheduleReconnect();
          } else {
            this.updateStatus('stopped', `Connection closed. ${reason || ''}`.trim());
          }
        } else if (this.isExplicitlyClosed && this.currentStatus !== 'stopped') {
          this.updateStatus('stopped', `Connection closed. ${reason || ''}`.trim());
        }
        
        this.emit('close', this.serverId, code, reason);
        this.sdkConnection = null; 
      });
    } // End of if (this.sdkConnection)
    
    this.connectTimeoutId = setTimeout(() => {
        if (this.currentStatus === 'starting' && this.sdkConnection) { 
            const timeoutMessage = `Connection attempt timed out after ${CONNECTION_TIMEOUT_MS / 1000}s.`;
            console.error(`[MCPConnectionWrapper-${this.serverId}] ${timeoutMessage}`);
            this.updateStatus('error', timeoutMessage);
            this.lastError = timeoutMessage; 
            this.emit('error', new Error(timeoutMessage), this.serverId); 
            
            this.sdkConnection.close(); 
            
            if (!this.isExplicitlyClosed) {
                this.scheduleReconnect();
            }
        }
    }, CONNECTION_TIMEOUT_MS);

    try {
      if (!this.sdkConnection) { 
        throw new Error("sdkConnection not initialized before connect call");
      }
      await this.sdkConnection.connect();
    } catch (error: any) {
      this.clearConnectTimeout(); 
      console.error(`[MCPConnectionWrapper-${this.serverId}] Failed to connect (connect() rejected):`, error.message);
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
        // Ensure status reflects it's stopped if it was trying to reconnect
        if (this.currentStatus !== 'stopped') {
            this.updateStatus('stopped', 'Explicitly closed, reconnection cancelled.');
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

  public async sendRequest(payload: McpRequestPayload): Promise<McpResponsePayload> {
    if (!this.sdkConnection || this.currentStatus !== 'running') {
      const errorMsg = `[MCPConnectionWrapper-${this.serverId}] Cannot send request: Connection not running or not initialized. Status: ${this.currentStatus}`;
      console.error(errorMsg);
      return {
        mcp_version: payload.mcp_version,
        request_id: payload.request_id,
        error: {
          code: McpErrorCode.SERVER_CONNECTION_ERROR, 
          message: `MCP Wrapper: Connection to server ${this.serverId} is not active. Status: ${this.currentStatus}`,
        },
      };
    }

    return new Promise<McpResponsePayload>((resolve, reject) => {
      const requestId = payload.request_id;
      this.pendingRequestIds.add(requestId); 
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanupPendingRequest = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (this.sdkConnection) {
            this.sdkConnection.removeListener('message', messageListener);
        }
        this.pendingRequestIds.delete(requestId); 
      };

      const messageListener = (message: MCPMessage) => {
        if (message.id === requestId) {
          cleanupPendingRequest();
          console.log(`[MCPConnectionWrapper-${this.serverId}] Received SDK response for ID ${message.id} (specific listener)`);
          
          if (message.error) {
            resolve({
              mcp_version: payload.mcp_version,
              request_id: String(message.id || requestId),
              error: {
                code: message.error.code || McpErrorCode.INTERNAL_ERROR, 
                message: message.error.message || 'Unknown SDK error',
                data: message.error.data,
              },
            });
          } else {
            resolve({
              mcp_version: payload.mcp_version,
              request_id: String(message.id || requestId),
              result: message.result,
            });
          }
        }
      };
      
      if (this.sdkConnection) {
        this.sdkConnection.on('message', messageListener);
      } else {
        cleanupPendingRequest();
        resolve({
            mcp_version: payload.mcp_version,
            request_id: requestId,
            error: {
                code: McpErrorCode.SERVER_CONNECTION_ERROR, 
                message: `MCP Wrapper: SDK Connection was null when trying to listen for response to ${requestId}.`,
            },
        });
        return; 
      }
      
      // Ensure sdkConnection is valid before accessing its options
      const requestTimeoutMs = this.sdkConnection && (this.sdkConnection as any).options?.requestTimeoutMs ? 
                               (this.sdkConnection as any).options.requestTimeoutMs : CONNECTION_TIMEOUT_MS;
      timeoutId = setTimeout(() => {
        cleanupPendingRequest();
        console.error(`[MCPConnectionWrapper-${this.serverId}] Timeout waiting for response to request ID ${requestId}`);
        resolve({ 
          mcp_version: payload.mcp_version,
          request_id: requestId,
          error: {
            code: McpErrorCode.REQUEST_TIMEOUT, 
            message: `Timeout waiting for response from server ${this.serverId} for request ID ${requestId}`,
          },
        });
      }, requestTimeoutMs);

      console.log(`[MCPConnectionWrapper-${this.serverId}] Sending SDK request: Method ${payload.method}, ID ${requestId}`);
      if (this.sdkConnection) {
        this.sdkConnection.sendRequest({
          jsonrpc: '2.0',
          id: requestId,
          method: payload.method,
          params: payload.params,
        }).catch(sendError => {
          cleanupPendingRequest();
          console.error(`[MCPConnectionWrapper-${this.serverId}] Error sending request ID ${requestId}:`, sendError);
          resolve({ 
              mcp_version: payload.mcp_version,
              request_id: requestId,
              error: {
                  code: McpErrorCode.SERVER_SEND_ERROR, 
                  message: `Error sending request to server ${this.serverId}: ${(sendError as Error).message}`,
              },
          });
        });
      } else {
        cleanupPendingRequest();
        resolve({
            mcp_version: payload.mcp_version,
            request_id: requestId,
            error: {
                code: McpErrorCode.SERVER_CONNECTION_ERROR, 
                message: `MCP Wrapper: SDK Connection was null when trying to send request ${requestId}.`,
            },
        });
      }
    });
  }

  public async sendNotification(payload: McpRequestPayload): Promise<void> {
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
        // When explicitly stopping, reset reconnect attempts if we want fresh retries on next manual connect
        // this.reconnectAttempts = 0; 
    }

    if (this.sdkConnection) {
      // The SDK's close method might be synchronous or asynchronous
      // It should trigger the 'close' event listener we've set up
      this.sdkConnection.close(); 
      // sdkConnection will be set to null in the 'close' event handler
    } else {
      // If no sdkConnection, ensure status is updated if it wasn't already stopped.
      if (this.currentStatus !== 'stopped') {
        this.updateStatus('stopped', isRestarting ? 'Restarting' : 'Explicitly stopped (no active connection)');
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
