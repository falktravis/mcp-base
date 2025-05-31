// packages/backend/src/routes/mcpApi.ts
import { Router } from 'express';
import { mcpGatewayController } from '../controllers/McpGatewayController';

const router = Router();

// This route will catch all requests to /mcp/*
// The McpGatewayController.handleRequest method will be responsible for:
// 1. Authenticating the request (via ApiKeyService used by CentralGatewayMCPService).
// 2. Extracting the target MCP server identifier (logic within CentralGatewayMCPService).
// 3. Forwarding the request to the appropriate managed MCP server.
// 4. Returning the MCP response or an error.
router.all('/*', mcpGatewayController.handleRequest.bind(mcpGatewayController));

console.log('[mcpApi.ts] MCP API routes configured to use McpGatewayController.');
export default router;
