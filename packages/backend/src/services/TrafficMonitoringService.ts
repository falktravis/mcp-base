// This service will be responsible for logging all incoming requests to the CentralGatewayMCPService
// and their outcomes to the PostgreSQL database. It will also provide methods to query this data.

import { query } from '../config/database'; // Import query function
import { TrafficLog } from '@mcp-pro/shared-types'; // Import TrafficLog type
import { randomBytes } from 'crypto';

export class TrafficMonitoringService {
  constructor() {
    console.log('TrafficMonitoringService initialized for direct SQL');
  }

  async logRequest(
    logData: Omit<TrafficLog, 'id' | 'timestamp'>
  ): Promise<TrafficLog | null> {
    const newId = randomBytes(16).toString('hex');
    const sql = `
      INSERT INTO "TrafficLog" (
        id, "serverId", "requestType", "targetTool", "targetResourceUri", 
        "targetPromptName", "requestPayload", "responsePayload", "isSuccess", 
        "durationMs", "clientIp", "apiKeyId", timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *;
    `;
    try {
      const { rows } = await query(sql, [
        newId,
        logData.serverId,
        logData.requestType,
        logData.targetTool,
        logData.targetResourceUri,
        logData.targetPromptName,
        JSON.stringify(logData.requestPayload), // Ensure payloads are stringified if they are objects
        logData.responsePayload ? JSON.stringify(logData.responsePayload) : null,
        logData.isSuccess,
        logData.durationMs,
        logData.clientIp,
        logData.apiKeyId,
      ]);
      if (rows.length > 0) {
        return rows[0] as TrafficLog;
      }
      return null;
    } catch (error) {
      console.error('Error logging traffic data:', error);
      return null;
    }
  }

  async getTrafficLogs(
    filters: { serverId?: string; requestType?: string; startDate?: Date; endDate?: Date; isSuccess?: boolean },
    pagination: { skip?: number; take?: number }
  ): Promise<{ logs: TrafficLog[]; total: number }> {
    let baseSql = 'SELECT * FROM "TrafficLog"';
    let countSql = 'SELECT COUNT(*) FROM "TrafficLog"';
    const whereClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters.serverId) {
      whereClauses.push(`"serverId" = $${paramIndex++}`);
      queryParams.push(filters.serverId);
    }
    if (filters.requestType) {
      whereClauses.push(`"requestType" = $${paramIndex++}`);
      queryParams.push(filters.requestType);
    }
    if (filters.isSuccess !== undefined) {
      whereClauses.push(`"isSuccess" = $${paramIndex++}`);
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

    if (whereClauses.length > 0) {
      const whereString = ` WHERE ${whereClauses.join(' AND ')}`;
      baseSql += whereString;
      countSql += whereString;
    }

    baseSql += ` ORDER BY timestamp DESC`;
    if (pagination.take !== undefined) {
      baseSql += ` LIMIT $${paramIndex++}`;
      queryParams.push(pagination.take);
    }
    if (pagination.skip !== undefined) {
      baseSql += ` OFFSET $${paramIndex++}`;
      queryParams.push(pagination.skip);
    }
    baseSql += ';';

    try {
      const { rows: logs } = await query(baseSql, queryParams);
      // For countSql, we need to use the same queryParams used for filtering, but not for pagination
      const countQueryParams = queryParams.slice(0, whereClauses.length);
      const { rows: countResult } = await query(countSql, countQueryParams);
      
      const total = parseInt(countResult[0].count, 10);
      return { logs: logs as TrafficLog[], total };
    } catch (error) {
      console.error('Error fetching traffic logs:', error);
      return { logs: [], total: 0 };
    }
  }

  async getTrafficLogById(id: string): Promise<TrafficLog | null> {
    const sql = 'SELECT * FROM "TrafficLog" WHERE id = $1;';
    try {
      const { rows } = await query(sql, [id]);
      if (rows.length > 0) {
        return rows[0] as TrafficLog;
      }
      return null;
    } catch (error) {
      console.error('Error fetching traffic log by ID:', error);
      return null;
    }
  }

  async getTrafficStats(filters: { serverId?: string; startDate?: Date; endDate?: Date }): Promise<any> {
    let successSql = 'SELECT COUNT(*) FROM "TrafficLog" WHERE "isSuccess" = TRUE';
    let failureSql = 'SELECT COUNT(*) FROM "TrafficLog" WHERE "isSuccess" = FALSE';
    const queryParams: any[] = [];
    const whereClauses: string[] = [];
    let paramIndex = 1;

    if (filters.serverId) {
      whereClauses.push(`"serverId" = $${paramIndex++}`);
      queryParams.push(filters.serverId);
    }
    if (filters.startDate) {
      whereClauses.push(`timestamp >= $${paramIndex++}`);
      queryParams.push(filters.startDate);
    }
    if (filters.endDate) {
      whereClauses.push(`timestamp <= $${paramIndex++}`);
      queryParams.push(filters.endDate);
    }
    
    if (whereClauses.length > 0) {
      const whereString = ` AND ${whereClauses.join(' AND ')}`; // Starts with AND because "isSuccess" is already there
      successSql += whereString;
      failureSql += whereString;
    }
    successSql += ';';
    failureSql += ';';

    try {
      const { rows: successResult } = await query(successSql, queryParams);
      const { rows: failureResult } = await query(failureSql, queryParams);
      
      const successCount = parseInt(successResult[0].count, 10);
      const failureCount = parseInt(failureResult[0].count, 10);
      return { successCount, failureCount };
    } catch (error) {
      console.error('Error fetching traffic stats:', error);
      return { successCount: 0, failureCount: 0 };
    }
  }
}

export const trafficMonitoringService = new TrafficMonitoringService();
