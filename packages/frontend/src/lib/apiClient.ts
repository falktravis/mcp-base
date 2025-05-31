// packages/frontend/src/lib/apiClient.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiResponse } from '@shared-types/api-contracts';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Define the base URL for your backend API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api'; // Adjust port if your backend is different

/**
 * @class ApiClient
 * @description A TypeScript-first API client for interacting with the MCP Pro backend.
 * It uses Axios for making HTTP requests and is configured to handle common scenarios
 * like request/response interceptors for auth, error handling, etc.
 */
class ApiClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000, // 10 seconds timeout
      headers: {
        'Content-Type': 'application/json',
        // 'Accept': 'application/json',
      },
    });

    // Initialize interceptors
    this.initializeRequestInterceptor();
    this.initializeResponseInterceptor();

    console.log('ApiClient initialized with baseURL:', API_BASE_URL);
  }

  /**
   * @method initializeRequestInterceptor
   * @description Sets up a request interceptor.
   * Useful for attaching auth tokens to requests, logging, etc.
   */
  private initializeRequestInterceptor() {
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Example: Get token from localStorage or a state management solution
        const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        console.log('Starting Request:', config.method?.toUpperCase(), config.url, config.data || '');
        return config;
      },
      (error) => {
        console.error('Request Error Interceptor:', error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * @method initializeResponseInterceptor
   * @description Sets up a response interceptor.
   * Useful for global error handling, response transformations, etc.
   */
  private initializeResponseInterceptor() {
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log('Response Received:', response.status, response.data);
        return response;
      },
      (error) => {
        console.error('Response Error Interceptor:', error.response?.status, error.response?.data || error.message);
        // Example: Handle 401 Unauthorized errors globally (e.g., redirect to login)
        if (error.response && error.response.status === 401) {
          // Handle unauthorized access, e.g., clear session, redirect to login
          console.warn('Unauthorized access detected. Implement redirection to login.');
          // if (typeof window !== 'undefined') window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }
  /**
   * @method get
   * @description Performs a GET request.
   * @param {string} path - The API endpoint path.
   * @param {AxiosRequestConfig} [config] - Optional Axios request configuration.
   * @returns {Promise<AxiosResponse<ApiResponse<T>>>}
   */
  public get<T = any>(path: string, config?: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.axiosInstance.get<ApiResponse<T>>(path, config);
  }
  /**
   * @method post
   * @description Performs a POST request.
   * @param {string} path - The API endpoint path.
   * @param {D} data - The data to send in the request body.
   * @param {AxiosRequestConfig} [config] - Optional Axios request configuration.
   * @returns {Promise<AxiosResponse<ApiResponse<T>>>}
   */
  public post<T = any, D = any>(path: string, data?: D, config?: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.axiosInstance.post<ApiResponse<T>>(path, data, config);
  }
  /**
   * @method put
   * @description Performs a PUT request.
   * @param {string} path - The API endpoint path.
   * @param {D} data - The data to send in the request body.
   * @param {AxiosRequestConfig} [config] - Optional Axios request configuration.
   * @returns {Promise<AxiosResponse<ApiResponse<T>>>}
   */
  public put<T = any, D = any>(path: string, data?: D, config?: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.axiosInstance.put<ApiResponse<T>>(path, data, config);
  }
  /**
   * @method delete
   * @description Performs a DELETE request.
   * @param {string} path - The API endpoint path.
   * @param {AxiosRequestConfig} [config] - Optional Axios request configuration.
   * @returns {Promise<AxiosResponse<ApiResponse<T>>>}
   */
  public delete<T = any>(path: string, config?: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.axiosInstance.delete<ApiResponse<T>>(path, config);
  }
  /**
   * @method patch
   * @description Performs a PATCH request.
   * @param {string} path - The API endpoint path.
   * @param {D} data - The data to send in the request body.
   * @param {AxiosRequestConfig} [config] - Optional Axios request configuration.
   * @returns {Promise<AxiosResponse<ApiResponse<T>>>}
   */
  public patch<T = any, D = any>(path: string, data?: D, config?: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.axiosInstance.patch<ApiResponse<T>>(path, data, config);
  }
}

// Export a singleton instance of the ApiClient
const apiClient = new ApiClient();
export default apiClient;

// Example usage (typically in service files or React hooks):
// apiClient.get('/users').then(response => console.log(response.data));
// apiClient.post('/users', { name: 'John Doe' }).then(response => console.log(response.data));
