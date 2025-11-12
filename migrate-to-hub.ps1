# Hub-Spoke Migration Script
$ErrorActionPreference = "Stop"

$landingZoneRg = "rg-ailz-lab"
$subscriptionId = (az account show --query id -o tsv)

Write-Host "`n[Step 1] Deleting VPN Gateway from Landing Zone..."
$vpnGateway = az network vnet-gateway list --resource-group $landingZoneRg --query "[0].name" -o tsv 2>$null
if ($vpnGateway) {
    Write-Host "  Deleting $vpnGateway (10-15 min)..."
    az network vnet-gateway delete --name $vpnGateway --resource-group $landingZoneRg --no-wait
}

Write-Host "`n[Step 2] Deleting DNS Resolver from Landing Zone..."
$dnsResolver = az dns-resolver list --resource-group $landingZoneRg --query "[0].name" -o tsv 2>$null
if ($dnsResolver) {
    Write-Host "  Deleting $dnsResolver..."
    az dns-resolver delete --name $dnsResolver --resource-group $landingZoneRg --yes --no-wait
}

Write-Host "`n[Step 3] Waiting for deletions (15-20 min)..."
if ($vpnGateway) {
    while ($true) {
        $status = az network vnet-gateway show --name $vpnGateway --resource-group $landingZoneRg 2>&1
        if ($status -match "ResourceNotFound" -or $LASTEXITCODE -ne 0) {
            Write-Host "  VPN Gateway deleted"
            break
        }
        Write-Host "  Still deleting VPN Gateway..."
        Start-Sleep -Seconds 30
    }
}

if ($dnsResolver) {
    while ($true) {
        $status = az dns-resolver show --name $dnsResolver --resource-group $landingZoneRg 2>&1
        if ($status -match "ResourceNotFound" -or $LASTEXITCODE -ne 0) {
            Write-Host "  DNS Resolver deleted"
            break
        }
        Write-Host "  Still deleting DNS Resolver..."
        Start-Sleep -Seconds 10
    }
}

Write-Host "`n[Step 4] Removing subnets from Landing Zone VNet..."
az network vnet subnet delete --name GatewaySubnet --vnet-name vnet-ailz-lab --resource-group $landingZoneRg 2>$null
az network vnet subnet delete --name snet-dns-inbound --vnet-name vnet-ailz-lab --resource-group $landingZoneRg 2>$null

Write-Host "`n[Step 5] Deploying Hub Infrastructure..."
az deployment sub create `
    --location swedencentral `
    --template-file hub.bicep `
    --parameters hub.bicepparam `
    --name "hub-deployment-$(Get-Date -Format 'yyyyMMddHHmmss')"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Hub deployment failed"
    exit 1
}

$hubVnetId = az network vnet show --name "vnet-hub-ezle7syi" --resource-group "rg-connectivity-hub" --query id -o tsv

Write-Host "`n[Step 6] Setting up VNet Peering..."
az network vnet peering create `
    --name "hub-to-lz" `
    --resource-group "rg-connectivity-hub" `
    --vnet-name "vnet-hub-ezle7syi" `
    --remote-vnet "/subscriptions/$subscriptionId/resourceGroups/$landingZoneRg/providers/Microsoft.Network/virtualNetworks/vnet-ailz-lab" `
    --allow-vnet-access `
    --allow-forwarded-traffic `
    --allow-gateway-transit

az network vnet peering create `
    --name "lz-to-hub" `
    --resource-group $landingZoneRg `
    --vnet-name "vnet-ailz-lab" `
    --remote-vnet $hubVnetId `
    --allow-vnet-access `
    --allow-forwarded-traffic `
    --use-remote-gateways

Write-Host "`n[Step 7] Updating Landing Zone VNet DNS..."
$dnsResolverIp = az network private-dns-resolver inbound-endpoint list `
    --resource-group "rg-connectivity-hub" `
    --dns-resolver-name "dnsres-ezle7syi" `
    --query "[0].ipConfigurations[0].privateIpAddress" -o tsv

az network vnet update `
    --name "vnet-ailz-lab" `
    --resource-group $landingZoneRg `
    --dns-servers $dnsResolverIp

Write-Host "`nMigration Complete!"
Write-Host "DNS Resolver IP: $dnsResolverIp"
Write-Host "`nNext: Generate VPN profile from Hub:"
Write-Host "az network vnet-gateway vpn-client generate --resource-group rg-connectivity-hub --name vpngw-ezle7syi --authentication-method EAPTLS -o tsv"
