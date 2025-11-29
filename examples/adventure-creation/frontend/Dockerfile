# Multi-stage build for React frontend
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build production bundle
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration as template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Set default backend URL (will be overridden by Container App env var)
ENV BACKEND_URL=http://localhost:8080

# Expose port 8080 (Container Apps standard)
EXPOSE 8080

# Start nginx (automatically processes templates with envsubst)
CMD ["nginx", "-g", "daemon off;"]
