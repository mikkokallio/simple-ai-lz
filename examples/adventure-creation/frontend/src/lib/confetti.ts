export function triggerIntenseParticles() {
  const event = new CustomEvent('intensifyParticles')
  window.dispatchEvent(event)
}

export function celebrateCardAddition() {
  triggerIntenseParticles()
}

export function celebrateLocationAddition() {
  triggerIntenseParticles()
}

export function celebrateNPCAddition() {
  triggerIntenseParticles()
}

export function celebrateEncounterAddition() {
  triggerIntenseParticles()
}

export function celebrateRewardAddition() {
  triggerIntenseParticles()
}

export function celebrateConflictAddition() {
  triggerIntenseParticles()
}
