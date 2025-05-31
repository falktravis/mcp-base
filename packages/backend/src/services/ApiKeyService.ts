/**
 * @file ApiKeyService.ts
 * @description This file defines the ApiKeyService class, responsible for managing API keys
 * within the MCP Pro application. It handles the creation, validation, revocation,
 * and retrieval of API keys. Security is a key concern, so this service
 * ensures that raw API keys are only exposed upon creation and that stored keys
 * are securely hashed using bcrypt. It interacts directly with the database
 * to persist and retrieve API key information.
 */

// packages/backend/src/services/ApiKeyService.ts
import { query } from '../config/database';
import { randomBytes } from 'crypto'; // Used for generating newId and rawKey parts
import { ApiKey } from 'shared-types'; // Corrected import path
import bcrypt from 'bcrypt';

// --- Constants for API Key Generation and Hashing ---

/**
 * @constant SALT_ROUNDS
 * @description The number of salt rounds to use with bcrypt for hashing API keys.
 * A higher number increases security but also increases hashing time.
 */
const SALT_ROUNDS = 10;

/**
 * @constant API_KEY_PREFIX
 * @description A prefix added to all generated API keys for easy identification.
 * Example: "mcpk_"
 */
const API_KEY_PREFIX = 'mcpk_';

/**
 * @constant RAW_KEY_BYTE_LENGTH
 * @description The number of random bytes to generate for the raw API key string (excluding prefix).
 * This will be converted to a hex string, effectively doubling its length.
 * For example, 28 bytes will result in a 56-character hex string.
 */
const RAW_KEY_BYTE_LENGTH = 28; 

/**
 * @class ApiKeyService
 * @description Service class responsible for all operations related to API key management.
 * This includes generating secure API keys, storing them hashed, validating provided keys,
 * and managing their lifecycle (revocation, metadata retrieval).
 */
export class ApiKeyService {
  /**
   * @constructor
   * @description Initializes the ApiKeyService. Logs a message to indicate that
   * the service has started and is using bcrypt for hashing.
   */
  constructor() {
    // Log service initialization for monitoring and debugging purposes.
    console.log('[ApiKeyService] Initialized with bcrypt hashing.');
  }

  /**
   * @private
   * @method generateRawApiKey
   * @description Generates a new raw (unhashed) API key string.
   * The key consists of the defined `API_KEY_PREFIX` followed by a cryptographically
   * secure random hex string.
   * @returns {string} The newly generated raw API key.
   */
  private generateRawApiKey(): string {
    // Combine the prefix with a random hex string.
    return API_KEY_PREFIX + randomBytes(RAW_KEY_BYTE_LENGTH).toString('hex');
  }

  /**
   * @private
   * @method getApiKeyPrefix
   * @description Extracts a short prefix from a raw API key for storage and identification.
   * This prefix includes the standard `API_KEY_PREFIX` and the first 6 characters
   * of the random hex part of the key. It's used for display purposes (e.g., in a list of keys)
   * without exposing the full key.
   * @param {string} rawKey - The raw API key from which to extract the prefix.
   * @returns {string} The extracted short prefix (e.g., "mcpk_abcdef").
   */
  private getApiKeyPrefix(rawKey: string): string {
    // Return the standard prefix plus the next 6 characters of the key.
    return rawKey.substring(0, API_KEY_PREFIX.length + 6);
  }

  /**
   * @method createApiKey
   * @description Creates a new API key, hashes it for storage, and saves it to the database.
   * The raw, unhashed key is returned ONCE upon creation for the user to copy.
   * It is not stored in its raw form.
   * @param {string} name - A user-defined name for the API key (e.g., "My Integration Key").
   * @param {Date} [expiresAt] - Optional date when the API key should expire.
   * @param {string[]} [scopes] - Optional array of scopes or permissions associated with the key. (Currently stored as JSON string in DB)
   * @returns {Promise<{ apiKeyRecord: Omit<ApiKey, 'hashedApiKey' | 'salt'>, rawKey: string } | null>} 
   *          A Promise that resolves to an object containing the non-sensitive parts of the API key record
   *          (id, name, prefix, scopes, expiration, etc.) and the `rawKey` (the actual API key to be shown to the user once).
   *          Returns `null` if key creation fails.
   */
  async createApiKey(name: string, expiresAt?: Date, scopes?: string[]): Promise<{ apiKeyRecord: Omit<ApiKey, 'hashedApiKey' | 'salt'>, rawKey: string } | null> {
    console.log(`[ApiKeyService] Creating API key with name: "${name}"`);
    
    // Generate the raw key and its storable prefix.
    const rawKey = this.generateRawApiKey();
    const prefix = this.getApiKeyPrefix(rawKey);

    // Generate a salt and hash the raw key for secure storage.
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedApiKey = await bcrypt.hash(rawKey, salt);
    
    // Generate a unique ID for the API key record.
    const newId = randomBytes(16).toString('hex'); 

    const sql = `
      INSERT INTO "ApiKey" (id, name, "hashedApiKey", salt, prefix, scopes, "expiresAt", "createdAt", "updatedAt", "revokedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NULL)
      RETURNING id, name, prefix, scopes, "expiresAt", "lastUsedAt", "revokedAt", "createdAt", "updatedAt";
    `;
    try {
      // Execute the SQL query to insert the new API key.
      // Scopes are stringified if provided, otherwise null.
      const { rows } = await query(sql, [newId, name, hashedApiKey, salt, prefix, scopes ? JSON.stringify(scopes) : null, expiresAt]);
      
      if (rows.length > 0) {
        // Successfully created. Return the non-sensitive parts of the record and the raw key.
        // The rawKey should be displayed to the user immediately as it won't be retrievable again.
        return { apiKeyRecord: rows[0] as Omit<ApiKey, 'hashedApiKey' | 'salt'>, rawKey };
      }
      // Should not happen if RETURNING clause works and insert is successful, but as a safeguard:
      console.error('[ApiKeyService] API key creation seemed to succeed but no record was returned.');
      return null;
    } catch (error) {
      console.error('[ApiKeyService] Error creating API key:', error);
      // TODO: Implement more specific error handling, e.g., for duplicate names if a unique constraint is added to the 'name' field.
      return null;
    }
  }

  /**
   * @method getAllApiKeys
   * @description Retrieves metadata for all non-revoked API keys.
   * This method returns a list of API key details, excluding sensitive information
   * like the hashed key and salt. It's typically used for displaying a list of
   * existing keys to an administrator.
   * @returns {Promise<Omit<ApiKey, 'hashedApiKey' | 'salt'>[]>} 
   *          A Promise that resolves to an array of API key metadata objects.
   *          Returns an empty array if an error occurs or no keys are found.
   */
  async getAllApiKeys(): Promise<Omit<ApiKey, 'hashedApiKey' | 'salt'>[]> {
    console.log(`[ApiKeyService] Fetching all API keys (metadata only)`);
    const sql = `
      SELECT id, name, prefix, scopes, "expiresAt", "lastUsedAt", "revokedAt", "createdAt", "updatedAt"
      FROM "ApiKey"
      WHERE "revokedAt" IS NULL; -- By default, only fetch active (non-revoked) keys.
    `;
    try {
      const { rows } = await query(sql);
      // Map database rows to the expected return type, parsing scopes if they are stored as JSON strings.
      return rows.map(row => ({
        ...row,
        scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes
      }));
    } catch (error) {
      console.error('[ApiKeyService] Error fetching API keys:', error);
      return []; // Return an empty array in case of an error.
    }
  }

  /**
   * @method validateApiKey
   * @description Validates a provided raw API key against the stored hashed keys.
   * If the key is valid, not revoked, and not expired, its metadata (excluding hash and salt)
   * is returned, and its "lastUsedAt" timestamp is updated.
   * This method iterates through all non-revoked keys and compares the provided key
   * against each stored hash. This is necessary because the raw key cannot be used
   * to directly look up its hash.
   * @param {string} providedKey - The raw API key string to validate.
   * @returns {Promise<Omit<ApiKey, 'hashedApiKey' | 'salt'> | null>} 
   *          A Promise that resolves to the API key's metadata (excluding sensitive fields)
   *          if valid, or `null` if the key is invalid, expired, revoked, or not found.
   * @remarks
   * This validation method fetches all non-revoked keys and then performs bcrypt.compare
   * for each one. For systems with a very large number of API keys, this could become
   * a performance bottleneck. Consider alternative strategies for very high-load systems,
   * such as caching frequently used keys or a more complex lookup mechanism if needed.
   */
  async validateApiKey(providedKey: string): Promise<Omit<ApiKey, 'hashedApiKey' | 'salt'> | null> {
    // Log the validation attempt, showing only a safe part of the key.
    console.log(`[ApiKeyService] Validating API key starting with "${providedKey.substring(0, API_KEY_PREFIX.length + 6)}..."`);
    
    // SQL to fetch all potentially relevant API keys (non-revoked).
    // We need the hashedApiKey and salt for comparison.
    const potentialKeysSql = `
      SELECT id, "hashedApiKey", salt, name, prefix, scopes, "expiresAt", "lastUsedAt", "revokedAt", "createdAt", "updatedAt" 
      FROM "ApiKey" 
      WHERE "revokedAt" IS NULL;`;

    try {
      const { rows } = await query(potentialKeysSql);
      if (rows.length === 0) {
        // No non-revoked keys in the database.
        console.log('[ApiKeyService] No non-revoked API keys found in the database for validation.');
        return null;
      }

      // Iterate through each fetched key record.
      for (const apiKeyRecord of rows as ApiKey[]) {
        // Check for expiration.
        if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
          console.log(`[ApiKeyService] API key ${apiKeyRecord.id} has expired.`);
          continue; // Skip this key as it's expired.
        }

        // Compare the provided raw key with the stored hashed key using bcrypt.
        // This is a CPU-intensive operation.
        const isValid = await bcrypt.compare(providedKey, apiKeyRecord.hashedApiKey);

        if (isValid) {
          // Key is valid.
          console.log(`[ApiKeyService] API key ${apiKeyRecord.id} validated successfully.`);
          
          // Update the "lastUsedAt" timestamp for this key.
          const updateLastUsedSql = `UPDATE "ApiKey" SET "lastUsedAt" = NOW() WHERE id = $1;`;
          try {
            await query(updateLastUsedSql, [apiKeyRecord.id]);
          } catch (updateError) {
            console.error(`[ApiKeyService] Failed to update lastUsedAt for key ${apiKeyRecord.id}:`, updateError);
            // Continue even if lastUsedAt update fails, as authentication itself was successful.
          }

          // Prepare the key metadata to return (excluding sensitive fields).
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { hashedApiKey, salt, ...apiKeyFieldsToReturn } = apiKeyRecord;
          return {
            ...apiKeyFieldsToReturn,
            // Ensure scopes are parsed if they are a JSON string.
            scopes: typeof apiKeyFieldsToReturn.scopes === 'string' ? JSON.parse(apiKeyFieldsToReturn.scopes) : apiKeyFieldsToReturn.scopes
          };
        }
      }
      // If the loop completes without finding a valid key.
      console.log(`[ApiKeyService] No valid API key found matching the provided token after checking all candidates.`);
      return null; 
    } catch (error) {
      console.error('[ApiKeyService] Error during API key validation process:', error);
      return null;
    }
  }

  /**
   * @method revokeApiKey
   * @description Revokes an API key by setting its "revokedAt" timestamp.
   * The key is not deleted from the database but is marked as unusable.
   * @param {string} apiKeyId - The ID of the API key to revoke.
   * @returns {Promise<boolean>} A Promise that resolves to `true` if the key was successfully
   *          revoked, or `false` otherwise (e.g., key not found or already revoked).
   */
  async revokeApiKey(apiKeyId: string): Promise<boolean> {
    console.log(`[ApiKeyService] Attempting to revoke API key ID: ${apiKeyId}`);
    // Set the "revokedAt" field to the current time for the specified key ID.
    // Ensures that the key is not already revoked.
    const sql = `UPDATE "ApiKey" SET "revokedAt" = NOW() WHERE id = $1 AND "revokedAt" IS NULL;`;
    try {
      const result = await query(sql, [apiKeyId]);
      // result.rowCount indicates the number of rows affected.
      // If > 0, the key was found and revoked.
      if (result.rowCount !== null && result.rowCount > 0) {
        console.log(`[ApiKeyService] API key ${apiKeyId} revoked successfully.`);
        return true;
      } else {
        console.log(`[ApiKeyService] API key ${apiKeyId} not found or already revoked.`);
        return false;
      }
    } catch (error) {
      console.error(`[ApiKeyService] Error revoking API key ${apiKeyId}:`, error);
      return false;
    }
  }

  /**
   * @method getApiKeyMetadata
   * @description Retrieves the metadata for a specific API key by its ID.
   * This method returns non-sensitive details of an API key.
   * @param {string} apiKeyId - The ID of the API key to retrieve.
   * @returns {Promise<Omit<ApiKey, 'hashedApiKey' | 'salt'> | null>} 
   *          A Promise that resolves to the API key's metadata (excluding sensitive fields)
   *          if found, or `null` if no key matches the given ID.
   */
  async getApiKeyMetadata(apiKeyId: string): Promise<Omit<ApiKey, 'hashedApiKey' | 'salt'> | null> {
    console.log(`[ApiKeyService] Fetching API key metadata by ID: ${apiKeyId}`);
    const sql = `
      SELECT id, name, prefix, scopes, "expiresAt", "lastUsedAt", "revokedAt", "createdAt", "updatedAt"
      FROM "ApiKey"
      WHERE id = $1;
    `;
    try {
      const { rows } = await query(sql, [apiKeyId]);
      if (rows.length > 0) {
         const apiKey = rows[0];
         // Parse scopes if they are stored as a JSON string.
        return {
            ...apiKey,
            scopes: typeof apiKey.scopes === 'string' ? JSON.parse(apiKey.scopes) : apiKey.scopes
        };
      }
      // No key found with the given ID.
      console.log(`[ApiKeyService] API key metadata not found for ID: ${apiKeyId}`);
      return null;
    } catch (error) {
      console.error(`[ApiKeyService] Error fetching API key metadata by ID ${apiKeyId}:`, error);
      return null;
    }
  }

  /**
   * @method deleteApiKeyPermanently
   * @description Permanently deletes an API key from the database.
   * This is a destructive operation and should be used with caution (e.g., for GDPR compliance or complete removal).
   * Prefer `revokeApiKey` for disabling keys under normal circumstances.
   * @param {string} apiKeyId - The ID of the API key to delete permanently.
   * @returns {Promise<boolean>} A Promise that resolves to `true` if the key was successfully
   *          deleted, or `false` otherwise (e.g., key not found).
   */
  async deleteApiKeyPermanently(apiKeyId: string): Promise<boolean> {
    // Log a warning due to the destructive nature of this operation.
    console.warn(`[ApiKeyService] Permanently deleting API key ID: ${apiKeyId}. This action is irreversible.`);
    const sql = `DELETE FROM "ApiKey" WHERE id = $1;`;
    try {
      const result = await query(sql, [apiKeyId]);
      // result.rowCount indicates the number of rows affected.
      if (result.rowCount !== null && result.rowCount > 0) {
        console.log(`[ApiKeyService] API key ${apiKeyId} permanently deleted successfully.`);
        return true;
      } else {
        console.log(`[ApiKeyService] API key ${apiKeyId} not found for permanent deletion.`);
        return false;
      }
    } catch (error) {
      console.error(`[ApiKeyService] Error permanently deleting API key ${apiKeyId}:`, error);
      return false;
    }
  }
}

