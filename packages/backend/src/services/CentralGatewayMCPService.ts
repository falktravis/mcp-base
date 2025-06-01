// This service will act as the MCP Server that mcp-remote clients connect to.
// It will receive MCP requests, authenticate them (e.g., API Key),
// and then use ManagedServerService to route the request to the appropriate downstream MCP server.

import { McpRequestPayload, McpResponsePayload, McpError as McpErrorInterface, ServerType, McpErrorCode } from 'shared-types/api-contracts'; // Corrected import path
import { ManagedServerService } from './ManagedServerService';
import { ApiKeyService } from './ApiKeyService';
import { TrafficMonitoringService } from './TrafficMonitoringService';
import { v4 as uuidv4 } from 'uuid';
import { ApiKey } from 'shared-types/db-models'; // Import ApiKey DB model for validateApiKey return type
import { SseSendDelegate } from '../controllers/McpGatewayController'; // Import the delegate type

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

// Define the shape of the raw request object more precisely
interface GatewayRawRequest {
    params?: { serverId?: string };
    body?: any; 
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
}

// Type for the SSE callback function
// type SseSendCallback = (mcpSessionId: string, message: any, serverId: string) => boolean; // Old type

export class CentralGatewayMCPService {
  private managedServerService: ManagedServerService;
  private apiKeyService: ApiKeyService;
  private trafficMonitoringService: TrafficMonitoringService;
  // private sseSendCallback?: SseSendCallback; // Old property
  private sseSendDelegate?: SseSendDelegate; // New property using the imported type

  constructor(
    managedServerService: ManagedServerService,
    apiKeyService: ApiKeyService,
    trafficMonitoringService: TrafficMonitoringService,
    // sseSendDelegate will be injected after McpGatewayController is instantiated
  ) {
    this.managedServerService = managedServerService;
    this.apiKeyService = apiKeyService;
    this.trafficMonitoringService = trafficMonitoringService;
    console.log('CentralGatewayMCPService initialized with core dependencies');

    // Register the callback with ManagedServerService for server-initiated messages
    this.managedServerService.setServerInitiatedMessageCallback(
      this.handleServerInitiatedMessage.bind(this)
    );
  }

  public setSseSendDelegate(delegate: SseSendDelegate): void {
    this.sseSendDelegate = delegate;
    console.log('[CentralGatewayMCPService] SSE send delegate registered.');
  }

  // Method to handle incoming MCP requests (generic for tool_call, resource_request, etc.)
  async handleMcpRequest(
    rawRequest: GatewayRawRequest, // Use the more specific type
    sourceIp?: string,
    mcpSessionId?: string, // Added mcpSessionId
  ): Promise<JsonRpcResponse> { 
    const gatewayRequestId = uuidv4(); 
    let apiKeyId: string | undefined;
    let serverIdFromPath: string | undefined;

    const startTime = Date.now();
    let loggedMcpMethod: string | undefined;

    const clientRequestBody = rawRequest.body;
    const jsonRpcRequestId = (clientRequestBody?.id !== undefined) ? clientRequestBody.id : null;

    try {
      // 1. Extract API Key and Authenticate
      const authHeader = rawRequest.headers?.['authorization'];
      const apiKeyFromAuth = typeof authHeader === 'string' ? authHeader.split(' ')?.[1] : undefined;
      const apiKeyHeader = rawRequest.headers?.['x-api-key'] || apiKeyFromAuth;
      let validatedApiKeyModel: Omit<ApiKey, "hashedApiKey" | "salt"> | null = null;
      if (apiKeyHeader) {
        validatedApiKeyModel = await this.apiKeyService.validateApiKey(String(apiKeyHeader)); // Ensure string
        if (!validatedApiKeyModel) {
          throw { statusCode: 401, mcpErrorCode: McpErrorCode.UNAUTHENTICATED, message: 'Invalid API key.' };
        }
        apiKeyId = validatedApiKeyModel.id;
      } else {
        apiKeyId = undefined; 
      }

      // 2. Extract serverId from path and request details from body
      serverIdFromPath = rawRequest.params?.serverId;
      if (!serverIdFromPath) {
        throw { statusCode: 400, mcpErrorCode: McpErrorCode.INVALID_PARAMS, message: 'Server ID must be provided in the URL path.' };
      }

      if (mcpSessionId) {
        console.log(`[CentralGatewayMCPService] Processing request for serverId: ${serverIdFromPath}, mcpSessionId: ${mcpSessionId}, gatewayRequestId: ${gatewayRequestId}`);
      } else {
        console.log(`[CentralGatewayMCPService] Processing request for serverId: ${serverIdFromPath} (no mcpSessionId), gatewayRequestId: ${gatewayRequestId}`);
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
        throw { statusCode: 400, mcpErrorCode: McpErrorCode.INVALID_REQUEST, message: 'Request body must contain a valid string "tool_name" or a valid string "method".' };
      }
      
      const mcpDownstreamRequestId = (jsonRpcRequestId !== null && (typeof jsonRpcRequestId === 'string' || typeof jsonRpcRequestId === 'number')) 
        ? String(jsonRpcRequestId) 
        : clientRequestBody?.request_id || uuidv4();

      const downstreamRequestPayload: McpRequestPayload = {
        mcp_version: clientRequestBody.mcp_version || '1.0',
        request_id: mcpDownstreamRequestId, 
        method: actualDownstreamMethod,
        params: actualDownstreamParams,
      };

      const server = await this.managedServerService.getServerById(serverIdFromPath);
      if (!server) {
        throw { statusCode: 404, mcpErrorCode: McpErrorCode.RESOURCE_NOT_FOUND, message: `Managed server with ID '${serverIdFromPath}' not found.` };
      }

      // 4. Proxy the request to the downstream server
      const downstreamMcpResponse: McpResponsePayload = await this.managedServerService.proxyMcpRequest(
        server.id, 
        downstreamRequestPayload
      );

      this.trafficMonitoringService.logRequest({
        serverId: server.id,
        mcpMethod: loggedMcpMethod,
        mcpRequestId: mcpDownstreamRequestId, 
        sourceIp,
        httpStatus: downstreamMcpResponse.error ? (downstreamMcpResponse.error.data?.httpStatus || 400) : 200,
        isSuccess: !downstreamMcpResponse.error,
        errorMessage: downstreamMcpResponse.error ? downstreamMcpResponse.error.message : undefined,
        durationMs: Date.now() - startTime,
        apiKeyId,
        mcpSessionId, // Log mcpSessionId
        gatewayRequestId // Log gatewayRequestId
      });

      // Construct the JSON-RPC response to be sent back to the McpGatewayController
      const finalJsonRpcResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: jsonRpcRequestId, // Use the original request ID for the response
        result: downstreamMcpResponse.error ? undefined : downstreamMcpResponse.result,
        error: downstreamMcpResponse.error ? {
            code: downstreamMcpResponse.error.code, // This should be McpErrorCode
            message: downstreamMcpResponse.error.message,
            data: downstreamMcpResponse.error.data
        } : undefined
      };
      return finalJsonRpcResponse;

    } catch (error: any) {
      console.error(`[CentralGatewayMCPService] Error handling MCP request (gatewayRequestId: ${gatewayRequestId}):`, error);
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      const jsonRpcRequestIdForError = (jsonRpcRequestId !== undefined && (typeof jsonRpcRequestId === 'string' || typeof jsonRpcRequestId === 'number' || jsonRpcRequestId === null)) 
            ? jsonRpcRequestId 
            : null;

      const responseError: JsonRpcErrorObject = {
        code: error.mcpErrorCode || McpErrorCode.INTERNAL_ERROR, // Use MCP error code from thrown error or default
        message: error.message || 'An internal error occurred in the gateway.',
        data: { 
            gateway_request_id: gatewayRequestId,
            original_error_code_val: error.code, // Preserve original code if any (like 'UNAUTHORIZED')
            httpStatus: error.statusCode || 500 
        }
      };

      this.trafficMonitoringService.logRequest({
        serverId: serverIdFromPath || GATEWAY_ERROR_SERVER_ID_PLACEHOLDER,
        mcpMethod: loggedMcpMethod || 'unknown_method_due_to_error',
        mcpRequestId: String(jsonRpcRequestIdForError || clientRequestBody?.request_id || 'unknown_request_id_due_to_error'),
        sourceIp,
        httpStatus: error.statusCode || 500,
        isSuccess: false,
        errorMessage: responseError.message,
        durationMs,
        apiKeyId,
        mcpSessionId, // Log mcpSessionId with the error
        gatewayRequestId // Log gatewayRequestId with the error
      });

      return {
        jsonrpc: '2.0',
        id: jsonRpcRequestIdForError,
        error: responseError,
      };
    }
  }

  // This method is the callback for McpConnectionWrapper, invoked via ManagedServerService
  private handleServerInitiatedMessage(targetServerId: string, mcpMessage: McpResponsePayload | McpRequestPayload): void {
    if (this.sseSendDelegate) {
      let messageToSend: any = mcpMessage; 
      // Adapt McpResponsePayload or McpRequestPayload to JsonRpcResponse or JsonRpcNotification structure
      if ('result' in mcpMessage || 'error' in mcpMessage) { // It's an McpResponsePayload
        messageToSend = {
          jsonrpc: '2.0',
          id: (mcpMessage as McpResponsePayload).request_id, 
          result: (mcpMessage as McpResponsePayload).result,
          error: (mcpMessage as McpResponsePayload).error,
        } as JsonRpcResponse; 
      } else if ('method' in mcpMessage) { // It's an McpRequestPayload (e.g. server sending a notification as a request)
        messageToSend = {
            jsonrpc: '2.0',
            method: mcpMessage.method,
            params: mcpMessage.params,
            id: mcpMessage.request_id || null, 
        }; 
      }

      // Broadcast to all sessions for this serverId by passing undefined for targetMcpSessionId.
      const streamsWrittenTo = this.sseSendDelegate(targetServerId, messageToSend, undefined);
      if (streamsWrittenTo > 0) {
        console.log(`[CentralGatewayMCPService] Server-initiated message for server ${targetServerId} forwarded to ${streamsWrittenTo} client session(s).`);
      } else {
        console.warn(`[CentralGatewayMCPService] Server-initiated message for server ${targetServerId} was not forwarded (no active background streams?).`);
      }
    } else {
      console.warn(`[CentralGatewayMCPService] SSE send delegate not registered. Cannot forward server-initiated message for server ${targetServerId}.`);
    }
  }
}

interface JsonRpcResponse { 
    jsonrpc: '2.0';
    id: string | number | null;
    result?: any;
    error?: { code: number; message: string; data?: any };
}
