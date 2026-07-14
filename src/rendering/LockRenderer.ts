import Decimal from 'break_infinity.js'
import { COMPLETION_CELEBRATION_MS } from '../game/constants'
import { cooldownRemainingMs, type RunState } from '../game/RunState'
import { formatDecimal } from '../utils/format'

export type LockEffect = 'hit' | 'critical' | 'forgiven' | 'miss' | 'completed' | null

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
  readonly shield: string
}

interface FloatingTextBase {
  readonly angle: number
  readonly startedAt: number
}

type FloatingTextEffect =
  | (FloatingTextBase & {
      readonly kind: 'gain'
      readonly amount: Decimal
      readonly critical: boolean
    })
  | (FloatingTextBase & { readonly kind: 'shielded' })

const EFFECT_LIFETIME_MS = 450
const GAIN_LIFETIME_MS = 1_200
const MISS_SHAKE_MS = 280
const HIT_PULSE_MS = 250
const MAX_FLOATING_TEXT_EFFECTS = 12

export class LockRenderer {
  private readonly context: CanvasRenderingContext2D
  private effect: LockEffect = null
  private effectStartedAt = 0
  private floatingTextEffects: FloatingTextEffect[] = []
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly resizeObserver: ResizeObserver
  private palette: Palette | null = null
  private sizeDirty = true
  private cssSize = 1
  private pixelRatio = 1

  public constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('Canvas 2D is not supported by this browser.')
    this.context = context
    this.resizeObserver = new ResizeObserver(() => {
      this.sizeDirty = true
    })
    this.resizeObserver.observe(canvas)
  }

  public showEffect(effect: Exclude<LockEffect, null>, now: number): void {
    this.effect = effect
    this.effectStartedAt = now
  }

  public showGain(angle: number, amount: Decimal, critical: boolean, now: number): void {
    this.addFloatingText({
      kind: 'gain',
      angle,
      amount: new Decimal(amount),
      critical,
      startedAt: now,
    })
  }

  public showShield(angle: number, now: number): void {
    this.addFloatingText({ kind: 'shielded', angle, startedAt: now })
  }

  public invalidatePalette(): void {
    this.palette = null
  }

  public destroy(): void {
    this.resizeObserver.disconnect()
    this.floatingTextEffects.length = 0
    this.effect = null
  }

  public render(run: RunState, now: number): void {
    const size = this.resizeCanvas()
    const palette = this.palette ?? (this.palette = this.readPalette())
    const { context } = this
    const center = size / 2
    const radius = size * 0.36
    const ringWidth = Math.max(8, size * 0.03)
    const effectAge = now - this.effectStartedAt
    if (effectAge > EFFECT_LIFETIME_MS) this.effect = null
    for (let index = this.floatingTextEffects.length - 1; index >= 0; index -= 1) {
      const floatingText = this.floatingTextEffects[index]
      if (floatingText !== undefined && now - floatingText.startedAt > GAIN_LIFETIME_MS) {
        this.floatingTextEffects.splice(index, 1)
      }
    }

    context.clearRect(0, 0, size, size)
    context.fillStyle = palette.background
    context.fillRect(0, 0, size, size)

    const shake =
      this.effect === 'miss' && !this.reduceMotion.matches && effectAge < MISS_SHAKE_MS
        ? Math.sin(effectAge * 0.12) * (1 - effectAge / MISS_SHAKE_MS) * 7
        : 0
    context.save()
    context.translate(shake, 0)

    context.lineWidth = ringWidth
    context.strokeStyle = this.ringColor(run, palette)
    context.beginPath()
    context.arc(center, center, radius, 0, Math.PI * 2)
    context.stroke()

    if (run.kind === 'active' || run.kind === 'failed') {
      this.drawTarget(
        run.targetAngle,
        run.targetHalfWidth,
        run.targetCritical,
        now,
        center,
        radius,
        ringWidth,
        palette,
      )
    }

    this.drawBar(run.markerAngle, center, radius, palette)
    this.drawCenterText(run, now, center, size, palette)
    this.drawPulse(center, radius, effectAge, palette)
    if (run.kind === 'completed') {
      this.drawWinCelebration(run.completedAt, now, center, radius, palette)
    }
    for (const floatingText of this.floatingTextEffects) {
      this.drawFloatingText(floatingText, now, center, radius, size, palette)
    }
    context.restore()
  }

  private resizeCanvas(): number {
    const nextPixelRatio = Math.max(1, window.devicePixelRatio || 1)
    const ratioChanged = nextPixelRatio !== this.pixelRatio
    if (ratioChanged) this.sizeDirty = true
    if (!this.sizeDirty) return this.cssSize

    this.cssSize = Math.max(
      1,
      Math.floor(Math.min(this.canvas.clientWidth, this.canvas.clientHeight)),
    )
    this.pixelRatio = nextPixelRatio
    const pixelSize = Math.floor(this.cssSize * this.pixelRatio)
    if (this.canvas.width !== pixelSize || this.canvas.height !== pixelSize) {
      this.canvas.width = pixelSize
      this.canvas.height = pixelSize
    }
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    this.sizeDirty = false
    return this.cssSize
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
    targetHalfWidth: number,
    critical: boolean,
    now: number,
    center: number,
    radius: number,
    ringWidth: number,
    palette: Palette,
  ): void {
    this.context.lineCap = 'round'
    this.context.strokeStyle = palette.outline
    this.context.lineWidth = ringWidth * 1.65
    this.context.beginPath()
    this.context.arc(center, center, radius, angle - targetHalfWidth, angle + targetHalfWidth)
    this.context.stroke()
    this.context.strokeStyle = critical ? palette.gold : palette.target
    this.context.lineWidth = ringWidth * 1.25
    this.context.beginPath()
    this.context.arc(center, center, radius, angle - targetHalfWidth, angle + targetHalfWidth)
    this.context.stroke()
    this.context.lineCap = 'butt'
    if (critical) this.drawCriticalSparkles(angle, now, center, radius, ringWidth, palette)
  }

  private drawCriticalSparkles(
    targetAngle: number,
    now: number,
    center: number,
    radius: number,
    ringWidth: number,
    palette: Palette,
  ): void {
    const animatedPhase = this.reduceMotion.matches ? 0 : now / 220
    this.context.save()
    for (let index = 0; index < 5; index += 1) {
      const angle = targetAngle + (index - 2) * 0.065
      const pulse = this.reduceMotion.matches
        ? 1
        : 0.7 + Math.sin(animatedPhase + index * 1.6) * 0.3
      const distance = radius + ringWidth * (1.25 + (index % 2) * 0.4)
      const x = center + Math.cos(angle) * distance
      const y = center + Math.sin(angle) * distance
      const size = Math.max(2.5, ringWidth * 0.22 * pulse)
      this.context.globalAlpha = 0.65 + pulse * 0.35
      this.context.fillStyle = index % 2 === 0 ? palette.goldLight : palette.gold
      this.context.beginPath()
      this.context.moveTo(x, y - size)
      this.context.lineTo(x + size * 0.55, y)
      this.context.lineTo(x, y + size)
      this.context.lineTo(x - size * 0.55, y)
      this.context.closePath()
      this.context.fill()
    }
    this.context.restore()
  }

  private drawCenterText(
    run: RunState,
    now: number,
    center: number,
    size: number,
    palette: Palette,
  ): void {
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
      this.context.fillStyle = palette.goldLight
      this.context.font = `800 ${Math.max(15, size * 0.04)}px system-ui, sans-serif`
      this.context.fillText(
        `+${formatDecimal(run.completionBonus)} BONUS`,
        center,
        center + size * 0.085,
      )
      this.context.fillText(
        `+${formatDecimal(run.medalsAwarded)} MEDAL`,
        center,
        center + size * 0.135,
      )
    }
  }

  private drawWinCelebration(
    completedAt: number,
    now: number,
    center: number,
    radius: number,
    palette: Palette,
  ): void {
    const progress = Math.min(1, Math.max(0, (now - completedAt) / COMPLETION_CELEBRATION_MS))
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

  private addFloatingText(effect: FloatingTextEffect): void {
    if (this.floatingTextEffects.length >= MAX_FLOATING_TEXT_EFFECTS) {
      this.floatingTextEffects.shift()
    }
    this.floatingTextEffects.push(effect)
  }

  private drawFloatingText(
    effect: FloatingTextEffect,
    now: number,
    center: number,
    radius: number,
    size: number,
    palette: Palette,
  ): void {
    const progress = Math.min(1, (now - effect.startedAt) / GAIN_LIFETIME_MS)
    const outwardOffset = size * (0.06 + (this.reduceMotion.matches ? 0 : progress * 0.055))
    const distance = radius + outwardOffset
    const x = center + Math.cos(effect.angle) * distance
    const y = center + Math.sin(effect.angle) * distance
    this.context.globalAlpha = 1 - progress
    this.context.fillStyle =
      effect.kind === 'shielded' ? palette.shield : effect.critical ? palette.gold : palette.success
    this.context.font = `800 ${Math.max(16, size * 0.045)}px system-ui, sans-serif`
    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'
    const label =
      effect.kind === 'shielded'
        ? 'Shielded!'
        : `${effect.critical ? 'CRIT ' : ''}+${formatDecimal(effect.amount)}`
    this.context.fillText(label, x, y)
    this.context.globalAlpha = 1
  }

  private drawPulse(center: number, radius: number, effectAge: number, palette: Palette): void {
    if (this.effect === null || this.reduceMotion.matches || effectAge < 0) return
    if (
      this.effect !== 'hit' &&
      this.effect !== 'critical' &&
      this.effect !== 'forgiven' &&
      this.effect !== 'completed'
    ) {
      return
    }
    const duration = this.effect === 'completed' ? EFFECT_LIFETIME_MS : HIT_PULSE_MS
    const progress = Math.min(1, effectAge / duration)
    this.context.globalAlpha = 1 - progress
    this.context.strokeStyle =
      this.effect === 'completed' || this.effect === 'critical'
        ? palette.gold
        : this.effect === 'forgiven'
          ? palette.shield
          : palette.success
    this.context.lineWidth = 5
    this.context.beginPath()
    this.context.arc(center, center, radius * (0.55 + progress * 0.7), 0, Math.PI * 2)
    this.context.stroke()
    this.context.globalAlpha = 1
  }

  private ringColor(run: RunState, palette: Palette): string {
    if (run.kind === 'failed') return palette.danger
    if (run.kind === 'completed') return palette.gold
    if (this.effect === 'hit') return palette.success
    if (this.effect === 'critical') return palette.gold
    if (this.effect === 'forgiven') return palette.shield
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
      shield: color('--color-shield'),
    }
  }
}
