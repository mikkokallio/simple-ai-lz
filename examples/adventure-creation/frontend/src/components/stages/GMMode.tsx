import { Adventure } from '@/types/adventure'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface GMModeProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

export default function GMMode({ adventure, updateAdventure }: GMModeProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2">GM Session Mode</h2>
        <p className="text-muted-foreground">Run your adventure live</p>
      </div>

      <Card className="parchment-texture border-2">
        <CardHeader>
          <CardTitle>Session Runner</CardTitle>
          <CardDescription>Interactive GM tools coming soon</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Live session management interface will be available here
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
