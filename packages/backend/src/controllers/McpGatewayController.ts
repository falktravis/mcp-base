import { Request, Response } from 'express';
import { CentralGatewayMCPService } from '../services/CentralGatewayMCPService';
import { IncomingMessage, ServerResponse } from 'http';

/**
 * New MCP Gateway Controller that integrates with the real MCP SDK Server
 * Replaces the legacy proxy-based approach with a centralized MCP gateway
 */
export class McpGatewayController {
  private centralGatewayService: CentralGatewayMCPService;

  constructor(centralGatewayService: CentralGatewayMCPService) {
    this.centralGatewayService = centralGatewayService;
  }

  /**
   * Handle all MCP requests to the centralized gateway
   * This integrates with the StreamableHTTP transport from the MCP SDK
   */
  public async handleCentralGatewayRequest(req: Request, res: Response): Promise<void> {
    try {
      const transport = this.centralGatewayService.getTransport();
      const serviceInstanceId = this.centralGatewayService.instanceId;
      const serviceIsReady = this.centralGatewayService.isReady();

      console.log(`[McpGatewayController] Handling request. CentralGatewayService Instance: ${serviceInstanceId}, IsReady: ${serviceIsReady}, HasTransport: ${!!transport}`);

      if (!serviceIsReady || !transport) {
        // Log the specific reason for better debugging
        if (!serviceIsReady) {
          console.error(`[McpGatewayController] Gateway service (Instance: ${serviceInstanceId}) not ready.`);
        }
        if (!transport) {
          console.error(`[McpGatewayController] Gateway transport not available for service instance ${serviceInstanceId}.`);
        }

        res.status(503).json({
          jsonrpc: "2.0", 
          error: {
            code: -32000, 
            message: serviceIsReady ? 'Gateway transport unavailable' : 'Gateway service not initialized',
          },
          id: null 
        });
        return;
      }

      // The StreamableHTTPServerTransport expects Node.js HTTP objects
      // Express Request/Response extend these, so we can cast them
      const nodeReq = req as unknown as IncomingMessage;
      const nodeRes = res as unknown as ServerResponse;

      // Let the MCP transport handle the request
      try {
        console.log(`[McpGatewayController] Calling transport.handleRequest for instance ${serviceInstanceId}...`);
        await transport.handleRequest(nodeReq, nodeRes);
        console.log(`[McpGatewayController] transport.handleRequest completed for instance ${serviceInstanceId}. Response headers sent by transport: ${res.headersSent}`);
        
        // If the transport handled the request and sent a response, we should not do anything further.
        if (res.headersSent) {
          console.log(`[McpGatewayController] Response was sent by transport.handleRequest. Returning.`);
          return; 
        }
        // If headers were NOT sent by transport, it implies an issue or that it expects us to send something.
        // This case is unusual if no error was thrown by transport.handleRequest.
        console.warn(`[McpGatewayController] WARNING: transport.handleRequest completed for instance ${serviceInstanceId} but did NOT send response headers.`);
        // Fall through to outer error handling or a generic success if appropriate, though this path is odd.

      } catch (transportError: any) {
        console.error(`[McpGatewayController] Error DIRECTLY from transport.handleRequest for instance ${serviceInstanceId}:`, transportError);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32001, // Different error code for this specific case
              message: 'Error during MCP transport handling',
              data: transportError.message || 'Unknown transport error'
            },
            id: null
          });
        }
        return; // Ensure we don't fall through to the outer catch
      }

    } catch (error: any) {
      console.error(`[McpGatewayController] Outer catch - Error handling gateway request for instance ${this.centralGatewayService.instanceId}:`, error);
      
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            code: -32603,
            message: 'Internal server error',
            data: error.message
          }
        });
      }
    }
  }

  /**
   * Health check endpoint for the gateway
   */
  public async handleHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const sessionCount = this.centralGatewayService.getActiveSessionCount();
      const toolCount = this.centralGatewayService.getAggregatedToolCount();

      res.json({
        status: 'healthy',
        gateway: 'mcp-pro-central-gateway',
        version: '1.0.0',
        sessions: sessionCount,
        tools: toolCount,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[NewMcpGatewayController] Error in health check:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  /**
   * Get gateway statistics
   */
  public async handleGatewayStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = {
        activeSessions: this.centralGatewayService.getActiveSessionCount(),
        aggregatedTools: this.centralGatewayService.getAggregatedToolCount(),
        timestamp: new Date().toISOString()
      };

      res.json(stats);
    } catch (error: any) {
      console.error('[NewMcpGatewayController] Error getting gateway stats:', error);
      res.status(500).json({
        error: error.message
      });
    }
  }
}
