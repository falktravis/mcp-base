# MCP Pro Documentation

Welcome to the MCP Pro documentation.

This document provides an overview of the project and links to more detailed information.

## Table of Contents

- [Architecture](./architecture.md)
- [API Reference](./api_reference.md)
- [Local Development Setup](./local_development_setup.md)

## MCP Pro Centralized Gateway

MCP Pro now features a Centralized MCP Gateway, transforming it into a single, intelligent MCP server that aggregates capabilities from multiple downstream MCP servers. Users (administrators of MCP Pro) configure their various downstream MCP servers within MCP Pro, including any necessary authentication details.

Clients (such as LLM agents or developer tools) then connect to a single MCP endpoint on MCP Pro (e.g., `/mcp/gateway`). From this endpoint, they can:

*   Discover a unified list of tools (and potentially other capabilities like prompts or resources in the future) aggregated from all configured and active downstream servers.
*   Execute these tools without needing to know which specific downstream server provides them. MCP Pro handles the routing and authentication to the appropriate downstream server.

This simplifies client configuration, centralizes management and monitoring, and allows for more sophisticated control over how MCP capabilities are exposed.

For detailed architectural and API information, please refer to:

*   **[Architecture - Centralized MCP Gateway](./architecture.md#centralized-mcp-gateway-architecture)**
*   **[MCP Pro: Centralized Gateway Specification](./mcp_central_gateway_specification.md)**
*   **[API Reference - Centralized Gateway Endpoint](./api_reference.md#centralized-gateway-endpoint)**
