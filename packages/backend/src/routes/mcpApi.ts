// packages/backend/src/routes/mcpApi.ts
// Refactor to accept controller instance as argument
import { Router } from 'express';
import { McpGatewayController } from '../controllers/McpGatewayController';

export default function(mcpGatewayController: McpGatewayController) {
  const router = Router();

  // Centralized MCP Gateway Endpoint
  // This single endpoint will handle all MCP requests to the gateway.
  // The McpGatewayController will no longer expect a serverId from the path for this route.
  router.all('/gateway', mcpGatewayController.handleCentralGatewayRequest.bind(mcpGatewayController));

  console.log('[mcpApi.ts] MCP API routes configured. Central Gateway: /gateway, Legacy Proxy: /:serverId/mcp');
  return router;
}
