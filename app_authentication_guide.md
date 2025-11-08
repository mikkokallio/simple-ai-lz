# Application Authentication Setup Guide

This guide explains how to configure user authentication for applications deployed on the AI Landing Zone.

## Overview

The landing zone infrastructure supports user authentication through:
- **Microsoft Entra ID (Azure AD)** as the identity provider
- **Container Apps Easy Auth** for frontend authentication
- **APIM JWT validation** for API protection
- **OAuth 2.0 / OpenID Connect** protocols

## Prerequisites

- Landing zone deployed successfully
- Entra ID tenant ID (used during deployment)
- Owner or Application Administrator role in Entra ID

## Per-Application Setup

Each application requiring user authentication needs an **App Registration** in Entra ID. This is done AFTER the landing zone is deployed.

### Step 1: Create App Registration

1. Navigate to **Azure Portal** > **Microsoft Entra ID** > **App registrations**
2. Click **New registration**
3. Configure:
   - **Name**: `<your-app-name>-app` (e.g., `doctrans-app`)
   - **Supported account types**: 
     - Single tenant (recommended for lab)
     - Multi-tenant (if needed)
   - **Redirect URI**: 
     - Platform: Web
     - URI: `https://<your-container-app-fqdn>/.auth/login/aad/callback`
     - (You'll get the FQDN after deploying your Container App)
4. Click **Register**

### Step 2: Configure Authentication

1. In your App Registration, go to **Authentication**
2. Under **Implicit grant and hybrid flows**, enable:
   - ✅ **ID tokens** (for Easy Auth)
3. Under **Advanced settings**:
   - Set **Allow public client flows** to **No**
4. **Save**

### Step 3: Configure API Permissions (Optional)

If your app needs to call Microsoft Graph or other APIs:

1. Go to **API permissions**
2. Click **Add a permission**
3. Select the API (e.g., Microsoft Graph)
4. Select required permissions (e.g., `User.Read`)
5. Click **Grant admin consent** (if you have permissions)

### Step 4: Create Client Secret (If Needed)

For backend API authentication or service-to-service calls:

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description and expiration
4. Click **Add**
5. **COPY THE SECRET VALUE IMMEDIATELY** (it won't be shown again)

### Step 5: Store Values in Key Vault

Store the following in the shared Key Vault:

```bash
# Get Key Vault name from deployment outputs
$keyVaultName = "<your-keyvault-name>"

# Store App Registration details
az keyvault secret set --vault-name $keyVaultName `
  --name "<appname>-client-id" `
  --value "<application-client-id>"

az keyvault secret set --vault-name $keyVaultName `
  --name "<appname>-tenant-id" `
  --value "<tenant-id>"

# Store client secret if created
az keyvault secret set --vault-name $keyVaultName `
  --name "<appname>-client-secret" `
  --value "<client-secret-value>"
```

### Step 6: Configure Container App Easy Auth

When deploying your frontend Container App, configure Easy Auth:

```bicep
resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'aca-ailz-myapp-web'
  properties: {
    configuration: {
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        {
          name: 'entra-client-id'
          keyVaultUrl: '${keyVaultUri}secrets/myapp-client-id'
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        // ... your container config
      ]
    }
    configuration: {
      auth: {
        identityProviders: {
          azureActiveDirectory: {
            enabled: true
            registration: {
              openIdIssuer: 'https://sts.windows.net/${tenantId}/v2.0'
              clientIdSettingName: 'entra-client-id'
            }
            validation: {
              allowedAudiences: [
                'api://${clientId}'
              ]
            }
          }
        }
        login: {
          preserveUrlFragmentsForLogins: true
        }
        globalValidation: {
          redirectToProvider: 'azureActiveDirectory'
          unauthenticatedClientAction: 'RedirectToLoginPage'
        }
      }
    }
  }
}
```

### Step 7: Configure APIM JWT Validation

Update your APIM policies to validate tokens:

```xml
<policies>
  <inbound>
    <validate-jwt header-name="Authorization" failed-validation-httpcode="401">
      <openid-config url="https://login.microsoftonline.com/${TENANT_ID}/v2.0/.well-known/openid-configuration" />
      <audiences>
        <audience>api://${CLIENT_ID}</audience>
      </audiences>
      <issuers>
        <issuer>https://sts.windows.net/${TENANT_ID}/</issuer>
      </issuers>
      <required-claims>
        <claim name="aud" match="any">
          <value>api://${CLIENT_ID}</value>
        </claim>
      </required-claims>
    </validate-jwt>
    <set-header name="X-User-Id" exists-action="override">
      <value>@(context.Request.Headers.GetValueOrDefault("Authorization","").Split(' ')[1].AsJwt()?.Subject)</value>
    </set-header>
    <base />
  </inbound>
</policies>
```

## Authentication Flow

### Web Application Flow (OpenID Connect)

1. User navigates to Container App URL
2. Easy Auth detects unauthenticated request
3. Redirects to Entra ID login page
4. User enters credentials (may include MFA)
5. Entra ID validates and redirects back with authorization code
6. Easy Auth exchanges code for tokens
7. Session cookie created for user
8. User accesses application

### API Request Flow (OAuth 2.0)

1. Frontend obtains access token (from Easy Auth session)
2. Frontend calls APIM with `Authorization: Bearer <token>` header
3. APIM validates JWT:
   - Signature verification
   - Expiration check
   - Audience validation
   - Issuer validation
4. If valid, APIM forwards request to backend
5. Backend receives request with user context (via headers)
6. Backend processes and returns response

## User Authorization (Application Level)

After authentication, applications should implement authorization:

### Role-Based Access Control (RBAC)

1. Define App Roles in App Registration:
   - Go to **App roles** > **Create app role**
   - Define roles (e.g., `Admin`, `User`, `Reader`)

2. Assign users/groups to roles:
   - Go to **Enterprise Applications**
   - Find your app
   - **Users and groups** > **Add user/group**
   - Assign roles

3. Check roles in application code:
   ```csharp
   // In .NET
   var roles = User.Claims
       .Where(c => c.Type == ClaimTypes.Role)
       .Select(c => c.Value);
   
   if (!roles.Contains("Admin")) {
       return Forbid();
   }
   ```

### Claims-Based Authorization

Access user claims from the token:

```csharp
// User email
var email = User.FindFirst(ClaimTypes.Email)?.Value;

// User object ID (unique identifier)
var userId = User.FindFirst("http://schemas.microsoft.com/identity/claims/objectidentifier")?.Value;

// User groups (requires optional claims configuration)
var groups = User.Claims
    .Where(c => c.Type == "groups")
    .Select(c => c.Value);
```

## Testing Authentication

### Test Easy Auth

1. Deploy Container App with Easy Auth enabled
2. Navigate to Container App URL in browser
3. Should redirect to login.microsoftonline.com
4. Login with test user
5. Should redirect back to application

### Test APIM JWT Validation

```bash
# Get access token (using Azure CLI)
$accessToken = az account get-access-token --resource api://<client-id> --query accessToken -o tsv

# Call APIM endpoint with token
curl -H "Authorization: Bearer $accessToken" https://<apim-gateway-url>/api/yourapp/endpoint
```

## Troubleshooting

### "Redirect URI mismatch" error
- Ensure redirect URI in App Registration matches Container App FQDN
- Format: `https://<fqdn>/.auth/login/aad/callback`

### "Invalid audience" error
- Check audience configuration in Easy Auth
- Should match App Registration Client ID
- Format: `api://<client-id>` or just `<client-id>`

### "Invalid issuer" error
- Verify tenant ID is correct
- Check OpenID configuration URL
- Ensure using v2.0 endpoint

### Token expired
- Tokens typically valid for 1 hour
- Application should handle refresh
- Easy Auth handles refresh automatically for web sessions

### CORS errors
- Configure CORS in Container App settings
- Configure CORS policy in APIM
- Ensure credentials are included in requests

## Security Best Practices

1. **Always use HTTPS** - Landing zone enforces this
2. **Validate tokens on backend** - Don't trust client-side validation alone
3. **Use short-lived tokens** - Default 1 hour is good
4. **Store secrets in Key Vault** - Never in code or config files
5. **Use Managed Identity** - For Key Vault access from Container Apps
6. **Implement proper authorization** - Authentication ≠ Authorization
7. **Log authentication events** - For auditing and security monitoring
8. **Rotate secrets regularly** - Set expiration on client secrets
9. **Use Conditional Access** - Require MFA, device compliance (if Entra ID P1)
10. **Monitor for suspicious activity** - Use Entra ID sign-in logs

## Cost Considerations

- Entra ID Free tier: Basic authentication (included with Azure subscription)
- Entra ID P1: $6/user/month - Conditional Access, MFA, advanced features
- Entra ID P2: $9/user/month - Identity Protection, PIM
- Easy Auth: No additional cost (part of Container Apps)
- APIM JWT validation: No additional cost (part of APIM policies)

**For lab environment**: Free tier is sufficient for basic authentication.

## Additional Resources

- [Container Apps Authentication](https://learn.microsoft.com/azure/container-apps/authentication)
- [APIM JWT Validation Policy](https://learn.microsoft.com/azure/api-management/validate-jwt-policy)
- [Microsoft Entra ID App Registrations](https://learn.microsoft.com/entra/identity-platform/quickstart-register-app)
- [OAuth 2.0 and OpenID Connect](https://learn.microsoft.com/entra/identity-platform/v2-protocols)
- [Microsoft identity platform tokens](https://learn.microsoft.com/entra/identity-platform/security-tokens)
