# Google OAuth Setup Guide

This guide covers setting up Google OAuth for both local development and Azure production deployment.

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
   - Click the project dropdown at the top
   - Click "New Project"
   - Name it "Adventure Creator" (or your preferred name)
   - Click "Create"

## Step 2: Enable Google+ API

1. In the left sidebar, go to **APIs & Services** > **Library**
2. Search for "Google+ API"
3. Click on it and click **Enable**

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace organization)
3. Click **Create**
4. Fill in the required fields:
   - **App name**: Adventure Creator
   - **User support email**: Your email
   - **Developer contact information**: Your email
5. Click **Save and Continue**
6. On the **Scopes** page, click **Add or Remove Scopes**
   - Add: `userinfo.email`
   - Add: `userinfo.profile`
7. Click **Save and Continue**
8. On **Test users** page (if in testing mode):
   - Add your email and any other test users
   - Click **Save and Continue**
9. Click **Back to Dashboard**

## Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client ID**
3. Choose **Web application** as application type
4. Name it "Adventure Creator Web Client"
5. Add **Authorized redirect URIs**:

### For Local Development:
```
http://localhost:8080/api/auth/callback
http://localhost:5173/auth/callback
```

### For Azure Production:
Based on your infrastructure configuration (uniqueSuffix: `demo11`, location: `swedencentral`):

```
https://ca-adventure-backend-demo11.<environment-hash>.swedencentral.azurecontainerapps.io/api/auth/callback
https://ca-adventure-frontend-demo11.<environment-hash>.swedencentral.azurecontainerapps.io/auth/callback
```

**To get your actual URLs after deployment:**
```powershell
# Run this in PowerShell from the root directory
az containerapp show --name ca-adventure-backend-demo11 --resource-group rg-ailz-demo-v11 --query "properties.configuration.ingress.fqdn" -o tsv
az containerapp show --name ca-adventure-frontend-demo11 --resource-group rg-ailz-demo-v11 --query "properties.configuration.ingress.fqdn" -o tsv
```

Or check the deployment outputs after running the deployment

6. Click **Create**
7. **Copy the Client ID and Client Secret** - you'll need these next

## Step 5: Configure Local Environment

1. Open `backend/.env` file
2. Add your credentials:

```env
# Google OAuth
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:8080/api/auth/callback

# Admin Configuration
ADMIN_EMAIL=your-email@gmail.com

# Session
SESSION_SECRET=generate-a-random-string-here

# Frontend (for redirects after login)
FRONTEND_URL=http://localhost:5173
```

**Important**: Generate a secure random string for `SESSION_SECRET`. You can use:
```powershell
# PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

## Step 6: Configure Azure Production Environment

### Option A: Using Azure Portal

1. Go to your Azure Container App (backend)
2. Navigate to **Settings** > **Environment variables**
3. Add the following secrets:

```
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://YOUR_BACKEND_URL/api/auth/callback
ADMIN_EMAIL=your-email@gmail.com
SESSION_SECRET=your-production-secret-here
FRONTEND_URL=https://YOUR_FRONTEND_URL
NODE_ENV=production
```

### Option B: Using Bicep/Infrastructure as Code

Add to your `main.bicepparam` or infrastructure configuration:

```bicep
param googleClientId string = '' // Set via parameter or KeyVault
param googleClientSecret string = '' // Set via parameter or KeyVault
param adminEmail string = 'your-email@gmail.com'
param sessionSecret string = '' // Generate and store securely
```

Update your container app environment variables in the Bicep template:

```bicep
env: [
  {
    name: 'GOOGLE_CLIENT_ID'
    value: googleClientId
  }
  {
    name: 'GOOGLE_CLIENT_SECRET'
    secretRef: 'google-client-secret' // Store as secret
  }
  {
    name: 'GOOGLE_REDIRECT_URI'
    value: 'https://${backendContainerApp.properties.configuration.ingress.fqdn}/api/auth/callback'
  }
  {
    name: 'ADMIN_EMAIL'
    value: adminEmail
  }
  {
    name: 'SESSION_SECRET'
    secretRef: 'session-secret' // Store as secret
  }
  {
    name: 'FRONTEND_URL'
    value: 'https://${frontendContainerApp.properties.configuration.ingress.fqdn}'
  }
  {
    name: 'NODE_ENV'
    value: 'production'
  }
]
```

### Option C: Using Azure Key Vault (Recommended for Production)

1. Create secrets in Azure Key Vault:
   - `google-client-id`
   - `google-client-secret`
   - `session-secret`

2. Grant your Container App managed identity access to Key Vault

3. Reference secrets in container environment:
```bicep
{
  name: 'GOOGLE_CLIENT_SECRET'
  secretRef: 'google-client-secret'
}
```

## Step 7: Update MongoDB Connection

### Local Development:
```env
MONGO_CONNECTION_STRING=mongodb://localhost:27017/adventure-creator
```

### Azure Production:
Use Azure Cosmos DB with MongoDB API or Azure Container Instances with MongoDB:

```env
MONGO_CONNECTION_STRING=mongodb://your-cosmosdb-account.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb
```

Or add to your Cosmos service for session storage:
```bicep
// In your Cosmos DB configuration
capability: [
  {
    name: 'EnableMongo'
  }
]
```

## Step 8: Test the Setup

### Local Testing:
1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Navigate to `http://localhost:5173`
4. Click "Sign In with Google"
5. You should see the Google OAuth consent screen
6. After authorizing, you should be redirected back and logged in

### Production Testing:
1. Deploy to Azure
2. Navigate to your frontend URL
3. Click "Sign In with Google"
4. Verify redirect works correctly
5. Check that you have admin access (if using ADMIN_EMAIL)

## Troubleshooting

### "Redirect URI mismatch" error
- Verify the redirect URI in Google Cloud Console exactly matches your backend URL
- Make sure there are no trailing slashes
- Check both development and production URIs are added

### "Invalid client" error
- Double-check your Client ID and Client Secret are correct
- Ensure there are no extra spaces or quotes in the .env file

### Session not persisting
- Verify `SESSION_SECRET` is set
- Check MongoDB/Cosmos DB connection string is correct
- In production, ensure `cookie.secure` is true and you're using HTTPS

### CORS errors
- Verify `FRONTEND_URL` is correctly set in backend .env
- Check that CORS is configured to allow credentials
- Ensure frontend and backend URLs match what's in the environment variables

## Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use different secrets** for development and production
3. **Rotate secrets regularly** in production
4. **Use Azure Key Vault** for production secrets
5. **Enable HTTPS** for all production URLs
6. **Set secure cookies** in production (`secure: true`, `httpOnly: true`, `sameSite: 'strict'`)
7. **Restrict OAuth consent screen** to specific domains if possible
8. **Monitor authentication logs** for suspicious activity

## Production Checklist

- [ ] Google OAuth credentials created
- [ ] Redirect URIs added for production URLs
- [ ] Environment variables configured in Azure
- [ ] Secrets stored in Azure Key Vault
- [ ] MongoDB/Cosmos DB connection configured
- [ ] HTTPS enabled on all endpoints
- [ ] ADMIN_EMAIL configured
- [ ] SESSION_SECRET generated (different from dev)
- [ ] CORS configured for production domains
- [ ] OAuth consent screen published (if not in testing mode)
- [ ] Test user can sign in successfully
- [ ] Admin user has correct permissions
- [ ] Sessions persist correctly
- [ ] User data isolation verified
