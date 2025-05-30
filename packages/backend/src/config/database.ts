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
  // User table creation is removed

  const createApiKeyTableQuery = `
    CREATE TABLE IF NOT EXISTS "ApiKey" (
      id VARCHAR(255) PRIMARY KEY,
      -- "userId" VARCHAR(255) NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, -- Removed
      "hashedKey" VARCHAR(255) UNIQUE NOT NULL,
      prefix VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      "expiresAt" TIMESTAMP WITH TIME ZONE,
      "lastUsedAt" TIMESTAMP WITH TIME ZONE,
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createManagedMcpServerTableQuery = `
    CREATE TABLE IF NOT EXISTS "ManagedMcpServer" (
      id VARCHAR(255) PRIMARY KEY,
      -- "userId" VARCHAR(255) NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, -- Removed
      name VARCHAR(255) NOT NULL,
      url VARCHAR(255) NOT NULL,
      type VARCHAR(255) NOT NULL, -- e.g., 'sse', 'streamable-http', 'stdio'
      "apiKey" TEXT, -- Encrypted
      credentials TEXT, -- Encrypted JSON blob for other auth types
      description TEXT,
      "isEnabled" BOOLEAN DEFAULT TRUE,
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      -- Add other fields from ManagedMcpServer interface as needed
    );
  `;

  const createTrafficLogTableQuery = `
    CREATE TABLE IF NOT EXISTS "TrafficLog" (
      id VARCHAR(255) PRIMARY KEY,
      "serverId" VARCHAR(255) NOT NULL REFERENCES "ManagedMcpServer"(id) ON DELETE CASCADE,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "requestType" VARCHAR(50) NOT NULL, -- 'tool_call', 'resource_access', 'prompt_request'
      "targetTool" VARCHAR(255),
      "targetResourceUri" VARCHAR(255),
      "targetPromptName" VARCHAR(255),
      "requestPayload" JSONB,
      "responsePayload" JSONB,
      "isSuccess" BOOLEAN NOT NULL,
      "durationMs" INTEGER NOT NULL,
      "clientIp" VARCHAR(255),
      "apiKeyId" VARCHAR(255) REFERENCES "ApiKey"(id) ON DELETE SET NULL -- If request used an API key
      -- "userId" field removed
    );
  `;

  try {
    // await pool.query(createUserTableQuery); // Removed
    // console.log('User table checked/created successfully.'); // Removed
    await pool.query(createApiKeyTableQuery);
    console.log('ApiKey table checked/created successfully.');
    await pool.query(createManagedMcpServerTableQuery);
    console.log('ManagedMcpServer table checked/created successfully.');
    await pool.query(createTrafficLogTableQuery);
    console.log('TrafficLog table checked/created successfully.');
  } catch (err) {
    console.error('Error initializing database tables:', err);
    // process.exit(1); // Optionally exit if DB setup fails
  }
};
