// packages/frontend/src/app/dashboard/page.tsx
'use client'; // Required for Next.js App Router client components

import React from 'react';
// import { usePlaceholder } from '@/contexts/placeholder'; // Example: Using a context
// import { usePlaceholderData } from '@/hooks/placeholder'; // Example: Using a custom hook

/**
 * @page DashboardPage
 * @description The main dashboard page for the MCP Pro application.
 * This page will display an overview of managed servers, traffic, and other key metrics.
 */
const DashboardPage: React.FC = () => {
  // const { message } = usePlaceholder(); // Example context usage
  // const { data, loading, error } = usePlaceholderData('example/success'); // Example hook usage

  console.log('DashboardPage: Rendering');

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">MCP Pro Dashboard</h1>

      {/* Example of using context and hook data */} 
      {/* <p className="mb-4">Context Message: {message}</p> */}
      {/* {loading && <p>Loading placeholder data...</p>} */}
      {/* {error && <p className="text-red-500">Error: {error.message}</p>} */}
      {/* {data && <pre className="bg-gray-100 p-2 rounded mb-4">{JSON.stringify(data, null, 2)}</pre>} */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Placeholder: Summary Cards */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Managed Servers</h2>
          <p className="text-4xl font-bold text-blue-600">5</p>
          <p className="text-gray-500">Active</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Total Traffic</h2>
          <p className="text-4xl font-bold text-green-600">1.2 TB</p>
          <p className="text-gray-500">Last 24 hours</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">API Keys</h2>
          <p className="text-4xl font-bold text-yellow-600">12</p>
          <p className="text-gray-500">Active Keys</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Recent Activity</h2>          <ul className="text-gray-600">
            <li className="py-1 border-b border-gray-200">Server &apos;Alpha&apos; started.</li>
            <li className="py-1 border-b border-gray-200">New API key generated for &apos;UserX&apos;.</li>
            <li className="py-1">Traffic spike detected on &apos;Gateway-1&apos;.</li>
          </ul>
        </div>
      </div>

      {/* Placeholder: Quick Actions */}
      <div className="mt-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">Quick Actions</h2>
        <div className="flex space-x-4">
          <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Add New Server
          </button>
          <button className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
            View Traffic Logs
          </button>
          <button className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded">
            Go to Marketplace
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
