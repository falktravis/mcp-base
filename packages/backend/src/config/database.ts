// This file will contain database connection logic using pg.Pool.
// It can be expanded with helper functions for database operations if needed.
//
// All table and column names use snake_case (unquoted) for PostgreSQL compatibility and consistency.

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
  // Table creation is now handled by 00_create_tables.sql in docker-entrypoint-initdb.d
  // This function can be kept for other initialization tasks or if running outside Docker without initdb.d scripts.
  // For now, we'll just log that it's being called.
  console.log('[initializeDatabase] Called. Table creation is primarily handled by init scripts in Docker.');

  // Optionally, you could still include CREATE TABLE IF NOT EXISTS here as a fallback
  // or for environments where the initdb.d scripts aren't used.
  // However, to strictly rely on the initdb.d scripts for table creation when using Docker,
  // we can remove the explicit pool.query calls for table creation from here.

  // Example: If you still want to ensure tables exist if not using Docker init scripts:
  const create_api_key_table_query = `
    CREATE TABLE IF NOT EXISTS api_key (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      hashed_api_key VARCHAR(255) UNIQUE NOT NULL,
      salt VARCHAR(255) NOT NULL,
      prefix VARCHAR(50) NOT NULL, -- Short prefix for identification
      scopes TEXT, -- JSON string array for permissions
      expires_at TIMESTAMP WITH TIME ZONE,
      last_used_at TIMESTAMP WITH TIME ZONE,
      revoked_at TIMESTAMP WITH TIME ZONE, -- To mark keys as revoked instead of deleting
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `;

  const create_managed_mcp_server_table_query = `
    CREATE TABLE IF NOT EXISTS managed_mcp_server (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      server_type VARCHAR(50) NOT NULL, -- e.g., 'sse', 'stdio', 'websocket'
      connection_details JSONB NOT NULL, -- Stores URL, command, args, etc.
      mcp_options TEXT, -- JSON string for MCP specific options
      status VARCHAR(50) NOT NULL, -- e.g., 'running', 'stopped', 'error'
      is_enabled BOOLEAN DEFAULT TRUE NOT NULL,
      tags TEXT, -- JSON string array for tags
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      last_pinged_at TIMESTAMP WITH TIME ZONE,
      last_error TEXT
    );
  `;

  const create_traffic_log_table_query = `
    CREATE TABLE IF NOT EXISTS traffic_log (
      id VARCHAR(255) PRIMARY KEY,
      server_id VARCHAR(255) NOT NULL REFERENCES managed_mcp_server(id) ON DELETE CASCADE,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      mcp_method VARCHAR(255) NOT NULL,
      mcp_request_id VARCHAR(255),
      source_ip VARCHAR(255),
      request_size_bytes INTEGER,
      response_size_bytes INTEGER,
      http_status INTEGER, -- Status code of the gateway response to the client
      target_server_http_status INTEGER, -- Status code from the target MCP server
      is_success BOOLEAN NOT NULL,
      duration_ms INTEGER NOT NULL,
      api_key_id VARCHAR(255) REFERENCES api_key(id) ON DELETE SET NULL,
      error_message TEXT
    );
  `;

  const create_server_extension_installation_table_query = `
    CREATE TABLE IF NOT EXISTS server_extension_installation (
        id VARCHAR(255) PRIMARY KEY,
        server_id VARCHAR(255) NOT NULL REFERENCES managed_mcp_server(id) ON DELETE CASCADE,
        extension_id VARCHAR(255) NOT NULL, -- Marketplace Extension ID
        installed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version VARCHAR(255) NOT NULL,
        config TEXT, -- JSON string for extension-specific configuration
        is_enabled BOOLEAN DEFAULT TRUE NOT NULL
    );
  `;

  const create_mcp_marketplace_server_table_query = `
    CREATE TABLE IF NOT EXISTS mcp_marketplace_server (
      qualified_name VARCHAR(255) PRIMARY KEY,
      display_name VARCHAR(255) NOT NULL,
      icon_url VARCHAR(255),
      connections JSONB NOT NULL,
      tools JSONB
    );
  `;

  try {
    // These will only create tables if they don't exist, serving as a fallback.
    // In a Docker environment with initdb.d, these should find the tables already created.
    await pool.query(create_api_key_table_query);
    await pool.query(create_managed_mcp_server_table_query);
    await pool.query(create_traffic_log_table_query);
    await pool.query(create_server_extension_installation_table_query);
    await pool.query(create_mcp_marketplace_server_table_query);
    console.log('All tables checked/created by initializeDatabase (fallback).');
  } catch (err) {
    console.error('Error initializing database tables in initializeDatabase (fallback):', err);
    // process.exit(1); // Decide if failure here is critical
  }
};
