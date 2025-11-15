/**
 * Get the backend API base URL
 * In production (Azure Container Apps), use the deployed backend URL
 * In development, use localhost
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname.includes('azurecontainerapps.io')) {
    return 'https://aca-triage-backend.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io';
  }
  return 'http://localhost:7071';
}
