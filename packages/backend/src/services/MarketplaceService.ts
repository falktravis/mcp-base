// packages/backend/src/services/MarketplaceService.ts

/**
 * @class MarketplaceService
 * @description Service for handling marketplace-related operations such as
 * fetching available MCP server images, configurations, or extensions.
 * This might interact with a central registry or a local cache of marketplace items.
 * (Currently a placeholder, does not interact with the database)
 */
export class MarketplaceService {
  private availableItems: MarketplaceItem[] = [];

  constructor() {
    this.loadMarketplaceItems();
    console.log('[MarketplaceService] Initialized.');
  }

  private loadMarketplaceItems(): void {
    // In a real application, this would fetch from a remote source, a database, or a configuration file.
    // For now, we use a static list.
    this.availableItems = [
      {
        id: 'mcp-echo-server-stdio',
        name: 'MCP Echo Server (STDIO)',
        description: 'A simple MCP server that echoes back any messages it receives. Runs as a command-line process using STDIO.',
        version: '1.0.0',
        type: 'stdio',
        connectionDefaults: {
          command: 'node', // Example: requires a compatible Node.js echo server script
          args: ['./scripts/echo-server.js'], // Path relative to where mcp-pro might run it or a globally accessible script
          workingDirectory: '.', // Or a specific path
        },
        mcpOptionsDefaults: {
          heartbeatInterval: 30000,
          initialPayload: { info: 'STDIO Echo server ready to connect' },
          supportsStdioControlMessages: true,
        },
        tags: ['echo', 'stdio', 'basic', 'template'],
        iconUrl: '/assets/icons/stdio-server-icon.png', // Placeholder path
      },
      {
        id: 'mcp-data-processor-tcp',
        name: 'MCP Data Processor (TCP)',
        description: 'A template for an MCP server that processes incoming data streams over a TCP connection.',
        version: '1.2.0',
        type: 'tcp',
        connectionDefaults: {
          host: '127.0.0.1',
          port: 6789,
        },
        mcpOptionsDefaults: {
          maxConnections: 10,
          requestTimeout: 5000,
        },
        tags: ['data', 'tcp', 'processing', 'template'],
        iconUrl: '/assets/icons/tcp-server-icon.png', // Placeholder path
      },
      {
        id: 'mcp-websocket-bridge',
        name: 'MCP WebSocket Bridge',
        description: 'Sets up an MCP server that acts as a bridge over WebSocket, useful for web client integrations.',
        version: '0.9.0',
        type: 'websocket',
        connectionDefaults: {
          path: '/mcp', // WebSocket server path
          port: 7000,    // Port the WebSocket server will listen on
        },
        tags: ['websocket', 'bridge', 'web', 'template'],
        iconUrl: '/assets/icons/websocket-server-icon.png', // Placeholder path
      },
    ];
    console.log(`[MarketplaceService] Loaded ${this.availableItems.length} mock marketplace items.`);
  }

  /**
   * @method getAllItems
   * @description Fetches a list of all items available in the marketplace.
   * @returns {Promise<MarketplaceItem[]>}
   */
  public async getAllItems(): Promise<MarketplaceItem[]> {
    // Simulating async operation
    return Promise.resolve([...this.availableItems]);
  }

  /**
   * @method getItemById
   * @description Fetches details for a specific marketplace item by its ID.
   * @param {string} itemId - The ID of the item.
   * @returns {Promise<MarketplaceItem | null>}
   */
  public async getItemById(itemId: string): Promise<MarketplaceItem | null> {
    const item = this.availableItems.find(i => i.id === itemId);
    // Simulating async operation
    return Promise.resolve(item || null);
  }

  /**
   * @method searchItems
   * @description Searches marketplace items based on a query string (e.g., name, description, tags).
   * (Basic placeholder implementation - case-insensitive search on name, description, and tags)
   * @param {string} query - The search query.
   * @returns {Promise<MarketplaceItem[]>}
   */
  public async searchItems(query: string): Promise<MarketplaceItem[]> {
    const lowerCaseQuery = query.toLowerCase();
    const results = this.availableItems.filter(item => 
      item.name.toLowerCase().includes(lowerCaseQuery) || 
      item.description.toLowerCase().includes(lowerCaseQuery) || 
      (item.tags && item.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)))
    );
    return Promise.resolve(results);
  }

  // In a future version, this could involve:
  // - Fetching from a remote API endpoint.
  // - Reading from a configuration file or database.
  // - Implementing caching strategies.
  // - Adding methods for publishing or updating items (admin functionality).
}

// Placeholder for a more sophisticated logging solution
const logger = console;

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  version: string;
  type: 'stdio' | 'tcp' | 'websocket'; // Example types of servers one might find
  connectionDefaults: Record<string, any>; // Default connection parameters (e.g., command for stdio, port for tcp)
  mcpOptionsDefaults?: Record<string, any>; // Default MCP-specific options
  tags?: string[];
  iconUrl?: string; // URL for an icon representing the item
}

// Instantiate the service for export
export const marketplaceService = new MarketplaceService();
