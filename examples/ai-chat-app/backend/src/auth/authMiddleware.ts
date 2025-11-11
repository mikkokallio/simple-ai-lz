// Authentication middleware using passport-azure-ad
import passport from 'passport';
import { BearerStrategy, IBearerStrategyOptionWithRequest, ITokenPayload, VerifyCallback } from 'passport-azure-ad';
import { Request, Response, NextFunction } from 'express';
import { bearerStrategyOptions } from './authConfig.js';

// Extend Express Request to include user information
declare global {
  namespace Express {
    interface User {
      oid: string;        // Object ID (unique user identifier)
      email?: string;     // User's email
      name?: string;      // User's display name
      upn?: string;       // User Principal Name
      tid?: string;       // Tenant ID
    }
  }
}

// Configure Bearer strategy for validating access tokens
const bearerStrategy = new BearerStrategy(
  bearerStrategyOptions as IBearerStrategyOptionWithRequest,
  (token: ITokenPayload, done: VerifyCallback) => {
    // Token is valid - extract user information
    const user: Express.User = {
      oid: (token.oid || token.sub || '') as string, // Object ID is the unique user identifier
      email: (token as any).email || token.preferred_username,
      name: token.name,
      upn: token.upn,
      tid: token.tid
    };

    if (!user.oid) {
      return done(new Error('Token missing required user identifier (oid)'), null);
    }

    // Pass user info to request
    return done(null, user, token);
  }
);

// Initialize passport with the bearer strategy
passport.use(bearerStrategy);

// Middleware to require authentication on protected routes
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  passport.authenticate('oauth-bearer', { session: false }, (err: any, user: Express.User, info: any) => {
    if (err) {
      console.error('Authentication error:', err);
      return res.status(401).json({ error: 'Authentication failed', details: err.message });
    }

    if (!user) {
      console.warn('Authentication failed - no user:', info);
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Valid access token required',
        details: info?.message || 'No token provided'
      });
    }

    // Attach user to request
    req.user = user;
    next();
  })(req, res, next);
}

// Middleware to optionally extract user if token is provided (but don't require it)
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided - continue without user
    return next();
  }

  passport.authenticate('oauth-bearer', { session: false }, (err: any, user: Express.User) => {
    if (err || !user) {
      // Invalid token - continue without user (optional auth)
      console.warn('Optional auth failed, continuing without user');
      return next();
    }

    // Valid token - attach user
    req.user = user;
    next();
  })(req, res, next);
}

// Helper to get user ID from request (after authentication)
export function getUserId(req: Request): string {
  if (!req.user || !req.user.oid) {
    throw new Error('User not authenticated');
  }
  return req.user.oid;
}

// Helper to get user email from request (after authentication)
export function getUserEmail(req: Request): string | undefined {
  return req.user?.email;
}

// Helper to get user name from request (after authentication)
export function getUserName(req: Request): string | undefined {
  return req.user?.name;
}

console.log('✅ Authentication middleware initialized');
