// packages/frontend/src/app/settings/api-keys/page.tsx
'use client';

import React, { useState, useEffect } from 'react';

/**
 * @page ApiKeysPage
 * @description Page for managing user API keys within the settings section.
 */

// Mock data for API keys - replace with API call
interface ApiKey {
  id: string;
  name: string;
  prefix: string; // e.g., mcp_pk_ (public key prefix)
  createdDate: string;
  lastUsedDate?: string;
  expiresDate?: string;
  isActive: boolean;
}

const mockApiKeys: ApiKey[] = [
  {
    id: 'key-001',
    name: 'My Main Application Key',
    prefix: 'mcp_sk_a1b2c3',
    createdDate: '2023-01-15',
    lastUsedDate: '2023-10-25',
    isActive: true,
  },
  {
    id: 'key-002',
    name: 'Development Test Key',
    prefix: 'mcp_sk_d4e5f6',
    createdDate: '2023-05-20',
    expiresDate: '2024-05-20',
    isActive: true,
  },
  {
    id: 'key-003',
    name: 'Old Integration Key',
    prefix: 'mcp_sk_g7h8i9',
    createdDate: '2022-11-01',
    lastUsedDate: '2023-03-10',
    isActive: false, // Revoked
  },
];

const ApiKeysPage: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null); // To display the new key once

  console.log('ApiKeysPage: Rendering');

  // Simulate fetching API keys
  useEffect(() => {
    console.log('ApiKeysPage: Fetching API keys...');
    setIsLoading(true);
    setTimeout(() => {
      setApiKeys(mockApiKeys);
      setIsLoading(false);
      console.log('ApiKeysPage: API keys loaded.');
    }, 1000);
  }, []);

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      alert('Please provide a name for the API key.');
      return;
    }
    console.log(`ApiKeysPage: Creating new API key with name: ${newKeyName}`);
    // Simulate API call to create key
    const newKey: ApiKey = {
      id: `key-${Date.now()}`,
      name: newKeyName,
      prefix: `mcp_sk_new${Math.random().toString(36).substring(2, 8)}`,
      createdDate: new Date().toISOString().split('T')[0],
      isActive: true,
    };
    const fullKeyValue = `${newKey.prefix}${Math.random().toString(36).substring(2, 15)}`; // Simulate full key
    
    setApiKeys(prev => [newKey, ...prev]);
    setGeneratedApiKey(fullKeyValue);
    setNewKeyName('');
    // setShowCreateModal(false); // Keep modal open to show the key
    alert(`API Key "${newKey.name}" created. Key: ${fullKeyValue} (This will only be shown once!)`);
  };

  const handleRevokeKey = (keyId: string) => {
    console.log(`ApiKeysPage: Revoking API key ${keyId}`);
    // Simulate API call
    setApiKeys(prev => 
      prev.map(key => key.id === keyId ? { ...key, isActive: false } : key)
    );
    alert(`API Key ${keyId} has been revoked.`);
  };

  const formatKeyDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">API Keys</h1>
        <button
          onClick={() => {
            setShowCreateModal(true);
            setGeneratedApiKey(null); // Clear any previously generated key
          }}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out"
        >
          Create New API Key
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-500">Loading API keys...</p>
      ) : apiKeys.length > 0 ? (
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                {['Name', 'Key Prefix', 'Created', 'Last Used', 'Expires', 'Status', 'Actions'].map(header => (
                  <th key={header} className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm">
                    <p className="text-gray-900 whitespace-no-wrap font-semibold">{key.name}</p>
                  </td>
                  <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm">
                    <p className="text-gray-700 whitespace-no-wrap font-mono">{key.prefix}...</p>
                  </td>
                  <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm whitespace-no-wrap">{formatKeyDate(key.createdDate)}</td>
                  <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm whitespace-no-wrap">{formatKeyDate(key.lastUsedDate)}</td>
                  <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm whitespace-no-wrap">{formatKeyDate(key.expiresDate)}</td>
                  <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm">
                    <span className={`px-2 py-1 font-semibold leading-tight rounded-full text-xs ${key.isActive ? 'text-green-900 bg-green-200' : 'text-red-900 bg-red-200'}`}>
                      {key.isActive ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm whitespace-no-wrap">
                    {key.isActive && (
                      <button 
                        onClick={() => handleRevokeKey(key.id)}
                        className="text-red-600 hover:text-red-900 text-xs"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-10">
          <p className="text-gray-500 text-lg">No API keys found.</p>
          <p className="text-gray-400 mt-2">Create your first API key to get started.</p>
        </div>
      )}

      {/* Create API Key Modal */}
      {showCreateModal && (
        <>
          <div className="fixed inset-0 bg-black opacity-50 z-40" onClick={() => setShowCreateModal(false)}></div>
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
              <h2 className="text-xl font-bold mb-4 text-gray-800">Create New API Key</h2>
              
              {generatedApiKey ? (
                <div>
                  <p className="text-sm text-gray-600 mb-2">Your new API key has been generated. Please copy it now. You will not be able to see it again.</p>
                  <div className="bg-gray-100 p-3 rounded font-mono text-sm break-all mb-4">
                    {generatedApiKey}
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generatedApiKey);
                      alert('API Key copied to clipboard!');
                    }}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded mb-2 transition duration-150"
                  >
                    Copy Key
                  </button>
                  <button 
                    onClick={() => {
                      setShowCreateModal(false);
                      setGeneratedApiKey(null);
                    }}
                    className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded transition duration-150"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <label htmlFor="keyName" className="block text-sm font-medium text-gray-700 mb-1">Key Name:</label>
                    <input 
                      type="text"
                      id="keyName"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., My Application Key"
                      className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  {/* Add options for expiration, permissions, etc. here */}
                  <div className="flex justify-end space-x-3">
                    <button 
                      onClick={() => setShowCreateModal(false)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded transition duration-150"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleCreateKey}
                      className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-150"
                    >
                      Generate Key
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ApiKeysPage;
