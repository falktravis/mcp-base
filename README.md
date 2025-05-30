# MCP Pro: Model Context Protocol Server Management

## Overview

MCP Pro is a comprehensive web application designed to streamline the management, monitoring, and interaction with one or more Model Context Protocol (MCP) servers. In an environment where multiple AI models and MCP-compliant services might be deployed (e.g., for different tasks, by different teams, or with different capabilities), MCP Pro provides a centralized dashboard and control plane.

The Model Context Protocol (MCP) itself is a specification that allows language models and other AI services to declare their capabilities (available tools, readable resources, invokable prompts) and for clients to interact with these capabilities in a standardized way. MCP Pro leverages this protocol to offer enhanced visibility and control over your MCP-enabled AI landscape.

This project is structured as a monorepo, containing:

-   **Frontend:** A Next.js and React application providing the user interface.
-   **Backend:** A Node.js and Express application serving the API, managing database interactions (PostgreSQL), and acting as a gateway or controller for downstream MCP servers.
-   **Shared Types:** A dedicated package for TypeScript definitions used across the frontend and backend, ensuring consistency.

## Core Features

-   **Centralized MCP Server Management:**
    *   Register and manage multiple downstream MCP servers.
    *   View connection status, available tools, resources, and prompts for each server.
    *   View and edit individual servers.
-   **API Key Management:**
    *   Securely generate and manage API keys for accessing MCP Pro's own API (and potentially for proxied requests to downstream servers).
-   **Traffic Monitoring & Logging:**
    *   Log requests made to or through MCP Pro to downstream servers.
    *   Provide insights into usage patterns, errors, and performance.
-   **Dockerized Deployment:**
    *   Comes with Docker configurations for straightforward development and production deployment.

## Packages

-   `packages/frontend`: The Next.js/React user interface.
-   `packages/backend`: The Node.js/Express API server, MCP gateway logic, and database interactions (PostgreSQL).
-   `packages/shared-types`: TypeScript type definitions shared between the frontend and backend.

## Getting Started & Documentation

For comprehensive information on setting up your local development environment, architecture details, API references, and more, please refer to our **[full documentation](./docs/README.md)**.

Key documents include:

-   **[Local Development Setup](./docs/local_development_setup.md):** Step-by-step guide to get MCP Pro running on your local machine.
-   **[Architecture Overview](./docs/architecture.md):** Understand the components and design of MCP Pro.
-   **[API Reference](./docs/api_reference.md):** Details on the backend API endpoints.

## Contributing

Contributions are welcome! Please see `CONTRIBUTING.md` (to be created) for guidelines.

## License

This project is licensed under the [Apache 2.0](./LICENSE).