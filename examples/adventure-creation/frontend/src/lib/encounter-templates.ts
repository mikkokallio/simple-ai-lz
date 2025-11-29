import { ENCOUNTER_TYPES, type EncounterType as BaseEncounterType, type EncounterTypeInfo } from './encounter-types'

export type EncounterType = BaseEncounterType

export interface EncounterTemplate extends EncounterTypeInfo {
  bgColor: string
  defaultTitle: string
}

export const ENCOUNTER_TEMPLATES: EncounterTemplate[] = ENCOUNTER_TYPES.map(typeInfo => ({
  ...typeInfo,
  bgColor: 'bg-secondary/50 border-border hover:border-accent/50',
  defaultTitle: `${typeInfo.label} Encounter`
}))

export function getEncounterTemplate(type: EncounterType): EncounterTemplate {
  return ENCOUNTER_TEMPLATES.find(t => t.type === type) || ENCOUNTER_TEMPLATES[0]
}

export { ENCOUNTER_TYPES } from './encounter-types'
