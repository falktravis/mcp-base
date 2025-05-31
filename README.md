# MCP Pro: Model Context Protocol Server Management

## Overview

MCP Pro is a comprehensive web application designed to streamline the management, monitoring, and interaction with one or more Model Context Protocol (MCP) servers. In an environment where multiple AI models and MCP-compliant services might be deployed (e.g., for different tasks, by different teams, or with different capabilities), MCP Pro provides a centralized dashboard and control plane.

## Core Features

-   **Centralized MCP Server Management:**
    *   One-click installation and easy management of multiple downstream MCP servers through a single gateway.
    *   View/Edit connection status, available tools, resources, and prompts for each server.
-   **MCP Server Packages:**
    *   Bundle multiple MCP servers with their configuration for easy environment changes and sharing with your team.
-   **Traffic Monitoring & Logging:**
    *   Log requests made to or through MCP Pro to downstream servers.
    *   Provide insights into usage patterns, errors, and performance.
-   **API Key Management:**
    *   Securely manage API keys and auth for requests to downstream servers.
-   **Dockerized Deployment:**
    *   Comes with Docker configurations for straightforward development and production deployment.

## Packages

-   `packages/frontend`: The Next.js/React user interface.
-   `packages/backend`: The Node.js/Express API server, MCP gateway logic, and database interactions (PostgreSQL).
-   `packages/shared-types`: TypeScript type definitions shared between the frontend and backend.

### Shared Types

The `shared-types` package contains all the common TypeScript interfaces and types shared between frontend and backend. This ensures consistency across the application. To use these types in any part of the codebase:

```typescript
// Import shared types using path aliases
import { ApiResponse, ServerType } from '@shared-types/api-contracts';
import { UserModel } from '@shared-types/db-models';

// Do NOT use relative paths
// import { ApiResponse } from '../../../shared-types/src/api-contracts'; ❌
```

If you modify the shared types, you need to rebuild the package:

```bash
npm run build --workspace=shared-types
```

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