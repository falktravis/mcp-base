// This service will act as the MCP Server that mcp-remote clients connect to.
// It will receive MCP requests, authenticate them (e.g., API Key),
// and then use ManagedServerService to route the request to the appropriate downstream MCP server.

import { McpRequestPayload, McpResponsePayload, McpError, ServerType } from '@shared-types/api-contracts'; // Corrected import path
import { ManagedServerService } from './ManagedServerService';
import { ApiKeyService } from './ApiKeyService';
import { TrafficMonitoringService } from './TrafficMonitoringService';
import { v4 as uuidv4 } from 'uuid';
import { ApiKey } from '@shared-types/db-models'; // Import ApiKey DB model for validateApiKey return type

const GATEWAY_ERROR_SERVER_ID_PLACEHOLDER = 'GATEWAY_ERROR_NO_SERVER_IDENTIFIED';

// Define a simple interface for JSON-RPC responses for clarity
interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: JsonRpcErrorObject;
}

// Define the shape of the raw request object more precisely, especially for the new flag
interface GatewayRawRequest {
    params?: { serverId?: string };
    body?: any; // McpRequestPayload or { tool_name, tool_input } or JSON-RPC like { method, params, id }
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
    isSseInitialization?: boolean; // Flag for SSE setup
}

// Type for the SSE callback function
type SseSendCallback = (serverId: string, sessionId: string | null, message: JsonRpcResponse) => boolean;

export class CentralGatewayMCPService {
  private managedServerService: ManagedServerService;
  private apiKeyService: ApiKeyService;
  private trafficMonitoringService: TrafficMonitoringService;
  private sseSendCallback?: SseSendCallback;

  constructor(
    managedServerService: ManagedServerService,
    apiKeyService: ApiKeyService,
    trafficMonitoringService: TrafficMonitoringService,
  ) {
    this.managedServerService = managedServerService;
    this.apiKeyService = apiKeyService;
    this.trafficMonitoringService = trafficMonitoringService;
    console.log('CentralGatewayMCPService initialized with all dependencies');
  }

  public setSseSendCallback(callback: SseSendCallback): void {
    this.sseSendCallback = callback;
    console.log('[CentralGatewayMCPService] SSE send callback registered.');
  }

  // Method to handle incoming MCP requests (generic for tool_call, resource_request, etc.)
  async handleMcpRequest(
    rawRequest: GatewayRawRequest, // Use the more specific type
    sourceIp?: string,
  ): Promise<JsonRpcResponse> { 
    const gatewayRequestId = uuidv4(); 
    let apiKeyId: string | undefined;
    let serverIdFromPath: string | undefined;

    const startTime = Date.now();
    let loggedMcpMethod: string | undefined;

    const clientRequestBody = rawRequest.body;
    const jsonRpcRequestId = clientRequestBody?.id; 
    const isSseInit = rawRequest.isSseInitialization === true;

    try {
      // 1. Extract API Key and Authenticate
      const authHeader = rawRequest.headers?.['authorization'];
      const apiKeyFromAuth = typeof authHeader === 'string' ? authHeader.split(' ')?.[1] : undefined;
      const apiKeyHeader = rawRequest.headers?.['x-api-key'] || apiKeyFromAuth;
      let validatedApiKeyModel: Omit<ApiKey, "hashedApiKey" | "salt"> | null = null;
      if (apiKeyHeader) {
        validatedApiKeyModel = await this.apiKeyService.validateApiKey(String(apiKeyHeader)); // Ensure string
        if (!validatedApiKeyModel) {
          throw { statusCode: 401, code: 'UNAUTHORIZED', message: 'Invalid API key.' };
        }
        apiKeyId = validatedApiKeyModel.id;
      } else {
        apiKeyId = undefined; // Or handle as an error if API key is always required
      }

      // 2. Extract serverId from path and request details from body
      serverIdFromPath = rawRequest.params?.serverId;
      if (!serverIdFromPath) {
        throw { statusCode: 400, code: 'NO_TARGET_SERVER', message: 'Server ID must be provided in the URL path.' };
      }

      const toolName = clientRequestBody?.tool_name;
      const toolInput = clientRequestBody?.tool_input;
      const clientMethod = clientRequestBody?.method; 

      let actualDownstreamMethod: string;
      let actualDownstreamParams: any;

      if (typeof toolName === 'string' && toolName) {
        actualDownstreamMethod = 'tools/call';
        actualDownstreamParams = { name: toolName, arguments: toolInput };
        loggedMcpMethod = `tools/call (${toolName})`;
      } else if (typeof clientMethod === 'string' && clientMethod) {
        actualDownstreamMethod = clientMethod;
        actualDownstreamParams = clientRequestBody.params;
        loggedMcpMethod = actualDownstreamMethod;
      } else {
        console.error('[CentralGatewayMCPService] Debug: Raw request body:', JSON.stringify(clientRequestBody));
        throw { statusCode: 400, code: 'INVALID_REQUEST', message: 'Request body must contain a valid string "tool_name" or a valid string "method".' };
      }
      
      const mcpDownstreamRequestId = (typeof jsonRpcRequestId === 'string' || typeof jsonRpcRequestId === 'number') 
        ? String(jsonRpcRequestId) 
        : clientRequestBody?.request_id || uuidv4(); // Use client's request_id if available, else generate

      const downstreamRequestPayload: McpRequestPayload = {
        mcp_version: clientRequestBody.mcp_version || '1.0',
        request_id: mcpDownstreamRequestId, 
        method: actualDownstreamMethod,
        params: actualDownstreamParams,
      };

      const server = await this.managedServerService.getServerById(serverIdFromPath);
      if (!server) {
        throw { statusCode: 404, code: 'SERVER_NOT_FOUND', message: `Managed server with ID '${serverIdFromPath}' not found.` };
      }

      // 4. Proxy the request to the downstream server
      // If this is an SSE initialization, the response will be sent via SSE callback by the controller.
      // Otherwise, it's a regular request/response.
      const downstreamMcpResponse: McpResponsePayload = await this.managedServerService.proxyMcpRequest(
        server.id, 
        downstreamRequestPayload
        // The third argument for a streaming callback was removed as it's not implemented in proxyMcpRequest
      );

      this.trafficMonitoringService.logRequest({
        serverId: server.id,
        mcpMethod: loggedMcpMethod,
        mcpRequestId: mcpDownstreamRequestId, 
        sourceIp,
        httpStatus: downstreamMcpResponse.error ? (downstreamMcpResponse.error.data?.httpStatus || 400) : 200,
        isSuccess: !downstreamMcpResponse.error,
        durationMs: Date.now() - startTime,
        apiKeyId,
        requestSizeBytes: clientRequestBody ? JSON.stringify(clientRequestBody).length : 0,
        responseSizeBytes: downstreamMcpResponse ? JSON.stringify(downstreamMcpResponse).length : 0,
        errorMessage: downstreamMcpResponse.error?.message,
        transportType: isSseInit ? 'sse_init' : 'http_post' // Add transport type for logging
      }).catch(err => console.error("Failed to log traffic:", err));

      const finalJsonRpcResponse: JsonRpcResponse = downstreamMcpResponse.error ? {
        jsonrpc: '2.0',
        id: jsonRpcRequestId,
        error: downstreamMcpResponse.error, 
      } : {
        jsonrpc: '2.0',
        id: jsonRpcRequestId,
        result: downstreamMcpResponse, 
      };

      // If it was an SSE initialization and a callback exists, the controller will send it.
      // Otherwise, return it for a regular HTTP response.
      // The controller now calls sendSseMessage itself after this promise resolves for sse init.
      return finalJsonRpcResponse;

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_GATEWAY_ERROR';
      const errorMessage = error.message || 'An unexpected error occurred in the gateway.';

      let methodForErrorLog: string;
      const crb = rawRequest.body;
      if (loggedMcpMethod) {
        methodForErrorLog = loggedMcpMethod;
      } else if (crb?.tool_name && typeof crb.tool_name === 'string') {
        methodForErrorLog = `tools/call (${crb.tool_name})`;
      } else if (crb?.method && typeof crb.method === 'string') {
        methodForErrorLog = crb.method;
      } else {
        methodForErrorLog = 'unknown_operation';
      }

      this.trafficMonitoringService.logRequest({
        serverId: serverIdFromPath || GATEWAY_ERROR_SERVER_ID_PLACEHOLDER,
        mcpMethod: methodForErrorLog,
        mcpRequestId: clientRequestBody?.request_id || clientRequestBody?.id || gatewayRequestId, 
        sourceIp,
        httpStatus: statusCode,
        isSuccess: false,
        durationMs,
        apiKeyId,
        requestSizeBytes: clientRequestBody ? JSON.stringify(clientRequestBody).length : 0,
        errorMessage,
        transportType: isSseInit ? 'sse_init_error' : 'http_post_error'
      }).catch(err => console.error("Failed to log error traffic:", err));

      const errorJsonRpcResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: jsonRpcRequestId || null, 
        error: {
          code: statusCode === 401 ? -32001 : statusCode === 404 ? -32002 : statusCode === 400 ? -32602 : -32000,
          message: errorMessage,
          data: { gateway_error_code: errorCode },
        },
      };

      // If it was an SSE initialization error and a callback exists, the controller will send it.
      // Otherwise, return it for a regular HTTP response.
      return errorJsonRpcResponse;
    }
  }

  // This method would be called by McpConnectionWrapper when it receives a message
  // from a downstream server that needs to be pushed to a client via SSE.
  public forwardMessageToSseClient(serverId: string, sessionId: string | null, mcpMessage: McpResponsePayload | McpRequestPayload ): void {
    if (this.sseSendCallback) {
      let messageToSend: any = mcpMessage; 
      if ('result' in mcpMessage || 'error' in mcpMessage) { // It's an McpResponsePayload
        messageToSend = {
          jsonrpc: '2.0',
          id: (mcpMessage as McpResponsePayload).request_id, // Use original request_id for responses
          result: (mcpMessage as McpResponsePayload).result,
          error: (mcpMessage as McpResponsePayload).error,
        } as JsonRpcResponse;
      } else if ('method' in mcpMessage) { // It's an McpRequestPayload (e.g. server sending a notification as a request)
        messageToSend = {
            jsonrpc: '2.0',
            method: mcpMessage.method,
            params: mcpMessage.params,
            id: mcpMessage.request_id || null, // Notifications might have an ID or not
        };
      }

      const sent = this.sseSendCallback(serverId, sessionId, messageToSend);
      if (sent) {
        console.log(`[CentralGatewayMCPService] Forwarded message to SSE client for server ${serverId}`);
      } else {
        console.warn(`[CentralGatewayMCPService] Failed to forward message to SSE client for server ${serverId}. SSE callback returned false.`);
      }
    } else {
      console.warn(`[CentralGatewayMCPService] SSE send callback not registered. Cannot forward message to client for server ${serverId}.`);
    }
  }
}
