import { Request, Response } from 'express';
import { ManagedServerService } from '../services/ManagedServerService';
import { ApiKeyService } from '../services/ApiKeyService'; // Corrected: Import class directly
import { 
    RegisterServerRequest, 
    UpdateServerConfigRequest,
    CreateApiKeyRequest,
    ApiResponse,
    ManagedMcpServerDetails,
    PaginatedResponse,
    ApiKeyDetails,
    CreateApiKeyResponse,
    ServerStatusResponse,
    ServerStatus
} from '@shared-types/api-contracts'; // Corrected import path
import { ApiKey } from '@shared-types/db-models'; // For mapping ApiKeyService response

const handleServiceCall = async <T>(
    res: Response, 
    serviceCall: () => Promise<T>, 
    successStatusCode: number = 200,
    notFoundMessage: string = 'Resource not found'
): Promise<void> => {
    try {
        const result = await serviceCall();
        if (result === null || (Array.isArray(result) && result.length === 0 && successStatusCode !== 204)) { // 204 can have empty body
            // For single resource GETs that return null, it's a 404
            // For list operations that return empty, it's usually a 200 with an empty array
            if (successStatusCode === 200 && result === null) {
                 res.status(404).json({ success: false, error: { message: notFoundMessage } } as ApiResponse<null>);
                 return;
            }
        }
        if (successStatusCode === 204) {
            res.status(successStatusCode).send();
        } else {
            res.status(successStatusCode).json({ success: true, data: result } as ApiResponse<T>);
        }
    } catch (error: any) {
        console.error('[ManagementController] Error:', error);
        // Basic error handling, can be expanded
        const statusCode = error.statusCode || 500;
        const message = error.message || 'An internal server error occurred.';
        const code = error.code || 'INTERNAL_SERVER_ERROR';
        res.status(statusCode).json({ success: false, error: { message, code } } as ApiResponse<null>);
    }
};

export class ManagementController {
    constructor(
        private msService: ManagedServerService, // Renamed for clarity
        private akService: ApiKeyService // Renamed for clarity
    ) {}

    // --- Server Management ---

    async registerServer(req: Request, res: Response): Promise<void> {
        await handleServiceCall<ManagedMcpServerDetails>(
            res,
            () => this.msService.registerServer(req.body as RegisterServerRequest),
            201 // HTTP 201 Created
        );
    }

    async getAllServers(req: Request, res: Response): Promise<void> {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const status = req.query.status as ServerStatus | undefined;
        await handleServiceCall<PaginatedResponse<ManagedMcpServerDetails>>(
            res,
            () => this.msService.getAllServers(page, limit, status)
        );
    }

    async getServerById(req: Request, res: Response): Promise<void> {
        const { serverId } = req.params;
        await handleServiceCall<ManagedMcpServerDetails | null>(
            res,
            () => this.msService.getServerById(serverId),
            200,
            `Server with ID ${serverId} not found`
        );
    }

    async updateServerConfig(req: Request, res: Response): Promise<void> {
        const { serverId } = req.params;
        await handleServiceCall<ManagedMcpServerDetails | null>(
            res,
            () => this.msService.updateServerConfig(serverId, req.body as UpdateServerConfigRequest),
            200,
            `Server with ID ${serverId} not found during update`
        );
    }

    async deleteServer(req: Request, res: Response): Promise<void> {
        const { serverId } = req.params;
        await handleServiceCall<boolean>(
            res,
            async () => {
                const success = await this.msService.deleteServer(serverId);
                if (!success) {
                    const error: any = new Error(`Server with ID ${serverId} not found or could not be deleted.`);
                    error.statusCode = 404;
                    error.code = 'NOT_FOUND';
                    throw error;
                }
                return success;
            },
            204 // HTTP 204 No Content
        );
    }

    async startServer(req: Request, res: Response): Promise<void> {
        const { serverId } = req.params;
        await handleServiceCall<void>(
            res,
            () => this.msService.startServer(serverId),
            202, // HTTP 202 Accepted (long-running operation)
            `Server with ID ${serverId} not found or could not be started`
        );
    }

    async stopServer(req: Request, res: Response): Promise<void> {
        const { serverId } = req.params;
        await handleServiceCall<void>(
            res,
            () => this.msService.stopServer(serverId),
            202, // HTTP 202 Accepted
            `Server with ID ${serverId} not found or could not be stopped`
        );
    }

    async getServerStatus(req: Request, res: Response): Promise<void> {
        const { serverId } = req.params;
        await handleServiceCall<ServerStatusResponse | null>(
            res,
            () => this.msService.getServerStatus(serverId),
            200,
            `Status for server ID ${serverId} not found`
        );
    }

    // --- API Key Management ---

    async createApiKey(req: Request, res: Response): Promise<void> {
        const { name, expiresAt } = req.body as CreateApiKeyRequest; // Removed scopes from destructuring
        await handleServiceCall<CreateApiKeyResponse>(
            res,
            async () => {
                // Passing undefined for scopes as it's not in CreateApiKeyRequest yet
                const result = await this.akService.createApiKey(name, expiresAt ? new Date(expiresAt) : undefined, undefined);
                if (!result) {
                    throw new Error('Failed to create API key.');
                }
                // Map ApiKeyService response to CreateApiKeyResponse
                const { apiKeyRecord, rawKey } = result;
                return {
                    id: apiKeyRecord.id,
                    name: apiKeyRecord.name,
                    key: rawKey, // This is the raw key to be shown to the user once
                    createdAt: apiKeyRecord.createdAt.toISOString(),
                    expiresAt: apiKeyRecord.expiresAt ? new Date(apiKeyRecord.expiresAt).toISOString() : undefined,
                    // scopes: apiKeyRecord.scopes, // Assuming scopes are part of ApiKeyDetails/CreateApiKeyResponse if needed
                };
            },
            201 // HTTP 201 Created
        );
    }

    async listApiKeys(req: Request, res: Response): Promise<void> {
        await handleServiceCall<ApiKeyDetails[]>( 
            res,
            async () => {
                const keys = await this.akService.getAllApiKeys(); // Corrected method name
                // Map Omit<ApiKey, 'hashedApiKey' | 'salt'>[] to ApiKeyDetails[]
                return keys.map(k => ({
                    id: k.id,
                    name: k.name,
                    createdAt: k.createdAt.toISOString(),
                    expiresAt: k.expiresAt ? new Date(k.expiresAt).toISOString() : undefined,
                    lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : undefined,
                    // scopes: k.scopes, // Ensure ApiKeyDetails includes scopes if needed
                }));
            }
        );
    }
    
    async getApiKeyDetails(req: Request, res: Response): Promise<void> {
        const { apiKeyId } = req.params;
         await handleServiceCall<ApiKeyDetails | null>(
            res,
            async () => {
                const key = await this.akService.getApiKeyMetadata(apiKeyId); // Corrected method name
                if (!key) return null;
                return {
                    id: key.id,
                    name: key.name,
                    createdAt: key.createdAt.toISOString(),
                    expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : undefined,
                    lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt).toISOString() : undefined,
                    // scopes: key.scopes, // Ensure ApiKeyDetails includes scopes if needed
                };
            },
            200,
            `API Key with ID ${apiKeyId} not found`
        );
    }

    async revokeApiKey(req: Request, res: Response): Promise<void> {
        const { apiKeyId } = req.params;
        await handleServiceCall<boolean>(
            res,
            async () => {
                const success = await this.akService.revokeApiKey(apiKeyId);
                 if (!success) {
                    const error: any = new Error(`API Key with ID ${apiKeyId} not found or could not be revoked.`);
                    error.statusCode = 404;
                    error.code = 'NOT_FOUND';
                    throw error;
                }
                return success;
            },
            204 // HTTP 204 No Content
        );
    }
}
