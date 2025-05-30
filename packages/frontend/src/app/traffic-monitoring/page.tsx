// packages/frontend/src/app/traffic-monitoring/page.tsx
'use client';

import React, { useState, useEffect } from 'react';

/**
 * @page TrafficMonitoringPage
 * @description Page for displaying real-time and historical traffic logs and metrics for MCP servers.
 */

// Mock data for traffic logs - in a real app, this would come from an API
const mockTrafficLogs = [
  {
    id: 'log-001',
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(), // 5 minutes ago
    serverId: 'server-001',
    serverName: 'Alpha Production',
    sourceIp: '123.45.67.89',
    requestPath: '/v1/models/bert/predict',
    statusCode: 200,
    durationMs: 150,
    requestSizeKb: 2.5,
    responseSizeKb: 10.2,
  },
  {
    id: 'log-002',
    timestamp: new Date(Date.now() - 10 * 60000).toISOString(), // 10 minutes ago
    serverId: 'server-002',
    serverName: 'Beta Staging',
    requestPath: '/v1/health',
    sourceIp: '203.0.113.45',
    statusCode: 200,
    durationMs: 12,
    requestSizeKb: 0.1,
    responseSizeKb: 0.5,
  },
  {
    id: 'log-003',
    timestamp: new Date(Date.now() - 12 * 60000).toISOString(), // 12 minutes ago
    serverId: 'server-001',
    serverName: 'Alpha Production',
    sourceIp: '198.51.100.12',
    requestPath: '/v1/models/gpt-3/generate',
    statusCode: 500,
    durationMs: 2500,
    requestSizeKb: 5.0,
    responseSizeKb: 0.2, // Small error response
  },
  {
    id: 'log-004',
    timestamp: new Date(Date.now() - 20 * 60000).toISOString(), // 20 minutes ago
    serverId: 'server-003',
    serverName: 'Gamma Development',
    sourceIp: '127.0.0.1',
    requestPath: '/v1/admin/config',
    statusCode: 401,
    durationMs: 5,
    requestSizeKb: 0.2,
    responseSizeKb: 0.1,
  },
];

const TrafficMonitoringPage: React.FC = () => {
  const [trafficLogs, setTrafficLogs] = useState(mockTrafficLogs);
  const [filter, setFilter] = useState({ serverId: '', statusCode: '' });
  const [isLoading, setIsLoading] = useState(false);

  console.log('TrafficMonitoringPage: Rendering with logs:', trafficLogs);

  // Simulate fetching logs - replace with actual API call
  useEffect(() => {
    setIsLoading(true);
    console.log('TrafficMonitoringPage: Fetching logs with filter:', filter);
    // Simulate API delay
    const timer = setTimeout(() => {
      // Basic filtering example (client-side for mock)
      const filtered = mockTrafficLogs.filter(log => 
        (filter.serverId ? log.serverId === filter.serverId : true) &&
        (filter.statusCode ? log.statusCode.toString() === filter.statusCode : true)
      );
      setTrafficLogs(filtered);
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [filter]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilter(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const formatTimestamp = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Traffic Monitoring</h1>

      {/* Filters */}
      <div className="mb-6 p-4 bg-white shadow rounded-lg flex flex-wrap gap-4 items-center">
        <div>
          <label htmlFor="serverId" className="block text-sm font-medium text-gray-700 mr-2">Server:</label>
          <select 
            name="serverId" 
            id="serverId"
            value={filter.serverId}
            onChange={handleFilterChange}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            <option value="">All Servers</option>
            <option value="server-001">Alpha Production</option>
            <option value="server-002">Beta Staging</option>
            <option value="server-003">Gamma Development</option>
          </select>
        </div>
        <div>
          <label htmlFor="statusCode" className="block text-sm font-medium text-gray-700 mr-2">Status Code:</label>
          <input 
            type="text" 
            name="statusCode" 
            id="statusCode"
            value={filter.statusCode}
            onChange={handleFilterChange}
            placeholder="e.g., 200, 500"
            className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2"
          />
        </div>
        {/* Add more filters like date range, IP, path etc. */}
      </div>

      {/* Traffic Logs Table */}
      {isLoading ? (
        <p className="text-center text-gray-500">Loading logs...</p>
      ) : (
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                {['Timestamp', 'Server', 'Source IP', 'Request Path', 'Status', 'Duration (ms)', 'Req Size', 'Res Size'].map(header => (
                  <th key={header} className="px-3 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trafficLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 border-b border-gray-200 bg-white text-xs whitespace-no-wrap">{formatTimestamp(log.timestamp)}</td>
                  <td className="px-3 py-3 border-b border-gray-200 bg-white text-xs">
                    <p className="text-gray-900 whitespace-no-wrap">{log.serverName}</p>
                    <p className="text-gray-500 whitespace-no-wrap text-xxs">({log.serverId})</p>
                  </td>
                  <td className="px-3 py-3 border-b border-gray-200 bg-white text-xs whitespace-no-wrap">{log.sourceIp}</td>
                  <td className="px-3 py-3 border-b border-gray-200 bg-white text-xs whitespace-no-wrap truncate" style={{maxWidth: '200px'}} title={log.requestPath}>{log.requestPath}</td>
                  <td className="px-3 py-3 border-b border-gray-200 bg-white text-xs">
                    <span className={`px-2 py-1 font-semibold leading-tight rounded-full ${ 
                        log.statusCode >= 500 ? 'text-red-900 bg-red-200' :
                        log.statusCode >= 400 ? 'text-yellow-900 bg-yellow-200' :
                        log.statusCode >= 200 && log.statusCode < 300 ? 'text-green-900 bg-green-200' :
                        'text-gray-900 bg-gray-200'
                      }`}>
                      {log.statusCode}
                    </span>
                  </td>
                  <td className="px-3 py-3 border-b border-gray-200 bg-white text-xs whitespace-no-wrap">{log.durationMs}</td>
                  <td className="px-3 py-3 border-b border-gray-200 bg-white text-xs whitespace-no-wrap">{log.requestSizeKb} KB</td>
                  <td className="px-3 py-3 border-b border-gray-200 bg-white text-xs whitespace-no-wrap">{log.responseSizeKb} KB</td>
                </tr>
              ))}
              {trafficLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-center text-gray-500">
                    No traffic logs found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TrafficMonitoringPage;
