/**
 * API Configuration
 * 
 * In production (nginx), the BACKEND_URL is injected via entrypoint.sh
 * In development (Vite), we use the proxy configured in vite.config.ts
 */

// Check if running in production (built by Vite)
const isProduction = (import.meta as any).env.PROD;

// In production, backend URL is set by nginx (from environment variable)
// In development, use relative URL (Vite proxy handles it)
export const API_BASE_URL = isProduction 
  ? (window as any).BACKEND_URL || ''
  : '';

console.log('API Configuration:', { isProduction, API_BASE_URL });
