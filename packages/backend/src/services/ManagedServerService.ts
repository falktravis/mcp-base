// This service will manage the lifecycle and connections to all downstream MCP servers
// that users add via the MCP Pro UI. It's analogous to MCPHub.js in the mcp-hub reference.

import { query } from '../config/database'; // Import query function
import { ManagedMcpServer } from 'shared-types'; // Import ManagedMcpServer type
// import { McpConnectionWrapper } from './McpConnectionWrapper'; // Assuming this will be refactored or used later
import { randomBytes } from 'crypto';

export class ManagedServerService {
  // private connections: Map<string, McpConnectionWrapper> = new Map();

  constructor() {
    console.log('ManagedServerService initialized for direct SQL');
    // this.loadAndConnectServers(); // Load initially on startup - to be implemented with McpConnectionWrapper
  }

  async loadAndConnectServers(): Promise<void> {
    console.log('Loading managed MCP servers from database...');
    const sql = 'SELECT * FROM "ManagedMcpServer" WHERE "isEnabled" = TRUE;';
    try {
      const { rows: servers } = await query(sql);
      console.log(`Found ${servers.length} enabled servers to manage.`);
      // for (const server of servers) {
      //   await this.addOrUpdateServerConnection(server as ManagedMcpServer);
      // }
    } catch (error) {
      console.error('Error loading managed servers:', error);
    }
  }
  
  async createManagedServer(serverData: Omit<ManagedMcpServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<ManagedMcpServer | null> {
    const newId = randomBytes(16).toString('hex');
    const sql = `
      INSERT INTO "ManagedMcpServer" (
        id, name, url, type, "apiKey", credentials, description, "isEnabled", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *;
    `;
    try {
      const { rows } = await query(sql, [
        newId,
        serverData.name,
        serverData.url,
        serverData.type,
        serverData.apiKey, // Assuming encryption is handled elsewhere or not needed for this field directly
        serverData.credentials, // Same assumption for credentials
        serverData.description,
        serverData.isEnabled,
      ]);
      if (rows.length > 0) {
        // this.addOrUpdateServerConnection(rows[0] as ManagedMcpServer); // Connect if enabled
        return rows[0] as ManagedMcpServer;
      }
      return null;
    } catch (error) {
      console.error('Error creating managed server:', error);
      return null;
    }
  }

  async getAllManagedServers(): Promise<ManagedMcpServer[]> {
    const sql = 'SELECT * FROM "ManagedMcpServer" ORDER BY "createdAt" DESC;';
    try {
      const { rows } = await query(sql);
      return rows as ManagedMcpServer[];
    } catch (error) {
      console.error('Error fetching all managed servers:', error);
      return [];
    }
  }

  async getManagedServerById(id: string): Promise<ManagedMcpServer | null> {
    const sql = 'SELECT * FROM "ManagedMcpServer" WHERE id = $1;';
    try {
      const { rows } = await query(sql, [id]);
      if (rows.length > 0) {
        return rows[0] as ManagedMcpServer;
      }
      return null;
    } catch (error) {
      console.error('Error fetching managed server by ID:', error);
      return null;
    }
  }

  async updateManagedServer(id: string, updates: Partial<Omit<ManagedMcpServer, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ManagedMcpServer | null> {
    const setClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      setClauses.push(`"${key}" = $${paramIndex++}`);
      queryParams.push(value);
    });

    if (setClauses.length === 0) {
      return this.getManagedServerById(id); // No updates, return current state
    }

    queryParams.push(id); // For the WHERE clause
    const sql = `
      UPDATE "ManagedMcpServer"
      SET ${setClauses.join(', ')}, "updatedAt" = NOW()
      WHERE id = $${paramIndex}
      RETURNING *;
    `;

    try {
      const { rows } = await query(sql, queryParams);
      if (rows.length > 0) {
        // await this.addOrUpdateServerConnection(rows[0] as ManagedMcpServer); // Update connection
        return rows[0] as ManagedMcpServer;
      }
      return null;
    } catch (error) {
      console.error('Error updating managed server:', error);
      return null;
    }
  }

  async deleteManagedServer(id: string): Promise<boolean> {
    const sql = 'DELETE FROM "ManagedMcpServer" WHERE id = $1;';
    try {
      // await this.removeServerConnection(id); // Disconnect before deleting
      const result = await query(sql, [id]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting managed server:', error);
      return false;
    }
  }


  async addOrUpdateServerConnection(serverConfig: ManagedMcpServer ): Promise<void> {
    // const existingConnection = this.connections.get(serverConfig.id);

    // if (existingConnection) {
    //   console.log(`Updating connection for server: ${serverConfig.name} (${serverConfig.id})`);
    //   await existingConnection.updateConfig(serverConfig); // Assumes McpConnectionWrapper has updateConfig
    //   if (serverConfig.isEnabled && existingConnection.getStatus() === 'disabled') {
    //     await existingConnection.connect();
    //   }
    // } else if (serverConfig.isEnabled) {
    //   console.log(`Adding new connection for server: ${serverConfig.name} (${serverConfig.id})`);
    //   const newConnection = new McpConnectionWrapper(serverConfig);
      // newConnection.on('statusChanged', (status) => this.handleConnectionStatusChange(serverConfig.id, status));
      // newConnection.on('capabilitiesChanged', (capabilities) => this.handleCapabilitiesChange(serverConfig.id, capabilities));
    //   this.connections.set(serverConfig.id, newConnection);
    //   await newConnection.connect();
    // }

    // if (!serverConfig.isEnabled && existingConnection && existingConnection.getStatus() !== 'disabled') {
    //   await existingConnection.disconnect(true); // Disconnect and mark as disabled
    // }
    console.log('Placeholder for addOrUpdateServerConnection', serverConfig.name);
  }

  async removeServerConnection(serverId: string): Promise<void> {
    // const connection = this.connections.get(serverId);
    // if (connection) {
    //   await connection.disconnect();
    //   this.connections.delete(serverId);
    //   console.log(`Disconnected and removed server: ${serverId}`);
    // }
    console.log('Placeholder for removeServerConnection', serverId);
  }

  // Called by CentralGatewayMCPService
  async callToolOnServer(serverId: string, toolName: string, args: any): Promise<any> {
    // const connection = this.connections.get(serverId);
    // if (!connection || connection.getStatus() !== 'connected') {
    //   throw new Error(`Server ${serverId} is not connected or does not exist.`);
    // }
    // return connection.callTool(toolName, args);
    console.log('Placeholder for callToolOnServer', serverId, toolName, args);
    return { message: 'callToolOnServer placeholder response' };
  }

  async readResourceOnServer(serverId: string, resourceUri: string): Promise<any> {
    // const connection = this.connections.get(serverId);
    // if (!connection || connection.getStatus() !== 'connected') {
    //   throw new Error(`Server ${serverId} is not connected or does not exist.`);
    // }
    // return connection.readResource(resourceUri);
    console.log('Placeholder for readResourceOnServer', serverId, resourceUri);
    return { message: 'readResourceOnServer placeholder response' };
  }

  async getPromptOnServer(serverId: string, promptName: string, args: any): Promise<any> {
    // const connection = this.connections.get(serverId);
    // if (!connection || connection.getStatus() !== 'connected') {
    //   throw new Error(`Server ${serverId} is not connected or does not exist.`);
    // }
    // return connection.getPrompt(promptName, args);
    console.log('Placeholder for getPromptOnServer', serverId, promptName, args);
    return { message: 'getPromptOnServer placeholder response' };
  }

  async refreshServerCapabilities(serverId: string): Promise<any> {
    // const connection = this.connections.get(serverId);
    // if (!connection) {
    //   throw new Error(`Server ${serverId} not found.`);
    // }
    // await connection.updateCapabilities();
    // return connection.getServerInfo(); // Or just a success message
    console.log('Placeholder for refreshServerCapabilities', serverId);
    return { message: 'refreshServerCapabilities placeholder response' };
  }

  getServerStatus(serverId: string): any {
    // const connection = this.connections.get(serverId);
    // if (!connection) {
    //   return { status: 'not_found' };
    // }
    // return connection.getServerInfo();
    console.log('Placeholder for getServerStatus', serverId);
    return { status: 'unknown_placeholder' };
  }

  getAllServerStatuses(): any[] {
    // return Array.from(this.connections.values()).map(conn => conn.getServerInfo());
    console.log('Placeholder for getAllServerStatuses');
    return [{ id: 'placeholder', status: 'unknown' }];
  }

  // private handleConnectionStatusChange(serverId: string, status: any) {
    // console.log(`Server ${serverId} status changed: ${status.status}`);
    // Update status in DB
    // prisma.managedMcpServer.update({ where: { id: serverId }, data: { status: status.status, lastError: status.error } });
    // Emit event for SSE to UI if necessary
  // }

  // private handleCapabilitiesChange(serverId: string, capabilities: any) {
    // console.log(`Server ${serverId} capabilities updated.`);
    // Update capabilities in DB (tools, resources, prompts)
    // prisma.managedMcpServer.update({
    //   where: { id: serverId },
    //   data: {
    //     tools: capabilities.tools,
    //     resources: capabilities.resources,
    //     prompts: capabilities.prompts,
    //     lastRefreshed: new Date(),
    //   }
    // });
    // Emit event for SSE to UI if necessary
  // }
}

export const managedServerService = new ManagedServerService();
