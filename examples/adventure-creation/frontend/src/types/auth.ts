export type UserRole = 'pending' | 'user' | 'premium' | 'admin'

export interface User {
  id: string
  email: string
  name: string
  picture?: string
  role: UserRole
  createdAt: number
  lastLoginAt: number
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}
