# Build stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies for Azure Functions)
RUN npm ci

# Install Azure Functions Core Tools globally
RUN npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Copy source code
COPY . .

# Expose Azure Functions default port
EXPOSE 80

ENV AzureWebJobsScriptRoot=/app
ENV FUNCTIONS_WORKER_RUNTIME=node

CMD ["func", "start", "--port", "80", "--host", "0.0.0.0"]
