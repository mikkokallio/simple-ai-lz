#!/bin/sh

# Entrypoint script for frontend container
# Replace runtime configuration placeholders with environment variables
echo "Configuring runtime environment..."

# Replace placeholders in config.js
sed -i "s|__VITE_ENTRA_CLIENT_ID__|${VITE_ENTRA_CLIENT_ID}|g" /usr/share/nginx/html/config.js
sed -i "s|__VITE_ENTRA_TENANT_ID__|${VITE_ENTRA_TENANT_ID}|g" /usr/share/nginx/html/config.js
sed -i "s|__VITE_ENTRA_REDIRECT_URI__|${VITE_ENTRA_REDIRECT_URI:-$VITE_API_URL}|g" /usr/share/nginx/html/config.js
sed -i "s|__VITE_API_URL__|${VITE_API_URL}|g" /usr/share/nginx/html/config.js

echo "Runtime configuration applied:"
echo "  VITE_ENTRA_CLIENT_ID: ${VITE_ENTRA_CLIENT_ID:0:10}..."
echo "  VITE_ENTRA_TENANT_ID: ${VITE_ENTRA_TENANT_ID:0:10}..."
echo "  VITE_API_URL: ${VITE_API_URL}"

echo "Starting nginx..."
nginx -g "daemon off;"

