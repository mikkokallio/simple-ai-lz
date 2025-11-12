# Fix VPN & DNS Configuration for Hub-Spoke Architecture
# This script fixes DNS resolution issues

$ErrorActionPreference = "Stop"

# Configuration
$hubResourceGroup = "rg-connectivity-hub"
$lzResourceGroup = "rg-ailz-lab"
$hubVnetName = "vnet-hub-ezle7syi"
$dnsResolverIp = "10.1.1.4"

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "VPN & DNS Configuration Fix Script" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Update Hub VNet DNS
Write-Host "[Step 1/3] Updating Hub VNet DNS configuration..." -ForegroundColor Yellow
Write-Host "  Setting DNS server to: $dnsResolverIp" -ForegroundColor Gray

az network vnet update --name $hubVnetName --resource-group $hubResourceGroup --dns-servers $dnsResolverIp --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Hub VNet DNS configuration updated" -ForegroundColor Green
} else {
    Write-Host "  ✗ Failed to update Hub VNet DNS" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 2: Get Hub VNet ID
Write-Host "[Step 2/3] Getting Hub VNet resource ID..." -ForegroundColor Yellow

$hubVnetId = az network vnet show --name $hubVnetName --resource-group $hubResourceGroup --query "id" --output tsv

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Hub VNet ID: $hubVnetId" -ForegroundColor Green
} else {
    Write-Host "  ✗ Failed to get Hub VNet ID" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Link DNS Zones
Write-Host "[Step 3/3] Linking Private DNS Zones to Hub VNet..." -ForegroundColor Yellow

$dnsZones = az network private-dns zone list --resource-group $lzResourceGroup --query "[].name" --output tsv

if (-not $dnsZones) {
    Write-Host "  ! No private DNS zones found" -ForegroundColor Yellow
} else {
    $zoneArray = $dnsZones -split "`n" | Where-Object { $_.Trim() -ne "" }
    $zoneCount = $zoneArray.Count
    Write-Host "  Found $zoneCount private DNS zones" -ForegroundColor Gray
    Write-Host ""

    $successCount = 0
    $skipCount = 0
    $errorCount = 0

    foreach ($zone in $zoneArray) {
        $zone = $zone.Trim()
        if ($zone -eq "") { continue }
        
        Write-Host "  Processing: $zone" -ForegroundColor Cyan
        
        $linkName = "hub-vnet-link"
        
        # Check if link exists
        $existingLink = az network private-dns link vnet show --resource-group $lzResourceGroup --zone-name $zone --name $linkName --query "id" --output tsv 2>$null

        if ($existingLink) {
            Write-Host "    ⊙ VNet link already exists" -ForegroundColor Yellow
            $skipCount++
        } else {
            # Create link
            $linkResult = az network private-dns link vnet create --resource-group $lzResourceGroup --zone-name $zone --name $linkName --virtual-network $hubVnetId --registration-enabled false --output none 2>&1

            if ($LASTEXITCODE -eq 0) {
                Write-Host "    ✓ VNet link created" -ForegroundColor Green
                $successCount++
            } else {
                Write-Host "    ✗ Failed to create VNet link" -ForegroundColor Red
                $errorCount++
            }
        }
    }

    Write-Host ""
    Write-Host "  Summary:" -ForegroundColor Cyan
    Write-Host "    ✓ Successfully linked: $successCount zones" -ForegroundColor Green
    Write-Host "    ⊙ Already linked: $skipCount zones" -ForegroundColor Yellow
    if ($errorCount -gt 0) {
        Write-Host "    ✗ Failed: $errorCount zones" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Configuration Update Complete!" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Reconnect your VPN connection" -ForegroundColor White
Write-Host "2. Test DNS: nslookup aca-ai-chat-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io" -ForegroundColor Gray
Write-Host "3. Check DNS server: ipconfig /all | Select-String 'DNS Servers'" -ForegroundColor Gray
Write-Host ""
