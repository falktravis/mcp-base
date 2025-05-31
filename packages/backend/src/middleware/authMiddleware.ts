import { Request, Response, NextFunction } from 'express';
import { ApiKeyService } from '../services/ApiKeyService';
import { ApiKey } from '@shared-types/db-models'; // For the type of validated key
import { ApiResponse } from '@shared-types/api-contracts';

// It's good practice to instantiate services if they are designed as classes
// or ensure they are singletons if accessed directly.
// Assuming ApiKeyService is intended to be instantiated.
const apiKeyService = new ApiKeyService();

// Extend Express Request type to include apiKey property
declare global {
    namespace Express {
        interface Request {
            apiKey?: Omit<ApiKey, 'hashedApiKey' | 'salt'>;
        }
    }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        const response: ApiResponse<null> = {
            success: false,
            error: { message: 'Unauthorized: No token provided', code: 'UNAUTHORIZED' },
        };
        return res.status(401).json(response);
    }

    try {
        const validatedKey = await apiKeyService.validateApiKey(token);

        if (validatedKey) {
            req.apiKey = validatedKey; // Attach validated key info to the request object
            next(); // Token is valid, proceed to the next middleware or route handler
        } else {
            const response: ApiResponse<null> = {
                success: false,
                error: { message: 'Unauthorized: Invalid or expired token', code: 'UNAUTHORIZED' },
            };
            return res.status(401).json(response);
        }
    } catch (error) {
        console.error('[authMiddleware] Error during token validation:', error);
        const response: ApiResponse<null> = {
            success: false,
            error: { message: 'Internal Server Error during authentication', code: 'INTERNAL_SERVER_ERROR' },
        };
        return res.status(500).json(response);
    }
};
