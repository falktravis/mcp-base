# MCP Pro API Reference

This document provides a comprehensive reference for the MCP Pro backend APIs.

## Table of Contents

- [MCP Pro API Reference](#mcp-pro-api-reference)
  - [Table of Contents](#table-of-contents)
  - [Authentication](#authentication)
  - [Base URLs](#base-urls)
  - [Error Handling](#error-handling)
  - [Rate Limiting](#rate-limiting)
  - [Management API](#management-api)
    - [Server Management](#server-management)
      - [`POST /management/servers`](#post-managementservers)
      - [`GET /management/servers`](#get-managementservers)
      - [`GET /management/servers/{serverId}`](#get-managementserversserverid)
      - [`PUT /management/servers/{serverId}`](#put-managementserversserverid)
      - [`DELETE /management/servers/{serverId}`](#delete-managementserversserverid)
      - [`POST /management/servers/{serverId}/start`](#post-managementserversserveridstart)
      - [`POST /management/servers/{serverId}/stop`](#post-managementserversserveridstop)
      - [`GET /management/servers/{serverId}/status`](#get-managementserversserveridstatus)
      - [`GET /management/servers/{serverId}/logs`](#get-managementserversserveridlogs)
    - [API Key Management](#api-key-management)
      - [`POST /management/apikeys`](#post-managementapikeys)
      - [`GET /management/apikeys`](#get-managementapikeys)
      - [`DELETE /management/apikeys/{apiKeyId}`](#delete-managementapikeysapikeyid)
    - [Traffic Monitoring](#traffic-monitoring)
      - [`GET /management/traffic/stats`](#get-managementtrafficstats)
      - [`GET /management/traffic/live`](#get-managementtrafficlive)
    - [Marketplace](#marketplace)
      - [`GET /management/marketplace/extensions`](#get-managementmarketplaceextensions)
      - [`GET /management/marketplace/extensions/{extensionId}`](#get-managementmarketplaceextensionsextensionid)
      - [`POST /management/marketplace/extensions/{extensionId}/install`](#post-managementmarketplaceextensionsextensionidinstall)
    - [User Account (Future)](#user-account-future)
  - [MCP Gateway API](#mcp-gateway-api)
      - [`POST /mcp/{serverId}`](#post-mcpserverid)

## Authentication

All API requests must be authenticated using an API key. The API key must be included in the `Authorization` header of the request, prefixed with `Bearer `.

Example: `Authorization: Bearer <YOUR_API_KEY>`

API keys can be managed through the [API Key Management](#api-key-management) endpoints.

## Base URLs

- Management API: `https://mcp-pro.example.com/api/v1`
- MCP Gateway API: `https://mcp-pro.example.com/mcp` (The `{serverId}` path parameter will route to the specific managed server)

## Error Handling

The API uses standard HTTP status codes to indicate the success or failure of a request.

- `200 OK`: Request successful.
- `201 Created`: Resource created successfully.
- `204 No Content`: Request successful, no content to return.
- `400 Bad Request`: The request was malformed or invalid. The response body may contain more details.
- `401 Unauthorized`: Authentication failed or was not provided.
- `403 Forbidden`: The authenticated user does not have permission to access the resource.
- `404 Not Found`: The requested resource does not exist.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: An unexpected error occurred on the server.

Error responses will typically be in JSON format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "A human-readable error message."
  }
}
```

## Rate Limiting

To ensure fair usage and stability, API requests are rate-limited. If you exceed the rate limit, you will receive a `429 Too Many Requests` error. Check the `Retry-After` header for information on when you can retry.

---

## Management API

Base URL: `/api/v1`

### Server Management

Endpoints for managing MCP server instances.

#### `POST /management/servers`

Register a new MCP server to be managed by MCP Pro.

- **Request Body**: `RegisterServerRequest`
- **Response**: `201 Created` - `ManagedMcpServerDetails`
- **Permissions**: Requires authentication.

#### `GET /management/servers`

List all managed MCP servers.

- **Request Query Parameters**:
    - `page` (optional, number, default: 1)
    - `limit` (optional, number, default: 10)
    - `status` (optional, string, e.g., "running", "stopped", "error")
- **Response**: `200 OK` - `PaginatedResponse<ManagedMcpServerDetails>`
- **Permissions**: Requires authentication.

#### `GET /management/servers/{serverId}`

Get details for a specific managed MCP server.

- **Path Parameters**:
    - `serverId` (string, required): The ID of the server.
- **Response**: `200 OK` - `ManagedMcpServerDetails`
- **Permissions**: Requires authentication.

#### `PUT /management/servers/{serverId}`

Update the configuration of a specific managed MCP server.

- **Path Parameters**:
    - `serverId` (string, required): The ID of the server.
- **Request Body**: `UpdateServerConfigRequest`
- **Response**: `200 OK` - `ManagedMcpServerDetails`
- **Permissions**: Requires authentication.

#### `DELETE /management/servers/{serverId}`

Unregister and remove a managed MCP server. This will also attempt to stop the server if it is running.

- **Path Parameters**:
    - `serverId` (string, required): The ID of the server.
- **Response**: `204 No Content`
- **Permissions**: Requires authentication.

#### `POST /management/servers/{serverId}/start`

Start a managed MCP server instance.

- **Path Parameters**:
    - `serverId` (string, required): The ID of the server.
- **Response**: `200 OK` - `{ message: "Server starting." }`
- **Permissions**: Requires authentication.

#### `POST /management/servers/{serverId}/stop`

Stop a managed MCP server instance.

- **Path Parameters**:
    - `serverId` (string, required): The ID of the server.
- **Response**: `200 OK` - `{ message: "Server stopping." }`
- **Permissions**: Requires authentication.

#### `GET /management/servers/{serverId}/status`

Get the current status of a managed MCP server instance.

- **Path Parameters**:
    - `serverId` (string, required): The ID of the server.
- **Response**: `200 OK` - `ServerStatusResponse`
- **Permissions**: Requires authentication.

#### `GET /management/servers/{serverId}/logs`

Retrieve logs for a specific managed MCP server.

- **Path Parameters**:
    - `serverId` (string, required): The ID of the server.
- **Request Query Parameters**:
    - `limit` (optional, number, default: 100): Number of log lines to return.
    - `since` (optional, string, ISO 8601 timestamp): Return logs since this time.
- **Response**: `200 OK` - `ServerLogsResponse`
- **Permissions**: Requires authentication.

---

### API Key Management

Endpoints for managing API keys used to authenticate with the MCP Pro API.

#### `POST /management/apikeys`

Create a new API key.

- **Request Body**: `CreateApiKeyRequest` (e.g., `{ "name": "My New Key", "expiresAt": "2025-12-31T23:59:59Z" }`)
- **Response**: `201 Created` - `CreateApiKeyResponse` (includes the new API key, which should be stored securely as it won't be shown again)
- **Permissions**: Requires authentication (typically an admin user or initial setup key).

#### `GET /management/apikeys`

List all API keys (excluding the key values themselves, only metadata).

- **Response**: `200 OK` - `ListApiKeysResponse`
- **Permissions**: Requires authentication.

#### `DELETE /management/apikeys/{apiKeyId}`

Revoke/delete an API key.

- **Path Parameters**:
    - `apiKeyId` (string, required): The ID of the API key to delete.
- **Response**: `204 No Content`
- **Permissions**: Requires authentication.

---

### Traffic Monitoring

Endpoints for monitoring API traffic to managed MCP servers.

#### `GET /management/traffic/stats`

Get aggregated traffic statistics.

- **Request Query Parameters**:
    - `serverId` (optional, string): Filter stats by a specific server.
    - `period` (optional, string, e.g., "1h", "24h", "7d"): Time period for stats.
- **Response**: `200 OK` - `TrafficStatsResponse`
- **Permissions**: Requires authentication.

#### `GET /management/traffic/live`

(Optional: Could be implemented via WebSockets)
Stream live traffic data.

- **Response**: (WebSocket stream or SSE) - `LiveTrafficEvent`
- **Permissions**: Requires authentication.

---

### Marketplace

Endpoints for interacting with the MCP extension marketplace.

#### `GET /management/marketplace/extensions`

List available extensions from the marketplace.

- **Request Query Parameters**:
    - `query` (optional, string): Search query.
    - `category` (optional, string): Filter by category.
    - `page` (optional, number, default: 1)
    - `limit` (optional, number, default: 10)
- **Response**: `200 OK` - `PaginatedResponse<MarketplaceExtension>`
- **Permissions**: Requires authentication.

#### `GET /management/marketplace/extensions/{extensionId}`

Get details for a specific marketplace extension.

- **Path Parameters**:
    - `extensionId` (string, required): The ID of the extension.
- **Response**: `200 OK` - `MarketplaceExtensionDetails`
- **Permissions**: Requires authentication.

#### `POST /management/marketplace/extensions/{extensionId}/install`

Install a marketplace extension to a managed server (or mark for installation).

- **Path Parameters**:
    - `extensionId` (string, required): The ID of the extension.
- **Request Body**: `InstallExtensionRequest` (e.g., `{ "serverId": "targetServerId" }`)
- **Response**: `200 OK` - `{ message: "Extension installation initiated." }`
- **Permissions**: Requires authentication.

---

### User Account (Future)

Endpoints for user account management (e.g., registration, login, profile). This section is a placeholder for future development.

---

## MCP Gateway API

Base URL: `/mcp` (This base URL might be further namespaced, e.g., `/api/mcp`)

### Centralized Gateway Endpoint

**`POST /mcp/gateway`**

This is the primary endpoint for interacting with the MCP Pro Centralized Gateway. It behaves as a standard MCP server, providing access to an aggregated set of capabilities (primarily tools) from all configured and enabled downstream MCP servers.

*   **Request Body**: Standard MCP Request Payload (JSON).
    *   Clients will use `gatewayToolName`s (e.g., `serverAlias_originalToolName`) when specifying tool names in requests like `tools/call`.
    *   Example (`tools/list`):
        ```json
        {
          "jsonrpc": "2.0",
          "id": "req-123",
          "method": "tools/list",
          "params": {}
        }
        ```
    *   Example (`tools/call` using a gateway-resolved tool name):
        ```json
        {
          "jsonrpc": "2.0",
          "id": "req-124",
          "method": "tools/call",
          "params": {
            "name": "myWeatherService_get_current_weather", // Example gatewayToolName
            "arguments": {
              "location": "London"
            }
          }
        }
        ```
*   **Response**: Standard MCP Response Payload (JSON) from the Centralized Gateway.
    *   For `tools/list`, the response will contain tools with `gatewayToolName`s.
    *   Example (successful `tools/call` response):
        ```json
        {
          "jsonrpc": "2.0",
          "id": "req-124",
          "result": {
            "temperature": "15°C",
            "condition": "Cloudy"
            // ... other tool-specific results
          }
        }
        ```
*   **Authentication**: Requires client authentication to MCP Pro (e.g., via an API Key passed in headers, managed by `ApiKeyService`). This is distinct from any authentication MCP Pro uses to connect to downstream servers.
*   **Permissions**: Requires a valid API key with permissions to access the MCP Gateway.
*   **Functionality**: This endpoint allows clients to:
    *   Discover aggregated tools using `tools/list`.
    *   Execute tools using `tools/call` (the gateway handles routing to the correct downstream server).
    *   Interact with other aggregated MCP capabilities as they are supported (e.g., prompts, resources).

### Direct Downstream Server Proxy Endpoint (Legacy/Deprecated)

**`POST /mcp/{serverId}`**

This endpoint provides direct proxy access to a specific managed MCP server, identified by `serverId`.

*   **Status:** This endpoint is considered **legacy** or **deprecated** in favor of the new `POST /mcp/gateway` endpoint for most client interactions. It may be maintained for specific administrative, diagnostic, or backward-compatibility purposes, but new development should primarily target the centralized gateway.
*   **Path Parameters**:
    *   `serverId` (string, required): The ID of the target managed MCP server.
*   **Request Body**: Standard MCP Request Payload (JSON).
    *   Tool names and other identifiers in the request should be the *original* names as understood by the downstream server.
*   **Response**: Standard MCP Response Payload (JSON) directly from the target downstream server.
*   **Authentication**:
    *   Requires client authentication to MCP Pro (e.g., API Key).
    *   MCP Pro uses the configured credentials for the specified `serverId` to authenticate to the downstream server if required.
*   **Permissions**: Requires a valid API key with permissions to access the MCP Gateway and potentially specific permissions per `serverId` if granular control is implemented.
