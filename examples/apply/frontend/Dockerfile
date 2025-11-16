# ============================================================================
# AppLy Frontend - Multi-stage Dockerfile
# ============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./

# Install dependencies
RUN npm install

# Copy source code
COPY index.html ./
COPY src ./src

# Build application
RUN npm run build

# Stage 2: Production with Nginx
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Create entrypoint script for runtime environment variable injection
RUN echo '#!/bin/sh' > /docker-entrypoint.d/40-inject-env.sh && \
    echo 'set -e' >> /docker-entrypoint.d/40-inject-env.sh && \
    echo '' >> /docker-entrypoint.d/40-inject-env.sh && \
    echo '# Inject BACKEND_URL into the JavaScript bundle at runtime' >> /docker-entrypoint.d/40-inject-env.sh && \
    echo 'if [ -n "$BACKEND_URL" ]; then' >> /docker-entrypoint.d/40-inject-env.sh && \
    echo '  find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|http://localhost:3000|$BACKEND_URL|g" {} \;' >> /docker-entrypoint.d/40-inject-env.sh && \
    echo '  echo "Injected BACKEND_URL: $BACKEND_URL"' >> /docker-entrypoint.d/40-inject-env.sh && \
    echo 'fi' >> /docker-entrypoint.d/40-inject-env.sh && \
    echo '' >> /docker-entrypoint.d/40-inject-env.sh && \
    echo 'echo "Frontend environment configured"' >> /docker-entrypoint.d/40-inject-env.sh && \
    chmod +x /docker-entrypoint.d/40-inject-env.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
