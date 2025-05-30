# MCP Pro Workspace

## Overview

This workspace contains the MCP Pro application, a web application for managing Model Context Protocol (MCP) servers. It includes a Next.js frontend, a Node.js/Express backend, and shared type definitions.

## Packages

- `packages/frontend`: The Next.js/React user interface.
- `packages/backend`: The Node.js/Express API server and MCP gateway.
- `packages/shared-types`: TypeScript type definitions shared between the frontend and backend.

## Getting Started

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Setup Environment Variables:**
   - Copy `packages/backend/.env.example` to `packages/backend/.env` and fill in the required values.

3. **Run Development Servers:**
   - To run both frontend and backend concurrently:
     ```bash
     npm run dev:frontend
     # In a new terminal
     npm run dev:backend
     ```

4. **Build for Production:**
   ```bash
   npm run build:frontend
   npm run build:backend
   ```

## Docker

Refer to `docker-compose.yml` and the Dockerfiles for building and running the application with Docker.

See `docs/local_development_setup.md` for more detailed setup instructions.
