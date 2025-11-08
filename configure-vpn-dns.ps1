# Configure DNS for VPN connection
# Run this script as Administrator

$vpnInterface = "vnet-ailz-lab"
$dnsServer = "10.0.4.4"

Write-Host "Configuring DNS for VPN interface: $vpnInterface" -ForegroundColor Cyan

try {
    # Check if interface exists
    $interface = Get-NetAdapter -Name $vpnInterface -ErrorAction Stop
    Write-Host "✓ VPN interface found: $($interface.Name)" -ForegroundColor Green
    
    # Set DNS server
    Set-DnsClientServerAddress -InterfaceAlias $vpnInterface -ServerAddresses $dnsServer
    Write-Host "✓ DNS server configured: $dnsServer" -ForegroundColor Green
    
    # Verify configuration
    $dnsConfig = Get-DnsClientServerAddress -InterfaceAlias $vpnInterface -AddressFamily IPv4
    Write-Host "`nDNS Configuration:" -ForegroundColor Yellow
    Write-Host "  Interface: $($dnsConfig.InterfaceAlias)"
    Write-Host "  DNS Servers: $($dnsConfig.ServerAddresses -join ', ')"
    
    # Test DNS resolution
    Write-Host "`nTesting DNS resolution..." -ForegroundColor Yellow
    $testDomain = "aca-ocr-trans-frontend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io"
    $result = Resolve-DnsName -Name $testDomain -Server $dnsServer -ErrorAction SilentlyContinue
    
    if ($result) {
        Write-Host "✓ DNS resolution successful!" -ForegroundColor Green
        Write-Host "  $testDomain -> $($result.IPAddress)" -ForegroundColor Gray
    } else {
        Write-Host "✗ DNS resolution failed" -ForegroundColor Red
    }
    
    Write-Host "`n✓ Configuration complete!" -ForegroundColor Green
    Write-Host "You can now access Container Apps via browser while connected to VPN." -ForegroundColor Cyan
    
} catch {
    Write-Host "✗ Error: $_" -ForegroundColor Red
    Write-Host "`nMake sure:" -ForegroundColor Yellow
    Write-Host "  1. You are running PowerShell as Administrator"
    Write-Host "  2. You are connected to the VPN (interface: $vpnInterface)"
    exit 1
}
