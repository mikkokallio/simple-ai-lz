# Entra ID App Registration Setup Guide

This guide explains how to create and configure an Azure Entra ID app registration for the AI Chat application with user authentication.

## Overview

The application uses:
- **Frontend**: MSAL (Microsoft Authentication Library) for browser-based authentication
- **Backend**: passport-azure-ad for API token validation
- **Flow**: Authorization Code Flow with PKCE (industry standard for SPAs)

## Step 1: Create App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** > **App registrations**
3. Click **+ New registration**
4. Fill in:
   - **Name**: `AI Chat App` (or your preferred name)
   - **Supported account types**: 
     - Choose **Accounts in this organizational directory only (Single tenant)** for internal apps
     - Choose **Accounts in any organizational directory (Multi-tenant)** if you want to support multiple organizations
   - **Redirect URI**: 
     - Platform: **Single-page application (SPA)**
     - URI: `http://localhost:5173` (for local development)
5. Click **Register**

## Step 2: Configure Authentication

After registration, configure the authentication settings:

### Add Production Redirect URIs

1. Go to **Authentication** in your app registration
2. Under **Single-page application** platform, click **Add URI**
3. Add your production frontend URL:
   ```
   https://aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io
   ```
4. Add any other environments (staging, etc.)

### Configure Token Settings

1. Scroll down to **Implicit grant and hybrid flows**
2. **DO NOT** check any boxes (we're using Authorization Code Flow with PKCE, not implicit flow)

3. Scroll to **Advanced settings**
4. **Allow public client flows**: Set to **No** (this is a confidential client for the backend)

## Step 3: Create Client Secret (for Backend API)

1. Go to **Certificates & secrets**
2. Click **+ New client secret**
3. Add description: `Backend API Secret`
4. Choose expiration: **24 months** (recommended for production)
5. Click **Add**
6. **IMPORTANT**: Copy the **Value** immediately - you won't be able to see it again!
7. Store this as `ENTRA_CLIENT_SECRET` in your backend `.env` file

## Step 4: Configure API Permissions

1. Go to **API permissions**
2. The default permissions should include:
   - **Microsoft Graph** > **User.Read** (Delegated)
3. This is sufficient for basic user authentication
4. Click **Grant admin consent for [your org]** if you have admin rights (recommended)

## Step 5: Expose an API (for Backend Token Validation)

1. Go to **Expose an API**
2. Click **+ Add a scope**
3. Accept the default **Application ID URI** (or customize it)
4. Add scope:
   - **Scope name**: `access_as_user`
   - **Who can consent**: **Admins and users**
   - **Admin consent display name**: `Access AI Chat API`
   - **Admin consent description**: `Allows the app to access the AI Chat API on behalf of the signed-in user`
   - **User consent display name**: `Access AI Chat API`
   - **User consent description**: `Allows the app to access the AI Chat API on your behalf`
   - **State**: **Enabled**
5. Click **Add scope**

## Step 6: Configure Token Claims (Optional but Recommended)

1. Go to **Token configuration**
2. Click **+ Add optional claim**
3. Token type: **ID**
4. Select claims:
   - ✅ `email`
   - ✅ `family_name`
   - ✅ `given_name`
   - ✅ `upn` (User Principal Name)
5. Click **Add**
6. If prompted about Microsoft Graph permissions, check the box and click **Add**

Repeat for **Access** token type with same claims.

## Step 7: Copy Configuration Values

You'll need these values from the **Overview** page:

1. **Application (client) ID**: Copy this GUID
   - Use for: `ENTRA_CLIENT_ID` in backend `.env`
   - Use for: `clientId` in frontend MSAL config

2. **Directory (tenant) ID**: Copy this GUID
   - Use for: `ENTRA_TENANT_ID` in backend `.env`
   - Use for: `tenantId` in frontend MSAL config

3. **Client Secret**: Use the value you copied in Step 3
   - Use for: `ENTRA_CLIENT_SECRET` in backend `.env`

## Step 8: Update Environment Variables

### Backend (.env)

```bash
ENTRA_TENANT_ID=<your-tenant-id-guid>
ENTRA_CLIENT_ID=<your-client-id-guid>
ENTRA_CLIENT_SECRET=<your-client-secret-value>
ENTRA_AUDIENCE=<your-client-id-guid>
ENTRA_ISSUER=https://login.microsoftonline.com/<your-tenant-id>/v2.0
```

### Frontend (environment variables or config)

The frontend will need:
- `VITE_ENTRA_CLIENT_ID`: Your Application (client) ID
- `VITE_ENTRA_TENANT_ID`: Your Directory (tenant) ID
- `VITE_ENTRA_REDIRECT_URI`: Your frontend URL (e.g., `http://localhost:5173` for dev)

## Security Considerations

### ⚠️ Important Security Notes

1. **Never commit client secrets to git**
   - Use `.env` files (already in `.gitignore`)
   - Use Azure Key Vault in production

2. **Use Managed Identity when possible**
   - For Container Apps, configure Managed Identity
   - Eliminates need to manage secrets

3. **Token Validation**
   - Backend validates all incoming tokens
   - Checks signature, issuer, audience, expiration
   - Extracts user identity from validated tokens

4. **HTTPS Only in Production**
   - Entra ID requires HTTPS for production redirect URIs
   - Local development can use HTTP

5. **CORS Configuration**
   - Backend must allow frontend origin
   - Already configured in server.ts

## Testing the Setup

### Local Development

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Navigate to `http://localhost:5173`
4. Click login - should redirect to Microsoft login
5. After login, should return to app with user info

### Production

1. Deploy backend and frontend
2. Update redirect URIs in Entra ID to include production URLs
3. Update environment variables in Container Apps
4. Test login flow in production

## Troubleshooting

### "Invalid redirect URI" error
- Ensure the URI in the error matches exactly what's configured in Entra ID
- URIs are case-sensitive
- Must include protocol (http:// or https://)

### "AADSTS50011: The reply URL specified in the request does not match"
- Check redirect URIs in Authentication settings
- Ensure SPA platform is selected (not Web)

### "AADSTS700016: Application not found in the directory"
- Wrong tenant ID in configuration
- Check `ENTRA_TENANT_ID` matches your Entra ID tenant

### Token validation fails (401 errors)
- Check `ENTRA_ISSUER` is correct
- Verify `ENTRA_AUDIENCE` matches client ID
- Ensure token hasn't expired (check system clock)

### CORS errors
- Backend must allow frontend origin in CORS config
- Check `Access-Control-Allow-Origin` headers

## Multi-Tenant Support (Optional)

If you want to support users from multiple organizations:

1. Change **Supported account types** to **Accounts in any organizational directory**
2. Update `ENTRA_ISSUER` to use `organizations` instead of tenant ID:
   ```
   ENTRA_ISSUER=https://login.microsoftonline.com/organizations/v2.0
   ```
3. Handle tenant validation in backend code if needed

## Additional Resources

- [Microsoft Entra ID Documentation](https://learn.microsoft.com/en-us/entra/identity-platform/)
- [MSAL.js Documentation](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [passport-azure-ad Documentation](https://github.com/AzureAD/passport-azure-ad)
- [OAuth 2.0 Authorization Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
