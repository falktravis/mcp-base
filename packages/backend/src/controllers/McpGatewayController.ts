import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CentralGatewayMCPService } from '../services/CentralGatewayMCPService';
import { McpRequestPayload } from '@shared-types/api-contracts';

// Define a simple interface for JSON-RPC responses for clarity within the controller
interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any; // This will contain the original McpResponsePayload in case of success
  error?: JsonRpcErrorObject;
}

export class McpGatewayController {
    // Store active SSE response objects per serverId and potentially a session/client identifier
    // Key: serverId (or serverId-sessionId), Value: Response object for SSE
    private activeSseResponses: Map<string, Response> = new Map();

    constructor(private gatewayService: CentralGatewayMCPService) {
        // We might need to pass a callback to CentralGatewayMCPService
        // so it can send messages back through the appropriate SSE connection.
        this.gatewayService.setSseSendCallback(this.sendSseMessage.bind(this));
    }

    // Callback for CentralGatewayMCPService to send messages over SSE
    public sendSseMessage(serverId: string, sessionId: string | null, message: any): boolean {
        if (sessionId) {
            const sseKey = `${serverId}-${sessionId}`;
            const res = this.activeSseResponses.get(sseKey);
            if (res && !res.writableEnded) {
                try {
                    res.write(`data: ${JSON.stringify(message)}\n\n`);
                    console.log(`[McpGatewayController] Sent SSE message to specific session ${sseKey}`);
                    return true;
                } catch (error) {
                    console.error(`[McpGatewayController] Error writing to SSE stream for ${sseKey}:`, error);
                    this.activeSseResponses.delete(sseKey);
                    return false;
                }
            } else {
                console.warn(`[McpGatewayController] No active or writable SSE response found for specific session ${sseKey}. Message not sent.`);
                if (res && res.writableEnded) {
                    this.activeSseResponses.delete(sseKey); // Clean up ended responses
                }
                return false;
            }
        } else {
            // Broadcast to all sessions for this serverId
            let messageSentToAtLeastOne = false;
            console.log(`[McpGatewayController] Broadcasting SSE message to all sessions for serverId: ${serverId}`);
            for (const [key, res] of this.activeSseResponses.entries()) {
                if (key.startsWith(`${serverId}-`) && res && !res.writableEnded) {
                    try {
                        res.write(`data: ${JSON.stringify(message)}\n\n`);
                        console.log(`[McpGatewayController] Broadcasted SSE message to session ${key}`);
                        messageSentToAtLeastOne = true;
                    } catch (error) {
                        console.error(`[McpGatewayController] Error writing to SSE stream for session ${key} during broadcast:`, error);
                        this.activeSseResponses.delete(key); // Clean up this specific problematic session
                    }
                } else if (key.startsWith(`${serverId}-`) && res && res.writableEnded) {
                    this.activeSseResponses.delete(key); // Clean up ended responses
                }
            }
            if (!messageSentToAtLeastOne) {
                console.warn(`[McpGatewayController] No active or writable SSE responses found for serverId ${serverId} during broadcast. Message not sent.`);
            }
            return messageSentToAtLeastOne;
        }
    }

    // Handles POST requests for client-to-server messages
    async handleRequest(req: Request, res: Response): Promise<void> {
        const sourceIp = req.ip; // Get source IP from request
        const serverId = req.params.serverId;

        try {
            const jsonRpcResponse: JsonRpcResponse = await this.gatewayService.handleMcpRequest(req, sourceIp);

            let httpStatusCode = 200;
            if (jsonRpcResponse.error) {
                // Map JSON-RPC error codes (which might be derived from MCP error codes or HTTP status codes)
                // back to HTTP status codes for the final response.
                // The error codes in JsonRpcResponse.error.code are now the primary source.
                switch (jsonRpcResponse.error.code) {
                    case -32001: // Example: Authentication failed (custom MCP mapping)
                        httpStatusCode = 401;
                        break;
                    case -32002: // Example: Server/method not found (custom MCP mapping)
                        httpStatusCode = 404;
                        break;
                    case -32602: // JSON-RPC Invalid Params (often maps to 400 Bad Request)
                        httpStatusCode = 400;
                        break;
                    // Add more specific mappings if needed based on your CentralGatewayMCPService error handling
                    default: // Generic server error for other MCP/JSON-RPC errors
                        // Check if the error object contains a hint from the service
                        if (jsonRpcResponse.error.data?.gateway_error_code === 'UNAUTHORIZED') httpStatusCode = 401;
                        else if (jsonRpcResponse.error.data?.gateway_error_code === 'NO_TARGET_SERVER') httpStatusCode = 400;
                        else if (jsonRpcResponse.error.data?.gateway_error_code === 'SERVER_NOT_FOUND') httpStatusCode = 404;
                        else if (jsonRpcResponse.error.data?.gateway_error_code === 'INVALID_REQUEST') httpStatusCode = 400;
                        else httpStatusCode = 500; // Default to 500 if no specific mapping
                        break;
                }
            }
            res.status(httpStatusCode).json(jsonRpcResponse);
        } catch (error: any) {
            // This catch block is for unexpected errors within the controller itself,
            // or if handleMcpRequest throws an error not caught and formatted as JsonRpcResponse.
            console.error('[McpGatewayController] Unhandled error:', error);
            
            // Attempt to get request ID from body, default to 'unknown'
            const requestId = req.body?.id || req.body?.request_id || 'unknown_request_id';

            const errorResponse: JsonRpcResponse = {
                jsonrpc: '2.0',
                id: requestId, // Best effort to include an ID
                error: {
                    code: -32000, // Generic internal JSON-RPC error code
                    message: error.message || 'An unexpected internal server error occurred in the gateway controller.',
                },
            };
            res.status(500).json(errorResponse);
        }
    }

    // Handles GET requests for SSE connections
    async handleSseConnection(req: Request, res: Response): Promise<void> {
        const serverId = req.params.serverId;
        const sessionId = uuidv4(); // Generate unique session ID
        const sseKey = `${serverId}-${sessionId}`; // Construct composite key

        console.log(`[McpGatewayController] SSE connection request for key: ${sseKey}`);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for SSE
        res.flushHeaders();

        this.activeSseResponses.set(sseKey, res);
        console.log(`[McpGatewayController] SSE connection established for ${sseKey}. Total active: ${this.activeSseResponses.size}`);

        // Send an initial message, like the result of an implicit 'initialize' call
        // This requires CentralGatewayMCPService to be able to trigger this.
        // For now, we simulate the gateway sending an initialize to the downstream and forwarding response.
        try {
            const initializeRequest: McpRequestPayload = {
                mcp_version: '1.0',
                request_id: 'gateway-sse-init-' + Date.now(),
                method: 'initialize',
                params: { capabilities: { streamable_http_transport: true } } // Client announces capability
            };

            // The gatewayService.handleMcpRequest is request/response.
            // For true streamable-http, the downstream server would connect, and then the gateway
            // would use the McpConnectionWrapper to forward messages over this SSE stream.
            // Here, we're simulating the initial handshake response.
            const jsonRpcResponse = await this.gatewayService.handleMcpRequest({
                params: { serverId },
                body: initializeRequest, // This body is what the client (e.g. MCP Inspector) would send via POST
                                        // but for SSE handshake, the server (gateway) initiates this to the *downstream* server.
                                        // The client connecting to /events doesn't send this body.
                headers: req.headers, 
                ip: req.ip,
                isSseInitialization: true // Add a flag to tell service this is for SSE setup
            }, req.ip);

            this.sendSseMessage(serverId, sessionId, jsonRpcResponse); // Pass sessionId for initial message

        } catch (error: any) {
            console.error(`[McpGatewayController] Error during SSE implicit initialization for ${sseKey}:`, error);
            const errorResponse: JsonRpcResponse = {
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32000,
                    message: error.message || 'Error during SSE initialization'
                }
            };
            this.sendSseMessage(serverId, sessionId, errorResponse); // Pass sessionId for error message
        }

        const keepAliveInterval = setInterval(() => {
            if (res.writableEnded) {
                clearInterval(keepAliveInterval);
                this.activeSseResponses.delete(sseKey);
                console.log(`[McpGatewayController] SSE stream ${sseKey} ended. Cleared keepAlive. Total active: ${this.activeSseResponses.size}`);
                return;
            }
            res.write(': keepalive\n\n');
        }, 20000);

        req.on('close', () => {
            console.log(`[McpGatewayController] SSE connection closed by client for ${sseKey}. Total active before removal: ${this.activeSseResponses.size}`);
            clearInterval(keepAliveInterval);
            this.activeSseResponses.delete(sseKey);
            console.log(`[McpGatewayController] SSE connection for ${sseKey} removed. Total active after removal: ${this.activeSseResponses.size}`);
            res.end();
        });
    }
}
