import { Creature } from '@/types/adventure'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface CreatureCardProps {
  creature: Creature
  name: string
}

const getModifier = (score: number): string => {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

const getSave = (score: number): string => {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export default function CreatureCard({ creature, name }: CreatureCardProps) {
  // Check if this is a lazy-loaded creature with metadata
  const hasMetadata = (creature as any)?._metadata
  const isLazyLoaded = hasMetadata && creature.abilityScores.str === 10 && creature.abilityScores.dex === 10
  
  // Safety check: ensure creature has required properties
  if (!creature || !creature.abilityScores) {
    return (
      <div className="fancy-card p-0 overflow-hidden border-2 border-neutral/30">
        <div className="fancy-card-section rounded-t-lg rounded-b-none p-4 border-b-2 border-neutral/30 bg-neutral/10">
          <h3 className="text-2xl mb-1 font-bold tracking-tight leading-tight text-neutral-foreground">
            {name || 'Unknown Creature'}
          </h3>
          <div className="text-sm italic text-muted-foreground">
            Error: Incomplete creature data
          </div>
        </div>
        <div className="p-4">
          <div className="text-sm text-muted-foreground">
            This creature's data could not be loaded properly. Please try removing and re-adding it.
          </div>
        </div>
      </div>
    )
  }
  
  // If lazy-loaded, show simplified view
  if (isLazyLoaded && hasMetadata) {
    const metadata = (creature as any)._metadata
    return (
      <div className="fancy-card p-0 overflow-hidden">
        <div className="fancy-card-section rounded-t-lg rounded-b-none p-4 border-b-2 border-[oklch(0.45_0.15_35_/_0.5)]">
          <h3 className="text-2xl mb-1 font-bold tracking-tight leading-tight" style={{ color: 'oklch(0.85 0.15 50)' }}>
            {name}
          </h3>
          <div className="text-sm italic" style={{ color: 'oklch(0.65 0.08 45)' }}>
            {creature.type}
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="font-bold">CR</span>
            <span>{creature.cr}</span>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="font-bold">Role</span>
            <span className="capitalize">{metadata.role}</span>
          </div>
          {metadata.summary && (
            <div className="text-sm text-muted-foreground pt-2 border-t border-border">
              {metadata.summary}
            </div>
          )}
          {metadata.keywords && metadata.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {metadata.keywords.slice(0, 6).map((keyword: string, idx: number) => (
                <span key={idx} className="px-2 py-0.5 text-xs bg-accent/20 rounded">
                  {keyword}
                </span>
              ))}
            </div>
          )}
          <div className="text-xs text-muted-foreground pt-2 border-t border-border italic">
            Full stat block available in HTML file: {metadata.htmlFile}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fancy-card p-0 overflow-hidden">
      <div className="fancy-card-section rounded-t-lg rounded-b-none p-4 border-b-2 border-[oklch(0.45_0.15_35_/_0.5)]">
        <h3 className="text-2xl mb-1 font-bold tracking-tight leading-tight" style={{ color: 'oklch(0.85 0.15 50)' }}>
          {name}
        </h3>
        <div className="text-sm italic" style={{ color: 'oklch(0.65 0.08 45)' }}>
          {creature.size} {creature.type}, {creature.alignment}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="fancy-card-section space-y-1">
          <div className="flex gap-4 text-sm">
            <span className="font-bold">AC</span>
            <span>{creature.ac}</span>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="font-bold">HP</span>
            <span>{creature.hp}</span>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="font-bold">Speed</span>
            <span>{creature.speed}</span>
          </div>
        </div>

        <Separator className="bg-border/30" />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <div className="grid grid-cols-4 text-center font-bold text-xs uppercase tracking-wider text-muted-foreground">
              <span></span>
              <span></span>
              <span>MOD</span>
              <span>SAVE</span>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-1">
              <span className="font-bold">STR</span>
              <span className="text-center">{creature.abilityScores.str}</span>
              <span className="text-center">{getModifier(creature.abilityScores.str)}</span>
              <span className="text-center">{getSave(creature.abilityScores.str)}</span>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-1">
              <span className="font-bold">DEX</span>
              <span className="text-center">{creature.abilityScores.dex}</span>
              <span className="text-center">{getModifier(creature.abilityScores.dex)}</span>
              <span className="text-center">{getSave(creature.abilityScores.dex)}</span>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-1">
              <span className="font-bold">CON</span>
              <span className="text-center">{creature.abilityScores.con}</span>
              <span className="text-center">{getModifier(creature.abilityScores.con)}</span>
              <span className="text-center">{getSave(creature.abilityScores.con)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="grid grid-cols-4 text-center font-bold text-xs uppercase tracking-wider text-muted-foreground">
              <span></span>
              <span></span>
              <span>MOD</span>
              <span>SAVE</span>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-1">
              <span className="font-bold">INT</span>
              <span className="text-center">{creature.abilityScores.int}</span>
              <span className="text-center">{getModifier(creature.abilityScores.int)}</span>
              <span className="text-center">{getSave(creature.abilityScores.int)}</span>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-1">
              <span className="font-bold">WIS</span>
              <span className="text-center">{creature.abilityScores.wis}</span>
              <span className="text-center">{getModifier(creature.abilityScores.wis)}</span>
              <span className="text-center">{getSave(creature.abilityScores.wis)}</span>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-1">
              <span className="font-bold">CHA</span>
              <span className="text-center">{creature.abilityScores.cha}</span>
              <span className="text-center">{getModifier(creature.abilityScores.cha)}</span>
              <span className="text-center">{getSave(creature.abilityScores.cha)}</span>
            </div>
          </div>
        </div>

        <Separator className="bg-border/30" />

        <div className="fancy-card-section space-y-2 text-sm">
          {creature.skills && (
            <div>
              <span className="font-bold">Skills </span>
              <span className="text-foreground">{creature.skills}</span>
            </div>
          )}
          {creature.resistances && (
            <div>
              <span className="font-bold">Resistances </span>
              <span className="text-foreground">{creature.resistances}</span>
            </div>
          )}
          {creature.immunities && (
            <div>
              <span className="font-bold">Immunities </span>
              <span className="text-foreground">{creature.immunities}</span>
            </div>
          )}
          {creature.gear && (
            <div>
              <span className="font-bold">Gear </span>
              <span className="text-foreground">{creature.gear}</span>
            </div>
          )}
          {creature.senses && (
            <div>
              <span className="font-bold">Senses </span>
              <span className="text-foreground">{creature.senses}</span>
            </div>
          )}
          {creature.languages && (
            <div>
              <span className="font-bold">Languages </span>
              <span className="text-foreground">{creature.languages}</span>
            </div>
          )}
          <div>
            <span className="font-bold">CR </span>
            <span className="text-foreground">{creature.cr}</span>
          </div>
        </div>

        {creature.traits && creature.traits.length > 0 && (
          <>
            <Separator className="bg-border/30" />
            <div className="space-y-3">
              <div className="text-base font-bold uppercase tracking-wide pb-1" style={{ color: 'oklch(0.85 0.15 50)', borderBottom: '2px solid oklch(0.45 0.15 35 / 0.5)' }}>
                Traits
              </div>
              <div className="fancy-card-section space-y-3">
                {creature.traits.map((trait, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="font-bold italic text-sm">{trait.name}.</div>
                    <div 
                      className="text-sm text-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: trait.description }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {creature.actions && creature.actions.length > 0 && (
          <>
            <Separator className="bg-border/30" />
            <div className="space-y-3">
              <div className="text-base font-bold uppercase tracking-wide pb-1" style={{ color: 'oklch(0.85 0.15 50)', borderBottom: '2px solid oklch(0.45 0.15 35 / 0.5)' }}>
                Actions
              </div>
              <div className="fancy-card-section space-y-3">
                {creature.actions.map((action, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="font-bold italic text-sm">{action.name}.</div>
                    <div 
                      className="text-sm text-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: action.description }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {creature.bonusActions && creature.bonusActions.length > 0 && (
          <>
            <Separator className="bg-border/30" />
            <div className="space-y-3">
              <div className="text-base font-bold uppercase tracking-wide pb-1" style={{ color: 'oklch(0.85 0.15 50)', borderBottom: '2px solid oklch(0.45 0.15 35 / 0.5)' }}>
                Bonus Actions
              </div>
              <div className="fancy-card-section space-y-3">
                {creature.bonusActions.map((action, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="font-bold italic text-sm">{action.name}.</div>
                    <div 
                      className="text-sm text-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: action.description }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {creature.reactions && creature.reactions.length > 0 && (
          <>
            <Separator className="bg-border/30" />
            <div className="space-y-3">
              <div className="text-base font-bold uppercase tracking-wide pb-1" style={{ color: 'oklch(0.85 0.15 50)', borderBottom: '2px solid oklch(0.45 0.15 35 / 0.5)' }}>
                Reactions
              </div>
              <div className="fancy-card-section space-y-3">
                {creature.reactions.map((reaction, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="font-bold italic text-sm">{reaction.name}.</div>
                    <div 
                      className="text-sm text-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: reaction.description }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {creature.legendaryActions && creature.legendaryActions.length > 0 && (
          <>
            <Separator className="bg-border/30" />
            <div className="space-y-3">
              <div className="text-base font-bold uppercase tracking-wide pb-1" style={{ color: 'oklch(0.85 0.15 50)', borderBottom: '2px solid oklch(0.45 0.15 35 / 0.5)' }}>
                Legendary Actions
              </div>
              <div className="fancy-card-section space-y-3">
                {creature.legendaryActions.map((action, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="font-bold italic text-sm">{action.name}.</div>
                    <div 
                      className="text-sm text-foreground leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: action.description }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
