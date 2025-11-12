// Container Apps Easy Auth middleware
// Reads user information from X-MS-CLIENT-PRINCIPAL header injected by Azure Container Apps
import { Request as ExpressRequest, Response, NextFunction } from 'express';

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

interface ClientPrincipal {
  userId: string;
  userDetails: string;
  userRoles?: string[];
  claims?: Array<{
    typ: string;
    val: string;
  }>;
}

// Middleware to extract user from Easy Auth header
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['x-ms-client-principal'] as string;

  if (!header) {
    console.warn('⚠️  No X-MS-CLIENT-PRINCIPAL header found - Easy Auth may not be configured');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  try {
    // Decode the base64-encoded JSON
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const principal: ClientPrincipal = JSON.parse(decoded);

    console.log('✅ User authenticated via Easy Auth');
    console.log('   User ID:', principal.userId);
    console.log('   User Details:', principal.userDetails);

    // Extract user information
    const user: User = {
      oid: principal.userId,
      email: principal.userDetails,
      name: principal.userDetails
    };

    // Extract additional claims if available
    if (principal.claims) {
      for (const claim of principal.claims) {
        switch (claim.typ) {
          case 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn':
          case 'preferred_username':
            user.upn = claim.val;
            user.email = claim.val;
            break;
          case 'name':
            user.name = claim.val;
            break;
          case 'http://schemas.microsoft.com/identity/claims/tenantid':
            user.tid = claim.val;
            break;
          case 'http://schemas.microsoft.com/identity/claims/objectidentifier':
            user.oid = claim.val;
            break;
        }
      }
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Error parsing X-MS-CLIENT-PRINCIPAL header:', error);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authentication token'
    });
  }
}

// Helper to get user ID from request (after authentication)
export function getUserId(req: Request): string {
  if (!req.user) {
    throw new Error('User not authenticated');
  }
  return req.user.oid;
}

console.log('✅ Easy Auth middleware initialized');
console.log('   Container Apps will inject X-MS-CLIENT-PRINCIPAL header');
console.log('   No token validation needed - handled by Azure');
