import { Request, Response, NextFunction } from 'express';

/**
 * Simple session middleware
 * Extracts sessionId from header or creates a new one
 * For production: replace with JWT validation from Entra ID
 */
export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Get session ID from header, default to 'anonymous' for testing
  const sessionId = req.headers['x-session-id'] as string || 'anonymous';
  
  // Attach to request for use in routes
  (req as any).sessionId = sessionId;
  
  next();
}

/**
 * Error handling middleware
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('Error:', err);
  
  const statusCode = (err as any).statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
