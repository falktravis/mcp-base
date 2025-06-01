'use client';

import React, { useState, useEffect } from 'react';
import { useMcpSession } from '@/contexts/McpSessionContext';

// A dummy server ID for testing. Replace with a real one from your backend.
const TEST_SERVER_ID = 'test-server-123'; 

export default function McpTestPage() {
  const {
    mcpSessionId,
    currentServerId,
    status,
    error,
    lastMessage,
    initializeSession,
    closeSession,
    sendMessage,
  } = useMcpSession();

  const [messageInput, setMessageInput] = useState('');
  const [initialized, setInitialized] = useState(false);

  const handleInitialize = async () => {
    console.log('[McpTestPage] Attempting to initialize session...');
    // You can pass an initial message payload if your 'initialize' method expects specific params
    const initialPayload = {
        method: 'initialize', // Or your specific init method
        params: { capabilities: { testClient: 'mcp-pro-frontend-v1' } }
    };
    const newSessionId = await initializeSession(TEST_SERVER_ID, initialPayload);
    if (newSessionId) {
      console.log('[McpTestPage] Session initialization successful, session ID:', newSessionId);
      setInitialized(true);
    } else {
      console.error('[McpTestPage] Session initialization failed.');
      setInitialized(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim()) {
      alert('Please enter a message to send.');
      return;
    }
    console.log(`[McpTestPage] Sending message: ${messageInput}`);
    // Construct your message payload according to MCP specs
    // This is a generic example; adjust method and params as needed.
    const payload = {
      method: 'echo', // Example method
      params: { content: messageInput },
      id: 'test-msg-' + Date.now()
    };
    try {
        const response = await sendMessage(payload);
        if (response) {
            console.log('[McpTestPage] Message sent, response:', response);
        } else {
            console.log('[McpTestPage] sendMessage did not return a response (or failed).');
        }
    } catch (e) {
        console.error('[McpTestPage] Error sending message:', e);
    }
    setMessageInput('');
  };

  useEffect(() => {
    // Automatically initialize session when component mounts and not yet initialized.
    // This is optional; you might want to trigger initialization via a user action.
    // if (!initialized && !mcpSessionId && currentServerId !== TEST_SERVER_ID) {
    //  handleInitialize();
    // }

    // Cleanup session on component unmount if it was initialized by this page
    // return () => {
    //   if (mcpSessionId && currentServerId === TEST_SERVER_ID) {
    //     console.log('[McpTestPage] Cleaning up session on unmount.');
    //     closeSession();
    //   }
    // };
  }, [initialized, mcpSessionId, currentServerId, closeSession]); // Removed handleInitialize from deps to avoid re-triggering

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>MCP Test Page</h1>
      
      <div>
        <p><strong>Status:</strong> <span style={{ color: status === 'connected' ? 'green' : (status === 'error' ? 'red' : 'orange')}}>{status}</span></p>
        {mcpSessionId && <p><strong>Session ID:</strong> {mcpSessionId}</p>}
        {currentServerId && <p><strong>Server ID:</strong> {currentServerId}</p>}
        {error && <p style={{ color: 'red' }}><strong>Error:</strong> {error}</p>}
      </div>

      {!mcpSessionId || status === 'disconnected' || status === 'error' ? (
        <button onClick={handleInitialize} disabled={status === 'connecting'}>
          {status === 'connecting' ? 'Initializing...' : 'Initialize Session with Test Server'}
        </button>
      ) : (
        <button onClick={closeSession}>Close Session</button>
      )}

      {status === 'connected' && mcpSessionId && (
        <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '10px' }}>
          <h2>Send Message</h2>
          <input 
            type="text" 
            value={messageInput} 
            onChange={(e) => setMessageInput(e.target.value)} 
            placeholder="Enter message (e.g., JSON string or simple text)"
            style={{ width: '300px', marginRight: '10px', padding: '8px' }}
          />
          <button onClick={handleSendMessage}>Send Echo Message</button>
        </div>
      )}

      {lastMessage && (
        <div style={{ marginTop: '20px', border: '1px solid #eee', padding: '10px', backgroundColor: '#f9f9f9' }}>
          <h2>Last Message Received (SSE or POST Response):</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(lastMessage, null, 2)}
          </pre>
        </div>
      )}
       <div style={{ marginTop: '20px', border: '1px solid #eee', padding: '10px', backgroundColor: '#f0f0f0' }}>
          <h2>Instructions:</h2>
          <p>1. Ensure your backend is running and accessible.</p>
          <p>2. Replace <code>TEST_SERVER_ID</code> in this file with a valid, registered server ID in your backend if needed.</p>
          <p>3. Click &quot;Initialize Session&quot; to start.</p>
          <p>4. Once connected, you can send a message (e.g., to an &lsquo;echo&rsquo; method if your test server supports it).</p>
          <p>5. Server-initiated messages or responses to your POSTs will appear under &quot;Last Message Received&quot;.</p>
          <p>6. Check the browser console for detailed logs from McpSessionContext and this page.</p>
      </div>
    </div>
  );
}
