import { Request, Response } from 'express';
import { trafficMonitoringService, TrafficMonitoringService } from '../services/TrafficMonitoringService';
import { ApiResponse, TrafficStatsResponse } from '../../../shared-types/src/api-contracts';

const handleServiceCall = async <T>(
    res: Response, 
    serviceCall: () => Promise<T>, 
    successStatusCode: number = 200,
    notFoundMessage: string = 'Resource not found'
): Promise<void> => {
    try {
        const result = await serviceCall();
        // Handle cases where result might be null or an empty array for non-204 success codes
        if (result === null || (Array.isArray(result) && result.length === 0 && successStatusCode !== 204)) {
            if (successStatusCode === 200 && result === null) { // Specifically for single resource fetch
                 res.status(404).json({ success: false, error: { message: notFoundMessage } } as ApiResponse<null>);
                 return;
            }
            // For list operations that return empty, it's still a success, just with no data.
            // This part of the condition might need adjustment based on desired behavior for empty lists.
        }

        if (successStatusCode === 204) {
            res.status(successStatusCode).send();
        } else {
            res.status(successStatusCode).json({ success: true, data: result } as ApiResponse<T>);
        }
    } catch (error: any) {
        console.error('[TrafficController] Error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.message || 'An internal server error occurred.';
        const code = error.code || 'INTERNAL_SERVER_ERROR';
        res.status(statusCode).json({ success: false, error: { message, code } } as ApiResponse<null>);
    }
};

export class TrafficController {
    constructor(private service: TrafficMonitoringService) {}

    async getTrafficStats(req: Request, res: Response): Promise<void> {
        const serverId = req.query.serverId as string | undefined;
        const period = req.query.period as string || '1h'; // e.g., "1h", "24h", "7d"

        // Convert period to startDate and endDate
        // This is a simplified conversion. A robust solution would use a date library.
        let startDate: Date | undefined;
        const endDate = new Date();

        switch (period) {
            case '1h':
                startDate = new Date(endDate.getTime() - 60 * 60 * 1000);
                break;
            case '24h':
                startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            // Default to 1 hour if period is unrecognized, or handle as an error
            default:
                startDate = new Date(endDate.getTime() - 60 * 60 * 1000);
                break;
        }

        await handleServiceCall<TrafficStatsResponse>(
            res,
            // Pass an object matching the service's expected filters
            () => this.service.getTrafficStats({
                serverId,
                startDate: startDate?.toISOString(),
                endDate: endDate.toISOString(),
            })
        );
    }
}

export const trafficController = new TrafficController(trafficMonitoringService);
