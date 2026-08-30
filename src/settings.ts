// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR SETTINGS — الإعدادات                                             ║
// ║                                                                          ║
// ║  Saved in the browser, so choices survive a refresh and the operator     ║
// ║  never has to touch the code. vision.ts reads its thresholds from here.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { DETECT } from './vision'

export type Sensitivity = 'strict' | 'balanced' | 'sensitive' | 'custom'

/**
 * Three ready-made profiles so nobody has to reason about raw pixel ratios.
 * "strict" only reacts to large, unambiguous changes — the safest default for
 * a live demo. "sensitive" catches small movements but will occasionally react
 * to lighting shifts or a passing shadow.
 */
export const PRESETS: Record<Exclude<Sensitivity, 'custom'>, {
  label: string; hint: string
  minConfidence: number; displacementRatio: number
  displacementFrames: number; personScore: number
}> = {
  strict: {
    label: 'صارم',
    hint: 'تنبيهات نادرة — الأغراض الكبيرة والواضحة فقط. الأنسب ليوم العرض.',
    minConfidence: 0.95, displacementRatio: 0.08, displacementFrames: 4, personScore: 0.85,
  },
  balanced: {
    label: 'متوازن',
    hint: 'توازن بين الدقة والحساسية.',
    minConfidence: 0.80, displacementRatio: 0.035, displacementFrames: 3, personScore: 0.80,
  },
  sensitive: {
    label: 'حسّاس',
    hint: 'يلاحظ أصغر تغيير — قد ينبّه أحياناً بسبب الإضاءة أو الظلال.',
    minConfidence: 0.65, displacementRatio: 0.02, displacementFrames: 2, personScore: 0.65,
  },
}

export type Settings = {
  sensitivity: Sensitivity
  detectionEnabled: boolean
  soundEnabled: boolean
  cameraId: string            // '' = let the browser choose
  facingMode: 'user' | 'environment'  // front/back camera on phones & tablets
  facilityName: string
  facilityUnit: string
  // Raw thresholds — only edited directly when sensitivity === 'custom'
  minConfidence: number
  displacementRatio: number
  displacementFrames: number
  personScore: number
}

const DEFAULTS: Settings = {
  sensitivity: 'strict',      // start cautious — easier to loosen than to regain trust
  detectionEnabled: true,
  soundEnabled: false,
  cameraId: '',
  facingMode: 'environment',  // back camera by default — matches evidence-capture use
  facilityName: 'أمن السلامة والجودة الجامعية',
  facilityUnit: 'وحدة السلامة والأمن الجامعي',
  minConfidence: PRESETS.strict.minConfidence,
  displacementRatio: PRESETS.strict.displacementRatio,
  displacementFrames: PRESETS.strict.displacementFrames,
  personScore: PRESETS.strict.personScore,
}

const KEY = 'athar.settings.v1'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch { return { ...DEFAULTS } }
}

let settings: Settings = load()
const listeners = new Set<() => void>()

export const getSettings = () => settings

export function subscribeSettings(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Pushes the active thresholds into the vision engine. */
export function applySettings() {
  const s = settings
  const p = s.sensitivity === 'custom' ? s : PRESETS[s.sensitivity]
  DETECT.minConfidence = p.minConfidence
  DETECT.displacementRatio = p.displacementRatio
  DETECT.confirmFrames.displacement = p.displacementFrames
  DETECT.personScore = p.personScore
}

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch }
  // Picking a preset also copies its numbers in, so switching to "custom"
  // later starts from whatever was last active instead of stale values.
  if (patch.sensitivity && patch.sensitivity !== 'custom') {
    const p = PRESETS[patch.sensitivity]
    settings = {
      ...settings,
      minConfidence: p.minConfidence,
      displacementRatio: p.displacementRatio,
      displacementFrames: p.displacementFrames,
      personScore: p.personScore,
    }
  }
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* private mode */ }
  applySettings()
  listeners.forEach(l => l())
}

export function resetSettings() {
  settings = { ...DEFAULTS }
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  applySettings()
  listeners.forEach(l => l())
}

// Apply saved thresholds as soon as the module loads.
applySettings()

/** Short alert tone. Uses WebAudio so there's no sound file to ship. */
export function beep() {
  if (!settings.soundEnabled) return
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.26)
    setTimeout(() => ctx.close(), 500)
  } catch { /* audio unavailable */ }
}

// ─── Camera enumeration ───────────────────────────────────────────────────────

export type CamDevice = { id: string; label: string }

/**
 * Lists connected video inputs (built-in, USB webcam on a stand, etc).
 * Browsers hide device labels until camera permission has been granted once,
 * so we fall back to numbering them.
 */
export async function listCameras(): Promise<CamDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter(d => d.kind === 'videoinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `كاميرا ${i + 1}` }))
  } catch { return [] }
}
