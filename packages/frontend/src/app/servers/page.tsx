// packages/frontend/src/app/servers/page.tsx
'use client';

import React, { useState } from 'react';
// import AddServerModal from '@/components/servers/AddServerModal'; // Placeholder for modal component
import { RegisterServerRequest, ServerType, ManagedMcpServerDetails } from '@shared-types/api-contracts';

/**
 * @page ServersPage
 * @description Page for listing, managing, and monitoring MCP servers.
 */

// Placeholder data for servers
// Using a modified version of ManagedMcpServerDetails interface
const mockServers: Array<Omit<ManagedMcpServerDetails, 'connectionDetails'> & { host: string, port: number }> = [
  {
    id: 'server-001',
    name: 'Alpha Production Server',
    status: 'running',
    serverType: 'stdio',
    host: '192.168.1.101',
    port: 8080,
    createdAt: '2023-10-25T12:00:00Z',
    updatedAt: '2023-10-25T12:00:00Z',
  },
  {
    id: 'server-002',
    name: 'Beta Staging Environment',
    status: 'stopped',
    serverType: 'streamable-http',
    host: 'mcp-beta.example.com',
    port: 9000,
    createdAt: '2023-10-24T15:30:00Z',
    updatedAt: '2023-10-24T15:30:00Z',
  },
  {
    id: 'server-003',
    name: 'Gamma Development Instance',
    status: 'error',
    serverType: 'sse',
    host: 'localhost',
    port: 7070,
    createdAt: '2023-10-23T09:45:00Z',
    updatedAt: '2023-10-23T09:45:00Z',
  },
];

const ServersPage: React.FC = () => {  const [servers, setServers] = useState(mockServers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  console.log('ServersPage: Rendering with servers:', servers);  const handleAddServer = (newServer: RegisterServerRequest) => {
    // Placeholder: This would typically involve an API call
    console.log('ServersPage: Adding new server:', newServer);
    // setServers(prev => [...prev, { ...newServer, id: `server-${Date.now()}` }]);
    // setIsModalOpen(false);
    alert('Add server functionality not yet implemented.');
  };

  const toggleServerStatus = (serverId: string) => {
    // Placeholder: API call to start/stop server
    console.log(`ServersPage: Toggling status for server ${serverId}`);
    // setServers(prevServers =>
    //   prevServers.map(server =>
    //     server.id === serverId
    //       ? { ...server, status: server.status === 'Running' ? 'Stopped' : 'Running' }
    //       : server
    //   )
    // );
    alert('Toggle server status functionality not yet implemented.');
  };

  const viewServerDetails = (serverId: string) => {
    console.log(`ServersPage: Viewing details for server ${serverId}`);
    // This would typically navigate to a dynamic route like /servers/[id]
    alert(`Navigate to details for server ${serverId} (not implemented).`);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Managed MCP Servers</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out"
        >
          Add New Server
        </button>
      </div>

      {/* Server List Table */}
      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="min-w-full leading-normal">
          <thead>
            <tr>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Name
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Status
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Type / Version
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Endpoint
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm">
                  <p className="text-gray-900 whitespace-no-wrap font-semibold">{server.name}</p>
                </td>
                <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm">
                  <span
                    className={`px-2 py-1 font-semibold leading-tight rounded-full text-xs whitespace-no-wrap ${ 
                      server.status === 'running' ? 'text-green-900 bg-green-200' :
                      server.status === 'stopped' ? 'text-yellow-900 bg-yellow-200' :
                      'text-red-900 bg-red-200'
                    }`}
                  >
                    {server.status}
                  </span>
                </td>
                <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm">
                  <p className="text-gray-900 whitespace-no-wrap">{server.serverType}</p>
                </td>
                <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm">
                  <p className="text-gray-900 whitespace-no-wrap">{server.host}:{server.port}</p>
                </td>
                <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm">
                  <button 
                    onClick={() => viewServerDetails(server.id)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3 text-xs"
                  >
                    Details
                  </button>
                  <button 
                    onClick={() => toggleServerStatus(server.id)}
                    className={`${server.status === 'running' ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'} text-xs`}
                  >
                    {server.status === 'running' ? 'Stop' : 'Start'}
                  </button>
                </td>
              </tr>
            ))}
            {servers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-center text-gray-500">
                  No servers found. Add a new server to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* {isModalOpen && (
        <AddServerModal
          onClose={() => setIsModalOpen(false)}
          onAddServer={handleAddServer}
        />
      )} */}
      {isModalOpen && <div className="fixed inset-0 bg-black opacity-50 z-40"></div>} 
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                <h2 className="text-2xl font-bold mb-4">Add New Server (Placeholder)</h2>
                <p className="mb-4">Server creation form will be here.</p>
                <button 
                    onClick={() => setIsModalOpen(false)} 
                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded mr-2"
                >
                    Close
                </button>                <button 
                    onClick={() => {
                      // Placeholder: When real modal is implemented, this will call handleAddServer with form data
                      alert('Add server functionality not yet implemented.');
                      setIsModalOpen(false);
                    }} 
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Add Server
                </button>
            </div>
        </div>
      )}

    </div>
  );
};

export default ServersPage;
