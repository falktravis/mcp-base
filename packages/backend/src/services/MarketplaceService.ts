// packages/backend/src/services/MarketplaceService.ts

import db from '../config/database';
import { ManagedServerService } from './ManagedServerService';
import { RegisterServerRequest, ServerType, ManagedMcpServerDetails } from 'shared-types/api-contracts';

/**
 * @class MarketplaceService
 * @description Service for handling marketplace-related operations such as
 * fetching available MCP server images, configurations, or extensions from the local database.
 */
export class MarketplaceService {
  constructor(private managedServerService: ManagedServerService) { // Injected ManagedServerService
    console.log('[MarketplaceService] Initialized.');
  }

  /**
   * @method getAllItems
   * @description Fetches a list of all items available in the marketplace.
   * @returns {Promise<any[]>}
   */
  public async getAllItems(): Promise<any[]> {
    const res = await db.query('SELECT * FROM mcp_marketplace_server');
    return res.rows;
  }

  /**
   * @method getItemById
   * @description Fetches details for a specific marketplace item by its qualified_name.
   * @param {string} itemId - The qualified_name of the item.
   * @returns {Promise<any | null>}
   */
  public async getItemById(itemId: string): Promise<any | null> {
    const res = await db.query('SELECT * FROM mcp_marketplace_server WHERE qualified_name = $1', [itemId]);
    return res.rows[0] || null;
  }

  /**
   * @method searchItems
   * @description Searches marketplace items based on a query string (e.g., display_name, icon_url, connections, tools).
   * @param {string} query - The search query.
   * @returns {Promise<any[]>}
   */
  public async searchItems(query: string): Promise<any[]> {
    const q = `%${query.toLowerCase()}%`;
    const res = await db.query(
      `SELECT * FROM mcp_marketplace_server WHERE 
        LOWER(display_name) LIKE $1 OR 
        LOWER(qualified_name) LIKE $1 OR 
        LOWER(CAST(connections AS TEXT)) LIKE $1 OR 
        LOWER(CAST(tools AS TEXT)) LIKE $1`,
      [q]
    );
    return res.rows;
  }

  /**
   * @method installServer
   * @description Fetches a marketplace item by its ID, transforms it into a server registration request,
   *              and registers it using the ManagedServerService.
   * @param {string} itemId - The qualified_name of the marketplace item to install.
   * @returns {Promise<ManagedMcpServerDetails | null>} The details of the registered server, or null if the item wasn't found.
   * @throws {Error} If the marketplace item has invalid connection information or an unsupported server type.
   */
  public async installServer(itemId: string): Promise<ManagedMcpServerDetails | null> {
    const item = await this.getItemById(itemId);
    if (!item) {
      console.warn(`[MarketplaceService] Marketplace item with ID ${itemId} not found for installation.`);
      return null; // Indicates item not found
    }

    // Ensure connections is an array and has at least one entry
    if (!Array.isArray(item.connections) || item.connections.length === 0) {
      console.error(`[MarketplaceService] Marketplace item ${itemId} has no connection information.`);
      throw new Error(`Marketplace item ${itemId} is missing connection information.`);
    }
    const connectionInfo = item.connections[0]; // Using the first connection object

    // Validate required fields from connectionInfo
    if (!connectionInfo.type || !connectionInfo.deploymentUrl) {
      console.error(`[MarketplaceService] Marketplace item ${itemId} has invalid connection structure. Missing type or deploymentUrl.`);
      throw new Error(`Marketplace item ${itemId} has invalid connection structure.`);
    }

    let serverType: ServerType;
    // Map marketplace connection type to our ServerType enum
    switch (connectionInfo.type.toLowerCase()) {
      case 'http': // Assuming 'http' from marketplace implies 'streamable-http' for now
      case 'streamable-http':
        serverType = 'streamable-http';
        break;
      case 'sse':
        serverType = 'sse';
        break;
      case 'websocket':
        serverType = 'websocket';
        break;
      // Add 'stdio' case if marketplace items can be of this type and provide 'command', 'args' etc.
      // case 'stdio':
      //   serverType = 'stdio';
      //   break;
      default:
        console.error(`[MarketplaceService] Unsupported server type '${connectionInfo.type}' for marketplace item ${itemId}.`);
        throw new Error(`Unsupported server type '${connectionInfo.type}' from marketplace item ${itemId}.`);
    }

    const registerRequest: RegisterServerRequest = {
      name: item.display_name || item.qualified_name, // Use display_name, fallback to qualified_name
      description: item.description || `Installed from marketplace: ${item.display_name || item.qualified_name}`,
      serverType: serverType,
      connectionDetails: {
        url: connectionInfo.deploymentUrl,
        // For stdio, you would map command, args, workingDirectory, env from connectionInfo if they exist
        // command: serverType === 'stdio' ? connectionInfo.command : undefined,
        // args: serverType === 'stdio' ? connectionInfo.args : undefined,
        // workingDirectory: serverType === 'stdio' ? connectionInfo.workingDirectory : undefined,
        // env: serverType === 'stdio' ? connectionInfo.env : undefined,
      },
      mcpOptions: { // Store additional marketplace info for reference
        marketplace_qualified_name: item.qualified_name,
        icon_url: item.icon_url,
        tools: item.tools, // Assuming item.tools is already in the correct format or serializable
        original_connections: item.connections, // Store the original connections array from marketplace item
      },
      tags: ['marketplace-installed', item.qualified_name], // Add relevant tags for identification
    };

    try {
      // Delegate to ManagedServerService to perform the actual registration
      const installedServer = await this.managedServerService.registerServer(registerRequest);
      console.log(`[MarketplaceService] Successfully registered server ${installedServer.id} from marketplace item ${itemId}.`);
      return installedServer;
    } catch (error) {
      console.error(`[MarketplaceService] Error registering server from marketplace item ${itemId}:`, error);
      // Re-throw the error to be handled by the controller or a global error handler
      // This allows the controller to return an appropriate HTTP error response
      throw error;
    }
  }
}

// Placeholder for a more sophisticated logging solution
const logger = console;
