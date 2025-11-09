# Key Vault Integration for OCR Translation App

This guide shows how to deploy the OCR Translation app with all secrets stored securely in Azure Key Vault.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Azure Key Vault                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Secrets:                                            │   │
│  │  - acr-password                                     │   │
│  │  - ai-foundry-key                                   │   │
│  │  - translator-key                                   │   │
│  │  - azure-openai-key                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ (Managed Identity RBAC)
                        │ Key Vault Secrets User
                        ↓
┌─────────────────────────────────────────────────────────────┐
│            Container Apps (Backend + Frontend)              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ System-Assigned Managed Identity                    │   │
│  │  - Reads secrets from Key Vault at runtime          │   │
│  │  - No secrets in app configuration                  │   │
│  │  - Automatic secret rotation support                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Benefits

1. **Centralized Secret Management**: All secrets in one secure location
2. **No Secrets in Code**: Secrets never appear in Bicep outputs or logs
3. **Automatic Rotation**: Update Key Vault secrets without redeploying apps
4. **RBAC-Based Access**: Managed identities access secrets via Azure RBAC
5. **Audit Trail**: Key Vault logs all secret access attempts

## How It Works

### 1. Secrets Storage
The Bicep template accepts secrets as secure parameters and stores them in Key Vault:

```bicep
@secure()
param translatorKey string = ''

resource secretTranslatorKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'translator-key'
  properties: {
    value: translatorKey
    contentType: 'Azure Translator API Key'
  }
}
```

### 2. Container App Secret References
Container Apps reference Key Vault secrets using managed identity:

```bicep
configuration: {
  secrets: [
    {
      name: 'translator-key'
      keyVaultUrl: '${keyVault.properties.vaultUri}secrets/translator-key'
      identity: 'system'  // Use system-assigned managed identity
    }
  ]
}
```

### 3. Environment Variables
Secrets are injected as environment variables at runtime:

```bicep
env: [
  {
    name: 'TRANSLATOR_KEY'
    secretRef: 'translator-key'  // References Key Vault secret
  }
]
```

### 4. RBAC Permissions
The template grants Container Apps the **Key Vault Secrets User** role:

```bicep
resource backendKeyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 
                                            '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
```

## Deployment

### Prerequisites
- Existing Key Vault in the resource group
- Azure CLI installed and authenticated
- Contributor access to resource group
- Key Vault Administrator access to Key Vault

### Option 1: PowerShell Script (Recommended)

The PowerShell script automatically retrieves all keys and endpoints:

```powershell
cd examples/ocr-translation-app/infrastructure

.\deploy-with-keyvault.ps1 `
    -ResourceGroupName "rg-ailz-lab" `
    -KeyVaultName "kv-ailz-ezle7syi" `
    -Location "swedencentral" `
    -UniqueSuffix "ezle7syi"
```

### Option 2: Manual Deployment

1. **Get Key Vault information**:
```bash
KV_ID=$(az keyvault show --name kv-ailz-ezle7syi --resource-group rg-ailz-lab --query id -o tsv)
```

2. **Retrieve API keys**:
```bash
TRANSLATOR_KEY=$(az cognitiveservices account keys list \
    --name dt-ailz-ezle7syi \
    --resource-group rg-ailz-lab \
    --query key1 -o tsv)

ACR_PASSWORD=$(az acr credential show \
    --name acrezle7syiailz \
    --query "passwords[0].value" -o tsv)
```

3. **Deploy Bicep template**:
```bash
az deployment group create \
    --name ocr-translation-app \
    --resource-group rg-ailz-lab \
    --template-file app-with-keyvault.bicep \
    --parameters \
        keyVaultResourceId="$KV_ID" \
        keyVaultName="kv-ailz-ezle7syi" \
        uniqueSuffix="ezle7syi" \
        translatorKey="$TRANSLATOR_KEY" \
        acrPassword="$ACR_PASSWORD" \
        documentIntelligenceEndpoint="https://di-ailz-ezle7syi.cognitiveservices.azure.com/" \
        documentTranslatorEndpoint="https://dt-ailz-ezle7syi.cognitiveservices.azure.com/" \
        storageAccountName="stailzezle7syi"
```

## Parameters

### Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `keyVaultResourceId` | Full resource ID of Key Vault | `/subscriptions/.../vaults/kv-ailz-ezle7syi` |
| `keyVaultName` | Name of Key Vault | `kv-ailz-ezle7syi` |
| `uniqueSuffix` | 8-character unique suffix | `ezle7syi` |

### Secret Parameters (Secure)

| Parameter | Description | Source |
|-----------|-------------|--------|
| `acrPassword` | Container Registry password | `az acr credential show` |
| `aiFoundryKey` | AI Foundry API key | AI Foundry service |
| `translatorKey` | Translator API key | `az cognitiveservices account keys list` |
| `azureOpenAIKey` | Azure OpenAI API key | Azure OpenAI service |

### Endpoint Parameters (Public)

| Parameter | Description | Example |
|-----------|-------------|---------|
| `aiFoundryEndpoint` | AI Foundry endpoint URL | `https://ai-foundry-endpoint.com` |
| `documentIntelligenceEndpoint` | Document Intelligence endpoint | `https://di-ailz-ezle7syi.cognitiveservices.azure.com/` |
| `documentTranslatorEndpoint` | Translator endpoint | `https://dt-ailz-ezle7syi.cognitiveservices.azure.com/` |
| `azureOpenAIEndpoint` | Azure OpenAI endpoint | `https://your-openai.openai.azure.com/` |

## Secrets Stored in Key Vault

After deployment, these secrets are stored in Key Vault:

1. **acr-password** - Azure Container Registry password
2. **ai-foundry-key** - AI Foundry API key
3. **translator-key** - Azure Translator API key
4. **azure-openai-key** - Azure OpenAI API key

## Updating Secrets

To rotate a secret without redeploying the app:

1. **Update the secret in Key Vault**:
```bash
az keyvault secret set \
    --vault-name kv-ailz-ezle7syi \
    --name translator-key \
    --value "new-key-value"
```

2. **Restart the Container App** (to pick up new value):
```bash
az containerapp revision restart \
    --name aca-ocr-trans-backend-ezle7syi \
    --resource-group rg-ailz-lab
```

## Verifying Key Vault Access

Check that Container Apps have proper RBAC access:

```bash
# Get backend app's principal ID
BACKEND_PRINCIPAL=$(az containerapp show \
    --name aca-ocr-trans-backend-ezle7syi \
    --resource-group rg-ailz-lab \
    --query "identity.principalId" -o tsv)

# List role assignments
az role assignment list \
    --assignee $BACKEND_PRINCIPAL \
    --scope /subscriptions/.../vaults/kv-ailz-ezle7syi
```

Should show: **Key Vault Secrets User** role

## Troubleshooting

### Secret Not Found
**Error**: `Secret 'translator-key' not found in Key Vault`

**Solution**: Ensure secret exists in Key Vault:
```bash
az keyvault secret show --vault-name kv-ailz-ezle7syi --name translator-key
```

### Access Denied
**Error**: `The user, group or application does not have secrets get permission`

**Solution**: Grant Key Vault Secrets User role:
```bash
az role assignment create \
    --role "Key Vault Secrets User" \
    --assignee $BACKEND_PRINCIPAL \
    --scope /subscriptions/.../vaults/kv-ailz-ezle7syi
```

### Secret Not Updating
**Issue**: Secret changed in Key Vault but app still uses old value

**Solution**: Container Apps cache secrets. Restart to refresh:
```bash
az containerapp revision restart \
    --name aca-ocr-trans-backend-ezle7syi \
    --resource-group rg-ailz-lab
```

## Security Best Practices

1. ✅ **Use Managed Identities**: No credentials in code or configuration
2. ✅ **Enable Soft Delete**: Recover accidentally deleted secrets (90 days)
3. ✅ **Enable Purge Protection**: Prevent permanent deletion during retention
4. ✅ **Use Private Endpoints**: Keep Key Vault off public internet
5. ✅ **Enable Audit Logging**: Monitor all secret access via Diagnostic Settings
6. ✅ **Principle of Least Privilege**: Grant only "Secrets User" role, not "Secrets Officer"

## Cost Considerations

- **Key Vault**: ~$0.03 per 10,000 operations
- **Secret Storage**: First 50,000 secrets free, then $0.03 per secret/month
- **No additional cost** for Container Apps to access Key Vault via managed identity

## Comparison: Before vs After

### Before (Direct Secrets)
```bicep
secrets: [
  {
    name: 'translator-key'
    value: translatorKey  // ❌ Visible in logs/outputs
  }
]
```

### After (Key Vault)
```bicep
secrets: [
  {
    name: 'translator-key'
    keyVaultUrl: 'https://kv-ailz.vault.azure.net/secrets/translator-key'
    identity: 'system'  // ✅ Secure, auditable, rotatable
  }
]
```

## Next Steps

1. ✅ Deploy using `app-with-keyvault.bicep`
2. ✅ Verify secrets in Key Vault
3. ✅ Test Container Apps can access secrets
4. ✅ Enable Key Vault diagnostic logs
5. ✅ Set up secret rotation policies
6. ✅ Configure alerts for access failures

## References

- [Azure Key Vault Best Practices](https://learn.microsoft.com/azure/key-vault/general/best-practices)
- [Container Apps Secrets](https://learn.microsoft.com/azure/container-apps/manage-secrets)
- [Managed Identity with Key Vault](https://learn.microsoft.com/azure/key-vault/general/rbac-guide)
