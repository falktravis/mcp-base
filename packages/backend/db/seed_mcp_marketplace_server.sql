-- SQL seed file for mcp_marketplace_server table
-- Add your initial MCP server entries here. Example:
-- INSERT INTO mcp_marketplace_server (qualified_name, display_name, icon_url, connections, tools)
-- VALUES (
--   'example/qualified',
--   'Example MCP Server',
--   'https://example.com/icon.png',
--   '[{"type": "http", "url": "https://example.com/api", "configSchema": {}}]',
--   '[{"name": "tool1", "description": "A tool", "inputSchema": {"type": "object"}}]'
-- )
-- ON CONFLICT (qualified_name) DO NOTHING;

INSERT INTO mcp_marketplace_server (
  qualified_name, display_name, icon_url, connections, tools
) VALUES (
  '@upstash/context7-mcp',
  'Context7',
  'https://spjawbfpwezjfmicopsl.supabase.co/storage/v1/object/public/server-icons/a2d7f090-292e-4145-a7ef-f1a7b6b061be.png',
  '[{"type": "http", "deploymentUrl": "https://mcp.context7.com/mcp", "configSchema": {}}]',
  '[{
    "name": "resolve-library-id",
    "description": "Resolves a package/product name to a Context7-compatible library ID and returns a list of matching libraries.\n\nYou MUST call this function before ''get-library-docs'' to obtain a valid Context7-compatible library ID UNLESS the user explicitly provides a library ID in the format ''/org/project'' or ''/org/project/version'' in their query.\n\nSelection Process:\n1. Analyze the query to understand what library/package the user is looking for\n2. Return the most relevant match based on:\n- Name similarity to the query (exact matches prioritized)\n- Description relevance to the query''s intent\n- Documentation coverage (prioritize libraries with higher Code Snippet counts)\n- Trust score (consider libraries with scores of 7-10 more authoritative)\n\nResponse Format:\n- Return the selected library ID in a clearly marked section\n- Provide a brief explanation for why this library was chosen\n- If multiple good matches exist, acknowledge this but proceed with the most relevant one\n- If no good matches exist, clearly state this and suggest query refinements\n\nFor ambiguous queries, request clarification before proceeding with a best-guess match."
  },
  {
    "name": "get-library-docs",
    "description": "Fetches up-to-date documentation for a library. You must call ''resolve-library-id'' first to obtain the exact Context7-compatible library ID required to use this tool, UNLESS the user explicitly provides a library ID in the format ''/org/project'' or ''/org/project/version'' in their query."
  }]'
)
ON CONFLICT (qualified_name) DO NOTHING;
