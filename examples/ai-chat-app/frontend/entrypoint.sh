#!/bin/sh

# Entrypoint script for frontend container
# Configures nginx to proxy to the correct backend URL

# If BACKEND_URL is set (Azure Container Apps), update nginx config
if [ -n "$BACKEND_URL" ]; then
    echo "Configuring nginx to proxy to: $BACKEND_URL"
    
    # Update nginx config with actual backend URL
    sed -i "s|http://backend:5000|$BACKEND_URL|g" /etc/nginx/conf.d/default.conf
fi

# Start nginx
nginx -g "daemon off;"
