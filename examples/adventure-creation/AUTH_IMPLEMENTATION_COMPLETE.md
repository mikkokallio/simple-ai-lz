# Google Authentication Implementation

## Overview

Full Google OAuth authentication has been implemented with role-based access control (RBAC) and user data isolation.

## User Roles

1. **Pending** - New users awaiting admin approval
   - Shown a "pending approval" screen
   - Cannot access the app
   
2. **User** - Standard access
   - Create and manage adventures
   - No AI features (AI Companion hidden, portrait generation hidden)
   
3. **Premium** - Full access
   - All User features
   - AI Companion enabled
   - AI portrait generation enabled
   
4. **Admin** - System management
   - All Premium features
   - Access to Admin tab with:
     - User management (view all users, change roles)
     - Template management (save current structure as template)

## Architecture

### Backend
- **Authentication**: Google OAuth 2.0
- **Session Management**: Express sessions with MongoDB storage (connect-mongo)
- **Database**: Cosmos DB with 3 containers:
  - `adventures` (partition key: userId) - User adventures
  - `users` (partition key: googleId) - User accounts
  - `templates` (partition key: createdBy) - Structure templates

### Frontend
- **Auth Context**: React Context API for global auth state
- **Conditional Rendering**: AI features hidden for non-Premium users
- **Route Protection**: Admin tab only visible to admin users

## Files Modified/Created

### Backend
- ✅ `src/routes/auth.ts` - OAuth endpoints
- ✅ `src/routes/admin.ts` - Admin-only endpoints
- ✅ `src/services/users.ts` - User management service
- ✅ `src/services/templates.ts` - Template management service
- ✅ `src/services/cosmos.ts` - Multi-container Cosmos DB access
- ✅ `src/routes/adventures.ts` - Updated to use userId
- ✅ `src/index.ts` - Added session middleware and routes
- ✅ `package.json` - Added auth dependencies
- ✅ `.env.example` - Added auth environment variables

### Frontend
- ✅ `src/types/auth.ts` - Auth types
- ✅ `src/contexts/AuthContext.tsx` - Global auth state
- ✅ `src/components/LoginScreen.tsx` - Login UI
- ✅ `src/components/PendingUserScreen.tsx` - Pending approval screen
- ✅ `src/components/stages/AdminView.tsx` - Admin panel
- ✅ `src/lib/api.ts` - Auth API client (already existed)
- ✅ `src/components/AICompanion.tsx` - Added role check
- ✅ `src/components/stages/NPCsStage.tsx` - Added role check for portrait gen
- ✅ `src/App.tsx` - Integrated auth, added admin tab
- ✅ `src/main.tsx` - Wrapped app in AuthProvider
- ✅ `src/types/adventure.ts` - Added 'admin' stage type

## Setup Instructions

### 1. Google Cloud Console Setup

1. Go to https://console.cloud.google.com/
2. Create a new project: "Adventure Creator" (or use existing)
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth 2.0 Client ID"
5. Configure OAuth consent screen (if prompted):
   - User Type: External
   - App name: "Adventure Creator"
   - Support email: your email
   - Add scopes: `userinfo.email`, `userinfo.profile`
6. Create OAuth 2.0 Client ID:
   - Application type: "Web application"
   - Name: "Adventure Creator"
   - Authorized redirect URIs:
     - Development: `http://localhost:8080/api/auth/callback`
     - Production: `https://your-domain.com/api/auth/callback`
7. Click "Create" and copy the Client ID and Client Secret

### 2. Backend Configuration

Update `backend/.env` with:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:8080/api/auth/callback

# Session
SESSION_SECRET=generate-a-random-string-here

# Frontend URL (for OAuth redirect)
FRONTEND_URL=http://localhost:5173

# MongoDB for sessions (can use Cosmos DB connection string)
MONGO_CONNECTION_STRING=your_cosmos_connection_string_here
```

**Generate a secure session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Install Dependencies

Backend:
```bash
cd backend
npm install
```

Frontend (no new dependencies needed):
```bash
cd frontend
npm install
```

### 4. Initialize Cosmos DB Containers

The backend will automatically create the necessary containers on first run:
- `adventures` (partition key: /userId)
- `users` (partition key: /googleId)
- `templates` (partition key: /createdBy)

### 5. Create First Admin User

1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Navigate to `http://localhost:5173`
4. Click "Sign In with Google"
5. Complete the OAuth flow
6. You'll see the "pending approval" screen
7. Manually update the user in Cosmos DB:
   - Open Azure Portal > Cosmos DB > `users` container
   - Find your user document
   - Change `role` from `"pending"` to `"admin"`
8. Refresh the app - you now have admin access

### 6. Manage Users

As an admin:
1. Click the "Admin" tab
2. View all registered users
3. Change user roles using the dropdown
4. New users will automatically be created with "pending" status

## API Endpoints

### Authentication
- `GET /api/auth/login` - Redirect to Google OAuth
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/auth/user` - Get current user
- `POST /api/auth/logout` - Logout

### Admin (Admin only)
- `GET /api/admin/users` - List all users
- `PUT /api/admin/users/:id/role` - Update user role
- `GET /api/admin/templates` - List templates
- `POST /api/admin/templates` - Create template
- `PUT /api/admin/templates/:id` - Update template
- `DELETE /api/admin/templates/:id` - Delete template

### Adventures (Authenticated users)
- All adventure endpoints now use `userId` instead of `sessionId`
- Adventures are completely isolated per user

## Security Features

1. **User Isolation**: Each user only sees their own adventures
2. **Role-Based Access**: Middleware enforces role requirements
3. **Session Management**: HTTP-only cookies with 30-day expiration
4. **Secure Cookies**: Automatic HTTPS-only in production
5. **OAuth 2.0**: Industry-standard authentication
6. **MongoDB Sessions**: Persistent session storage

## Role Promotion Flow

1. User signs in with Google → `pending` role
2. Admin promotes to `user` → Basic features
3. Admin promotes to `premium` → AI features enabled
4. Admin promotes to `admin` → Management features enabled

## Testing

1. Test with multiple Google accounts
2. Verify each role sees appropriate features:
   - Pending: Only pending screen
   - User: No AI Companion, no portrait generation
   - Premium: Full AI features
   - Admin: Admin tab visible, can manage users
3. Verify data isolation (users can't see each other's adventures)

## Production Considerations

1. Update `GOOGLE_REDIRECT_URI` in .env to production URL
2. Set `NODE_ENV=production`
3. Update `FRONTEND_URL` to production domain
4. Use secure MongoDB connection (TLS enabled)
5. Generate strong `SESSION_SECRET`
6. Configure CORS for production domain
7. Enable HTTPS (sessions will use secure cookies automatically)

## Troubleshooting

**"Not authenticated" errors:**
- Check that session middleware is running
- Verify MongoDB connection string
- Check browser cookies (HTTP-only cookie should be set)

**OAuth redirect fails:**
- Verify redirect URI matches Google Console exactly
- Check `GOOGLE_REDIRECT_URI` in .env
- Ensure backend is running on correct port

**User stuck on pending screen:**
- Check user's role in Cosmos DB `users` container
- Admin needs to update role manually or via Admin panel

**AI features not showing for Premium:**
- Verify user role is `premium` or `admin`
- Check browser console for errors
- Ensure AuthContext is providing user data

## Next Steps

1. **Get Google OAuth credentials** from Google Cloud Console
2. **Update backend .env** with credentials
3. **Start both servers** (backend and frontend)
4. **Sign in** and create first admin user
5. **Test role-based access** with different user accounts
6. **Save structure templates** from Admin panel
7. **Invite users** and manage their roles

## Architecture Diagram

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ OAuth Flow
       ▼
┌──────────────────┐      ┌─────────────┐
│  Google OAuth    │◄────►│   Backend   │
│  (Authorization) │      │  Express    │
└──────────────────┘      └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              ┌─────▼────┐ ┌────▼─────┐ ┌───▼────┐
              │ Cosmos DB│ │ MongoDB  │ │ Azure  │
              │(Data)    │ │(Sessions)│ │OpenAI  │
              └──────────┘ └──────────┘ └────────┘
```

## Summary

The authentication system is now fully implemented. All that's needed is:
1. Google OAuth credentials from Google Cloud Console
2. Environment variable configuration
3. First admin user creation

Once configured, the app will have complete user authentication, role-based access control, and data isolation.
