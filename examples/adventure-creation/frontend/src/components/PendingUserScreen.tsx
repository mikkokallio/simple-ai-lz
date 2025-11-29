import { Button } from '@/components/ui/button'
import { Clock, Sparkle } from '@phosphor-icons/react'
import ParticleEffect from '@/components/ParticleEffect'
import { useAuth } from '@/contexts/AuthContext'

export default function PendingUserScreen() {
  const { logout, user } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <div className="ornate-border fancy-card p-12 glow-border-animated relative overflow-hidden">
          <ParticleEffect />
          <div className="relative z-10">
            <Clock className="w-20 h-20 text-[oklch(0.70_0.15_40)] mx-auto mb-6 drop-shadow-[0_0_15px_oklch(0.65_0.15_40_/_0.6)]" weight="fill" />
            <h1 className="text-4xl mb-4 text-golden">Access Pending</h1>
            <p className="text-lg text-muted-foreground mb-4 font-normal tracking-normal">
              Hello, <span className="text-foreground font-semibold">{user?.name || user?.email}</span>!
            </p>
            <p className="text-lg text-muted-foreground mb-8 font-normal tracking-normal">
              Your request to access Adventure Forge is currently pending approval. An administrator will review your account and grant appropriate access soon.
            </p>
            
            <div className="p-4 rounded-lg bg-secondary/30 border-2 border-border mb-8">
              <div className="flex items-start gap-3">
                <Sparkle className="w-5 h-5 text-accent flex-shrink-0 mt-1" weight="fill" />
                <div className="text-left">
                  <p className="text-sm font-semibold mb-1">What happens next?</p>
                  <p className="text-xs text-muted-foreground">
                    Once an administrator reviews and approves your account, you'll receive access to Adventure Forge. 
                    You can return to this page anytime to check your status.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Button 
                variant="secondary"
                size="lg" 
                className="gap-2"
                onClick={() => window.location.reload()}
              >
                Refresh Status
              </Button>
              <Button 
                variant="ghost"
                size="lg" 
                className="gap-2"
                onClick={logout}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
