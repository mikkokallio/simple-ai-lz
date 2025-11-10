#!/bin/sh

# Entrypoint script for frontend container
echo "Starting nginx..."
nginx -g "daemon off;"
