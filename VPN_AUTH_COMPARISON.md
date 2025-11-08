# VPN Authentication Methods - Comparison

## Summary

Your VPN Gateway is currently deployed with **Certificate-based authentication** (from the earlier deployment). The Bicep has now been updated to support **Azure AD (Entra ID) authentication**, which is much more convenient for your Windows environment.

## Option 1: Azure AD (Entra ID) Authentication ⭐ RECOMMENDED

### Advantages for Your Scenario
- ✅ **Zero certificate management** - No PowerShell cert generation needed
- ✅ **Native Windows integration** - Uses your Microsoft/Entra ID credentials
- ✅ **Easier onboarding** - Just download Azure VPN Client and sign in
- ✅ **Better security** - Conditional Access, MFA policies apply automatically
- ✅ **Simpler automation** - Configuration baked into Bicep template

### How It Works
1. Deploy VPN Gateway with `vpnAuthType = 'AzureAD'` (now the default)
2. Download Azure VPN Client for Windows
3. Import VPN configuration (auto-generated with correct values)
4. Click "Connect" and sign in with your Microsoft account
5. Done! No certificates to generate or manage

### Configuration Values (Auto-populated in Bicep)
```
Tenant:   https://login.microsoftonline.com/822e1525-06a0-418c-9fab-ffc6a51aaac5
Audience: c632b3df-fb67-4d84-bdcf-b95ad541b5c8  # Microsoft's fixed GUID
Issuer:   https://sts.windows.net/822e1525-06a0-418c-9fab-ffc6a51aaac5/
Address Pool: 172.16.201.0/24  # Configurable parameter
```

### Client Installation
- **Windows**: [Azure VPN Client](https://aka.ms/azvpnclientdownload)
- **macOS/iOS**: Azure VPN Client from App Store
- **Android**: Azure VPN Client from Play Store
- **Linux**: OpenVPN with downloaded configuration

### Cost
Same as certificate-based: ~$5-20/month (VpnGw1 SKU)

---

## Option 2: Certificate-Based Authentication (Legacy)

### When to Use
- ❌ You need compatibility with very old VPN clients
- ❌ You can't use Azure AD for some reason
- ❌ You enjoy generating PowerShell certificates 😅

### Disadvantages
- ⛔ **Manual certificate generation** required (PowerShell commands)
- ⛔ **Certificate distribution** - Need to export/import certs to each device
- ⛔ **Certificate expiration** - Must track and renew before expiry
- ⛔ **No conditional access** - Can't enforce MFA or location policies
- ⛔ **More complex setup** - 6+ steps vs 3 steps for Azure AD

### Setup Process
1. Generate self-signed root certificate (PowerShell)
2. Generate client certificate (PowerShell)
3. Export root cert to Base64
4. Upload root cert to Azure VPN Gateway
5. Download VPN client configuration
6. Install and configure VPN client on each device
7. Export/import client certificates if using multiple devices

---

## Current Status

### Deployed Infrastructure
Your VPN Gateway `vpngw-ailz-ezle7syi` is currently running with **Certificate authentication** from the earlier deployment (ailz-prod-deployment-v3).

### Updated Bicep Templates
The Bicep has been updated to:
- ✅ Default to **Azure AD authentication** (`vpnAuthType = 'AzureAD'`)
- ✅ Support **both authentication types** (switchable via parameter)
- ✅ Auto-populate all Entra ID values (tenant, audience, issuer)
- ✅ Allow custom VPN client address pool (default: 172.16.201.0/24)

---

## Recommendation: Migrate to Azure AD Auth

### Why Migrate?
Since you're on Windows and using Microsoft/Entra ID, Azure AD authentication will:
1. **Save time**: 3 steps instead of 6+
2. **Improve security**: Automatic MFA, conditional access
3. **Simplify operations**: No certificates to manage
4. **Better UX**: Just sign in like any Microsoft service

### How to Migrate

**Option A: Update existing VPN Gateway** (Fastest)
```powershell
# Get VPN Gateway name
$gateway = "vpngw-ailz-ezle7syi"
$rg = "rg-ailz-lab"
$tenantId = "822e1525-06a0-418c-9fab-ffc6a51aaac5"

# Update to Azure AD authentication
az network vnet-gateway update `
  --name $gateway `
  --resource-group $rg `
  --client-protocol OpenVPN `
  --address-prefixes 172.16.201.0/24 `
  --aad-tenant "https://login.microsoftonline.com/$tenantId" `
  --aad-audience "c632b3df-fb67-4d84-bdcf-b95ad541b5c8" `
  --aad-issuer "https://sts.windows.net/$tenantId/" `
  --gateway-type Vpn `
  --vpn-type RouteBased `
  --vpn-auth-type AAD

# Takes ~5-10 minutes
```

**Option B: Redeploy with new configuration** (Clean slate)
1. Update `main.bicepparam` to ensure `vpnAuthType = 'AzureAD'` (already default)
2. Run deployment:
   ```powershell
   az deployment sub create `
     --name ailz-prod-deployment-v4 `
     --location swedencentral `
     --template-file main.bicep `
     --parameters main.bicepparam
   ```
3. Gateway will update in place (~10 minutes)

---

## Next Steps

### If sticking with Certificate Auth (current):
1. Generate certificates:
   ```powershell
   $cert = New-SelfSignedCertificate -Type Custom -KeySpec Signature `
     -Subject "CN=AilzP2SRootCert" -KeyExportPolicy Exportable `
     -HashAlgorithm sha256 -KeyLength 2048 `
     -CertStoreLocation "Cert:\CurrentUser\My" `
     -KeyUsageProperty Sign -KeyUsage CertSign
   
   New-SelfSignedCertificate -Type Custom -DnsName "AilzP2SClientCert" `
     -KeySpec Signature -Subject "CN=AilzP2SClientCert" `
     -KeyExportPolicy Exportable -HashAlgorithm sha256 -KeyLength 2048 `
     -CertStoreLocation "Cert:\CurrentUser\My" `
     -Signer $cert -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.2")
   ```

2. Upload root certificate to VPN Gateway (see UPGRADE_TO_PRODUCTION.md)

### If migrating to Azure AD Auth (recommended): ⭐
1. Run Option A command above to update existing gateway, OR
2. Redeploy with updated Bicep (Option B)
3. Download Azure VPN Client
4. Import configuration and connect

---

## Questions?

- **Can I switch back and forth?** Yes, it's just a configuration change on the VPN Gateway
- **Will existing connections break?** Yes, briefly during the auth type change (~2-5 minutes)
- **Can I use both simultaneously?** No, the gateway supports one auth type at a time
- **Is Azure AD more expensive?** No, same cost (~$5-20/month for VpnGw1 SKU)

---

**Your choice!** Both work, but Azure AD is significantly easier for your Windows + Microsoft environment. 🚀
