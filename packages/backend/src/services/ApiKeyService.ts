// packages/backend/src/services/ApiKeyService.ts
import { query } from '../config/database';
import { randomBytes } from 'crypto';
import { ApiKey } from 'shared-types'; // Updated import path

/**
 * @class ApiKeyService
 * @description Service for managing API keys using direct SQL (single-admin context).
 */
export class ApiKeyService {
  constructor() {
    console.log('ApiKeyService initialized for direct SQL (single-admin)');
  }

  private generateNewApiKey(): string {
    return `mcpk_` + randomBytes(28).toString('hex');
  }

  async createApiKey(name: string, expiresAt?: Date): Promise<{ apiKeyRecord: ApiKey, rawKey: string } | null> {
    console.log(`ApiKeyService: Creating API key with name "${name}"`);
    const apiKeyString = this.generateNewApiKey();
    const prefix = apiKeyString.substring(0, 8);
    const newId = randomBytes(16).toString('hex');

    const sql = `
      INSERT INTO "ApiKey" (id, "hashedKey", prefix, name, "expiresAt", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *;
    `;
    try {
      const { rows } = await query(sql, [newId, apiKeyString, prefix, name, expiresAt]);
      if (rows.length > 0) {
        return { apiKeyRecord: rows[0] as ApiKey, rawKey: apiKeyString };
      }
      return null;
    } catch (error) {
      console.error('Error creating API key:', error);
      return null;
    }
  }

  async getAllApiKeys(): Promise<Omit<ApiKey, 'hashedKey'>[]> {
    console.log(`ApiKeyService: Fetching all API keys`);
    const sql = `
      SELECT id, prefix, name, "expiresAt", "lastUsedAt", "createdAt", "updatedAt"
      FROM "ApiKey";
    `;
    try {
      const { rows } = await query(sql);
      return rows;
    } catch (error) {
      console.error('Error fetching API keys:', error);
      return [];
    }
  }

  async validateApiKey(keyString: string): Promise<Omit<ApiKey, 'hashedKey'> | null> {
    console.log(`ApiKeyService: Validating API key`);
    const apiKeySql = `SELECT * FROM "ApiKey" WHERE "hashedKey" = $1;`;
    try {
      const { rows } = await query(apiKeySql, [keyString]);
      if (rows.length === 0) {
        return null;
      }
      const apiKeyRecord: ApiKey = rows[0];

      if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
        console.log(`ApiKeyService: API key ${apiKeyRecord.id} has expired.`);
        return null;
      }

      const updateLastUsedSql = `UPDATE "ApiKey" SET "lastUsedAt" = NOW() WHERE id = $1;`;
      await query(updateLastUsedSql, [apiKeyRecord.id]);

      const { hashedKey, ...apiKeyFieldsToReturn } = apiKeyRecord;
      return apiKeyFieldsToReturn;
    } catch (error) {
      console.error('Error validating API key:', error);
      return null;
    }
  }

  async revokeApiKey(apiKeyId: string): Promise<boolean> {
    console.log(`ApiKeyService: Revoking API key ${apiKeyId}`);
    const sql = `UPDATE "ApiKey" SET "expiresAt" = NOW() WHERE id = $1;`;
    try {
      const result = await query(sql, [apiKeyId]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error revoking API key:', error);
      return false;
    }
  }

  async getApiKeyById(apiKeyId: string): Promise<Omit<ApiKey, 'hashedKey'> | null> {
    console.log(`ApiKeyService: Fetching API key by ID ${apiKeyId}`);
    const sql = `
      SELECT id, prefix, name, "expiresAt", "lastUsedAt", "createdAt", "updatedAt"
      FROM "ApiKey" 
      WHERE id = $1;
    `;
    try {
      const { rows } = await query(sql, [apiKeyId]);
      if (rows.length > 0) {
        return rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error fetching API key by ID:', error);
      return null;
    }
  }
}

