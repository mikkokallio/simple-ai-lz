// MSAL configuration for Azure Entra ID authentication
import { Configuration, LogLevel } from '@azure/msal-browser';

// Get configuration from environment variables
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID;
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID;
const redirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI || window.location.origin;

// Validate required configuration
if (!clientId || !tenantId) {
  throw new Error(
    'Missing required Entra ID configuration. Please check your .env file:\n' +
    `VITE_ENTRA_CLIENT_ID: ${clientId ? '✓' : '✗ MISSING'}\n` +
    `VITE_ENTRA_TENANT_ID: ${tenantId ? '✓' : '✗ MISSING'}`
  );
}

// MSAL configuration
export const msalConfig: Configuration = {
  auth: {
    clientId: clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: redirectUri,
    postLogoutRedirectUri: redirectUri,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage', // Use sessionStorage to avoid issues with multiple tabs
    storeAuthStateInCookie: false, // Set to true for IE11 support
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// Add scopes for API access
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

// Scopes for accessing the backend API
export const apiRequest = {
  scopes: [`api://${clientId}/access_as_user`],
};

console.log('✅ MSAL configuration loaded');
console.log(`   Client ID: ${clientId}`);
console.log(`   Tenant ID: ${tenantId}`);
console.log(`   Redirect URI: ${redirectUri}`);
