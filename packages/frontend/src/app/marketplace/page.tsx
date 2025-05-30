// packages/frontend/src/app/marketplace/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';

/**
 * @page MarketplacePage
 * @description Page for browsing and managing MCP server images, extensions, or configurations from a marketplace.
 */

// Mock data for marketplace items - replace with API call
const mockMarketplaceItems = [
  {
    id: 'mcp-image-std',
    name: 'Standard MCP Server Image',
    type: 'Server Image',
    version: '1.2.5',
    description: 'A general-purpose MCP server image with common features.',
    provider: 'MCP Pro Core Team',
    rating: 4.5,
    downloads: 1200,
    tags: ['official', 'stable', 'general'],
    iconUrl: 'https://via.placeholder.com/150/007BFF/FFFFFF?Text=MCP-Std' // Placeholder icon
  },
  {
    id: 'mcp-image-perf',
    name: 'High-Performance LLM Gateway',
    type: 'Server Image',
    version: '2.0.1',
    description: 'Optimized for high-throughput LLM request proxying and caching.',
    provider: 'Community Contributor',
    rating: 4.8,
    downloads: 850,
    tags: ['llm', 'performance', 'beta'],
    iconUrl: 'https://via.placeholder.com/150/28A745/FFFFFF?Text=MCP-Perf' // Placeholder icon
  },
  {
    id: 'mcp-plugin-analytics',
    name: 'Advanced Analytics Plugin',
    type: 'Plugin',
    version: '0.9.0',
    description: 'Provides detailed traffic analysis and reporting capabilities for your MCP servers.',
    provider: 'Third-Party Inc.',
    rating: 4.2,
    downloads: 300,
    tags: ['analytics', 'monitoring', 'reporting'],
    iconUrl: 'https://via.placeholder.com/150/FFC107/000000?Text=Analytics' // Placeholder icon
  },
  {
    id: 'mcp-config-secure',
    name: 'Secure Deployment Configuration',
    type: 'Configuration Pack',
    version: '1.0.0',
    description: 'A pre-defined configuration set for deploying MCP servers with enhanced security settings.',
    provider: 'MCP Pro Security Team',
    rating: 5.0,
    downloads: 50,
    tags: ['security', 'official', 'hardening'],
    iconUrl: 'https://via.placeholder.com/150/DC3545/FFFFFF?Text=Secure' // Placeholder icon
  },
];

const MarketplacePage: React.FC = () => {
  const [items, setItems] = useState(mockMarketplaceItems);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [isLoading, setIsLoading] = useState(false);

  console.log('MarketplacePage: Rendering with items:', items);

  // Simulate fetching items - replace with actual API call
  useEffect(() => {
    setIsLoading(true);
    console.log(`MarketplacePage: Fetching items. Search: "${searchTerm}", Type: "${filterType}"`);
    const timer = setTimeout(() => {
      const filtered = mockMarketplaceItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (filterType === 'All' || item.type === filterType)
      );
      setItems(filtered);
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, filterType]);

  const handleInstall = (itemId: string) => {
    // Placeholder for install logic
    console.log(`MarketplacePage: Initiating install for item ${itemId}`);
    alert(`Install/Download for item ${itemId} not yet implemented.`);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Marketplace</h1>

      {/* Filters and Search */}
      <div className="mb-6 p-4 bg-white shadow rounded-lg flex flex-wrap gap-4 items-center">
        <input 
          type="text"
          placeholder="Search items..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-grow p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
        <select 
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="All">All Types</option>
          <option value="Server Image">Server Images</option>
          <option value="Plugin">Plugins</option>
          <option value="Configuration Pack">Configuration Packs</option>
        </select>
      </div>

      {/* Marketplace Items Grid */}
      {isLoading ? (
        <p className="text-center text-gray-500">Loading marketplace items...</p>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">          {items.map((item) => (
            <div key={item.id} className="bg-white shadow-lg rounded-lg overflow-hidden flex flex-col">
              <Image 
                src={item.iconUrl || 'https://via.placeholder.com/300x200?text=No+Image'} 
                alt={item.name} 
                width={300} 
                height={200} 
                className="w-full h-48 object-cover"
              />
              <div className="p-4 flex flex-col flex-grow">
                <h2 className="text-xl font-semibold text-gray-800 mb-1">{item.name}</h2>
                <p className="text-xs text-gray-500 mb-2">By {item.provider} - v{item.version}</p>
                <p className="text-sm text-gray-600 mb-3 flex-grow">{item.description}</p>
                <div className="mb-3">
                  {item.tags.map(tag => (
                    <span key={tag} className="inline-block bg-gray-200 rounded-full px-2 py-0.5 text-xs font-semibold text-gray-700 mr-1 mb-1 capitalize">{tag}</span>
                  ))}
                </div>
                <div className="flex justify-between items-center text-sm text-gray-500 mb-3">
                  <span>⭐ {item.rating.toFixed(1)}</span>
                  <span>{item.downloads.toLocaleString()} downloads</span>
                </div>
                <button 
                  onClick={() => handleInstall(item.id)}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded transition duration-150 ease-in-out mt-auto"
                >
                  Install / Download
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-500 py-10">No items found matching your criteria.</p>
      )}
    </div>
  );
};

export default MarketplacePage;
