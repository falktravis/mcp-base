// This file will contain database connection logic using pg.Pool.
// It can be expanded with helper functions for database operations if needed.

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config(); // Ensure environment variables are loaded

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optional: SSL configuration for production environments
  // ssl: {
  //   rejectUnauthorized: false // Adjust as per your security requirements
  // }
});

pool.on('connect', () => {
  console.log('Connected to the PostgreSQL database!');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export default pool;

// Example of how to create tables if they don't exist.
// This should ideally be handled by a migration system.
export const initializeDatabase = async () => {

  const createApiKeyTableQuery = `
    CREATE TABLE IF NOT EXISTS "ApiKey" (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      "hashedApiKey" VARCHAR(255) UNIQUE NOT NULL,
      salt VARCHAR(255) NOT NULL,
      prefix VARCHAR(50) NOT NULL, -- Short prefix for identification
      scopes TEXT, -- JSON string array for permissions
      "expiresAt" TIMESTAMP WITH TIME ZONE,
      "lastUsedAt" TIMESTAMP WITH TIME ZONE,
      "revokedAt" TIMESTAMP WITH TIME ZONE, -- To mark keys as revoked instead of deleting
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `;

  const createManagedMcpServerTableQuery = `
    CREATE TABLE IF NOT EXISTS "ManagedMcpServer" (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      "serverType" VARCHAR(50) NOT NULL, -- e.g., 'sse', 'stdio', 'websocket'
      "connectionDetails" JSONB NOT NULL, -- Stores URL, command, args, etc.
      "mcpOptions" TEXT, -- JSON string for MCP specific options
      status VARCHAR(50) NOT NULL, -- e.g., 'running', 'stopped', 'error'
      "isEnabled" BOOLEAN DEFAULT TRUE NOT NULL,
      tags TEXT, -- JSON string array for tags
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "lastPingedAt" TIMESTAMP WITH TIME ZONE,
      "lastError" TEXT
    );
  `;

  const createTrafficLogTableQuery = `
    CREATE TABLE IF NOT EXISTS "TrafficLog" (
      id VARCHAR(255) PRIMARY KEY,
      "serverId" VARCHAR(255) NOT NULL REFERENCES "ManagedMcpServer"(id) ON DELETE CASCADE,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "mcpMethod" VARCHAR(255) NOT NULL,
      "mcpRequestId" VARCHAR(255),
      "sourceIp" VARCHAR(255),
      "requestSizeBytes" INTEGER,
      "responseSizeBytes" INTEGER,
      "httpStatus" INTEGER, -- Status code of the gateway response to the client
      "targetServerHttpStatus" INTEGER, -- Status code from the target MCP server
      "isSuccess" BOOLEAN NOT NULL,
      "durationMs" INTEGER NOT NULL,
      "apiKeyId" VARCHAR(255) REFERENCES "ApiKey"(id) ON DELETE SET NULL,
      "errorMessage" TEXT
      -- requestPayload and responsePayload removed as per plan; consider logging snippets or storing elsewhere
    );
  `;

  const createServerExtensionInstallationTableQuery = `
    CREATE TABLE IF NOT EXISTS "ServerExtensionInstallation" (
        id VARCHAR(255) PRIMARY KEY,
        "serverId" VARCHAR(255) NOT NULL REFERENCES "ManagedMcpServer"(id) ON DELETE CASCADE,
        "extensionId" VARCHAR(255) NOT NULL, -- Marketplace Extension ID
        "installedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version VARCHAR(255) NOT NULL,
        config TEXT, -- JSON string for extension-specific configuration
        "isEnabled" BOOLEAN DEFAULT TRUE NOT NULL
    );
  `;

  try {
    await pool.query(createApiKeyTableQuery);
    console.log('ApiKey table checked/created successfully.');
    await pool.query(createManagedMcpServerTableQuery);
    console.log('ManagedMcpServer table checked/created successfully.');
    await pool.query(createTrafficLogTableQuery);
    console.log('TrafficLog table checked/created successfully.');
    await pool.query(createServerExtensionInstallationTableQuery);
    console.log('ServerExtensionInstallation table checked/created successfully.');
  } catch (err) {
    console.error('Error initializing database tables:', err);
    // process.exit(1); // Optionally exit if DB setup fails
  }
};
