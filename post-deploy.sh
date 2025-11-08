#!/bin/bash
# ============================================================================
# Post-Deployment Configuration Script
# ============================================================================
# This script performs configuration steps that cannot be done during
# initial Bicep deployment due to circular dependencies or Azure limitations.
#
# Run this script AFTER the main Bicep deployment completes successfully.
#
# Usage:
#   chmod +x post-deploy.sh
#   ./post-deploy.sh
# ============================================================================

set -e  # Exit on error

RESOURCE_GROUP="rg-ailz-lab"
VNET_NAME="vnet-ailz-lab"

echo "========================================="
echo "Post-Deployment Configuration"
echo "========================================="
echo ""

# ============================================================================
# 1. Configure VNet DNS Servers
# ============================================================================

echo "Step 1: Configuring VNet DNS servers..."
echo ""

# Get DNS Resolver inbound endpoint IP
DNS_RESOLVER_IP=$(az deployment sub show \
  --name ailz-mvp-deployment \
  --query "properties.outputs.dnsResolverInboundIp.value" \
  --output tsv)

if [ -z "$DNS_RESOLVER_IP" ]; then
  echo "❌ Error: Could not retrieve DNS Resolver IP from deployment outputs"
  echo "   Make sure the main deployment completed successfully"
  exit 1
fi

echo "✓ DNS Resolver inbound endpoint: $DNS_RESOLVER_IP"
echo ""

# Update VNet DNS configuration
echo "Updating VNet DNS servers..."
az network vnet update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VNET_NAME" \
  --dns-servers "$DNS_RESOLVER_IP" \
  --output none

echo "✓ VNet DNS servers configured"
echo ""

# ============================================================================
# 2. Regenerate VPN Client Configuration (if VPN Gateway is deployed)
# ============================================================================

echo "Step 2: Checking for VPN Gateway..."
echo ""

VPN_GATEWAY_NAME=$(az network vnet-gateway list \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].name" \
  --output tsv 2>/dev/null || echo "")

if [ -n "$VPN_GATEWAY_NAME" ]; then
  echo "✓ VPN Gateway found: $VPN_GATEWAY_NAME"
  echo ""
  
  echo "Regenerating VPN client configuration..."
  VPN_PROFILE_URL=$(az network vnet-gateway vpn-client generate \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VPN_GATEWAY_NAME" \
    --processor-architecture Amd64 \
    --output tsv)
  
  echo "✓ VPN client configuration regenerated"
  echo ""
  echo "📥 Download VPN profile: $VPN_PROFILE_URL"
  echo ""
  echo "⚠️  IMPORTANT: To enable DNS resolution for VPN clients:"
  echo "   1. Download the VPN profile from the URL above"
  echo "   2. Disconnect from VPN if currently connected"
  echo "   3. Import the new profile to Azure VPN Client"
  echo "   4. Reconnect to VPN"
  echo "   5. Verify DNS works: nslookup <internal-fqdn> $DNS_RESOLVER_IP"
  echo ""
else
  echo "⚠️  No VPN Gateway found (deployment may have skipped it)"
  echo "   DNS configuration is still useful for Azure resources"
  echo ""
fi

# ============================================================================
# 3. Summary
# ============================================================================

echo "========================================="
echo "✅ Post-Deployment Configuration Complete"
echo "========================================="
echo ""
echo "DNS Resolver IP: $DNS_RESOLVER_IP"
echo "VNet DNS configured: Yes"
if [ -n "$VPN_GATEWAY_NAME" ]; then
  echo "VPN profile regenerated: Yes"
  echo ""
  echo "Next steps:"
  echo "  1. Download and import the new VPN profile"
  echo "  2. Test DNS resolution from VPN client"
  echo "  3. Access internal Container Apps via browser"
else
  echo "VPN Gateway: Not deployed"
fi
echo ""
