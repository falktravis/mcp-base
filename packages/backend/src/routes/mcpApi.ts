// packages/backend/src/routes/mcpApi.ts
// Refactor to accept controller instance as argument
import { Router } from 'express';
import { McpGatewayController } from '../controllers/McpGatewayController';

export default function(mcpGatewayController: McpGatewayController) {
  const router = Router();
  router.all('/*', mcpGatewayController.handleRequest.bind(mcpGatewayController));
  console.log('[mcpApi.ts] MCP API routes configured to use McpGatewayController.');
  return router;
}
