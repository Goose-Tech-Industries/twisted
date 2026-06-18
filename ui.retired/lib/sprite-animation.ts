// =================================================================
// SPRITE ANIMATION SYSTEM
// =================================================================
// Define animations from sprite sheets. Each animation is a sequence
// of frames with timing. Assign to states (idle, walk, attack, hurt).

export interface SpriteFrame {
  x: number; y: number         // position in sprite sheet (pixels)
  w: number; h: number         // frame size
  duration: number             // ms this frame is shown
}

export interface SpriteAnimation {
  name: string                 // 'idle', 'walk_down', 'attack', 'hurt', 'death'
  frames: SpriteFrame[]
  loop: boolean
  spriteSheetUrl?: string      // if different from entity's default sheet
}

export interface AnimationState {
  animation: string
  frameIndex: number
  elapsed: number
  finished: boolean
}

// Calculate which frame to show based on elapsed time
export function getAnimationFrame(anim: SpriteAnimation, state: AnimationState): SpriteFrame | null {
  if (!anim || !anim.frames.length) return null

  let elapsed = state.elapsed
  let frameIdx = 0

  for (let i = 0; i < anim.frames.length; i++) {
    if (elapsed < anim.frames[i].duration) {
      frameIdx = i
      break
    }
    elapsed -= anim.frames[i].duration
    if (i === anim.frames.length - 1) {
      if (anim.loop) {
        elapsed = elapsed % anim.frames.reduce((sum, f) => sum + f.duration, 0)
        return getAnimationFrame(anim, { ...state, elapsed })
      }
      frameIdx = anim.frames.length - 1
    }
  }

  return anim.frames[frameIdx]
}

// Generate a simple animation from a grid sprite sheet
export function generateGridAnimation(
  sheetWidth: number, sheetHeight: number,
  frameW: number, frameH: number,
  row: number, startCol: number, frameCount: number,
  fps: number = 8, loop: boolean = true
): SpriteAnimation {
  const frames: SpriteFrame[] = []
  const duration = 1000 / fps

  for (let i = 0; i < frameCount; i++) {
    frames.push({
      x: (startCol + i) * frameW,
      y: row * frameH,
      w: frameW, h: frameH,
      duration
    })
  }

  return { name: 'generated', frames, loop }
}

// Standard RPG character animation set (4 directions × N frames)
export function generateCharacterAnimations(
  frameW: number, frameH: number, framesPerDir: number = 3, fps: number = 6
): Record<string, SpriteAnimation> {
  return {
    idle_down:  generateGridAnimation(0, 0, frameW, frameH, 0, 0, 1, fps, true),
    walk_down:  generateGridAnimation(0, 0, frameW, frameH, 0, 0, framesPerDir, fps, true),
    walk_left:  generateGridAnimation(0, 0, frameW, frameH, 1, 0, framesPerDir, fps, true),
    walk_right: generateGridAnimation(0, 0, frameW, frameH, 2, 0, framesPerDir, fps, true),
    walk_up:    generateGridAnimation(0, 0, frameW, frameH, 3, 0, framesPerDir, fps, true),
    attack:     generateGridAnimation(0, 0, frameW, frameH, 4, 0, framesPerDir, 10, false),
    hurt:       generateGridAnimation(0, 0, frameW, frameH, 5, 0, 2, 6, false),
    death:      generateGridAnimation(0, 0, frameW, frameH, 6, 0, framesPerDir, 4, false),
  }
}
