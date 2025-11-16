# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create a simple script that generates the config file
# This runs before nginx starts
RUN echo '#!/bin/sh' > /docker-entrypoint.d/40-create-config.sh && \
    echo 'echo "window.BACKEND_URL = \"${VITE_API_BASE_URL}\";" > /usr/share/nginx/html/config.js' >> /docker-entrypoint.d/40-create-config.sh && \
    echo 'echo "Backend URL configured: ${VITE_API_BASE_URL}"' >> /docker-entrypoint.d/40-create-config.sh && \
    chmod +x /docker-entrypoint.d/40-create-config.sh && \
    cat /docker-entrypoint.d/40-create-config.sh

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
