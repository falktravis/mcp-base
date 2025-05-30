# Local Development Setup

This guide explains how to set up and run MCP Pro locally for development.

## Prerequisites

- Node.js (version specified in `.nvmrc` or similar, e.g., v18+)
- npm (version 8+ for workspaces) or pnpm
- Docker and Docker Compose
- Git

## Setup Steps

1.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd mcp-pro
    ```

2.  **Install Dependencies:**
    This project uses npm workspaces. Install dependencies from the root directory:
    ```bash
    npm install
    ```
    Alternatively, if you prefer pnpm (recommended for better monorepo support):
    ```bash
    pnpm install
    ```

3.  **Set Up Environment Variables:**

    *   **Backend:**
        Navigate to the backend package: `cd packages/backend`
        Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
        Update `packages/backend/.env` with your local database credentials and any other required settings. Specifically, ensure `DATABASE_URL` is correct for your local PostgreSQL instance if not using Docker for the database initially.

    *   **Frontend:**
        The frontend might require environment variables (e.g., `NEXT_PUBLIC_API_URL`). These are typically set in `packages/frontend/.env.local`. Refer to `packages/frontend/.env.example` if one is created, or set them directly.
        For example, to connect to the local backend:
        ```
        NEXT_PUBLIC_API_URL=http://localhost:3001
        ```

4.  **Database Setup (using Docker Compose):**
    From the project root directory, start the PostgreSQL database service:
    ```bash
    docker-compose up -d postgres
    ```
    This will start a PostgreSQL container and persist data in a Docker volume.

5.  **Run Database Migrations (Backend):
    Once the database is running, apply Prisma migrations:
    ```bash
    npm run prisma:migrate:dev --workspace=backend
    # or with pnpm
    # pnpm --filter backend run prisma:migrate:dev 
    ```
    You might need to run `prisma generate` first if you haven't:
    ```bash
    npm run prisma:generate --workspace=backend
    # or with pnpm
    # pnpm --filter backend run prisma:generate
    ```

6.  **Run Development Servers:**

    *   **Using Docker Compose (Recommended for integrated environment):**
        From the project root, start all services (frontend, backend, db):
        ```bash
        docker-compose up --build
        ```
        The frontend will be accessible at `http://localhost:3000`.
        The backend will be accessible at `http://localhost:3001`.

    *   **Running Services Manually (Alternative):**
        You can run each service in a separate terminal.

        *   **Backend (`packages/backend`):
            ```bash
            npm run dev --workspace=backend
            # or with pnpm
            # pnpm --filter backend run dev
            ```

        *   **Frontend (`packages/frontend`):
            ```bash
            npm run dev --workspace=frontend
            # or with pnpm
            # pnpm --filter frontend run dev
            ```

        *   **Shared Types (`packages/shared-types`):
            If you make changes to `shared-types`, you might need to rebuild it. It usually has a `build` or `watch` script.
            ```bash
            npm run build --workspace=shared-types
            # or with pnpm
            # pnpm --filter shared-types run build (or watch)
            ```
            The frontend and backend dev servers should pick up changes in `shared-types` automatically due to symlinking by npm/pnpm workspaces, but a manual rebuild of `shared-types` might be necessary if direct output (e.g., from a `dist` folder) is consumed.

## Building for Production

*   **Backend:**
    ```bash
    npm run build --workspace=backend
    ```
*   **Frontend:**
    ```bash
    npm run build --workspace=frontend
    ```

## Running in Production (using Docker Compose)

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
(Assuming you have a `docker-compose.prod.yml` for production overrides)

Or, if your main `docker-compose.yml` is parameterized for production stages in Dockerfiles:
```bash
docker-compose up -d --build
```
Ensure `NODE_ENV=production` is set in the Docker environment for backend and frontend services for production builds.

## Linting and Formatting

- **Lint:**
  ```bash
  npm run lint --workspaces --if-present
  # or with pnpm
  # pnpm lint -r
  ```
- **Format:**
  ```bash
  npm run format --workspaces --if-present
  # or with pnpm
  # pnpm format -r
  ```

## Troubleshooting

(Common issues and solutions to be added here)
