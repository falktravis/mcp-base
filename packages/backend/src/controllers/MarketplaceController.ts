import { Request, Response } from 'express';
import { marketplaceService, MarketplaceService, MarketplaceItem } from '../services/MarketplaceService';
import { 
    ApiResponse,
    PaginatedResponse,
} from '../../../shared-types/src/api-contracts';

// Re-using a similar handler as in ManagementController for consistency
const handleServiceCall = async <T>(
    res: Response, 
    serviceCall: () => Promise<T>, 
    successStatusCode: number = 200,
    notFoundMessage: string = 'Resource not found'
): Promise<void> => {
    try {
        const result = await serviceCall();
        if (result === null || (Array.isArray(result) && result.length === 0 && successStatusCode !== 204)) {
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
        console.error('[MarketplaceController] Error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.message || 'An internal server error occurred.';
        const code = error.code || 'INTERNAL_SERVER_ERROR';
        res.status(statusCode).json({ success: false, error: { message, code } } as ApiResponse<null>);
    }
};

export class MarketplaceController {
    constructor(private service: MarketplaceService) {}

    async getAllItems(req: Request, res: Response): Promise<void> {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const type = req.query.type as MarketplaceItem['type'] | undefined;

        // The mock MarketplaceService might not support pagination or filtering yet.
        // Adjusting the call based on its actual signature.
        // For now, assume getAllItems in the service handles these or ignores them.
        await handleServiceCall<PaginatedResponse<MarketplaceItem>>(
            res,
            //() => this.service.getAllItems(page, limit, type) // If service supports these
            async () => { // Adapting to current mock service structure
                const allItems = await this.service.getAllItems();
                // Basic pagination for the mock
                const start = (page - 1) * limit;
                const end = start + limit;
                const paginatedItems = allItems.slice(start, end);
                return {
                    items: paginatedItems,
                    total: allItems.length,
                    page,
                    limit
                };
            }
        );
    }

    async getItemById(req: Request, res: Response): Promise<void> {
        const { itemId } = req.params;
        await handleServiceCall<MarketplaceItem | null>(
            res,
            () => this.service.getItemById(itemId),
            200,
            `Marketplace item with ID ${itemId} not found`
        );
    }

    async searchItems(req: Request, res: Response): Promise<void> {
        const query = req.query.q as string || '';
        
        // Corrected to call service.searchItems with only the query parameter
        await handleServiceCall<MarketplaceItem[]>( 
            res,
            () => this.service.searchItems(query)
        );
    }
}

// Instantiate the controller with the service
export const marketplaceController = new MarketplaceController(marketplaceService);
