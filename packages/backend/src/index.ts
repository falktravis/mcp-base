// Main entry point for the backend application
import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/database';
// Import controller and service classes only (not instances)
import { ManagementController } from './controllers/ManagementController';
import { MarketplaceController } from './controllers/MarketplaceController';
import { TrafficController } from './controllers/TrafficController';
import { McpGatewayController } from './controllers/McpGatewayController';
import { ManagedServerService } from './services/ManagedServerService';
import { ApiKeyService } from './services/ApiKeyService';
import { TrafficMonitoringService } from './services/TrafficMonitoringService';
import { MarketplaceService } from './services/MarketplaceService';
import { CentralGatewayMCPService } from './services/CentralGatewayMCPService';

dotenv.config(); // Load environment variables from .env file

const app: Express = express();
const port: number = parseInt(process.env.PORT ? process.env.PORT : '') || 3001;

// Middleware
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Basic CORS middleware (consider using the 'cors' package for more options)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all origins (adjust for production)
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    return res.status(200).json({});
  }
  next();
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.send('MCP Pro Backend is running!');
});

// Global error handler (simple example)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

async function main() {
  // Initialize database
  try {
    await initializeDatabase();
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize the database:', error);
    process.exit(1); // Exit if DB connection fails
  }

  // Instantiate services after DB is ready
  const apiKeyService = new ApiKeyService();
  const trafficMonitoringService = new TrafficMonitoringService();
  
  // CentralGatewayMCPService needs a way to forward messages. This will be passed to ManagedServerService,
  // which in turn passes it to McpConnectionWrapper instances.
  // McpGatewayController will provide the actual implementation for this callback.
  let forwardMessageCallbackForManagedService: any = null; 

  const centralGatewayService = new CentralGatewayMCPService(
    null as any, // managedServerService will be set later
    apiKeyService,
    trafficMonitoringService
  );

  // McpGatewayController needs centralGatewayService and will set the SSE callback on it.
  const mcpGatewayController = new McpGatewayController(centralGatewayService);

  // Now that mcpGatewayController is instantiated, it can provide the callback
  // that CentralGatewayMCPService uses to send messages via SSE.
  // And CentralGatewayMCPService provides the callback for McpConnectionWrapper.
  forwardMessageCallbackForManagedService = centralGatewayService.forwardMessageToSseClient.bind(centralGatewayService);
  
  // Instantiate ManagedServerService with the callback
  const managedServerService = new ManagedServerService(false, forwardMessageCallbackForManagedService);
  
  // Now, set the managedServerService dependency in centralGatewayService
  // This is a bit of a workaround for the circular dependency in terms of callback setup.
  // A more robust solution might involve an event emitter or a dedicated messaging bus.
  (centralGatewayService as any).managedServerService = managedServerService; 

  const marketplaceService = new MarketplaceService(managedServerService);

  // Instantiate other controllers with their dependencies
  const managementController = new ManagementController(managedServerService, apiKeyService);
  const marketplaceController = new MarketplaceController(marketplaceService);
  const trafficController = new TrafficController(trafficMonitoringService);
  // mcpGatewayController is already instantiated

  // Import routes and inject controllers
  const managementApiRoutes = require('./routes/managementApi').default(managementController, marketplaceController, trafficController);
  const mcpApiRoutes = require('./routes/mcpApi').default(mcpGatewayController);

  // API Routes
  app.use('/api/management', managementApiRoutes);
  app.use('/mcp', mcpApiRoutes);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Backend server is listening on port ${port}`);
  });
}

main().catch((e) => {
  console.error('Failed to start the backend server:', e);
  process.exit(1);
});
