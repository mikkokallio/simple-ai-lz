// Authentication configuration for Azure Entra ID
import dotenv from 'dotenv';

dotenv.config();

export interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  audience: string;
  issuer: string;
}

// Validate that all required environment variables are present
function validateEntraConfig(): EntraConfig {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  // Accept api://CLIENT_ID format for custom scopes like user_impersonation
  const audience = process.env.ENTRA_AUDIENCE || `api://${clientId}`;
  const issuer = process.env.ENTRA_ISSUER || `https://login.microsoftonline.com/${tenantId}/v2.0`;

  const missing: string[] = [];
  if (!tenantId) missing.push('ENTRA_TENANT_ID');
  if (!clientId) missing.push('ENTRA_CLIENT_ID');
  if (!clientSecret) missing.push('ENTRA_CLIENT_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Missing required Entra ID environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file and ensure all authentication variables are set.\n' +
      'See ENTRA_ID_SETUP.md for configuration instructions.'
    );
  }

  return {
    tenantId: tenantId!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    audience: audience!,
    issuer: issuer!
  };
}

// Export configuration (will throw if invalid)
export const entraConfig = validateEntraConfig();

// Passport-azure-ad BearerStrategy options
export const bearerStrategyOptions = {
  identityMetadata: `https://login.microsoftonline.com/${entraConfig.tenantId}/v2.0/.well-known/openid-configuration`,
  clientID: entraConfig.clientId,
  audience: entraConfig.audience,
  issuer: entraConfig.issuer,
  validateIssuer: true,
  passReqToCallback: false,
  loggingLevel: 'info', // Always enable detailed logging for debugging
  // Optional: Allow tokens from multiple tenants (set to false for single-tenant)
  allowMultiAudiencesInToken: false,
};

console.log('✅ Entra ID authentication configured');
console.log(`   Tenant: ${entraConfig.tenantId}`);
console.log(`   Client: ${entraConfig.clientId}`);
console.log(`   Audience: ${entraConfig.audience}`);
console.log(`   Issuer: ${entraConfig.issuer}`);
