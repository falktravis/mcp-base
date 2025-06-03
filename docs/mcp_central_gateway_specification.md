# MCP Pro: Centralized Gateway Specification

**Version:** 1.0
**Date:** June 1, 2025

## 1. Overview & Purpose

This document specifies the functionality and behavior of the MCP Pro Centralized Gateway. The Centralized Gateway transforms MCP Pro from a simple per-server proxy into a sophisticated, single-endpoint MCP server that aggregates capabilities (primarily tools) from multiple configured downstream MCP servers.

**Key Goals:**

*   Provide a unified MCP endpoint for clients (e.g., LLM Agents, developer tools).
*   Centralize the management of connections and authentication to multiple downstream MCP servers.
*   Offer a consolidated and consistently named list of tools and other capabilities to clients.
*   Enhance control over capability exposure, naming, and error handling.

This specification supersedes previous descriptions of MCP Pro's gateway functionality that were based on a direct path-based proxy model.

## 2. Core Functionality

### 2.1. Downstream Server Authentication

*   MCP Pro (specifically, the `ManagedServerService`) is responsible for storing and managing the connection details, including authentication credentials, for each downstream MCP server.
*   The structure for these details, including various authentication types (none, API key, Bearer token), is defined in `docs/database_specifications.md` under the `managed_mcp_server` table's `connection_details` field.
*   When MCP Pro (via `McpConnectionWrapper`) establishes a connection to a downstream server, it uses these stored credentials to authenticate.
*   **Security:** As noted in `database_specifications.md`, direct storage of secrets is a placeholder. Production environments should prioritize integration with a dedicated secrets management system or, at a minimum, ensure robust encryption at rest for these credentials.

### 2.2. Tool Aggregation & Naming

*   **Aggregation:** The Centralized Gateway discovers tools from all enabled and successfully connected downstream MCP servers by invoking the `tools/list` MCP method on each.
*   **Default Naming Convention:** To ensure uniqueness in the aggregated list, tools exposed by the gateway are renamed. The default convention is `serverAlias_originalToolName`.
    *   `serverAlias`: A user-configurable alias for the downstream server (e.g., from the `managed_mcp_server.alias` field). If an alias is not set, a sanitized version of the server's `name` may be used as a fallback.
    *   `originalToolName`: The name of the tool as provided by the downstream server.
*   **Internal Mapping:** The gateway maintains an internal mapping for each exposed tool: `gatewayToolName -> { originalToolName, serverId, originalServerAlias }`.
*   **Client View of Tools:**
    *   Clients performing a `tools/list` request on the Centralized Gateway will receive a list of tools with these `gatewayToolName`s.
    *   The gateway may optionally enrich the tool's description or annotations (within the `Tool` object returned by `tools/list`) to include information about its origin, such as `originServerAlias` or `originServerName`.

### 2.3. Request Routing (tools/call)

*   When a client invokes `tools/call` on the Centralized Gateway using a `gatewayToolName`:
    1.  The gateway uses its internal mapping to identify the `originalToolName` and the `serverId` of the downstream server that provides this tool.
    2.  It retrieves an active, authenticated connection to the target downstream server (via `ManagedServerService` and `McpConnectionWrapper`).
    3.  It then sends a `tools/call` request to the downstream server, using the `originalToolName` and the original arguments provided by the client.
    4.  The response (or error) from the downstream server is relayed back to the client through the Centralized Gateway.

### 2.4. Capability Discovery & `listChanged` Handling

*   **Initial Discovery:** Upon startup, and whenever a new downstream server is enabled or its configuration changes, the Centralized Gateway initiates a discovery process to fetch the `tools/list` from all relevant downstream servers.
*   **Real-time Updates (`listChanged`):**
    *   The gateway (via `McpConnectionWrapper` -> `ManagedServerService` -> `CentralGatewayMCPService`) effectively subscribes to or is notified of `notifications/tools/list_changed` events from downstream servers that support this capability.
    *   When such a notification is received for a specific downstream server, the gateway re-fetches the `tools/list` *from that server only* and updates its aggregated tool offering accordingly (adding, removing, or updating tools).
    *   If a downstream server does not support `listChanged`, the gateway might rely on periodic polling or manual refresh triggers to update capabilities (details for this fallback TBD, `listChanged` support is preferred).

### 2.5. Downstream Server Availability & Error Handling

*   **Unavailable Servers:**
    *   If a downstream server becomes unavailable (e.g., connection fails, `tools/list` request fails, repeated health check failures), its tools are temporarily removed from the Centralized Gateway's aggregated list.
    *   The gateway (via `ManagedServerService` and `McpConnectionWrapper`) will periodically attempt to re-establish connections and re-discover capabilities for unavailable servers.
*   **Tool Execution Errors:**
    *   Errors originating from a downstream server during a `tools/call` operation are relayed transparently through the Centralized Gateway to the client.
    *   The error response from the gateway should conform to the MCP JSON-RPC error object structure.
    *   The error message or data should, where possible, include context indicating the origin of the error (e.g., the `originalServerAlias` or `serverId`) to aid client-side debugging.

### 2.6. Connection Management

*   The Centralized Gateway relies on `ManagedServerService` and `McpConnectionWrapper` to manage persistent connections to downstream MCP servers.
*   Persistent connections are preferred to:
    *   Reduce latency for tool calls (avoiding per-call connection setup).
    *   Facilitate the timely reception of server-initiated notifications like `listChanged`.

## 3. Client Interaction with the Centralized Gateway

*   **Single Endpoint:** Clients interact with the Centralized Gateway via a single, stable MCP endpoint provided by MCP Pro. The proposed endpoint is `POST /mcp/gateway` (see `api_reference.md`).
*   **Standard MCP Server Behavior:** The Centralized Gateway itself behaves as a standard MCP server from the client's perspective. It supports standard MCP methods like:
    *   `mcp/initialize` (or equivalent handshake/capability discovery for the gateway itself)
    *   `tools/list` (returns the aggregated list of tools with `gatewayToolName`s)
    *   `tools/call` (invokes tools using `gatewayToolName`s)
    *   Other MCP methods as applicable (e.g., for resources or prompts if they are aggregated in the future).
*   **Authentication to Gateway:** Clients must authenticate to MCP Pro to use the Centralized Gateway endpoint, typically using an API key managed by `ApiKeyService`.

## 4. Advanced Configuration & Future Considerations

This section outlines potential enhancements and areas for future development.

### 4.1. Naming Conflict Resolution & Customization

*   **Advanced Conflict Handling:** If the default `serverAlias_originalToolName` convention still results in conflicts (e.g., due to identical aliases or very long names), implement a more robust strategy (e.g., appending a numeric suffix, admin notification).
*   **User-Defined Naming Rules:** Consider allowing administrators to define custom naming templates or explicit overrides for `gatewayToolName`s.
*   **Namespacing/Grouping in Client View:** While the gateway's `tools/list` returns a flat list, explore how clients could better visualize or group tools based on origin (e.g., by ensuring `originServerAlias` is consistently available in tool annotations).

### 4.2. Granular Capability Control

*   **Selective Tool Exposure:** Allow administrators to selectively enable/disable individual tools from downstream servers from being exposed through the gateway, rather than an all-or-nothing aggregation per server.

### 4.3. Resilience & Performance

*   **`listChanged` Debouncing/Throttling:** Implement debouncing for processing `listChanged` notifications from a single server to prevent excessive `tools/list` calls in rapid succession.
*   **Robust Initial Synchronization:** Enhance retry mechanisms for the initial capability sync when the gateway starts or a new server is added, especially if downstream servers are temporarily unavailable.

### 4.4. Gateway's Own Capabilities

*   **Gateway-Specific Tools:** Consider adding tools directly provided by the Centralized Gateway itself, for example:
    *   `gateway/listOriginServers`: Lists all downstream servers contributing to the aggregated capabilities.
    *   `gateway/getToolOrigin { gatewayToolName: string }`: Returns the origin server details for a given aggregated tool.

### 4.5. Enhanced Observability

*   **Detailed Logging:** Implement detailed logging for the capability aggregation process (tools added/removed, origin, renaming conflicts).
*   **Request Correlation:** Ensure robust correlation of request IDs across the gateway (client-to-gateway and gateway-to-downstream) for easier debugging.
*   **Gateway Health Checks:** Provide a dedicated health check endpoint for the Centralized Gateway that also reflects its ability to connect to and aggregate from downstream services.

### 4.6. Secrets Management

*   **Prioritize Integration:** For production deployments, prioritize integrating MCP Pro with a dedicated secrets management system (e.g., HashiCorp Vault, AWS Secrets Manager, Azure Key Vault) for storing downstream server credentials, rather than direct database storage.
