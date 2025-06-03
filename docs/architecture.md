# MCP Pro Architecture

This document outlines the architecture of MCP Pro.

## Overview

MCP Pro is a web application for managing Model Context Protocol (MCP) servers. It consists of a Next.js frontend, a Node.js/Express backend, and a PostgreSQL database. The application is designed to be deployed using Docker.

## Components

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, SASS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL
- **Authentication:** NextAuth.js (to be integrated)
- **Shared Types:** A separate package (`packages/shared-types`) for TypeScript types shared between frontend and backend. The package exports API contracts and database model types that can be imported using path aliases (`@shared-types/*`).
- **Deployment:** Docker, Docker Compose

## Directory Structure (Monorepo)

```
mcp-pro/
├── docs/
│   ├── README.md
│   ├── architecture.md
│   ├── api_reference.md
│   └── local_development_setup.md
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   ├── hooks/
│   │   │   ├── contexts/
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared-types/
│       ├── src/
│       │   ├── index.ts
│       │   ├── api-contracts.ts
│       │   └── db-models.ts
│       ├── package.json
│       └── tsconfig.json
├── .eslintrc.js
├── .gitignore
├── .prettierrc.js
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── package.json (root for workspaces)
├── README.md (root)
└── tsconfig.base.json
```

## Data Flow

(Details to be added as development progresses)

## Authentication Flow

(Details to be added with NextAuth.js integration)

## Centralized MCP Gateway Architecture

This section outlines the architecture of the new Centralized MCP Gateway, which replaces the previous path-based proxy model.

### Overview

The Centralized MCP Gateway transforms MCP Pro into a single, intelligent MCP server that aggregates capabilities (primarily tools) from multiple configured downstream MCP servers. This approach offers several benefits:

*   **Unified Endpoint:** Clients interact with a single, stable MCP endpoint on MCP Pro, regardless of how many downstream servers are managed.
*   **Centralized Management:** Administrators can manage downstream server connections, authentication, and capability aggregation from a central point.
*   **Consistent Client Experience:** Clients receive a consolidated list of available tools, simplifying their interaction logic.
*   **Enhanced Control:** MCP Pro can implement policies for naming, error handling, and availability of aggregated tools.

### Core Components Diagram (Conceptual)

The primary components involved in the Centralized MCP Gateway are:

1.  **Client (e.g., LLM Agent, Developer Tool):** Initiates MCP requests to MCP Pro.
2.  **MCP Pro Backend:**
    *   **`McpGatewayController.ts` (Adapted):** Receives incoming HTTP requests for the central gateway endpoint and passes them to the `CentralGatewayMCPService`.
    *   **`CentralGatewayMCPService.ts` (Refactored):** Acts as the core of the new gateway. It is instantiated as an `McpServer` (from the `@modelcontextprotocol/sdk`). It is responsible for:
        *   Aggregating tools from downstream servers.
        *   Maintaining a mapping of gateway-exposed tool names to their original names and origin servers.
        *   Handling incoming MCP requests (e.g., `tools/call`) from clients.
        *   Routing these requests to the appropriate downstream server via `ManagedServerService` and `McpConnectionWrapper`.
    *   **`ManagedServerService.ts`:** Manages the configuration (including authentication details) and lifecycle of all downstream MCP servers. It provides active `McpConnectionWrapper` instances to the `CentralGatewayMCPService` and notifies it of relevant changes (e.g., server availability, `listChanged` events).
    *   **`McpConnectionWrapper.ts`:** Handles the actual MCP connection (using the `@modelcontextprotocol/sdk`) to a single downstream server, including authentication and forwarding server-initiated notifications like `listChanged`.
3.  **Downstream MCP Servers:** External MCP servers managed by MCP Pro, providing the actual tools and capabilities.

*(A visual diagram would be beneficial here in the final document to illustrate these interactions.)*

### Request Flow Diagram: `tools/call` (Conceptual)

A typical `tools/call` request to the Centralized MCP Gateway follows this flow:

1.  **Client Request:** The client sends an MCP `tools/call` request to MCP Pro's central gateway endpoint (e.g., `POST /mcp/gateway`). The request uses the `gatewayToolName` (the name exposed by the central gateway).
2.  **Controller Receives:** `McpGatewayController` receives the HTTP request.
3.  **Gateway Service Processing:** The request is passed to `CentralGatewayMCPService`. Its internal `McpServer` instance receives the MCP request.
4.  **Tool Mapping & Routing:** `CentralGatewayMCPService` looks up the `gatewayToolName` in its internal mapping to find the `originalToolName` and the `serverId` of the downstream server that provides this tool.
5.  **Connection Retrieval:** `CentralGatewayMCPService` requests an active `McpConnectionWrapper` for the identified `serverId` from `ManagedServerService`.
6.  **Downstream Request:** The `CentralGatewayMCPService` uses the `McpConnectionWrapper` to send a new MCP `tools/call` request (using the `originalToolName` and original arguments) to the target downstream server.
7.  **Downstream Processing:** The downstream MCP server executes the tool.
8.  **Response Relay:** The response from the downstream server is sent back through the `McpConnectionWrapper` to `CentralGatewayMCPService`.
9.  **Client Response:** `CentralGatewayMCPService` relays the MCP response (or an error) back to the original client via `McpGatewayController`.

*(A visual sequence diagram would be beneficial here.)*

### Capability Aggregation Flow Diagram (Conceptual)

The Centralized MCP Gateway aggregates tools from downstream servers as follows:

1.  **Initialization/Reconfiguration:** This process occurs when `CentralGatewayMCPService` starts or when there's a relevant change (e.g., a downstream server is added/updated/enabled, or a `listChanged` notification is received).
2.  **Fetch Server Configurations:** `CentralGatewayMCPService` retrieves the list of all enabled `ManagedMcpServer` configurations from `ManagedServerService`.
3.  **Iterate and Discover:** For each enabled downstream server:
    *   `CentralGatewayMCPService` ensures an active `McpConnectionWrapper` is available (or established) via `ManagedServerService`.
    *   It uses the `McpConnectionWrapper` to send a `tools/list` request to the downstream server.
4.  **Process and Map Tools:** Upon receiving the `tools/list` response from a downstream server:
    *   For each tool, `CentralGatewayMCPService` generates a unique `gatewayToolName` (e.g., by prefixing with a server alias: `serverAlias_originalToolName`).
    *   It stores this mapping: `gatewayToolName -> { originalToolName, serverId, originalServerAlias }`.
5.  **Register Aggregated Tools:** `CentralGatewayMCPService` registers these renamed tools (now `gatewayToolName`) with its own internal `McpServer` instance, making them available to clients connected to the gateway. The original server alias might be added to the tool's description or annotations.
6.  **Handle `listChanged` Notifications:**
    *   `McpConnectionWrapper` instances listen for `listChanged` notifications from their respective downstream servers.
    *   These notifications are propagated up through `ManagedServerService` to `CentralGatewayMCPService`.
    *   Upon receiving such a notification for a specific downstream server, `CentralGatewayMCPService` re-initiates the tool discovery process (steps 3b-5) for *that specific server* to update its aggregated tool list.

*(A visual activity or sequence diagram would be beneficial here.)*

## Service Responsibilities in Centralized Gateway

This section details the roles and responsibilities of key backend services in the context of the Centralized MCP Gateway.

### `ManagedServerService.ts`

*   **Configuration Management:**
    *   Handles CRUD (Create, Read, Update, Delete) operations for `managed_mcp_server` entities in the database.
    *   Manages the new `connection_details.authentication` structure, ensuring it's correctly stored and retrieved. This includes details for API keys, bearer tokens, etc., required to connect to downstream servers.
*   **Connection Lifecycle & Provision:**
    *   Manages the lifecycle of `McpConnectionWrapper` instances for each downstream server (creating, starting, stopping, and disposing of them).
    *   Provides active and authenticated `McpConnectionWrapper` instances to the `CentralGatewayMCPService` on demand.
*   **`listChanged` Notification Propagation:**
    *   Receives events from `McpConnectionWrapper` instances that indicate a potential change in downstream server capabilities (e.g., a raw `listChanged` notification or a more generic status change).
    *   Notifies `CentralGatewayMCPService` about these events, triggering a re-evaluation or re-fetching of capabilities for the affected downstream server.

### `McpConnectionWrapper.ts`

*   **Authenticated MCP Connections:**
    *   Responsible for establishing and maintaining a single MCP connection to a downstream server using the `@modelcontextprotocol/sdk`.
    *   Reads authentication details (e.g., API key, token, header name, prefix) from the `connection_details.authentication` field of its `ManagedMcpServer` configuration.
    *   Applies these credentials when making the connection (e.g., by setting appropriate HTTP headers for WebSocket/HTTP transports or passing them as arguments/env vars if supported by STDIO transports via the SDK).
*   **Event Emission:**
    *   Emits events indicating changes in its connection status (e.g., connected, disconnected, error).
    *   Listens for server-initiated MCP notifications from the downstream server, specifically `notifications/tools/list_changed` (and equivalents for resources/prompts if they are to be aggregated).
    *   Emits an event to `ManagedServerService` when such capability-altering notifications are received, or when connection status changes suggest capabilities might need re-verification.

### `CentralGatewayMCPService.ts` (Refactored)

*   **Role Transformation:** Evolves from a simple proxy to a fully-fledged MCP server, instantiated using the `McpServer` class from the `@modelcontextprotocol/sdk`. It becomes the single point of MCP interaction for clients of MCP Pro.
*   **Initialization & Orchestration:**
    *   Instantiates its internal `McpServer`.
    *   Registers with `ManagedServerService` to receive notifications about downstream server availability, configuration changes, or `listChanged` events.
    *   On startup, and upon relevant notifications, orchestrates the capability aggregation process:
        *   Requests `tools/list` from all relevant downstream servers via their `McpConnectionWrapper`s.
        *   Processes the results, renames tools, and stores mappings.
*   **Capability Management & Aggregation:**
    *   Maintains the definitive aggregated list of tools exposed by the gateway.
    *   Dynamically adds, updates, or removes tools from its internal `McpServer`'s offering based on information from downstream servers and their `listChanged` notifications.
    *   Handles tool name uniquification (e.g., `serverAlias_originalToolName`) and maintains the mapping to original tool names and server IDs.
*   **Request Handling & Routing:**
    *   The handlers registered with its internal `McpServer` instance receive MCP requests (e.g., `tools/call`) from clients.
    *   For a `tools/call` using a `gatewayToolName`, it looks up the mapping to find the `originalToolName` and the `serverId` of the downstream server.
    *   It then uses `ManagedServerService` to obtain the `McpConnectionWrapper` for that `serverId` and forwards the request (with the `originalToolName`) to the downstream server.
    *   Relays the response or error from the downstream server back to the client.
*   **Gateway Identity:**
    *   Defines its own MCP server information (e.g., name like "MCP Pro Central Gateway", version) when its `McpServer` instance is initialized. This information is provided to clients during MCP initialization.

### `McpGatewayController.ts` (Adapted)

*   **Endpoint Handling:**
    *   Its primary role in the new model is to handle HTTP requests for the new central gateway MCP endpoint (e.g., `POST /mcp/gateway`).
    *   It passes the raw MCP request payload from the HTTP body to the `CentralGatewayMCPService` for processing by its `McpServer` instance.
    *   It takes the MCP response from `CentralGatewayMCPService` and sends it back as the HTTP response.
*   **Path-Based Proxying (Deprecation):** The previous logic of extracting a `serverId` from the URL path to proxy requests directly will be deprecated or removed for the main aggregated flow. If direct proxying is still needed for specific administrative or diagnostic purposes, it should be clearly distinct from the central gateway endpoint.

### `ApiKeyService.ts`

*   **Gateway Authentication:** Continues to be responsible for authenticating incoming requests made *to* MCP Pro's API endpoints, including the new central MCP gateway endpoint. It verifies API keys provided by clients wishing to use the gateway.

### `TrafficMonitoringService.ts`

*   **Logging Gateway Requests:** Logs all MCP requests made to the central gateway endpoint.
*   **Correlation (Desirable):** Ideally, logs should allow correlation between an incoming request to the central gateway and any subsequent outgoing requests made by the gateway to downstream servers. This might involve propagating or linking request IDs.
