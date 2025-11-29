import { cosmosService } from './cosmos.js';

export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  role: 'pending' | 'user' | 'premium' | 'admin';
  createdAt: number;
  lastLoginAt: number;
}

class UserService {
  /**
   * Create or update user from Google OAuth
   */
  async createOrUpdateUser(data: {
    googleId: string;
    email: string;
    name: string;
    picture?: string;
  }): Promise<User> {
    // Check if user exists
    const existing = await this.getUserByGoogleId(data.googleId);
    
    if (existing) {
      // Update existing user
      return this.updateUser(existing.id, {
        name: data.name,
        picture: data.picture,
        lastLoginAt: Date.now(),
      });
    }

    // Determine role: admin if matches ADMIN_EMAIL, otherwise pending
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const isAdmin = adminEmail && data.email.toLowerCase() === adminEmail;
    const role = isAdmin ? 'admin' : 'pending';

    // Create new user
    const newUser: User = {
      id: crypto.randomUUID(),
      googleId: data.googleId,
      email: data.email,
      name: data.name,
      picture: data.picture,
      role,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    };

    await cosmosService.createUser(newUser);
    console.log(`Created new user: ${newUser.email} (role: ${role})`);
    return newUser;
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    return cosmosService.getUserByGoogleId(googleId);
  }

  async getUser(id: string): Promise<User | null> {
    return cosmosService.getUser(id);
  }

  async listUsers(): Promise<User[]> {
    return cosmosService.listUsers();
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    return cosmosService.updateUser(id, updates);
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    return this.updateUser(id, { role: role as User['role'] });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.updateUser(id, { lastLoginAt: Date.now() });
  }
}

export const userService = new UserService();
