// packages/frontend/src/components/servers/AddServerModal.tsx
'use client';

import React, { useState } from 'react';

/**
 * @component AddServerModal
 * @description Modal component for adding a new MCP server.
 * This is a placeholder and will need to be integrated with actual form handling and API calls.
 */

interface AddServerModalProps {
  onClose: () => void;
  onAddServer: (serverData: NewServerData) => void;
}

export interface NewServerData {
  name: string;
  host: string;
  port: number;
  type: string; // e.g., 'LLM', 'General', 'Custom'
  description?: string;
  // Add other relevant fields like authentication details, tags, etc.
}

const AddServerModal: React.FC<AddServerModalProps> = ({ onClose, onAddServer }) => {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState<number | string>(8080);
  const [type, setType] = useState('General');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  console.log('AddServerModal: Rendering');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !host.trim() || !port) {
      setError('Name, Host, and Port are required.');
      return;
    }

    const numericPort = Number(port);
    if (isNaN(numericPort) || numericPort <= 0 || numericPort > 65535) {
      setError('Invalid port number. Must be between 1 and 65535.');
      return;
    }

    const serverData: NewServerData = {
      name,
      host,
      port: numericPort,
      type,
      description,
    };

    console.log('AddServerModal: Submitting server data:', serverData);
    onAddServer(serverData);
    // onClose(); // Typically called by parent after successful submission
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Add New MCP Server</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="serverName" className="block text-sm font-medium text-gray-700 mb-1">Server Name:</label>
            <input 
              type="text"
              id="serverName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="serverHost" className="block text-sm font-medium text-gray-700 mb-1">Host / IP Address:</label>
              <input 
                type="text"
                id="serverHost"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
                placeholder="e.g., mcp.example.com or 192.168.1.100"
                className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="serverPort" className="block text-sm font-medium text-gray-700 mb-1">Port:</label>
              <input 
                type="number"
                id="serverPort"
                value={port}
                onChange={(e) => setPort(e.target.value ? Number(e.target.value) : '')}
                required
                min="1"
                max="65535"
                className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="serverType" className="block text-sm font-medium text-gray-700 mb-1">Server Type:</label>
            <select 
              id="serverType" 
              value={type} 
              onChange={(e) => setType(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="General">General MCP</option>
              <option value="LLM">LLM Optimized</option>
              <option value="DataProcessing">Data Processing</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          <div className="mb-6">
            <label htmlFor="serverDescription" className="block text-sm font-medium text-gray-700 mb-1">Description (Optional):</label>
            <textarea 
              id="serverDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Briefly describe this server or its purpose."
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button 
              type="button"
              onClick={onClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition duration-150"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded transition duration-150"
            >
              Add Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddServerModal;
