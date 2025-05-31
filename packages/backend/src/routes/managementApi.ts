// packages/backend/src/routes/managementApi.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware'; // Import the middleware
import { ManagementController } from '../controllers/ManagementController';
import { MarketplaceController } from '../controllers/MarketplaceController';
import { TrafficController } from '../controllers/TrafficController';

// Refactor to accept controller instances as arguments
export default function(
  managementController: ManagementController,
  marketplaceController: MarketplaceController,
  trafficController: TrafficController
) {
  const router = Router();
  // Apply authentication middleware to all routes in this router
  router.use(authenticateToken);

  // --- Server Management Routes ---
  router.post('/servers', managementController.registerServer.bind(managementController));
  router.get('/servers', managementController.getAllServers.bind(managementController));
  router.get('/servers/:serverId', managementController.getServerById.bind(managementController));
  router.put('/servers/:serverId', managementController.updateServerConfig.bind(managementController));
  router.delete('/servers/:serverId', managementController.deleteServer.bind(managementController));
  router.post('/servers/:serverId/start', managementController.startServer.bind(managementController));
  router.post('/servers/:serverId/stop', managementController.stopServer.bind(managementController));
  router.get('/servers/:serverId/status', managementController.getServerStatus.bind(managementController));
  // router.get('/servers/:serverId/logs', managementController.getServerLogs.bind(managementController)); // Assuming getServerLogs will be added to ManagementController

  // --- API Key Management Routes ---
  router.post('/api-keys', managementController.createApiKey.bind(managementController));
  router.get('/api-keys', managementController.listApiKeys.bind(managementController));
  router.get('/api-keys/:apiKeyId', managementController.getApiKeyDetails.bind(managementController));
  router.delete('/api-keys/:apiKeyId', managementController.revokeApiKey.bind(managementController));

  // --- Traffic Monitoring Routes ---
  router.get('/traffic/stats', trafficController.getTrafficStats.bind(trafficController));
  // If a more detailed log fetching endpoint is needed (like the commented out /traffic/logs):
  // It would require a method in TrafficController that calls service.getTrafficLogs with appropriate params from req.

  // --- Marketplace Routes ---
  router.get('/marketplace/items', marketplaceController.getAllItems.bind(marketplaceController));
  router.get('/marketplace/items/:itemId', marketplaceController.getItemById.bind(marketplaceController));
  router.get('/marketplace/search', marketplaceController.searchItems.bind(marketplaceController)); // Added search route

  console.log('[managementApi.ts] Management API routes configured with authentication.');
  return router;
}
