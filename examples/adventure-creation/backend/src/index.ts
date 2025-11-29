import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { cosmosService } from './services/cosmos.js';
import { openaiService } from './services/openai.js';
import { sessionMiddleware, errorHandler } from './middleware/auth.js';
import adventuresRouter from './routes/adventures.js';
import aiRouter from './routes/ai.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Security and performance middleware
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
};
app.use(cors(corsOptions));

// Session middleware
app.use(sessionMiddleware);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/adventures', adventuresRouter);
app.use('/api/ai', aiRouter);

// Error handling
app.use(errorHandler);

// Initialize services and start server
async function start() {
  try {
    console.log('Starting Adventure Creator Backend...');
    console.log(`Node.js version: ${process.version}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Initialize Cosmos DB
    await cosmosService.initialize();

    // Initialize Azure OpenAI
    await openaiService.initialize();

    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Server listening on port ${PORT}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
      console.log(`✓ API endpoints:`);
      console.log(`  - GET    /api/adventures`);
      console.log(`  - GET    /api/adventures/:id`);
      console.log(`  - POST   /api/adventures`);
      console.log(`  - PUT    /api/adventures/:id`);
      console.log(`  - DELETE /api/adventures/:id`);
      console.log(`  - POST   /api/ai/chat`);
      console.log(`  - POST   /api/ai/portrait`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

start();
