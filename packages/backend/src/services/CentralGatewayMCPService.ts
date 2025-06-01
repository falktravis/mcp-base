// This service will act as the MCP Server that mcp-remote clients connect to.
// It will receive MCP requests, authenticate them (e.g., API Key),
// and then use ManagedServerService to route the request to the appropriate downstream MCP server.

import { McpRequestPayload, McpResponsePayload, McpError } from '@shared-types/api-contracts'; // Corrected import path
import { ManagedServerService } from './ManagedServerService';
import { ApiKeyService } from './ApiKeyService';
import { TrafficMonitoringService } from './TrafficMonitoringService';
import { v4 as uuidv4 } from 'uuid';
import { ApiKey } from '@shared-types/db-models'; // Import ApiKey DB model for validateApiKey return type

const GATEWAY_ERROR_SERVER_ID_PLACEHOLDER = 'GATEWAY_ERROR_NO_SERVER_IDENTIFIED';

export class CentralGatewayMCPService {
  private managedServerService: ManagedServerService;
  private apiKeyService: ApiKeyService;
  private trafficMonitoringService: TrafficMonitoringService;

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

  // Method to handle incoming MCP requests (generic for tool_call, resource_request, etc.)
  async handleMcpRequest(
    rawRequest: any, // Raw request object, likely from Express
    sourceIp?: string,
  ): Promise<McpResponsePayload> {
    const gatewayRequestId = uuidv4(); // Unique ID for this gateway transaction
    let apiKeyId: string | undefined;
    let serverId: string | undefined; // Will be populated after server lookup
    let mcpMethod = 'unknown';
    let requestBody: McpRequestPayload | undefined;
    const startTime = Date.now();

    try {
      // 1. Extract API Key and Authenticate
      // TEMPORARY BYPASS: Allow all requests without API key for local/dev use
      const apiKeyHeader = rawRequest.headers?.['x-api-key'] || rawRequest.headers?.['authorization']?.split(' ')?.[1];
      let validatedApiKeyModel: Omit<ApiKey, "hashedApiKey" | "salt"> | null = null;
      if (apiKeyHeader) {
        validatedApiKeyModel = await this.apiKeyService.validateApiKey(apiKeyHeader);
        if (!validatedApiKeyModel) {
          throw { statusCode: 401, code: 'UNAUTHORIZED', message: 'Invalid API key.' };
        }
        apiKeyId = validatedApiKeyModel.id;
      } else {
        // No API key provided, but bypass authentication for now
        apiKeyId = undefined;
      }

      // 2. Parse and Validate MCP Request Payload
      requestBody = rawRequest.body as McpRequestPayload;
      if (!requestBody || typeof requestBody.method !== 'string') {
        throw { statusCode: 400, code: 'INVALID_REQUEST', message: 'Invalid MCP request payload or missing method.' };
      }
      mcpMethod = requestBody.method;
      const originalRequestId = requestBody.request_id || uuidv4(); // Use original or generate one

      // 3. Determine the target downstream server ID and actual MCP method
      const { downstreamServerId: parsedServerId, actualMcpMethod } = this.parseGatewayRequestTarget(requestBody);
      if (!parsedServerId) {
          throw { statusCode: 400, code: 'NO_TARGET_SERVER', message: 'Downstream server ID not specified in method (e.g., serverId/actual.method).' };
      }
      serverId = parsedServerId; // serverId is now assigned

      const server = await this.managedServerService.getServerById(serverId);
      if (!server) {
        throw { statusCode: 404, code: 'SERVER_NOT_FOUND', message: `Managed server with ID '${serverId}' not found.` };
      }
      // serverId is confirmed valid here

      // Construct the request for the downstream server
      const downstreamRequest: McpRequestPayload = {
        ...requestBody,
        method: actualMcpMethod, // Use the parsed actual method
        request_id: originalRequestId, // Forward the original/generated request_id
      };

      // This method needs to be implemented in ManagedServerService
      const response = await this.managedServerService.proxyMcpRequest(server.id, downstreamRequest);

      // 5. Log the successful transaction
      this.trafficMonitoringService.logRequest({
        serverId: server.id, // serverId is guaranteed here
        mcpMethod: actualMcpMethod, // Log the actual method called on downstream server
        mcpRequestId: originalRequestId,
        sourceIp,
        httpStatus: 200, // Assuming success if no error thrown by proxyMcpRequest
        isSuccess: !response.error,
        durationMs: Date.now() - startTime,
        apiKeyId,
        requestSizeBytes: rawRequest.body ? JSON.stringify(rawRequest.body).length : 0,
        responseSizeBytes: response ? JSON.stringify(response).length : 0,
      }).catch(err => console.error("Failed to log traffic:", err)); // Log and continue

      return response;

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_GATEWAY_ERROR';
      const errorMessage = error.message || 'An unexpected error occurred in the gateway.';

      // Log the failed transaction
      this.trafficMonitoringService.logRequest({
        serverId: serverId || GATEWAY_ERROR_SERVER_ID_PLACEHOLDER, // Use placeholder if serverId is undefined
        mcpMethod: requestBody?.method || mcpMethod, // Best effort to get method
        mcpRequestId: requestBody?.request_id,
        sourceIp,
        httpStatus: statusCode,
        isSuccess: false,
        durationMs,
        apiKeyId,
        requestSizeBytes: rawRequest.body ? JSON.stringify(rawRequest.body).length : 0,
        errorMessage,
      }).catch(err => console.error("Failed to log error traffic:", err)); // Log and continue

      // Return an MCP-compliant error response
      return {
        mcp_version: requestBody?.mcp_version || '1.0', // Best effort
        request_id: requestBody?.request_id || gatewayRequestId, // Best effort
        error: {
          code: statusCode === 401 ? -32001 : statusCode === 404 ? -32002 : statusCode === 400 ? -32602 : -32000, // Example MCP error codes
          message: errorMessage,
          data: { gateway_error_code: errorCode }
        },
      };
    }
  }


  private parseGatewayRequestTarget(request: McpRequestPayload): { downstreamServerId?: string, actualMcpMethod: string } {
    // MCP Pro Gateway method format: "serverAliasOrId/actual.method.name"
    // If no slash, it's an error or a request for the gateway itself (not yet supported for direct MCP methods)
    const parts = request.method.split('/');
    if (parts.length >= 2) {
      return {
        downstreamServerId: parts[0], // Assuming the first part is the server ID
        actualMcpMethod: parts.slice(1).join('/'),
      };
    }
    // If no server alias, assume it's for the gateway or malformed.
    // For now, we require a server alias.
    // This could be expanded to handle gateway-native MCP methods.
    return { actualMcpMethod: request.method }; // No server alias found
  }

  // Placeholder for other MCP protocol methods the gateway might expose directly
  // e.g., listing available downstream servers, gateway health, etc.
  // These would not be proxied but handled by this service.
}

// export const centralGatewayMCPService = new CentralGatewayMCPService(); // Instantiation will be handled in index.ts
