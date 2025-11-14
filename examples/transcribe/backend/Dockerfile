# Build stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies for Azure Functions)
RUN npm ci

# Copy source code
COPY . .

# Expose Azure Functions default port
EXPOSE 80

ENV AzureWebJobsScriptRoot=/app

CMD ["node_modules/.bin/func", "start", "--port", "80"]
