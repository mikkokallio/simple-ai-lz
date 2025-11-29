import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User, AuthState } from '@/types/auth'
import { authAPI } from '@/lib/api'

interface AuthContextValue extends AuthState {
  login: () => void
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = async () => {
    try {
      const userData = await authAPI.getCurrentUser()
      setUser(userData)
    } catch (error) {
      console.error('Failed to get user:', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshUser()
  }, [])

  const login = () => {
    window.location.href = authAPI.getLoginUrl()
  }

  const logout = async () => {
    try {
      await authAPI.logout()
      setUser(null)
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
