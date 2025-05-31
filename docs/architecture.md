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
