-- All table and column names are snake_case and unquoted.

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

CREATE TABLE IF NOT EXISTS server_extension_installation (
    id VARCHAR(255) PRIMARY KEY,
    server_id VARCHAR(255) NOT NULL REFERENCES managed_mcp_server(id) ON DELETE CASCADE,
    extension_id VARCHAR(255) NOT NULL, -- Marketplace Extension ID
    installed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version VARCHAR(255) NOT NULL,
    config TEXT, -- JSON string for extension-specific configuration
    is_enabled BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_marketplace_server (
  qualified_name VARCHAR(255) PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  icon_url VARCHAR(255),
  connections JSONB NOT NULL,
  tools JSONB
);

-- Log successful creation (optional, but good for debugging)
DO $$
BEGIN
  RAISE NOTICE 'All tables checked/created successfully by 00_create_tables.sql';
END $$;
