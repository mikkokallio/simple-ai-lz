# ============================================================================
# Post-Deployment Configuration Script
# ============================================================================
# This script performs configuration steps that cannot be done during
# initial Bicep deployment due to circular dependencies or Azure limitations.
#
# Run this script AFTER the main Bicep deployment completes successfully.
#
# Usage:
#   .\post-deploy.ps1
# ============================================================================

$ErrorActionPreference = "Stop"

$resourceGroup = "rg-ailz-lab"
$vnetName = "vnet-ailz-lab"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Post-Deployment Configuration" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# 1. Configure VNet DNS Servers
# ============================================================================

Write-Host "Step 1: Configuring VNet DNS servers..." -ForegroundColor Yellow
Write-Host ""

# Get DNS Resolver inbound endpoint IP
try {
    $dnsResolverIp = az deployment sub show `
        --name ailz-mvp-deployment `
        --query "properties.outputs.dnsResolverInboundIp.value" `
        --output tsv
    
    if ([string]::IsNullOrEmpty($dnsResolverIp)) {
        throw "DNS Resolver IP is empty"
    }
    
    Write-Host "✓ DNS Resolver inbound endpoint: $dnsResolverIp" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "❌ Error: Could not retrieve DNS Resolver IP from deployment outputs" -ForegroundColor Red
    Write-Host "   Make sure the main deployment completed successfully" -ForegroundColor Yellow
    exit 1
}

# Update VNet DNS configuration
Write-Host "Updating VNet DNS servers..." -ForegroundColor Gray
az network vnet update `
    --resource-group $resourceGroup `
    --name $vnetName `
    --dns-servers $dnsResolverIp `
    --output none

Write-Host "✓ VNet DNS servers configured" -ForegroundColor Green
Write-Host ""

# ============================================================================
# 2. Regenerate VPN Client Configuration (if VPN Gateway is deployed)
# ============================================================================

Write-Host "Step 2: Checking for VPN Gateway..." -ForegroundColor Yellow
Write-Host ""

try {
    $vpnGatewayName = az network vnet-gateway list `
        --resource-group $resourceGroup `
        --query "[0].name" `
        --output tsv 2>$null
    
    if (![string]::IsNullOrEmpty($vpnGatewayName)) {
        Write-Host "✓ VPN Gateway found: $vpnGatewayName" -ForegroundColor Green
        Write-Host ""
        
        Write-Host "Regenerating VPN client configuration..." -ForegroundColor Gray
        $vpnProfileUrl = az network vnet-gateway vpn-client generate `
            --resource-group $resourceGroup `
            --name $vpnGatewayName `
            --processor-architecture Amd64 `
            --output tsv
        
        Write-Host "✓ VPN client configuration regenerated" -ForegroundColor Green
        Write-Host ""
        Write-Host "📥 Download VPN profile: $vpnProfileUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "⚠️  IMPORTANT: To enable DNS resolution for VPN clients:" -ForegroundColor Yellow
        Write-Host "   1. Download the VPN profile from the URL above" -ForegroundColor Gray
        Write-Host "   2. Disconnect from VPN if currently connected" -ForegroundColor Gray
        Write-Host "   3. Import the new profile to Azure VPN Client" -ForegroundColor Gray
        Write-Host "   4. Reconnect to VPN" -ForegroundColor Gray
        Write-Host "   5. Verify DNS works: nslookup <internal-fqdn> $dnsResolverIp" -ForegroundColor Gray
        Write-Host ""
    }
    else {
        Write-Host "⚠️  No VPN Gateway found (deployment may have skipped it)" -ForegroundColor Yellow
        Write-Host "   DNS configuration is still useful for Azure resources" -ForegroundColor Gray
        Write-Host ""
    }
}
catch {
    Write-Host "⚠️  No VPN Gateway found" -ForegroundColor Yellow
    Write-Host ""
}

# ============================================================================
# 3. Summary
# ============================================================================

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "✅ Post-Deployment Configuration Complete" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "DNS Resolver IP: $dnsResolverIp" -ForegroundColor Gray
Write-Host "VNet DNS configured: Yes" -ForegroundColor Gray
if (![string]::IsNullOrEmpty($vpnGatewayName)) {
    Write-Host "VPN profile regenerated: Yes" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Download and import the new VPN profile" -ForegroundColor Gray
    Write-Host "  2. Test DNS resolution from VPN client" -ForegroundColor Gray
    Write-Host "  3. Access internal Container Apps via browser" -ForegroundColor Gray
}
else {
    Write-Host "VPN Gateway: Not deployed" -ForegroundColor Gray
}
Write-Host ""
