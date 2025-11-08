# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config template
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Nginx will automatically substitute $BACKEND_URL from environment variable
# when using the /etc/nginx/templates/ directory
ENV BACKEND_URL=http://localhost:3000

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
