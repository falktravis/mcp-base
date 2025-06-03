### `managed_mcp_server`

Stores information about MCP servers managed by MCP Pro.

*   `id` (VARCHAR(255), PK): Unique identifier for the managed server.
*   `name` (VARCHAR(255), NN): User-defined name for the server.
*   `description` (TEXT): Optional description.
*   `server_type` (VARCHAR(50), NN): Type of server connection (e.g., 'stdio', 'websocket', 'sse', 'streamable-http').
*   `connection_details` (JSONB, NN): Stores connection-specific details. **This field will be augmented to include authentication credentials.**
    *   **Structure for `connection_details`:**
        ```json
        {
          // Existing fields like "url" for remote servers, 
          // or "command", "args", "cwd" for STDIO servers.
          "url": "wss://example-downstream-mcp.com/mcp", // Example for WebSocket
          "command": "/path/to/mcp/server/executable", // Example for STDIO
          "args": ["--port", "{{port}}"],
          "cwd": "/path/to/server/working/directory",

          // NEW "authentication" object
          "authentication": {
            "type": "none" // or "apiKey", "bearerToken"
            // Conditional fields based on "type":
          }
        }
        ```
    *   **`authentication.type = "none"`:**
        ```json
        {
          "authentication": {
            "type": "none"
          }
        }
        ```
    *   **`authentication.type = "apiKey"`:**
        ```json
        {
          "authentication": {
            "type": "apiKey",
            "key": "your-actual-api-key-value", // The secret API key
            "headerName": "X-Custom-API-Key", // e.g., "X-API-Key", "Authorization"
            "prefix": null // e.g., "ApiKey ", "Bearer " (if headerName is "Authorization")
          }
        }
        ```
    *   **`authentication.type = "bearerToken"`:**
        ```json
        {
          "authentication": {
            "type": "bearerToken",
            "token": "your-actual-bearer-token-value" // The secret token
          }
        }
        ```
    *   **Security Note:** Storing raw secrets directly in the database is generally discouraged for production systems. Ideally, MCP Pro should integrate with a dedicated secrets management system (e.g., HashiCorp Vault, AWS Secrets Manager, Azure Key Vault). In such a setup, the `key` or `token` fields above would store a *reference* to the secret in the vault, not the secret itself. For the current implementation phase, direct storage is specified, but this security enhancement should be a high-priority consideration for production readiness. Database-level encryption at rest for the `connection_details` column is also highly recommended if direct storage is used.
*   `mcp_options` (TEXT): JSON string for MCP specific options (e.g., for the MCP SDK client connecting to this server).
*   `status` (VARCHAR(50), NN): Current status of the server (e.g., 'running', 'stopped', 'error', 'disabled').
*   `is_enabled` (BOOLEAN, DF TRUE, NN): Whether this server configuration is active and should be connected to by MCP Pro.
*   `tags` (TEXT): JSON string array for tags, for organization and filtering.
*   `created_at` (TIMESTAMP WITH TIME ZONE, DF CURRENT_TIMESTAMP, NN): Timestamp of creation.
*   `updated_at` (TIMESTAMP WITH TIME ZONE, DF CURRENT_TIMESTAMP, NN): Timestamp of last update.
*   `last_pinged_at` (TIMESTAMP WITH TIME ZONE): Timestamp of the last successful communication or health check.
*   `last_error` (TEXT): Stores the last error message if the server is in an error state.
*   **New (Recommended): `alias` (VARCHAR(100), UNIQ, NULL):** A short, unique, user-configurable alias for the server (e.g., "weather_service", "code_analyzer_prod"). This alias will be used by the Central Gateway to prefix tool names for uniqueness (e.g., `weather_service_get_current_weather`). If not provided, the `name` field could be sanitized and used as a fallback.