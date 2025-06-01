'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface McpMessage {
  // Define the structure of messages received from or sent to MCP server
  // This will likely align with JsonRpcResponse/JsonRpcNotification from backend
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: unknown; // Changed from any
  result?: unknown; // Changed from any
  error?: {
    code: number;
    message: string;
    data?: unknown; // Changed from any
  };
}

interface McpSessionContextType {
  mcpSessionId: string | null;
  currentServerId: string | null;
  status: McpConnectionStatus;
  error: string | null;
  lastMessage: McpMessage | null;
  initializeSession: (serverId: string, initialMessage?: Omit<McpMessage, 'jsonrpc' | 'id'> & { id?: string | number }) => Promise<string | null>; // Changed any to specific type
  closeSession: () => void;
  sendMessage: (message: Omit<McpMessage, 'jsonrpc' | 'id'> & { id?: string | number }) => Promise<McpMessage | null>; // For sending POST requests
  // subscribeToMessages: (callback: (message: McpMessage) => void) => () => void; // For SSE messages
}

const McpSessionContext = createContext<McpSessionContextType | undefined>(undefined);

interface McpSessionProviderProps {
  children: ReactNode;
}

export const McpSessionProvider: React.FC<McpSessionProviderProps> = ({ children }) => {
  const [mcpSessionId, setMcpSessionId] = useState<string | null>(null);
  const [currentServerId, setCurrentServerId] = useState<string | null>(null);
  const [status, setStatus] = useState<McpConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<McpMessage | null>(null);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [messageListeners, setMessageListeners] = useState<Array<(message: McpMessage) => void>>([]);


  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/mcp'; // Ensure this is configured

  // Cleanup SSE connection
  const cleanupEventSource = useCallback(() => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
      console.log('[McpSessionContext] SSE connection closed.');
    }
  }, [eventSource]);

  // Define closeSession first as it's a dependency for initializeSession
  const closeSession = useCallback(() => {
    console.log('[McpSessionContext] Closing session...');
    cleanupEventSource();
    setMcpSessionId(null);
    setCurrentServerId(null);
    setStatus('disconnected');
    setError(null);
    setLastMessage(null);
  }, [cleanupEventSource]);

  useEffect(() => {
    return () => {
      cleanupEventSource(); // General cleanup on unmount
    };
  }, [cleanupEventSource]);

  const initializeSession = useCallback(async (serverId: string, initialPayload?: Omit<McpMessage, 'jsonrpc' | 'id'> & { id?: string | number }) => {
    if (status === 'connected' || status === 'connecting') {
      console.warn('[McpSessionContext] Session initialization attempted while already connected/connecting.');
      if (currentServerId === serverId && mcpSessionId) return mcpSessionId; // Already connected to this server
      closeSession(); // Now closeSession is defined and in scope
    }

    setStatus('connecting');
    setCurrentServerId(serverId);
    setError(null);
    console.log(`[McpSessionContext] Initializing session with server: ${serverId}`);

    const initializeRequestMessage = {
        jsonrpc: '2.0',
        id: initialPayload?.id || 'init-' + Date.now(),
        method: initialPayload?.method || 'initialize', // Default to 'initialize'
        params: initialPayload?.params || { capabilities: {} } // Default params
    };

    try {
      const response = await fetch(`${API_BASE_URL}/${serverId}/mcp`, { // Ensure /mcp is part of the path
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(initializeRequestMessage),
      });

      const newMcpSessionId = response.headers.get('Mcp-Session-Id');
      if (!response.ok || !newMcpSessionId) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to initialize session' }));
        throw new Error((errorData as {message?: string}).message || `Server responded with ${response.status}`);
      }
      
      setMcpSessionId(newMcpSessionId);
      console.log(`[McpSessionContext] Session initialized. Mcp-Session-Id: ${newMcpSessionId}`);
      
      setStatus('connected'); // Tentatively set to connected, GET SSE will confirm.

      // Automatically establish the GET SSE connection
      if (newMcpSessionId && serverId) {
        cleanupEventSource(); // Close any existing SSE connection

        console.log(`[McpSessionContext] Establishing GET SSE connection for session ${newMcpSessionId} with server ${serverId}`);
        const sseUrl = `${API_BASE_URL}/${serverId}/mcp?mcpSessionId=${encodeURIComponent(newMcpSessionId)}`; // Ensure /mcp is part of the path
        const newEs = new EventSource(sseUrl, { withCredentials: true }); // withCredentials might be needed for cookies if used

        newEs.onopen = () => {
          console.log(`[McpSessionContext] SSE connection opened for session ${newMcpSessionId} with server ${serverId}.`);
          setStatus('connected');
          setError(null);
        };

        newEs.onmessage = (event) => {
          try {
            const messageData = JSON.parse(event.data) as McpMessage;
            console.log('[McpSessionContext] SSE message received:', messageData);
            setLastMessage(messageData);
            messageListeners.forEach(listener => listener(messageData));
          } catch (e) {
            console.error('[McpSessionContext] Error parsing SSE message:', e);
          }
        };

        newEs.onerror = (err) => {
          console.error('[McpSessionContext] SSE connection error:', err);
          setStatus('error');
          // Type assertion because 'err' is a generic Event, but error events have more specific properties.
          const errorEvent = err as Event & { message?: string }; // More specific type for error event
          setError(errorEvent.message || 'SSE connection failed. Check console for details.');
          newEs.close(); // Close on error
          setEventSource(null);
          // Implement retry logic if necessary
        };
        setEventSource(newEs);
      }
      return newMcpSessionId;

    } catch (e: unknown) { // Changed from any
      console.error('[McpSessionContext] Error initializing session:', e);
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to initialize session.'); // Better error message handling
      setMcpSessionId(null);
      setCurrentServerId(null);
      cleanupEventSource();
      return null;
    }
  }, [status, currentServerId, mcpSessionId, cleanupEventSource, API_BASE_URL, messageListeners, closeSession]); // Added closeSession to dependency array

  const sendMessage = useCallback(async (messageBody: Omit<McpMessage, 'jsonrpc' | 'id'> & { id?: string | number }) => {
    if (!mcpSessionId || !currentServerId || status !== 'connected') {
      console.error('[McpSessionContext] Cannot send message: session not active or not connected.');
      setError('Session not active. Initialize a session first.');
      return null;
    }

    const requestMessage: McpMessage = {
      jsonrpc: '2.0',
      id: messageBody.id || 'msg-' + Date.now(),
      ...messageBody,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/${currentServerId}/mcp`, { // Ensure /mcp is part of the path
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Mcp-Session-Id': mcpSessionId,
        },
        body: JSON.stringify(requestMessage),
      });

      if (!response.ok) {
        // Try to parse error from body
        const errorData = await response.json().catch(() => ({ message: 'Failed to send message' }));
        throw new Error((errorData as {error?: {message?: string}, message?: string}).error?.message || (errorData as {message?: string}).message || `Server responded with ${response.status}`);
      }
      
      // If the POST response is streamed (SSE-like), we need to handle it.
      // For now, assuming it returns a single JSON response or the first event of a stream.
      // This part needs to align with how McpGatewayController handles POST responses.
      // If it's a true SSE stream for POST, this fetch needs to be handled differently (e.g. reading line by line).
      // For simplicity, let's assume it might return a single JSON response for non-initialize POSTs,
      // or the first message of a stream which we capture.
      // The primary channel for server-to-client messages is the GET SSE stream.

      const responseData = await response.json() as McpMessage; // Assuming single JSON response for now
      console.log('[McpSessionContext] Message sent, response received:', responseData);
      setLastMessage(responseData); // Update last message with the direct response to this POST
      return responseData;

    } catch (e: unknown) { // Changed from any
      console.error('[McpSessionContext] Error sending message:', e);
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to send message.'); // Better error message handling
      return null;
    }
  }, [mcpSessionId, currentServerId, status, API_BASE_URL]);
  
  // const subscribeToMessages = useCallback((callback: (message: McpMessage) => void) => {
  //   setMessageListeners(prev => [...prev, callback]);
  //   return () => {
  //     setMessageListeners(prev => prev.filter(cb => cb !== callback));
  //   };
  // }, []);


  return (
    <McpSessionContext.Provider value={{ 
        mcpSessionId, 
        currentServerId, 
        status, 
        error, 
        lastMessage, 
        initializeSession, 
        closeSession, 
        sendMessage,
        // subscribeToMessages 
    }}>
      {children}
    </McpSessionContext.Provider>
  );
};

export const useMcpSession = (): McpSessionContextType => {
  const context = useContext(McpSessionContext);
  if (context === undefined) {
    throw new Error('useMcpSession must be used within an McpSessionProvider');
  }
  return context;
};
