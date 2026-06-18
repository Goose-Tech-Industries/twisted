// ═══════════════════════════════════════════════════════════════
// FPS CONTROLLER — Skyrim-style free-roam movement
// ═══════════════════════════════════════════════════════════════
// Handles: WASD movement, mouse look (pointer lock), collision
// against tile grid, sprint, jump. Works with Three.js camera.
//
// Designed for server-authoritative validation: sends position
// updates at a fixed rate, server checks against passability.
// ═══════════════════════════════════════════════════════════════

import * as THREE from "three"

export interface FPSControllerConfig {
  moveSpeed: number        // units/sec (default 4.0)
  sprintMultiplier: number // sprint speed factor (default 1.8)
  mouseSensitivity: number // radians per pixel (default 0.002)
  playerHeight: number     // camera Y height (default 0.8)
  playerRadius: number     // collision radius (default 0.25)
  gravity: number          // units/sec^2 (default 9.8)
  jumpForce: number        // initial upward velocity (default 4.5)
}

const DEFAULT_CONFIG: FPSControllerConfig = {
  moveSpeed: 4.0,
  sprintMultiplier: 1.8,
  mouseSensitivity: 0.002,
  playerHeight: 0.8,
  playerRadius: 0.25,
  gravity: 9.8,
  jumpForce: 4.5,
}

export interface TileCollisionMap {
  width: number
  height: number
  isPassable: (tileX: number, tileY: number) => boolean
  getElevation: (tileX: number, tileY: number) => number
}

export interface FPSPositionUpdate {
  x: number       // world X (continuous)
  y: number       // world Y (height)
  z: number       // world Z (continuous)
  rotY: number    // yaw rotation
  tileX: number   // current tile X (for server validation)
  tileY: number   // current tile Y (for server validation)
  running: boolean
}

export class FPSController {
  camera: THREE.PerspectiveCamera
  config: FPSControllerConfig
  collisionMap: TileCollisionMap | null = null

  // Position state
  position = new THREE.Vector3(0, 0.8, 0)
  velocity = new THREE.Vector3(0, 0, 0)
  yaw = 0    // horizontal rotation (radians)
  pitch = 0  // vertical rotation (radians)

  // Input state
  private keys = new Set<string>()
  private isLocked = false
  private isSprinting = false
  private isJumping = false
  private onGround = true

  // Callbacks
  onPositionUpdate: ((update: FPSPositionUpdate) => void) | null = null
  onInteract: (() => void) | null = null

  // Rate limiting for server updates
  private lastServerUpdate = 0
  private serverUpdateRate = 50 // ms between server updates (20 Hz)
  private lastTileX = -1
  private lastTileY = -1

  // DOM element for pointer lock
  private domElement: HTMLElement | null = null

  // Bound handlers (for cleanup)
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null
  private _onKeyUp: ((e: KeyboardEvent) => void) | null = null
  private _onMouseMove: ((e: MouseEvent) => void) | null = null
  private _onPointerLockChange: (() => void) | null = null
  private _onClick: ((e: MouseEvent) => void) | null = null

  constructor(camera: THREE.PerspectiveCamera, config?: Partial<FPSControllerConfig>) {
    this.camera = camera
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.position.y = this.config.playerHeight
  }

  // ── Set initial position from tile coordinates ──
  setTilePosition(tileX: number, tileY: number) {
    // Center of tile in world space (1 unit per tile, player at origin is their tile)
    this.position.x = 0 // player is always at origin in the scene (scene moves around them)
    this.position.z = 0
    this.lastTileX = tileX
    this.lastTileY = tileY
  }

  // ── Set world position directly ──
  setWorldPosition(x: number, y: number, z: number) {
    this.position.set(x, y, z)
  }

  // ── Attach to DOM element ──
  attach(element: HTMLElement) {
    this.domElement = element

    this._onKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      this.keys.add(e.code)
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.isSprinting = true
      if (e.code === 'Space' && this.onGround) {
        this.velocity.y = this.config.jumpForce
        this.onGround = false
        this.isJumping = true
      }
      if (e.code === 'KeyE' || e.code === 'Enter') {
        this.onInteract?.()
      }
      // Prevent page scroll
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault()
      }
    }

    this._onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code)
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.isSprinting = false
    }

    this._onMouseMove = (e: MouseEvent) => {
      if (!this.isLocked) return
      this.yaw -= e.movementX * this.config.mouseSensitivity
      this.pitch -= e.movementY * this.config.mouseSensitivity
      // Clamp pitch to prevent flipping
      this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch))
    }

    this._onClick = (e: MouseEvent) => {
      if (!this.isLocked && this.domElement) {
        this.domElement.requestPointerLock()
      }
    }

    this._onPointerLockChange = () => {
      this.isLocked = document.pointerLockElement === this.domElement
      if (!this.isLocked) {
        this.keys.clear()
        this.isSprinting = false
      }
    }

    document.addEventListener('keydown', this._onKeyDown)
    document.addEventListener('keyup', this._onKeyUp)
    document.addEventListener('mousemove', this._onMouseMove)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    element.addEventListener('click', this._onClick)
  }

  // ── Detach from DOM ──
  detach() {
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown)
    if (this._onKeyUp) document.removeEventListener('keyup', this._onKeyUp)
    if (this._onMouseMove) document.removeEventListener('mousemove', this._onMouseMove)
    if (this._onPointerLockChange) document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    if (this._onClick && this.domElement) this.domElement.removeEventListener('click', this._onClick)
    if (document.pointerLockElement === this.domElement) document.exitPointerLock()
    this.domElement = null
  }

  // ── Main update loop (call every frame with delta time) ──
  update(dt: number, playerTileX: number, playerTileY: number) {
    if (!this.isLocked) return

    const speed = this.config.moveSpeed * (this.isSprinting ? this.config.sprintMultiplier : 1.0)

    // ── Calculate movement direction from input ──
    const forward = new THREE.Vector3(0, 0, -1)
    const right = new THREE.Vector3(1, 0, 0)

    // Rotate directions by yaw (horizontal look direction)
    const euler = new THREE.Euler(0, this.yaw, 0, 'YXZ')
    forward.applyEuler(euler)
    right.applyEuler(euler)

    // Flatten to XZ plane for movement (no flying)
    forward.y = 0
    forward.normalize()
    right.y = 0
    right.normalize()

    const moveDir = new THREE.Vector3(0, 0, 0)

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveDir.add(forward)
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveDir.sub(forward)
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveDir.add(right)
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveDir.sub(right)

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize()
      moveDir.multiplyScalar(speed * dt)
    }

    // ── Apply gravity ──
    if (!this.onGround) {
      this.velocity.y -= this.config.gravity * dt
    }

    // ── Proposed new position ──
    const newPos = this.position.clone()
    newPos.x += moveDir.x
    newPos.z += moveDir.z
    newPos.y += this.velocity.y * dt

    // ── Collision detection against tile grid ──
    if (this.collisionMap) {
      const cm = this.collisionMap
      const r = this.config.playerRadius

      // Convert world position to tile coordinates
      // The scene is centered on the player's current tile, so
      // world (0,0,0) = playerTileX, playerTileY
      const worldToTileX = (wx: number) => Math.floor(playerTileX + wx + 0.5)
      const worldToTileZ = (wz: number) => Math.floor(playerTileY + wz + 0.5)

      // Check collision in X direction
      const txNew = worldToTileX(newPos.x)
      const tzCur = worldToTileZ(this.position.z)
      if (txNew >= 0 && txNew < cm.width && tzCur >= 0 && tzCur < cm.height) {
        if (!cm.isPassable(txNew, tzCur)) {
          newPos.x = this.position.x // block X movement
        }
      } else {
        newPos.x = this.position.x // block at map edge
      }

      // Check collision in Z direction
      const txCur = worldToTileX(newPos.x)
      const tzNew = worldToTileZ(newPos.z)
      if (txCur >= 0 && txCur < cm.width && tzNew >= 0 && tzNew < cm.height) {
        if (!cm.isPassable(txCur, tzNew)) {
          newPos.z = this.position.z // block Z movement
        }
      } else {
        newPos.z = this.position.z // block at map edge
      }

      // Ground height from elevation
      const finalTX = worldToTileX(newPos.x)
      const finalTZ = worldToTileZ(newPos.z)
      if (finalTX >= 0 && finalTX < cm.width && finalTZ >= 0 && finalTZ < cm.height) {
        const groundY = cm.getElevation(finalTX, finalTZ) * 0.5 + this.config.playerHeight
        if (newPos.y <= groundY) {
          newPos.y = groundY
          this.velocity.y = 0
          this.onGround = true
          this.isJumping = false
        }
      }
    }

    this.position.copy(newPos)

    // ── Update camera ──
    this.camera.position.copy(this.position)
    const lookEuler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')
    this.camera.quaternion.setFromEuler(lookEuler)

    // ── Send position updates to server ──
    const now = Date.now()
    if (now - this.lastServerUpdate >= this.serverUpdateRate && this.collisionMap) {
      const tileX = Math.floor(playerTileX + this.position.x + 0.5)
      const tileZ = Math.floor(playerTileY + this.position.z + 0.5)

      // Only send if tile changed or enough time passed
      if (tileX !== this.lastTileX || tileZ !== this.lastTileY || now - this.lastServerUpdate > 200) {
        this.lastServerUpdate = now

        this.onPositionUpdate?.({
          x: this.position.x,
          y: this.position.y,
          z: this.position.z,
          rotY: this.yaw,
          tileX,
          tileY: tileZ,
          running: this.isSprinting,
        })

        this.lastTileX = tileX
        this.lastTileY = tileZ
      }
    }
  }

  get locked() { return this.isLocked }
  get sprinting() { return this.isSprinting }
}
