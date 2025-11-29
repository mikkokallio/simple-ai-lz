import { Router, Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { userService } from '../services/users.js';

const router = Router();

// Initialize Google OAuth client
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/api/auth/callback'
);

console.log('Google OAuth Configuration:');
console.log('  Client ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'MISSING');
console.log('  Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING');
console.log('  Redirect URI:', process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/api/auth/callback');

/**
 * GET /api/auth/login
 * Redirect to Google OAuth
 */
router.get('/login', (req: Request, res: Response) => {
  console.log('Auth login requested');
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'select_account',
  });
  console.log('Generated auth URL:', authUrl);
  res.redirect(authUrl);
});

/**
 * GET /api/auth/callback
 * Handle OAuth callback from Google
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Create or update user in database
    const user = await userService.createOrUpdateUser({
      googleId: payload.sub,
      email: payload.email!,
      name: payload.name || payload.email!,
      picture: payload.picture,
    });

    // Set session cookie
    (req.session as any).userId = user.id;
    (req.session as any).accessToken = tokens.access_token;
    
    console.log('Session set:', { userId: user.id, sessionId: req.sessionID });
    
    // Save session before redirect
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          reject(err);
        } else {
          console.log('Session saved successfully');
          resolve();
        }
      });
    });

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(frontendUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * GET /api/auth/user
 * Get current authenticated user
 */
router.get('/user', async (req: Request, res: Response) => {
  try {
    console.log('User check - Session ID:', req.sessionID);
    console.log('User check - Session data:', req.session);
    
    const userId = (req.session as any)?.userId;
    
    if (!userId) {
      console.log('No userId in session');
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await userService.getUser(userId);
    
    if (!user) {
      console.log('User not found:', userId);
      res.status(404).json({ error: 'User not found' });
      return;
    }

    console.log('User found:', user.email);
    
    // Update last login
    await userService.updateLastLogin(userId);

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * POST /api/auth/logout
 * Logout current user
 */
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    res.json({ success: true });
  });
});

/**
 * Middleware to check if user is authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  (req as any).userId = userId;
  next();
}

/**
 * Middleware to check if user has required role
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const user = await userService.getUser(userId);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!roles.includes(user.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      (req as any).user = user;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ error: 'Authorization failed' });
    }
  };
}

export default router;
