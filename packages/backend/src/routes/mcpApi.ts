// packages/backend/src/routes/mcpApi.ts
// Refactor to accept controller instance as argument
import { Router } from 'express';
import { McpGatewayController } from '../controllers/McpGatewayController';

export default function(mcpGatewayController: McpGatewayController) {
  const router = Router();
  // Route for specific server requests, captures serverId in params
  // router.all('/:serverId/request', mcpGatewayController.handleRequest.bind(mcpGatewayController)); // Old single endpoint

  // New SSE endpoint for server-to-client events
  router.get('/:serverId/events', mcpGatewayController.handleSseConnection.bind(mcpGatewayController));

  // New POST endpoint for client-to-server messages
  router.post('/:serverId/message', mcpGatewayController.handleRequest.bind(mcpGatewayController));


  // You might have other general MCP routes that don't include a serverId in the path
  // For example, a route for gateway-level information (if any)
  // router.all('/', mcpGatewayController.handleGeneralRequest.bind(mcpGatewayController)); // Example

  console.log('[mcpApi.ts] MCP API routes configured with GET /events and POST /message endpoints.');
  return router;
}
