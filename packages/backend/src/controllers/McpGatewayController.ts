import { Request, Response } from 'express';
import { CentralGatewayMCPService } from '../services/CentralGatewayMCPService';
import { McpResponsePayload } from '../../../shared-types/src/api-contracts';
import { managedServerService } from '../services/ManagedServerService';
import { ApiKeyService } from '../services/ApiKeyService'; // Corrected: Import class directly
import { trafficMonitoringService } from '../services/TrafficMonitoringService';

// Instantiate the service (or get it from a DI container/service registry)
const apiKeyServiceInstance = new ApiKeyService(); // Create an instance

const centralGatewayServiceInstance = new CentralGatewayMCPService(
    managedServerService, // Assuming this is the singleton instance
    apiKeyServiceInstance, // Use the instantiated service
    trafficMonitoringService // Assuming this is the singleton instance
);

export class McpGatewayController {
    constructor(private gatewayService: CentralGatewayMCPService) {}

    async handleRequest(req: Request, res: Response): Promise<void> {
        const sourceIp = req.ip; // Get source IP from request

        try {
            // The CentralGatewayMCPService.handleMcpRequest expects the raw request object
            // and will handle parsing headers (for API key) and body (for MCP payload)
            const mcpResponse: McpResponsePayload = await this.gatewayService.handleMcpRequest(req, sourceIp);

            // Determine HTTP status code based on MCP response
            // This is a simplified mapping. A more robust solution might inspect mcpResponse.error.code
            let httpStatusCode = 200;
            if (mcpResponse.error) {
                // Example mapping of MCP error codes to HTTP status codes
                // This can be more sophisticated based on specific MCP error codes
                switch (mcpResponse.error.code) {
                    case -32001: // Example: Authentication failed
                        httpStatusCode = 401;
                        break;
                    case -32002: // Example: Server/method not found
                        httpStatusCode = 404;
                        break;
                    case -32602: // Example: Invalid params
                        httpStatusCode = 400;
                        break;
                    default: // Generic server error for other MCP errors
                        httpStatusCode = 500;
                        break;
                }
            }

            res.status(httpStatusCode).json(mcpResponse);

        } catch (error: any) {
            // This catch block is for unexpected errors within the controller itself,
            // or if handleMcpRequest throws an error not caught and formatted as McpResponsePayload.
            console.error('[McpGatewayController] Unhandled error:', error);
            // Ensure a generic MCP Error response is sent if not already formatted
            const responsePayload: McpResponsePayload = {
                mcp_version: req.body?.mcp_version || '1.0', // Best effort
                request_id: req.body?.request_id || 'unknown',
                error: {
                    code: -32000, // Generic internal error
                    message: error.message || 'An unexpected internal server error occurred in the gateway controller.',
                },
            };
            res.status(500).json(responsePayload);
        }
    }
}

export const mcpGatewayController = new McpGatewayController(centralGatewayServiceInstance);
