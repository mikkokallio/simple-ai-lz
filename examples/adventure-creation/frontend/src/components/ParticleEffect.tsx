import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface Particle {
  id: number
  x: number
  y: number
  size: number
  duration: number
  delay: number
}

export default function ParticleEffect() {
  const [particles, setParticles] = useState<Particle[]>([])
  const [isIntense, setIsIntense] = useState(false)

  useEffect(() => {
    const generateParticles = (count: number = 50) => {
      const newParticles: Particle[] = []
      for (let i = 0; i < count; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: Math.random() * 3 + 1,
          duration: Math.random() * 8 + 6,
          delay: Math.random() * 4,
        })
      }
      setParticles(newParticles)
    }

    generateParticles()

    const handleIntensify = () => {
      setIsIntense(true)
      generateParticles(120)
      
      setTimeout(() => {
        setIsIntense(false)
        generateParticles(12)
      }, 5000)
    }

    window.addEventListener('intensifyParticles', handleIntensify)
    return () => window.removeEventListener('intensifyParticles', handleIntensify)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            background: 'oklch(0.70 0.15 40)',
            boxShadow: `0 0 ${particle.size * 3}px oklch(0.65 0.15 40 / 0.6)`,
          }}
          animate={{
            y: [0, -30 * (isIntense ? 5 : 1), -60 * (isIntense ? 5 : 1)],
            x: [0, Math.random() * 20 - 10, Math.random() * 20 - 10],
            opacity: [0, 0.6, 0.8, 0.6, 0],
            scale: [0.5, 1, 1, 0.8, 0.3],
          }}
          transition={{
            duration: isIntense ? particle.duration / 5 : particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}
