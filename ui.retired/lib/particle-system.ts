// =================================================================
// 2D PARTICLE SYSTEM WITH PHYSICS
// =================================================================
// Canvas-based particle effects: fire, ice, lightning, heal, hit sparks,
// blood, dust, smoke. Each particle has position, velocity, gravity,
// lifetime, color, size, and opacity decay.

export interface Particle {
  x: number; y: number
  vx: number; vy: number
  ax: number; ay: number        // acceleration (gravity, wind)
  life: number; maxLife: number
  size: number; sizeDecay: number
  color: string
  opacity: number; opacityDecay: number
  rotation: number; rotSpeed: number
  shape: 'circle' | 'square' | 'star' | 'line'
}

export interface ParticleEmitter {
  x: number; y: number
  particles: Particle[]
  emitting: boolean
  rate: number                  // particles per frame
  burst: number                 // particles on first frame
  preset: string
  elapsed: number
  maxDuration: number           // 0 = infinite
}

export interface ParticlePreset {
  name: string
  colors: string[]
  minSpeed: number; maxSpeed: number
  minLife: number; maxLife: number
  minSize: number; maxSize: number
  gravity: number              // positive = down
  spread: number               // angle spread in radians (PI = all directions)
  direction: number            // base angle in radians (0 = right, PI/2 = down)
  rate: number
  burst: number
  sizeDecay: number
  opacityDecay: number
  shape: 'circle' | 'square' | 'star' | 'line'
  duration: number             // ms, 0 = infinite
}

// Pre-built effect presets
export const PARTICLE_PRESETS: Record<string, ParticlePreset> = {
  fire: {
    name: 'Fire', colors: ['#ff4400', '#ff8800', '#ffcc00', '#ff6600'],
    minSpeed: 0.5, maxSpeed: 2, minLife: 300, maxLife: 800,
    minSize: 2, maxSize: 6, gravity: -0.03, spread: 0.4,
    direction: -Math.PI / 2, rate: 3, burst: 0,
    sizeDecay: 0.02, opacityDecay: 0.01, shape: 'circle', duration: 0
  },
  ice: {
    name: 'Ice', colors: ['#88ccff', '#aaddff', '#ffffff', '#66bbff'],
    minSpeed: 0.3, maxSpeed: 1.5, minLife: 400, maxLife: 1000,
    minSize: 1, maxSize: 4, gravity: 0.01, spread: Math.PI,
    direction: -Math.PI / 2, rate: 2, burst: 0,
    sizeDecay: 0.01, opacityDecay: 0.008, shape: 'star', duration: 0
  },
  lightning: {
    name: 'Lightning', colors: ['#ffffff', '#aaccff', '#88aaff', '#ffff88'],
    minSpeed: 2, maxSpeed: 5, minLife: 50, maxLife: 150,
    minSize: 1, maxSize: 3, gravity: 0, spread: Math.PI,
    direction: 0, rate: 5, burst: 15,
    sizeDecay: 0, opacityDecay: 0.05, shape: 'line', duration: 300
  },
  heal: {
    name: 'Heal', colors: ['#44ff88', '#88ffaa', '#aaffcc', '#ffffff'],
    minSpeed: 0.3, maxSpeed: 1, minLife: 500, maxLife: 1200,
    minSize: 2, maxSize: 5, gravity: -0.02, spread: Math.PI,
    direction: -Math.PI / 2, rate: 2, burst: 8,
    sizeDecay: 0.01, opacityDecay: 0.006, shape: 'star', duration: 1500
  },
  hit_sparks: {
    name: 'Hit Sparks', colors: ['#ffffff', '#ffcc44', '#ff8844', '#ff4444'],
    minSpeed: 2, maxSpeed: 6, minLife: 100, maxLife: 400,
    minSize: 1, maxSize: 3, gravity: 0.05, spread: Math.PI,
    direction: 0, rate: 0, burst: 12,
    sizeDecay: 0.02, opacityDecay: 0.02, shape: 'circle', duration: 500
  },
  blood: {
    name: 'Blood', colors: ['#cc0000', '#990000', '#660000', '#ff2222'],
    minSpeed: 1, maxSpeed: 4, minLife: 200, maxLife: 600,
    minSize: 1, maxSize: 4, gravity: 0.08, spread: Math.PI * 0.6,
    direction: -Math.PI / 4, rate: 0, burst: 8,
    sizeDecay: 0.01, opacityDecay: 0.01, shape: 'circle', duration: 800
  },
  dust: {
    name: 'Dust', colors: ['#aa9977', '#997755', '#887744', '#ccbb99'],
    minSpeed: 0.5, maxSpeed: 2, minLife: 300, maxLife: 800,
    minSize: 2, maxSize: 5, gravity: -0.01, spread: Math.PI * 0.3,
    direction: -Math.PI / 2, rate: 0, burst: 6,
    sizeDecay: 0.02, opacityDecay: 0.01, shape: 'circle', duration: 600
  },
  smoke: {
    name: 'Smoke', colors: ['#444444', '#555555', '#666666', '#333333'],
    minSpeed: 0.2, maxSpeed: 0.8, minLife: 800, maxLife: 2000,
    minSize: 3, maxSize: 8, gravity: -0.01, spread: 0.5,
    direction: -Math.PI / 2, rate: 1, burst: 0,
    sizeDecay: -0.01, opacityDecay: 0.004, shape: 'circle', duration: 0
  },
  levelup: {
    name: 'Level Up', colors: ['#ffdd44', '#ffee88', '#ffffff', '#ffcc00'],
    minSpeed: 1, maxSpeed: 3, minLife: 500, maxLife: 1500,
    minSize: 2, maxSize: 6, gravity: -0.04, spread: Math.PI * 2,
    direction: 0, rate: 4, burst: 20,
    sizeDecay: 0.01, opacityDecay: 0.005, shape: 'star', duration: 2000
  },
  dark_aura: {
    name: 'Dark Aura', colors: ['#440066', '#660088', '#220044', '#880099'],
    minSpeed: 0.3, maxSpeed: 1, minLife: 400, maxLife: 1000,
    minSize: 2, maxSize: 5, gravity: -0.02, spread: Math.PI * 2,
    direction: 0, rate: 2, burst: 0,
    sizeDecay: 0.01, opacityDecay: 0.007, shape: 'circle', duration: 0
  },
}

// Create a particle from a preset
function createParticle(emitter: ParticleEmitter, preset: ParticlePreset): Particle {
  const angle = preset.direction + (Math.random() - 0.5) * preset.spread * 2
  const speed = preset.minSpeed + Math.random() * (preset.maxSpeed - preset.minSpeed)
  const life = preset.minLife + Math.random() * (preset.maxLife - preset.minLife)
  const size = preset.minSize + Math.random() * (preset.maxSize - preset.minSize)
  const color = preset.colors[Math.floor(Math.random() * preset.colors.length)]

  return {
    x: emitter.x + (Math.random() - 0.5) * 10,
    y: emitter.y + (Math.random() - 0.5) * 10,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    ax: 0, ay: preset.gravity,
    life, maxLife: life,
    size, sizeDecay: preset.sizeDecay,
    color, opacity: 1, opacityDecay: preset.opacityDecay,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.1,
    shape: preset.shape
  }
}

// Create an emitter
export function createEmitter(x: number, y: number, presetName: string): ParticleEmitter {
  const preset = PARTICLE_PRESETS[presetName]
  if (!preset) return { x, y, particles: [], emitting: false, rate: 0, burst: 0, preset: presetName, elapsed: 0, maxDuration: 0 }

  const emitter: ParticleEmitter = {
    x, y, particles: [], emitting: true,
    rate: preset.rate, burst: preset.burst,
    preset: presetName, elapsed: 0, maxDuration: preset.duration
  }

  // Initial burst
  for (let i = 0; i < preset.burst; i++) {
    emitter.particles.push(createParticle(emitter, preset))
  }

  return emitter
}

// Update emitter each frame (call in requestAnimationFrame)
export function updateEmitter(emitter: ParticleEmitter, dt: number): boolean {
  const preset = PARTICLE_PRESETS[emitter.preset]
  if (!preset) return false

  emitter.elapsed += dt

  // Check duration
  if (emitter.maxDuration > 0 && emitter.elapsed >= emitter.maxDuration) {
    emitter.emitting = false
  }

  // Emit new particles
  if (emitter.emitting) {
    for (let i = 0; i < emitter.rate; i++) {
      emitter.particles.push(createParticle(emitter, preset))
    }
  }

  // Update existing particles
  for (let i = emitter.particles.length - 1; i >= 0; i--) {
    const p = emitter.particles[i]
    p.vx += p.ax * dt / 16
    p.vy += p.ay * dt / 16
    p.x += p.vx * dt / 16
    p.y += p.vy * dt / 16
    p.life -= dt
    p.size = Math.max(0.1, p.size - p.sizeDecay * dt / 16)
    p.opacity = Math.max(0, p.opacity - p.opacityDecay * dt / 16)
    p.rotation += p.rotSpeed * dt / 16

    if (p.life <= 0 || p.opacity <= 0) {
      emitter.particles.splice(i, 1)
    }
  }

  // Emitter is done when not emitting and no particles left
  return emitter.emitting || emitter.particles.length > 0
}

// Render particles to a Canvas 2D context
export function renderParticles(ctx: CanvasRenderingContext2D, emitter: ParticleEmitter) {
  for (const p of emitter.particles) {
    ctx.save()
    ctx.globalAlpha = p.opacity
    ctx.fillStyle = p.color
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)

    switch (p.shape) {
      case 'circle':
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'square':
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        break
      case 'star':
        ctx.beginPath()
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5 - Math.PI / 2
          const r = i % 2 === 0 ? p.size : p.size * 0.4
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
        }
        ctx.closePath()
        ctx.fill()
        break
      case 'line':
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(p.vx * 3, p.vy * 3)
        ctx.stroke()
        break
    }

    ctx.restore()
  }
}
