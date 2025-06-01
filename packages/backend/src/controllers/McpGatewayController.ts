import type { Request, Response } from 'express'; // Use import type
import { v4 as uuidv4 } from 'uuid';
import { CentralGatewayMCPService } from '../services/CentralGatewayMCPService';
// McpResponsePayload is not directly used here, JsonRpcResponse is constructed from its parts.
import { McpRequestPayload, McpErrorCode /*, isMcpRequest */ } from 'shared-types/api-contracts';

// Basic type guard for McpRequestPayload (can be refined in shared-types later)
function isMcpRequest(payload: any): payload is McpRequestPayload {
  return payload && typeof payload.mcp_version === 'string' && typeof payload.request_id === 'string' && typeof payload.method === 'string';
}

// Define a simple interface for JSON-RPC responses for clarity within the controller
interface JsonRpcErrorObject {
    code: number; // Should align with McpErrorCode or standard JSON-RPC codes
    message: string;
    data?: any;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: any;
    error?: JsonRpcErrorObject;
}

// New internal data structures for session and stream management
interface ActiveSseStream {
  res: Response;
  serverId: string;
  mcpSessionId: string;
  type: 'POST_RESPONSE_STREAM' | 'GET_BACKGROUND_STREAM';
  createdAt: number;
}

interface McpSession {
  serverId: string;
  backgroundStreamConnectionUuid?: string; // connectionUuid of the GET_BACKGROUND_STREAM
  activePostResponseStreamConnectionUuids: Set<string>; // connectionUuids of POST_RESPONSE_STREAMs
  createdAt: number;
  // Potentially add lastActivityAt for idle session cleanup
}

// Type for the SSE callback function that CentralGatewayMCPService will use
// Returns the number of client sessions the message was successfully sent to.
export type SseSendDelegate = (serverId: string, message: any, targetMcpSessionId?: string) => number;

export class McpGatewayController {
    private activeSseStreams: Map<string, ActiveSseStream> = new Map(); // Key: connectionUuid
    private mcpSessions: Map<string, McpSession> = new Map(); // Key: mcpSessionId

    constructor(private gatewayService: CentralGatewayMCPService) {
        // The actual method reference will be passed from CentralGatewayMCPService
        // this.gatewayService.setSseSendCallback(this.forwardMessageToClientSession.bind(this));
    }

    /**
     * Forwards a message to client SSE streams.
     * If targetMcpSessionId is provided, sends only to that session's background stream.
     * If targetMcpSessionId is not provided, broadcasts to all background streams for the given serverId.
     * @param serverId The ID of the server originating the message.
     * @param message The message payload to send.
     * @param targetMcpSessionId Optional. If specified, only sends to this session.
     * @returns The number of streams the message was successfully written to.
     */
    public forwardMessageToClientSession(serverId: string, message: any, targetMcpSessionId?: string): number {
        console.log(`[McpGatewayController] forwardMessageToClientSession called for serverId: ${serverId}, targetMcpSessionId: ${targetMcpSessionId || 'ALL'}.`);
        let streamsWrittenTo = 0;

        if (targetMcpSessionId) {
            const session = this.mcpSessions.get(targetMcpSessionId);
            if (session && session.serverId === serverId && session.backgroundStreamConnectionUuid) {
                const streamInfo = this.activeSseStreams.get(session.backgroundStreamConnectionUuid);
                if (streamInfo && streamInfo.res.writable) {
                    try {
                        streamInfo.res.write(`data: ${JSON.stringify(message)}\n\n`);
                        console.log(`[McpGatewayController] Forwarded message to specific background stream ${session.backgroundStreamConnectionUuid} for mcpSessionId ${targetMcpSessionId}`);
                        streamsWrittenTo++;
                    } catch (error) {
                        console.error(`[McpGatewayController] Error writing to background stream ${session.backgroundStreamConnectionUuid}:`, error);
                        this._cleanupSseStream(session.backgroundStreamConnectionUuid);
                    }
                }
            } else if (session && session.serverId !== serverId) {
                 console.warn(`[McpGatewayController] Session ${targetMcpSessionId} found, but belongs to server ${session.serverId}, not ${serverId}.`);
            }
        } else {
            // Broadcast to all relevant sessions for the serverId
            this.mcpSessions.forEach((session, mcpSessionId) => {
                if (session.serverId === serverId && session.backgroundStreamConnectionUuid) {
                    const streamInfo = this.activeSseStreams.get(session.backgroundStreamConnectionUuid);
                    if (streamInfo && streamInfo.res.writable) {
                        try {
                            streamInfo.res.write(`data: ${JSON.stringify(message)}\n\n`);
                            console.log(`[McpGatewayController] Broadcasted message to background stream ${session.backgroundStreamConnectionUuid} for mcpSessionId ${mcpSessionId}`);
                            streamsWrittenTo++;
                        } catch (error) {
                            console.error(`[McpGatewayController] Error broadcasting to background stream ${session.backgroundStreamConnectionUuid}:`, error);
                            this._cleanupSseStream(session.backgroundStreamConnectionUuid);
                        }
                    }
                }
            });
        }
        
        if (streamsWrittenTo === 0) {
             console.warn(`[McpGatewayController] No suitable background stream(s) found to forward message for serverId: ${serverId}` + (targetMcpSessionId ? ` (target: ${targetMcpSessionId})` : ' (broadcast)') );
        }
        return streamsWrittenTo;
    }

    public async handleMcpEndpoint(req: Request, res: Response): Promise<void> {
        const serverId = req.params.serverId;
        if (!serverId) {
            res.status(400).json({ error: 'serverId path parameter is required' });
            return;
        }

        if (req.method === 'POST') {
            await this._handlePostRequest(req, res, serverId);
        } else if (req.method === 'GET') {
            await this._handleGetRequest(req, res, serverId);
        } else if (req.method === 'DELETE') {
            await this._handleDeleteSession(req, res, serverId);
        } else {
            res.setHeader('Allow', 'POST, GET, DELETE');
            res.status(405).json({ error: 'Method Not Allowed' });
        }
    }

    private _validateMcpSessionId(mcpSessionId: string | undefined | null, allowMissingOnInitialize: boolean = false): { isValid: boolean; error?: string; mcpSessionId?: string } {
        if (!mcpSessionId) {
            if (allowMissingOnInitialize) return { isValid: true };
            return { isValid: false, error: 'Mcp-Session-Id header is required.' };
        }
        if (typeof mcpSessionId !== 'string' || !/^[\x21-\x7E]+$/.test(mcpSessionId)) {
            return { isValid: false, error: 'Invalid Mcp-Session-Id format.' };
        }
        return { isValid: true, mcpSessionId: mcpSessionId };
    }

    private _cleanupSseStream(connectionUuid: string): void {
        const streamInfo = this.activeSseStreams.get(connectionUuid);
        if (streamInfo) {
            if (streamInfo.res.writable && !streamInfo.res.writableEnded) {
                streamInfo.res.end();
            }
            this.activeSseStreams.delete(connectionUuid);
            const mcpSession = this.mcpSessions.get(streamInfo.mcpSessionId);
            if (mcpSession) {
                if (mcpSession.backgroundStreamConnectionUuid === connectionUuid) {
                    mcpSession.backgroundStreamConnectionUuid = undefined;
                }
                mcpSession.activePostResponseStreamConnectionUuids.delete(connectionUuid);
            }
            console.log(`[McpGatewayController] Cleaned up SSE stream ${connectionUuid}. Active streams: ${this.activeSseStreams.size}`);
        }
    }
    
    private async _handlePostRequest(req: Request, res: Response, serverId: string): Promise<void> {
        console.log(`[McpGatewayController] _handlePostRequest for serverId: ${serverId}`);
        const mcpSessionIdFromHeader = req.headers['mcp-session-id'] as string | undefined;

        const payloadAnalysis = analyzeJsonRpcPayload(req.body);

        if (payloadAnalysis.isOnlyNotificationsOrResponses) {
            const validation = this._validateMcpSessionId(mcpSessionIdFromHeader);
            if (!validation.isValid || !validation.mcpSessionId) { // Ensure mcpSessionId is present after validation
                res.status(400).json({ error: validation.error || 'Mcp-Session-Id is required and was not validated.' });
                return;
            }
            const session = this.mcpSessions.get(validation.mcpSessionId);
            if (!session || session.serverId !== serverId) {
                res.status(404).json({ error: 'MCP session not found or not valid for this serverId.' });
                return;
            }
            
            await this.gatewayService.handleMcpRequest({
                params: { serverId },
                body: req.body,
                headers: req.headers as Record<string, string>,
                ip: req.ip,
            }, req.ip, validation.mcpSessionId);
            res.status(202).send();
            return;
        }

        if (payloadAnalysis.hasRequests) {
            let effectiveMcpSessionId: string;
            let isNewSession = false;

            if (payloadAnalysis.isInitializeRequest) {
                const validation = this._validateMcpSessionId(mcpSessionIdFromHeader, true);
                if (!validation.isValid) {
                    res.status(400).json({ error: validation.error });
                    return;
                }
                if (validation.mcpSessionId && this.mcpSessions.has(validation.mcpSessionId)) {
                    console.warn(`[McpGatewayController] InitializeRequest received with existing Mcp-Session-Id '${validation.mcpSessionId}'. A new session will be created, ignoring the provided one for InitializeRequest as per typical new session semantics.`);
                    effectiveMcpSessionId = uuidv4(); 
                } else if (validation.mcpSessionId) {
                    effectiveMcpSessionId = validation.mcpSessionId;
                } else {
                    effectiveMcpSessionId = uuidv4();
                }
                isNewSession = true;
            } else {
                const validation = this._validateMcpSessionId(mcpSessionIdFromHeader);
                if (!validation.isValid || !validation.mcpSessionId) {
                    res.status(400).json({ error: validation.error || 'Mcp-Session-Id is required and was not validated for non-initialize request.' });
                    return;
                }
                const session = this.mcpSessions.get(validation.mcpSessionId);
                if (!session || session.serverId !== serverId) {
                    res.status(404).json({ error: 'MCP session not found or not valid for this serverId. Send InitializeRequest first.' });
                    return;
                }
                effectiveMcpSessionId = validation.mcpSessionId;
            }

            if (isNewSession) {
                // If a session with this ID already exists (e.g. client retrying Initialize with same new ID before server confirmed old one)
                // we might want to clean up the old one first, or the Map will just overwrite.
                // For now, simple overwrite is fine.
                this.mcpSessions.set(effectiveMcpSessionId, {
                    serverId: serverId,
                    activePostResponseStreamConnectionUuids: new Set(),
                    createdAt: Date.now()
                });
                console.log(`[McpGatewayController] New MCP session ${effectiveMcpSessionId} created/updated for server ${serverId}.`);
            }

            const connectionUuid = uuidv4();
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            if (isNewSession) {
                res.setHeader('Mcp-Session-Id', effectiveMcpSessionId);
            }
            res.flushHeaders();

            const mcpSession = this.mcpSessions.get(effectiveMcpSessionId)!; // Should exist due to logic above
            mcpSession.activePostResponseStreamConnectionUuids.add(connectionUuid);
            this.activeSseStreams.set(connectionUuid, {
                res,
                serverId,
                mcpSessionId: effectiveMcpSessionId,
                type: 'POST_RESPONSE_STREAM',
                createdAt: Date.now()
            });

            req.on('close', () => {
                console.log(`[McpGatewayController] POST_RESPONSE_STREAM ${connectionUuid} for session ${effectiveMcpSessionId} closed by client.`);
                this._cleanupSseStream(connectionUuid);
            });

            try {
                for (const mcpRequest of payloadAnalysis.requests) {
                    const jsonRpcResponse: JsonRpcResponse = await this.gatewayService.handleMcpRequest({
                        params: { serverId },
                        body: mcpRequest,
                        headers: req.headers as Record<string, string>,
                        ip: req.ip,
                    }, req.ip, effectiveMcpSessionId);

                    if (res.writable && !res.writableEnded) {
                        res.write(`data: ${JSON.stringify(jsonRpcResponse)}\n\n`);
                    } else {
                        console.warn(`[McpGatewayController] POST_RESPONSE_STREAM ${connectionUuid} for session ${effectiveMcpSessionId} no longer writable. Aborting further responses.`);
                        break;
                    }
                }
            } catch (error: any) {
                console.error(`[McpGatewayController] Error processing requests in POST_RESPONSE_STREAM ${connectionUuid} for session ${effectiveMcpSessionId}:`, error);
                if (res.writable && !res.writableEnded) {
                    const errorResponse: JsonRpcResponse = {
                        jsonrpc: '2.0',
                        id: null, 
                        error: { code: McpErrorCode.INTERNAL_ERROR, message: error.message || 'Error processing batch request in POST stream' }
                    };
                    res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
                }
            } finally {
                if (res.writable && !res.writableEnded) {
                    res.end();
                }
            }
            return;
        }

        console.warn('[McpGatewayController] POST request payload was not clearly requests or only notifications/responses.', req.body);
        res.status(400).json({ error: 'Invalid MCP payload structure in POST request.' });
    }

    private async _handleGetRequest(req: Request, res: Response, serverId: string): Promise<void> {
        console.log(`[McpGatewayController] _handleGetRequest for serverId: ${serverId}`);
        
        // Attempt to get Mcp-Session-Id from header first, then from query parameter
        let mcpSessionIdFromHeader = req.headers['mcp-session-id'] as string | undefined;
        let mcpSessionIdFromQuery = req.query.mcpSessionId as string | undefined;

        let effectiveMcpSessionId = mcpSessionIdFromHeader || mcpSessionIdFromQuery;

        if (mcpSessionIdFromHeader && mcpSessionIdFromQuery && mcpSessionIdFromHeader !== mcpSessionIdFromQuery) {
            console.warn(`[McpGatewayController] Mcp-Session-Id provided in both header (${mcpSessionIdFromHeader}) and query (${mcpSessionIdFromQuery}). Prioritizing header.`);
            effectiveMcpSessionId = mcpSessionIdFromHeader; // Prioritize header if both are present and different
        }

        console.log(`[McpGatewayController] Effective Mcp-Session-Id for GET request: ${effectiveMcpSessionId}`);

        // 1. Verify Accept header
        const acceptHeader = req.headers.accept;
        if (!acceptHeader || !acceptHeader.includes('text/event-stream')) {
            res.status(406).json({ error: 'Accept header must include text/event-stream.' });
            return;
        }

        // 2. Validate Mcp-Session-Id
        const sessionValidation = this._validateMcpSessionId(effectiveMcpSessionId); // Use effectiveMcpSessionId
        if (!sessionValidation.isValid || !sessionValidation.mcpSessionId) {
            res.status(400).json({ 
                error: sessionValidation.error || 'Mcp-Session-Id is required (from header or query parameter) and invalid.',
                details: `Received from header: ${mcpSessionIdFromHeader}, from query: ${mcpSessionIdFromQuery}`
            });
            return;
        }

        const mcpSessionId = sessionValidation.mcpSessionId; // This is now the validated effectiveMcpSessionId
        const session = this.mcpSessions.get(mcpSessionId);

        if (!session || session.serverId !== serverId) {
            res.status(404).json({ error: `MCP session ${mcpSessionId} not found or not valid for server ${serverId}.` });
            return;
        }

        // 3. Generate connectionUuid and set response headers
        const connectionUuid = uuidv4();
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust CORS as needed
        res.flushHeaders(); // Send headers immediately

        // 4. Register the stream
        // If a background stream already exists for this session, clean it up first.
        if (session.backgroundStreamConnectionUuid) {
            console.log(`[McpGatewayController] Replacing existing background stream ${session.backgroundStreamConnectionUuid} for session ${mcpSessionId}`);
            this._cleanupSseStream(session.backgroundStreamConnectionUuid);
        }

        this.activeSseStreams.set(connectionUuid, {
            res,
            serverId,
            mcpSessionId,
            type: 'GET_BACKGROUND_STREAM',
            createdAt: Date.now(),
        });
        session.backgroundStreamConnectionUuid = connectionUuid;
        console.log(`[McpGatewayController] New GET_BACKGROUND_STREAM ${connectionUuid} established for session ${mcpSessionId}. Total active streams: ${this.activeSseStreams.size}`);

        // 5. Handle client close
        req.on('close', () => {
            console.log(`[McpGatewayController] GET_BACKGROUND_STREAM ${connectionUuid} for session ${mcpSessionId} closed by client.`);
            // Only clear the session's backgroundStreamConnectionUuid if it still points to this connection.
            // This handles cases where a new GET request might have already replaced it.
            const currentSession = this.mcpSessions.get(mcpSessionId);
            if (currentSession && currentSession.backgroundStreamConnectionUuid === connectionUuid) {
                currentSession.backgroundStreamConnectionUuid = undefined;
                console.log(`[McpGatewayController] Cleared backgroundStreamConnectionUuid for session ${mcpSessionId}.`);
            }
            this._cleanupSseStream(connectionUuid); // General cleanup for this stream
        });

        // 6. Send initial SSE comment and start keep-alive
        res.write(': background stream open\n\n');

        const keepAliveInterval = setInterval(() => {
            if (res.writableEnded) {
                clearInterval(keepAliveInterval);
                // Cleanup is handled by req.on('close') mostly, but this ensures interval stops if stream ends unexpectedly server-side
                console.log(`[McpGatewayController] GET_BACKGROUND_STREAM ${connectionUuid} (session ${mcpSessionId}) keep-alive found stream ended. Interval cleared.`);
                // No need to call _cleanupSseStream here as it would have been called or will be by 'close' event.
                return;
            }
            res.write(': keepalive\n\n');
        }, 25000); // Send keep-alive every 25 seconds

        // Ensure keepAliveInterval is also cleared if the stream is cleaned up for other reasons
        // (e.g. a new GET request replacing this one)
        // We can augment _cleanupSseStream or handle it here. For now, _cleanupSseStream ends the response,
        // which should trigger writableEnded and stop the interval.
    }

    private async _handleDeleteSession(req: Request, res: Response, serverId: string): Promise<void> {
        console.log(`[McpGatewayController] _handleDeleteSession for serverId: ${serverId}`);
        // Implementation will follow in Phase 4.
        res.status(501).json({ message: '_handleDeleteSession not implemented' });
    }
}

function analyzeJsonRpcPayload(body: any): { hasRequests: boolean; isOnlyNotificationsOrResponses: boolean; isInitializeRequest: boolean; requests: McpRequestPayload[] } {
    const requests: McpRequestPayload[] = [];
    let hasRequests = false;
    let hasNotifications = false;
    let hasResponses = false;
    let isInitializeRequest = false;

    const processMessage = (msg: any) => {
        if (msg && typeof msg === 'object') {
            if (isMcpRequest(msg)) {
                requests.push(msg);
                hasRequests = true;
                if (msg.method === 'initialize') {
                    isInitializeRequest = true;
                }
            } else if (msg.method && !msg.id) {
                hasNotifications = true;
            } else if (msg.result || msg.error) {
                hasResponses = true;
            }
        }
    };

    if (Array.isArray(body)) {
        body.forEach(processMessage);
    } else {
        processMessage(body);
    }

    return {
        hasRequests,
        isOnlyNotificationsOrResponses: !hasRequests && (hasNotifications || hasResponses),
        isInitializeRequest,
        requests
    };
}
