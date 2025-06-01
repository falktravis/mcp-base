// packages/backend/src/routes/mcpApi.ts
// Refactor to accept controller instance as argument
import { Router } from 'express';
import { McpGatewayController } from '../controllers/McpGatewayController';

export default function(mcpGatewayController: McpGatewayController) {
  const router = Router();

  // Single MCP endpoint per serverId, supporting all relevant HTTP methods (POST, GET, DELETE)
  router.all('/:serverId/mcp', mcpGatewayController.handleMcpEndpoint.bind(mcpGatewayController));

  console.log('[mcpApi.ts] MCP API routes configured with a single MCP endpoint: /:serverId/mcp');
  return router;
}
