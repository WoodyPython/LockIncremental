import type { GameSnapshot } from '../game/GameSimulation'
import { COMPLETION_BONUS_RATE, TARGET_HALF_WIDTH_RADIANS, TARGET_REWARD } from '../game/constants'
import { cooldownRemainingMs } from '../game/RunState'

export type LockEffect = 'hit' | 'miss' | 'completed' | null

interface Palette {
  readonly background: string
  readonly ring: string
  readonly text: string
  readonly muted: string
  readonly primary: string
  readonly target: string
  readonly outline: string
  readonly danger: string
  readonly success: string
  readonly gold: string
  readonly goldLight: string
}

interface GainEffect {
  readonly angle: number
  readonly amount: number
  readonly startedAt: number
}

export class LockRenderer {
  private readonly context: CanvasRenderingContext2D
  private effect: LockEffect = null
  private effectStartedAt = 0
  private gains: GainEffect[] = []
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  public constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('Canvas 2D is not supported by this browser.')
    this.context = context
  }

  public showEffect(effect: Exclude<LockEffect, null>, now: number): void {
    this.effect = effect
    this.effectStartedAt = now
  }

  public showGain(angle: number, amount: number, now: number): void {
    this.gains.push({ angle, amount, startedAt: now })
  }

  public render(snapshot: GameSnapshot, now: number): void {
    const size = this.resizeCanvas()
    const palette = this.readPalette()
    const { context } = this
    const center = size / 2
    const radius = size * 0.36
    const ringWidth = Math.max(8, size * 0.03)
    const effectAge = now - this.effectStartedAt
    if (effectAge > 450) this.effect = null
    this.gains = this.gains.filter((gain) => now - gain.startedAt <= 1_200)

    context.clearRect(0, 0, size, size)
    context.fillStyle = palette.background
    context.fillRect(0, 0, size, size)

    const shake =
      this.effect === 'miss' && !this.reduceMotion.matches && effectAge < 280
        ? Math.sin(effectAge * 0.12) * (1 - effectAge / 280) * 7
        : 0
    context.save()
    context.translate(shake, 0)

    context.lineWidth = ringWidth
    context.strokeStyle = this.ringColor(snapshot, palette)
    context.beginPath()
    context.arc(center, center, radius, 0, Math.PI * 2)
    context.stroke()

    if (snapshot.run.kind === 'active' || snapshot.run.kind === 'failed') {
      this.drawTarget(snapshot.run.targetAngle, center, radius, ringWidth, palette)
    }

    this.drawBar(snapshot.run.markerAngle, center, radius, palette)
    this.drawCenterText(snapshot, now, center, size, palette)
    this.drawPulse(center, radius, effectAge, palette)
    if (snapshot.run.kind === 'completed') {
      this.drawWinCelebration(snapshot.run.completedAt, now, center, radius, palette)
    }
    for (const gain of this.gains) this.drawGain(gain, now, center, radius, size, palette)
    context.restore()
  }

  private resizeCanvas(): number {
    const cssSize = Math.max(
      1,
      Math.floor(Math.min(this.canvas.clientWidth, this.canvas.clientHeight)),
    )
    const scale = Math.max(1, window.devicePixelRatio || 1)
    const pixelSize = Math.floor(cssSize * scale)
    if (this.canvas.width !== pixelSize || this.canvas.height !== pixelSize) {
      this.canvas.width = pixelSize
      this.canvas.height = pixelSize
    }
    this.context.setTransform(scale, 0, 0, scale, 0, 0)
    return cssSize
  }

  private drawBar(angle: number, center: number, radius: number, palette: Palette): void {
    const innerRadius = radius * 0.38
    const startX = center + Math.cos(angle) * innerRadius
    const startY = center + Math.sin(angle) * innerRadius
    const endX = center + Math.cos(angle) * radius
    const endY = center + Math.sin(angle) * radius
    const barWidth = Math.max(7, radius * 0.07)
    this.context.lineCap = 'round'
    this.context.strokeStyle = palette.outline
    this.context.lineWidth = barWidth + 6
    this.context.beginPath()
    this.context.moveTo(startX, startY)
    this.context.lineTo(endX, endY)
    this.context.stroke()
    this.context.strokeStyle = palette.primary
    this.context.lineWidth = barWidth
    this.context.beginPath()
    this.context.moveTo(startX, startY)
    this.context.lineTo(endX, endY)
    this.context.stroke()
    this.context.lineCap = 'butt'
  }

  private drawTarget(
    angle: number,
    center: number,
    radius: number,
    ringWidth: number,
    palette: Palette,
  ): void {
    this.context.lineCap = 'round'
    this.context.strokeStyle = palette.outline
    this.context.lineWidth = ringWidth * 1.65
    this.context.beginPath()
    this.context.arc(
      center,
      center,
      radius,
      angle - TARGET_HALF_WIDTH_RADIANS,
      angle + TARGET_HALF_WIDTH_RADIANS,
    )
    this.context.stroke()
    this.context.strokeStyle = palette.target
    this.context.lineWidth = ringWidth * 1.25
    this.context.beginPath()
    this.context.arc(
      center,
      center,
      radius,
      angle - TARGET_HALF_WIDTH_RADIANS,
      angle + TARGET_HALF_WIDTH_RADIANS,
    )
    this.context.stroke()
    this.context.lineCap = 'butt'
  }

  private drawCenterText(
    snapshot: GameSnapshot,
    now: number,
    center: number,
    size: number,
    palette: Palette,
  ): void {
    const run = snapshot.run
    let heading: string
    let color = palette.text
    if (run.kind === 'active') {
      heading = `${run.hits} / ${run.requiredHits}`
    } else if (run.kind === 'idle') {
      heading = 'Click to Play'
    } else if (run.kind === 'completed') {
      heading = 'Jackpot!'
      color = palette.gold
    } else {
      const remaining = cooldownRemainingMs(run, now)
      heading = remaining > 0 ? `${Math.ceil(remaining / 1_000)}` : 'Click to Play'
      if (remaining > 0) color = palette.danger
    }

    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'
    this.context.fillStyle = color
    this.context.font = `800 ${Math.max(28, size * 0.09)}px system-ui, sans-serif`
    this.context.fillText(heading, center, center, size * 0.62)

    if (run.kind === 'failed' && cooldownRemainingMs(run, now) > 0) {
      this.context.fillStyle = palette.muted
      this.context.font = `700 ${Math.max(12, size * 0.03)}px system-ui, sans-serif`
      this.context.fillText('COOLDOWN', center, center + size * 0.09)
    } else if (run.kind === 'completed') {
      const bonus = run.requiredHits * TARGET_REWARD * COMPLETION_BONUS_RATE
      this.context.fillStyle = palette.goldLight
      this.context.font = `800 ${Math.max(15, size * 0.04)}px system-ui, sans-serif`
      this.context.fillText(`+${bonus} BONUS`, center, center + size * 0.1)
    }
  }

  private drawWinCelebration(
    completedAt: number,
    now: number,
    center: number,
    radius: number,
    palette: Palette,
  ): void {
    const progress = Math.min(1, Math.max(0, (now - completedAt) / 1_500))
    if (this.reduceMotion.matches) return

    this.context.save()
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2 + progress * 0.45
      const distance = radius * (0.35 + progress * 0.85)
      const x = center + Math.cos(angle) * distance
      const y = center + Math.sin(angle) * distance
      this.context.globalAlpha = 1 - progress
      this.context.fillStyle = index % 2 === 0 ? palette.gold : palette.goldLight
      this.context.beginPath()
      this.context.arc(x, y, 4 + (index % 3), 0, Math.PI * 2)
      this.context.fill()
    }
    this.context.globalAlpha = 1 - progress
    this.context.strokeStyle = palette.goldLight
    this.context.lineWidth = 5
    this.context.beginPath()
    this.context.arc(center, center, radius * (0.55 + progress * 0.75), 0, Math.PI * 2)
    this.context.stroke()
    this.context.restore()
  }

  private drawGain(
    gain: GainEffect,
    now: number,
    center: number,
    radius: number,
    size: number,
    palette: Palette,
  ): void {
    const progress = Math.min(1, (now - gain.startedAt) / 1_200)
    const outwardOffset = size * (0.06 + (this.reduceMotion.matches ? 0 : progress * 0.055))
    const distance = radius + outwardOffset
    const x = center + Math.cos(gain.angle) * distance
    const y = center + Math.sin(gain.angle) * distance
    this.context.globalAlpha = 1 - progress
    this.context.fillStyle = palette.success
    this.context.font = `800 ${Math.max(16, size * 0.045)}px system-ui, sans-serif`
    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'
    this.context.fillText(`+${gain.amount}`, x, y)
    this.context.globalAlpha = 1
  }

  private drawPulse(center: number, radius: number, effectAge: number, palette: Palette): void {
    if (this.effect === null || this.reduceMotion.matches || effectAge < 0) return
    if (this.effect !== 'hit' && this.effect !== 'completed') return
    const duration = this.effect === 'completed' ? 450 : 250
    const progress = Math.min(1, effectAge / duration)
    this.context.globalAlpha = 1 - progress
    this.context.strokeStyle = this.effect === 'hit' ? palette.success : palette.gold
    this.context.lineWidth = 5
    this.context.beginPath()
    this.context.arc(center, center, radius * (0.55 + progress * 0.7), 0, Math.PI * 2)
    this.context.stroke()
    this.context.globalAlpha = 1
  }

  private ringColor(snapshot: GameSnapshot, palette: Palette): string {
    if (snapshot.run.kind === 'failed') return palette.danger
    if (snapshot.run.kind === 'completed') return palette.gold
    if (this.effect === 'hit') return palette.success
    return palette.ring
  }

  private readPalette(): Palette {
    const styles = getComputedStyle(document.documentElement)
    const color = (name: string): string => styles.getPropertyValue(name).trim()
    return {
      background: color('--color-surface'),
      ring: color('--color-ring'),
      text: color('--color-text'),
      muted: color('--color-text-muted'),
      primary: color('--color-primary'),
      target: color('--color-target'),
      outline: color('--color-outline'),
      danger: color('--color-danger'),
      success: color('--color-success'),
      gold: color('--color-gold'),
      goldLight: color('--color-gold-light'),
    }
  }
}
