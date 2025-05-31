// This service will manage the lifecycle and connections to all downstream MCP servers
// that users add via the MCP Pro UI. It's analogous to MCPHub.js in the mcp-hub reference.

import { v4 as uuidv4 } from 'uuid';
import db from '../config/database'; // pg.Pool instance
import { ManagedMcpServer } from '../../../shared-types/src/db-models';
import { 
    RegisterServerRequest, 
    UpdateServerConfigRequest, 
    ServerStatus, 
    ManagedMcpServerDetails, 
    ServerStatusResponse,
    PaginatedResponse,
    McpRequestPayload,
    McpResponsePayload
} from '../../../shared-types/src/api-contracts';
import { McpConnectionWrapper } from './McpConnectionWrapper';
import { DevWatcher } from './DevWatcher';
import { spawn, ChildProcess } from 'child_process';

// Placeholder for a more sophisticated logging solution
const logger = console;

export class ManagedServerService {
  private serverConnections: Map<string, McpConnectionWrapper> = new Map();
  private devWatcher: DevWatcher | null = null;

  constructor(isDevMode: boolean = false) {
    if (isDevMode) {
      this.devWatcher = new DevWatcher();
      logger.info('[ManagedServerService] Development mode enabled. DevWatcher initialized.');
    }
    this.initializeManagedServersFromDB().catch(err => {
        logger.error('[ManagedServerService] Error during async initialization:', err);
    });
  }

  private async initializeManagedServersFromDB(): Promise<void> {
    logger.info('[ManagedServerService] Initializing managed servers from database...');
    try {
      const result = await db.query('SELECT * FROM managed_mcp_servers WHERE is_enabled = $1', [true]);
      const servers: any[] = result.rows;
      for (const serverRow of servers) {
        const serverModel = this.mapDbRowToManagedMcpServer(serverRow);
        if (serverModel) {
          this.createAndConnectServer(serverModel, false); 
        }
      }
      logger.info(`[ManagedServerService] Initialized ${this.serverConnections.size} enabled servers.`);
    } catch (error) {
      logger.error('[ManagedServerService] Error initializing servers from DB:', error);
    }
  }

  private mapDbRowToManagedMcpServer(row: any): ManagedMcpServer | null {
    if (!row) return null;
    try {
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        serverType: row.server_type,
        connectionDetails: typeof row.connection_details === 'string' 
            ? JSON.parse(row.connection_details) 
            : row.connection_details, // Assuming connection_details from DB is valid JSON string or already object
        mcpOptions: row.mcp_options, // Store as string from DB
        status: row.status as ServerStatus || 'unknown',
        isEnabled: row.is_enabled,
        tags: row.tags, // Store as string from DB (JSON array string)
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        lastPingedAt: row.last_pinged_at ? new Date(row.last_pinged_at) : undefined,
        lastError: row.last_error,
      };
    } catch (error) {
      logger.error(`[ManagedServerService] Error mapping DB row to ManagedMcpServer (ID: ${row.id}):`, error);
      return null;
    }
  }
  
  private mapManagedMcpServerToDbParams(server: ManagedMcpServer): any[] {
    return [
      server.id,
      server.name,
      server.description,
      server.serverType,
      JSON.stringify(server.connectionDetails),
      server.mcpOptions || 'null', // Pass string directly, or string 'null' if undefined
      server.status,
      server.isEnabled,
      server.tags || 'null', // Pass string directly (JSON array string), or string 'null' if undefined
      server.createdAt.toISOString(),
      server.updatedAt.toISOString(),
      server.lastPingedAt?.toISOString() || null,
      server.lastError || null,
    ];
  }

  private mapManagedMcpServerToDetails(server: ManagedMcpServer, status?: ServerStatus): ManagedMcpServerDetails {
     let currentStatus = status;
     if (!currentStatus) {
        const conn = this.serverConnections.get(server.id);
        currentStatus = conn ? conn.getStatus().status : server.status;
     }

    return {
      id: server.id,
      name: server.name,
      description: server.description,
      serverType: server.serverType,
      connectionDetails: server.connectionDetails, // Assumed to be object from mapDbRowToManagedMcpServer or construction
      mcpOptions: server.mcpOptions ? JSON.parse(server.mcpOptions) : undefined, // Parse string to object
      status: currentStatus,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
      tags: server.tags ? JSON.parse(server.tags) : [], // Parse JSON string to array, default to empty array
    };
  }

  private createStdioProcess(serverConfig: ManagedMcpServer): ChildProcess {
    if (serverConfig.serverType !== 'stdio' || !serverConfig.connectionDetails.command) {
        throw new Error('Cannot start STDIO server without command.');
    }
    const { command, args, workingDirectory, env } = serverConfig.connectionDetails;
    const newProcess = spawn(command, args || [], {
        cwd: workingDirectory,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
    });
    logger.info(`[ManagedServerService] Spawned new STDIO process for server ${serverConfig.id} (PID: ${newProcess.pid}). Command: ${command}`);
    
    newProcess.on('error', (err) => {
        logger.error(`[ManagedServerService] Error spawning STDIO process for server ${serverConfig.id} (PID: ${newProcess.pid}):`, err);
    });

    newProcess.stderr?.on('data', (data) => {
        logger.error(`[ManagedServerService] STDERR from ${serverConfig.id} (PID: ${newProcess.pid}): ${data.toString()}`);
    });
    return newProcess;
  }

  private createAndConnectServer(serverConfig: ManagedMcpServer, startAfterCreation: boolean): McpConnectionWrapper | null {
    if (this.serverConnections.has(serverConfig.id)) {
      logger.warn(`[ManagedServerService] Server ${serverConfig.id} already has an active connection wrapper.`);
      return this.serverConnections.get(serverConfig.id) || null;
    }

    let stdioProcess: ChildProcess | undefined = undefined;
    const startStdioServerCallback = (): ChildProcess => this.createStdioProcess(serverConfig);

    if (serverConfig.serverType === 'stdio' && serverConfig.isEnabled && serverConfig.connectionDetails.command) {
      if (this.devWatcher) {
         stdioProcess = startStdioServerCallback(); // Initial spawn
         this.devWatcher.addServer(serverConfig.id, serverConfig, startStdioServerCallback);
      } else {
        stdioProcess = startStdioServerCallback();
      }
    }

    const connectionWrapper = new McpConnectionWrapper(serverConfig.id, serverConfig, stdioProcess);
    
    connectionWrapper.on('statusChange', (status, serverId, details) => {
      logger.info(`[ManagedServerService] Server ${serverId} status changed to ${status}. Details: ${details || 'N/A'}`);
      this.updateServerStatusInDb(serverId, status, details);
    });

    connectionWrapper.on('error', (error, serverId) => {
      logger.error(`[ManagedServerService] Error from McpConnectionWrapper for server ${serverId}:`, error);
    });
    
    connectionWrapper.on('close', (serverId, code, reason) => {
        logger.info(`[ManagedServerService] Connection to server ${serverId} closed. Code: ${code}, Reason: ${reason}`);
    });

    this.serverConnections.set(serverConfig.id, connectionWrapper);

    if (serverConfig.isEnabled && startAfterCreation) {
      connectionWrapper.connect().catch(err => {
        logger.error(`[ManagedServerService] Error during initial connect for server ${serverConfig.id}:`, err);
      });
    } else if (!serverConfig.isEnabled) {
        // McpConnectionWrapper.updateStatus is private.
        // The status will be set to 'stopped' by McpConnectionWrapper if it's not connected.
        // We can ensure the DB reflects this.
        this.updateServerStatusInDb(serverConfig.id, 'stopped', 'Server is disabled.');
    }
    return connectionWrapper;
  }

  public async registerServer(request: RegisterServerRequest): Promise<ManagedMcpServerDetails> {
    const serverId = uuidv4();
    const now = new Date();
    const serverConfig: ManagedMcpServer = {
      id: serverId,
      name: request.name,
      description: request.description,
      serverType: request.serverType,
      connectionDetails: request.connectionDetails,
      mcpOptions: JSON.stringify(request.mcpOptions || {}), // Stringify incoming object
      status: 'stopped',
      isEnabled: true, 
      tags: JSON.stringify(request.tags || []), // Stringify incoming array
      createdAt: now,
      updatedAt: now,
    };

    const params = this.mapManagedMcpServerToDbParams(serverConfig);
    const insertQuery = `
      INSERT INTO managed_mcp_servers 
      (id, name, description, server_type, connection_details, mcp_options, status, is_enabled, tags, created_at, updated_at, last_pinged_at, last_error) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;
    await db.query(insertQuery, params);
    this.createAndConnectServer(serverConfig, false); 
    return this.mapManagedMcpServerToDetails(serverConfig, 'stopped');
  }

  public async getAllServers(page: number = 1, limit: number = 10, statusFilter?: ServerStatus): Promise<PaginatedResponse<ManagedMcpServerDetails>> {
    const offset = (page - 1) * limit;
    let baseSelectQuery = 'SELECT * FROM managed_mcp_servers';
    let countQueryStr = 'SELECT COUNT(id) as total FROM managed_mcp_servers';
    const queryParams: any[] = [];
    const countQueryParams: any[] = [];

    let whereClause = '';
    if (statusFilter) {
      whereClause = ' WHERE status = $1';
      queryParams.push(statusFilter);
      countQueryParams.push(statusFilter);
    }

    baseSelectQuery += whereClause + ` ORDER BY name ASC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);
    countQueryStr += whereClause;

    const [serversResult, totalResult] = await Promise.all([
      db.query(baseSelectQuery, queryParams),
      db.query(countQueryStr, countQueryParams)
    ]);
    
    const servers: any[] = serversResult.rows;
    const total = parseInt(totalResult.rows[0].total, 10);

    const serverDetails = servers.map((s: any) => {
        const serverModel = this.mapDbRowToManagedMcpServer(s);
        return serverModel ? this.mapManagedMcpServerToDetails(serverModel) : null;
    }).filter(Boolean) as ManagedMcpServerDetails[];

    return {
      items: serverDetails,
      total,
      page,
      limit,
    };
  }

  public async getServerById(serverId: string): Promise<ManagedMcpServerDetails | null> {
    const result = await db.query('SELECT * FROM managed_mcp_servers WHERE id = $1', [serverId]);
    const serverRow: any = result.rows[0];
    if (!serverRow) {
      return null;
    }
    const serverModel = this.mapDbRowToManagedMcpServer(serverRow);
    return serverModel ? this.mapManagedMcpServerToDetails(serverModel) : null;
  }
  
  public async getServerConfigForConnection(serverId: string): Promise<ManagedMcpServer | null> {
    const result = await db.query('SELECT * FROM managed_mcp_servers WHERE id = $1', [serverId]);
    const serverRow: any = result.rows[0];
    if (!serverRow) {
      return null;
    }
    return this.mapDbRowToManagedMcpServer(serverRow);
  }

  public async updateServerConfig(serverId: string, request: UpdateServerConfigRequest): Promise<ManagedMcpServerDetails | null> {
    const existingServer = await this.getServerConfigForConnection(serverId);
    if (!existingServer) {
      return null; 
    }

    const updatedServerData: Partial<ManagedMcpServer> = {};

    if (request.name !== undefined) updatedServerData.name = request.name;
    if (request.description !== undefined) updatedServerData.description = request.description;
    if (request.serverType !== undefined) updatedServerData.serverType = request.serverType;
    if (request.connectionDetails !== undefined) updatedServerData.connectionDetails = request.connectionDetails;
    if (request.mcpOptions !== undefined) updatedServerData.mcpOptions = JSON.stringify(request.mcpOptions || {}); // Stringify
    if (request.tags !== undefined) updatedServerData.tags = JSON.stringify(request.tags || []); // Stringify
    
    updatedServerData.updatedAt = new Date();

    const finalServerConfig: ManagedMcpServer = {
        ...existingServer,
        ...updatedServerData,
    };
    
    const setClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (updatedServerData.name !== undefined) { setClauses.push(`name = $${paramIndex++}`); queryParams.push(updatedServerData.name); }
    if (updatedServerData.description !== undefined) { setClauses.push(`description = $${paramIndex++}`); queryParams.push(updatedServerData.description); }
    if (updatedServerData.serverType !== undefined) { setClauses.push(`server_type = $${paramIndex++}`); queryParams.push(updatedServerData.serverType); }
    if (updatedServerData.connectionDetails !== undefined) { setClauses.push(`connection_details = $${paramIndex++}`); queryParams.push(JSON.stringify(updatedServerData.connectionDetails)); }
    // Use the stringified versions from updatedServerData for mcpOptions and tags
    if (updatedServerData.mcpOptions !== undefined) { setClauses.push(`mcp_options = $${paramIndex++}`); queryParams.push(updatedServerData.mcpOptions);}
    if (updatedServerData.tags !== undefined) { setClauses.push(`tags = $${paramIndex++}`); queryParams.push(updatedServerData.tags); }
    
    setClauses.push(`updated_at = $${paramIndex++}`); 
    queryParams.push(finalServerConfig.updatedAt.toISOString());
    
    queryParams.push(serverId); // For the WHERE clause: id = $paramIndex

    if (setClauses.length === 1 && updatedServerData.updatedAt && Object.keys(updatedServerData).length === 1 && ! (updatedServerData.name || updatedServerData.description || updatedServerData.serverType || updatedServerData.connectionDetails || updatedServerData.mcpOptions || updatedServerData.tags) ) { 
       logger.info(`[ManagedServerService] updateServerConfig for server ${serverId} only involves updatedAt timestamp.`);
    } else if (setClauses.length === 0) {
        logger.warn(`[ManagedServerService] updateServerConfig called for server ${serverId} with no updatable fields.`);
        return this.mapManagedMcpServerToDetails(existingServer);
    }
    
    const updateQuery = `UPDATE managed_mcp_servers SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`;
    await db.query(updateQuery, queryParams);

    const connectionWrapper = this.serverConnections.get(serverId);
    if (connectionWrapper) {
      let newStdioProcess: ChildProcess | undefined = undefined;
      const needsNewProcess = finalServerConfig.serverType === 'stdio' && 
                              finalServerConfig.connectionDetails.command &&
                              (existingServer.serverType !== 'stdio' || 
                               JSON.stringify(existingServer.connectionDetails) !== JSON.stringify(finalServerConfig.connectionDetails));

      if (needsNewProcess) {
          if (this.devWatcher) this.devWatcher.removeServer(serverId);
          const startCallback = (): ChildProcess => this.createStdioProcess(finalServerConfig);
          newStdioProcess = startCallback();
          if (this.devWatcher) {
              this.devWatcher.addServer(serverId, finalServerConfig, startCallback);
          }
      }
      connectionWrapper.updateServerConfig(finalServerConfig, newStdioProcess);
    } else {
      if (finalServerConfig.isEnabled) {
          this.createAndConnectServer(finalServerConfig, false); 
      }
    }
    return this.mapManagedMcpServerToDetails(finalServerConfig);
  }

  public async deleteServer(serverId: string): Promise<boolean> {
    const connectionWrapper = this.serverConnections.get(serverId);
    if (connectionWrapper) {
      connectionWrapper.stop(true); 
      this.serverConnections.delete(serverId);
    }
    if (this.devWatcher) {
      this.devWatcher.removeServer(serverId);
    }
    const result = await db.query('DELETE FROM managed_mcp_servers WHERE id = $1', [serverId]);
    return (result.rowCount || 0) > 0;
  }

  public async startServer(serverId: string): Promise<void> {
    let connectionWrapper = this.serverConnections.get(serverId);
    if (!connectionWrapper) {
      const serverConfig = await this.getServerConfigForConnection(serverId);
      if (serverConfig && serverConfig.isEnabled) {
        const newWrapper = this.createAndConnectServer(serverConfig, true); // Corrected: newWrapper can be null
        if (newWrapper) { // Check if newWrapper is not null
            connectionWrapper = newWrapper;
        } else {
            throw new Error('Failed to create connection wrapper for server.');
        }
      } else if (serverConfig && !serverConfig.isEnabled) {
        throw new Error('Server is disabled and cannot be started.');
      }
      if (!connectionWrapper) throw new Error('Server not found or not initialized.');
    }
    if (!connectionWrapper.getServerConfig().isEnabled) { // Ensure connectionWrapper is defined
        throw new Error('Server is disabled and cannot be started.');
    }
    await connectionWrapper.connect(); 
  }

  public async stopServer(serverId: string): Promise<void> {
    const connectionWrapper = this.serverConnections.get(serverId);
    if (!connectionWrapper) {
      await this.updateServerStatusInDb(serverId, 'stopped', 'Explicitly stopped via API when no active connection.');
      logger.info(`[ManagedServerService] Server ${serverId} stop called, no active connection found. Ensured DB status is 'stopped'.`);
      return;
    }
    connectionWrapper.stop(); 
  }

  public async getServerStatus(serverId: string): Promise<ServerStatusResponse | null> {
    const connectionWrapper = this.serverConnections.get(serverId);
    if (connectionWrapper) {
      const statusInfo = connectionWrapper.getStatus();
      return {
        serverId,
        status: statusInfo.status,
        timestamp: new Date().toISOString(),
        details: statusInfo.error || undefined,
      };
    }
    const result = await db.query('SELECT status, last_error FROM managed_mcp_servers WHERE id = $1', [serverId]);
    const serverRow: any = result.rows[0];
    if (serverRow) {
      return {
        serverId,
        status: serverRow.status as ServerStatus,
        timestamp: new Date().toISOString(),
        details: serverRow.last_error || undefined,
      };
    }
    return null;
  }
  
  public async updateServerStatusInDb(serverId: string, status: ServerStatus, details?: string | null): Promise<void> {
    try {
      const params: any[] = [status, new Date().toISOString()];
      let setClauses = 'status = $1, updated_at = $2';

      if (status === 'error') {
        setClauses += ', last_error = $3';
        params.push(details?.substring(0, 1024) || null);
      } else {
        setClauses += ', last_error = NULL';
      }
      
      params.push(serverId); // For WHERE id = $X

      const query = `UPDATE managed_mcp_servers SET ${setClauses} WHERE id = $${params.length}`;
      await db.query(query, params);

    } catch (error) {
      logger.error(`[ManagedServerService] Failed to update server ${serverId} status in DB:`, error);
    }
  }

  public getMcpConnection(serverId: string): McpConnectionWrapper | undefined {
    return this.serverConnections.get(serverId);
  }

  public async cleanup(): Promise<void> {
    logger.info('[ManagedServerService] Cleaning up all server connections...');
    if (this.devWatcher) {
      this.devWatcher.stopAll();
    }
    const stopPromises = Array.from(this.serverConnections.values()).map(conn => {
      try {
        conn.stop(true); 
      } catch (e) {
        logger.error(`[ManagedServerService] Error stopping connection for server ${conn.serverId}:`, e);
      }
      return Promise.resolve(); 
    });
    await Promise.allSettled(stopPromises);
    this.serverConnections.clear();
    logger.info('[ManagedServerService] All server connections stopped and cleared.');
  }

  public async proxyMcpRequest(serverId: string, request: McpRequestPayload): Promise<McpResponsePayload> {
    const connectionWrapper = this.serverConnections.get(serverId);
    if (!connectionWrapper) {
      logger.error(`[ManagedServerService] No active connection found for server ${serverId} to proxy request.`);
      return {
        mcp_version: request.mcp_version || '1.0',
        request_id: request.request_id,
        error: {
          code: -32004, // Custom error code for connection issue
          message: `MCP Pro: No active connection to managed server '${serverId}'. Server might be stopped or misconfigured.`,
        },
      };
    }

    if (connectionWrapper.getStatus().status !== 'running') {
        logger.warn(`[ManagedServerService] Attempted to proxy request to server ${serverId} which is not in 'running' state (current: ${connectionWrapper.getStatus().status}).`);
        return {
            mcp_version: request.mcp_version || '1.0',
            request_id: request.request_id,
            error: {
                code: -32005, // Custom error code for server not ready
                message: `MCP Pro: Managed server '${serverId}' is not currently running. Status: ${connectionWrapper.getStatus().status}.`,
            },
        };
    }

    try {
      // The McpConnectionWrapper should have a method to send/forward an MCP request
      // and return the MCP response.
      logger.info(`[ManagedServerService] Proxying MCP request (ID: ${request.request_id}, Method: ${request.method}) to server ${serverId}`);
      const response = await connectionWrapper.sendRequest(request);
      logger.info(`[ManagedServerService] Received response for MCP request (ID: ${request.request_id}) from server ${serverId}`);
      return response;
    } catch (error: any) {
      logger.error(`[ManagedServerService] Error proxying MCP request to server ${serverId}:`, error);
      return {
        mcp_version: request.mcp_version || '1.0',
        request_id: request.request_id,
        error: {
          code: -32003, // Custom error code for proxying failure
          message: `MCP Pro: Error proxying request to managed server '${serverId}'. ${error.message || 'Unknown error.'}`,
          data: error.data, // Include any additional error data if available
        },
      };
    }
  }
}

export const managedServerService = new ManagedServerService();

// Ensure this line is not duplicated if it already exists from previous steps
// export default managedServerService; // Or however it's exported/used in index.ts
