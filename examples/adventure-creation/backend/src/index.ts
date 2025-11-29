import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Load environment variables FIRST before any other imports that might use them
dotenv.config();

import { cosmosService } from './services/cosmos.js';
import { openaiService } from './services/openai.js';
import { sessionMiddleware, errorHandler } from './middleware/auth.js';
import adventuresRouter from './routes/adventures.js';
import aiRouter from './routes/ai.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Security and performance middleware
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
};
app.use(cors(corsOptions));

// Session configuration for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || 'adventure-creator-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/adventures', adventuresRouter);
app.use('/api/ai', aiRouter);
app.use('/api/admin', adminRouter);
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
    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Server listening on port ${PORT}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
      console.log(`✓ API endpoints:`);
      console.log(`  Auth:`);
      console.log(`    - GET  /api/auth/login`);
      console.log(`    - GET  /api/auth/callback`);
      console.log(`    - GET  /api/auth/user`);
      console.log(`    - POST /api/auth/logout`);
      console.log(`  Adventures:`);
      console.log(`    - GET    /api/adventures`);
      console.log(`    - GET    /api/adventures/:id`);
      console.log(`    - POST   /api/adventures`);
      console.log(`    - PUT    /api/adventures/:id`);
      console.log(`    - DELETE /api/adventures/:id`);
      console.log(`  AI:`);
      console.log(`    - POST /api/ai/chat`);
      console.log(`    - POST /api/ai/portrait`);
      console.log(`  Admin:`);
      console.log(`    - GET    /api/admin/users`);
      console.log(`    - PUT    /api/admin/users/:id/role`);
      console.log(`    - GET    /api/admin/templates`);
      console.log(`    - POST   /api/admin/templates`);
      console.log(`    - DELETE /api/admin/templates/:id`);
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
