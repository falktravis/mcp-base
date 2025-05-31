// This service will be responsible for logging all incoming requests to the CentralGatewayMCPService
// and their outcomes to the PostgreSQL database. It will also provide methods to query this data.

import { query } from '../config/database'; // Uses the exported query function from database.ts
import { TrafficLog } from '@shared-types/db-models'; // Corrected: TrafficLog is in db-models
import { PaginatedResponse } from '@shared-types/api-contracts'; // PaginatedResponse is in api-contracts
import { v4 as uuidv4 } from 'uuid'; // Using uuid for ID generation

// Placeholder for a more sophisticated logging solution
const logger = console;

export class TrafficMonitoringService {
  constructor() {
    logger.info('[TrafficMonitoringService] Initialized.');
  }

  /**
   * Logs a single traffic event to the database.
   * The structure of logData should align with the TrafficLog interface in db-models.ts,
   * excluding id and timestamp which are auto-generated.
   * @param logData - The data for the traffic log.
   * @returns The created TrafficLog object or null if an error occurred.
   */
  async logRequest(
    logData: Omit<TrafficLog, 'id' | 'timestamp'>
  ): Promise<TrafficLog | null> {
    const newId = uuidv4();
    const sql = `
      INSERT INTO traffic_log (
        id, server_id, timestamp, mcp_method, mcp_request_id, source_ip, 
        request_size_bytes, response_size_bytes, http_status, target_server_http_status, 
        is_success, duration_ms, api_key_id, error_message
        -- Add requestPayloadSnippet, responsePayloadSnippet if you decide to use them
      )
      VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;
    try {
      const { rows } = await query(sql, [
        newId,
        logData.serverId,
        logData.mcpMethod,
        logData.mcpRequestId,
        logData.sourceIp,
        logData.requestSizeBytes,
        logData.responseSizeBytes,
        logData.httpStatus,
        logData.targetServerHttpStatus,
        logData.isSuccess,
        logData.durationMs,
        logData.apiKeyId,
        logData.errorMessage,
      ]);
      if (rows.length > 0) {
        // The row from DB should match TrafficLog structure, assuming DB columns match interface fields
        // Dates are typically returned as strings or Date objects by pg driver depending on config/parsers
        const dbRow = rows[0];
        return {
            ...dbRow,
            timestamp: new Date(dbRow.timestamp), // Ensure timestamp is a Date object
        } as TrafficLog;
      }
      return null;
    } catch (error) {
      logger.error('[TrafficMonitoringService] Error logging traffic data:', error);
      return null;
    }
  }

  /**
   * Retrieves traffic logs based on specified filters and pagination.
   * Filters should align with fields in the TrafficLog interface.
   * @param filters - Criteria to filter logs by.
   * @param pagination - Pagination parameters (page, limit).
   * @returns A paginated response of TrafficLog objects.
   */
  async getTrafficLogs(
    filters: { 
        serverId?: string; 
        mcpMethod?: string; 
        startDate?: string; // ISO Date string
        endDate?: string;   // ISO Date string
        isSuccess?: boolean; 
        apiKeyId?: string;
        sourceIp?: string;
    },
    pagination: { page?: number; limit?: number }
  ): Promise<PaginatedResponse<TrafficLog>> {
    const currentPage = Math.max(1, pagination.page || 1);
    const currentLimit = Math.max(1, pagination.limit || 10);
    const offset = (currentPage - 1) * currentLimit;

    let baseSql = 'SELECT * FROM traffic_log';
    let countSql = 'SELECT COUNT(*) as total FROM traffic_log';
    const whereClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters.serverId) {
      whereClauses.push(`server_id = $${paramIndex++}`);
      queryParams.push(filters.serverId);
    }
    if (filters.mcpMethod) {
      whereClauses.push(`mcp_method ILIKE $${paramIndex++}`); // Case-insensitive for method name
      queryParams.push(`%${filters.mcpMethod}%`);
    }
    if (filters.isSuccess !== undefined) {
      whereClauses.push(`is_success = $${paramIndex++}`);
      queryParams.push(filters.isSuccess);
    }
    if (filters.startDate) {
      whereClauses.push(`timestamp >= $${paramIndex++}`);
      queryParams.push(filters.startDate);
    }
    if (filters.endDate) {
      whereClauses.push(`timestamp <= $${paramIndex++}`);
      queryParams.push(filters.endDate);
    }
    if (filters.apiKeyId) {
        whereClauses.push(`api_key_id = $${paramIndex++}`);
        queryParams.push(filters.apiKeyId);
    }
    if (filters.sourceIp) {
        whereClauses.push(`source_ip ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.sourceIp}%`);
    }

    if (whereClauses.length > 0) {
      const whereString = ` WHERE ${whereClauses.join(' AND ')}`;
      baseSql += whereString;
      countSql += whereString;
    }

    baseSql += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const finalQueryParams = [...queryParams, currentLimit, offset];
    const countQueryParams = [...queryParams]; 

    try {
      const logsResult = await query(baseSql, finalQueryParams);
      const totalResult = await query(countSql, countQueryParams);

      const logs: TrafficLog[] = logsResult.rows.map((row: any) => ({
        ...row,
        timestamp: new Date(row.timestamp),
      }));
      
      const total = parseInt(totalResult.rows[0].total, 10) || 0;

      return {
        items: logs,
        total,
        page: currentPage,
        limit: currentLimit,
      };
    } catch (error) {
      logger.error('[TrafficMonitoringService] Error fetching traffic logs:', error);
      return {
        items: [],
        total: 0,
        page: currentPage,
        limit: currentLimit,
      };
    }
  }

  /**
   * Provides aggregated statistics about traffic.
   * (This is a basic version and can be expanded significantly)
   */
  async getTrafficStats(
    filters?: { serverId?: string; startDate?: string; endDate?: string; mcpMethod?: string; }
  ): Promise<any> { // Define a proper interface for stats later
    let baseQuery = 'SELECT COUNT(*) as total_requests, SUM(CASE WHEN is_success = false THEN 1 ELSE 0 END) as failed_requests FROM traffic_log';
    const queryParams: any[] = [];
    const whereClauses: string[] = [];
    let paramIndex = 1;

    if (filters?.serverId) {
        whereClauses.push(`server_id = $${paramIndex++}`);
        queryParams.push(filters.serverId);
    }
    if (filters?.startDate) {
        whereClauses.push(`timestamp >= $${paramIndex++}`);
        queryParams.push(filters.startDate);
    }
    if (filters?.endDate) {
        whereClauses.push(`timestamp <= $${paramIndex++}`);
        queryParams.push(filters.endDate);
    }
    if (filters?.mcpMethod) {
        whereClauses.push(`mcp_method ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.mcpMethod}%`);
    }

    if (whereClauses.length > 0) {
        baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    try {
        const { rows } = await query(baseQuery, queryParams);
        const stats = rows[0];
        const totalRequests = parseInt(stats.total_requests, 10) || 0;
        const failedRequests = parseInt(stats.failed_requests, 10) || 0;
        return {
            totalRequests,
            failedRequests,
            successRate: totalRequests > 0 ? 
                ((totalRequests - failedRequests) / totalRequests) * 100 
                : 100,
        };
    } catch (error) {
        logger.error('[TrafficMonitoringService] Error fetching traffic stats:', error);
        return {
            totalRequests: 0,
            failedRequests: 0,
            successRate: 0,
        };
    }
  }
}
