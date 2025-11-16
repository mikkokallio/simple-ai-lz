#!/bin/sh
set -e

# Get the backend URL from environment variable (set by Container App)
BACKEND_URL="${VITE_API_BASE_URL:-}"

# Inject the backend URL into a JavaScript file that will be loaded by index.html
cat > /usr/share/nginx/html/config.js <<EOF
window.BACKEND_URL = '${BACKEND_URL}';
console.log('Backend URL configured:', window.BACKEND_URL);
EOF

echo "Configured backend URL: ${BACKEND_URL}"

# Don't start nginx here - the nginx entrypoint will do that
exit 0
