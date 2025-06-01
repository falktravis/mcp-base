const apiKey = 'dc3430c5-a3d1-4a30-ab70-c0f1a6e7f69c';
const query = 'owner:mem0ai is:verified memory';
const encodedQuery = encodeURIComponent(query);

const response = await fetch(
  `https://registry.smithery.ai/servers/@dpflucas/mysql-mcp-server`,
  {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    }
  }
);

const serverInfo = await response.json();
console.log(serverInfo);

const configSchema = serverInfo.connections[0].configSchema;
console.log(configSchema);
