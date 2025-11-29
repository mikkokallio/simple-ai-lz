import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SignIn, Sparkle, Shield, Crown } from '@phosphor-icons/react'
import ParticleEffect from './ParticleEffect'
import { authAPI } from '@/lib/api'

interface LoginScreenProps {
  onLogin: () => void
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleGoogleLogin = () => {
    setIsLoading(true)
    // Redirect to backend Google OAuth endpoint
    window.location.href = authAPI.getLoginUrl()
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-b from-background to-background/95">
      <ParticleEffect />
      
      <div className="relative z-10 w-full max-w-md">
        <div className="ornate-border fancy-card p-12 glow-border-animated relative overflow-hidden">
          <ParticleEffect />
          <div className="relative z-10">
            <div className="flex justify-center mb-6">
              <Sparkle className="w-20 h-20 text-[oklch(0.70_0.15_40)] drop-shadow-[0_0_15px_oklch(0.65_0.15_40_/_0.6)]" weight="fill" />
            </div>
            
            <h1 className="text-4xl mb-4 text-golden text-center">Adventure Forge</h1>
            
            <p className="text-lg text-muted-foreground mb-8 font-normal tracking-normal text-center">
              Sign in to create and manage your D&D adventures
            </p>

            <Button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              size="lg"
              variant="secondary"
              className="w-full gap-3 text-base py-6"
            >
              <SignIn className="w-5 h-5" weight="bold" />
              {isLoading ? 'Redirecting...' : 'Sign In with Google'}
            </Button>

            <p className="text-xs text-center text-muted-foreground mt-6">
              New accounts require admin approval
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
