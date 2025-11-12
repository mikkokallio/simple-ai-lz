// JWT Bearer Token Authentication Middleware
// Validates Azure AD tokens directly without relying on Easy Auth
import { Request as ExpressRequest, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Extend Request interface
export interface User {
  oid: string;
  email?: string;
  name?: string;
  upn?: string;
  tid?: string;
}

export interface Request extends ExpressRequest {
  user?: User;
}

// JWKS client for Azure AD
const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

// Middleware to validate JWT token
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('⚠️  No Bearer token found in Authorization header');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Verify token
  jwt.verify(
    token,
    getKey,
    {
      audience: process.env.ENTRA_CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0`,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err) {
        console.error('❌ JWT verification failed:', err.message);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token'
        });
      }

      const payload = decoded as jwt.JwtPayload;

      console.log('✅ User authenticated via JWT');
      console.log('   User ID (oid):', payload.oid);
      console.log('   User email:', payload.email || payload.upn || payload.preferred_username);

      // Extract user information
      const user: User = {
        oid: payload.oid,
        email: payload.email || payload.upn || payload.preferred_username,
        name: payload.name,
        upn: payload.upn,
        tid: payload.tid,
      };

      req.user = user;
      next();
    }
  );
}

// Helper to get user ID from request
export function getUserId(req: Request): string {
  if (!req.user || !req.user.oid) {
    throw new Error('User not authenticated');
  }
  return req.user.oid;
}
