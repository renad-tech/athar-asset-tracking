// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR VISION ENGINE — محرك الرؤية                                      ║
// ║                                                                          ║
// ║  Two independent layers, by design:                                      ║
// ║                                                                          ║
// ║   • CORE (this file, pure JavaScript — zero downloads, works offline     ║
// ║     from the very first second):                                         ║
// ║        - QR badge scanning            → who is this person?              ║
// ║        - Reference snapshot           → what does "normal" look like?    ║
// ║        - Motion detection             → is anything moving right now?    ║
// ║        - Displacement detection       → did an object actually MOVE      ║
// ║                                         or disappear? → before/after     ║
// ║                                                                          ║
// ║   • OPTIONAL person detector (COCO-SSD). Only activates if the model     ║
// ║     files exist in /public/models/coco-ssd/. See scripts/download-model. ║
// ║     Everything above keeps working perfectly without it.                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import jsQR from 'jsqr'

export type Box = { x: number; y: number; w: number; h: number }   // normalised 0..1
export type VisionHit =
  | { kind: 'person'; box: Box; score: number; label: string }
  | { kind: 'badge'; box: Box; empId: string; label: string }
  | { kind: 'motion'; box: Box; label: string }
  | { kind: 'object'; box: Box; score: number; label: string }

// ─── Frame helpers ────────────────────────────────────────────────────────────

/**
 * Reusable scratch canvases — allocating one per frame would thrash memory.
 * Created lazily so importing this module never touches `document`, which
 * keeps it safe to load in tests and any non-browser context.
 */
let work: HTMLCanvasElement | null = null
let workCtx: CanvasRenderingContext2D | null = null
let full: HTMLCanvasElement | null = null
let fullCtx: CanvasRenderingContext2D | null = null

function ensureCanvases() {
  if (work && full) return true
  if (typeof document === 'undefined') return false
  work = document.createElement('canvas')
  workCtx = work.getContext('2d', { willReadFrequently: true })
  full = document.createElement('canvas')
  fullCtx = full.getContext('2d')
  return !!(workCtx && fullCtx)
}

/** Analysis runs on a small grayscale copy: fast, and ignores camera noise. */
const GRID_W = 64
const GRID_H = 48

// ══════════════════════════════════════════════════════════════════════════════
//  حساسية الكشف — عدّل هذه الأرقام لتقليل أو زيادة التنبيهات
//  كل رقم مشروح. ارفع القيمة = تنبيهات أقل وأكثر تأكيداً.
// ══════════════════════════════════════════════════════════════════════════════
export const DETECT = {
  /** أقل ثقة مقبولة لأي تنبيه (0.80 = ٨٠٪). ارفعها لتقليل الإنذارات الخاطئة. */
  minConfidence: 0.80,

  /** كم إطاراً متتالياً يجب أن يتفق قبل تصديق الكشف. أقوى وسيلة ضد الإنذار الخاطئ. */
  confirmFrames: {
    motion: 2,       // حركة
    badge: 2,        // بطاقة QR — نفس الرقم مرتين
    displacement: 3, // تحريك غرض — الأصرم، لأنه يلتقط صوراً
  },

  /** أقل ثقة لكشف الأشخاص/الأجسام بالنموذج (COCO-SSD). */
  personScore: 0.80,

  /** أقل نسبة تغيّر في المشهد تُعتبر تحريكاً فعلياً (٣.٥٪ من الصورة). */
  displacementRatio: 0.035,

  /** ثوانٍ يجب أن يهدأ فيها المشهد قبل الحكم بأن شيئاً حُرِّك. */
  settleMs: 1500,

  /** أقل فاصل زمني بين التقاط صورتي أدلة — يمنع تكرار التنبيه لنفس الحدث. */
  captureCooldownMs: 8000,

  /** فرق الإضاءة لكل بكسل الذي يُعتبر تغيّراً حقيقياً. */
  pixelThreshold: 34,
}

export function grabImageData(video: HTMLVideoElement, w = GRID_W, h = GRID_H): ImageData | null {
  if (!video.videoWidth || !ensureCanvases()) return null
  work!.width = w; work!.height = h
  workCtx!.drawImage(video, 0, 0, w, h)
  return workCtx!.getImageData(0, 0, w, h)
}

/** Full-resolution JPEG snapshot, capped in size so evidence stays small. */
export function snapshot(video: HTMLVideoElement, maxW = 640, quality = 0.7): string {
  if (!video.videoWidth || !ensureCanvases()) return ''
  const scale = Math.min(1, maxW / video.videoWidth)
  full!.width = Math.round(video.videoWidth * scale)
  full!.height = Math.round(video.videoHeight * scale)
  fullCtx!.drawImage(video, 0, 0, full!.width, full!.height)
  return full!.toDataURL('image/jpeg', quality)
}

/** Converts RGBA pixels to a flat luminance array. */
function luma(img: ImageData): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.width * img.height)
  const d = img.data
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    out[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0
  }
  return out
}

// ─── QR badge scanning ────────────────────────────────────────────────────────

/**
 * Reads a QR badge held up to the camera.
 * Scans at a higher resolution than motion analysis — QR needs the detail.
 */
export function scanBadge(video: HTMLVideoElement): { empId: string; box: Box } | null {
  const img = grabImageData(video, 320, 240)
  if (!img) return null
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
  if (!code?.data) return null

  const xs = [code.location.topLeftCorner.x, code.location.topRightCorner.x,
              code.location.bottomLeftCorner.x, code.location.bottomRightCorner.x]
  const ys = [code.location.topLeftCorner.y, code.location.topRightCorner.y,
              code.location.bottomLeftCorner.y, code.location.bottomRightCorner.y]
  const x = Math.min(...xs), y = Math.min(...ys)

  return {
    empId: code.data.trim(),
    box: {
      x: x / img.width, y: y / img.height,
      w: (Math.max(...xs) - x) / img.width,
      h: (Math.max(...ys) - y) / img.height,
    },
  }
}

// ─── Scene reference + change detection ──────────────────────────────────────

export type Scene = {
  reference: Uint8ClampedArray      // the "normal" state of the room
  referenceShot: string             // full-res JPEG of that same moment
  capturedAt: number
  w: number
  h: number
}

/** Takes the initial survey of the room — everything is compared against this. */
export function captureScene(video: HTMLVideoElement): Scene | null {
  const img = grabImageData(video)
  if (!img) return null
  return {
    reference: luma(img),
    referenceShot: snapshot(video),
    capturedAt: Date.now(),
    w: img.width, h: img.height,
  }
}

export type ChangeResult = {
  changedRatio: number      // 0..1 — how much of the frame differs from reference
  boxes: Box[]              // clusters of changed pixels
  moving: boolean           // frame-to-frame movement happening right now
  motionRatio: number
  motionConfidence: number  // 0..1 — how sure we are this is real movement
  changeConfidence: number  // 0..1 — how sure we are something was displaced
  lightShift: number        // global brightness drift (lamp switched, cloud passed)
}

/**
 * Median of the per-pixel differences. If a lamp is switched on, EVERY pixel
 * shifts by roughly the same amount, so the median jumps. Subtracting it means
 * a lighting change no longer looks like a moved object — this single step
 * removes the most common false alarm.
 */
function medianDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  // Sample every 7th pixel — plenty for a median, far cheaper than sorting all.
  const sample: number[] = []
  for (let i = 0; i < a.length; i += 7) sample.push(a[i] - b[i])
  sample.sort((x, y) => x - y)
  return sample[sample.length >> 1] ?? 0
}

/**
 * Maps a measured ratio onto 0..1 confidence.
 *
 * Calibration: the threshold itself scores 50% (borderline, rejected), and
 * confidence reaches 100% at 1.5× the threshold. A typical real object move
 * covers ~4-8% of the frame against a 3.5% threshold, which lands at 84-100%
 * — comfortably above the bar — while a marginal 3.7% flicker scores 56% and
 * is correctly thrown away.
 */
function confidenceFrom(ratio: number, threshold: number): number {
  if (ratio <= threshold) return 0
  return Math.min(1, 0.5 + 0.5 * ((ratio - threshold) / (threshold * 0.5)))
}

/**
 * Compares the live frame against BOTH the reference scene (what changed since
 * we started?) and the previous frame (is something moving right now?).
 *
 * The distinction matters: motion means a person is active; a change that
 * persists AFTER motion stops means an object was actually displaced.
 */
export function detectChange(
  video: HTMLVideoElement,
  scene: Scene | null,
  prev: Uint8ClampedArray | null,
): { result: ChangeResult; current: Uint8ClampedArray } | null {
  const img = grabImageData(video)
  if (!img) return null
  const cur = luma(img)
  const w = img.width, h = img.height
  const TH = DETECT.pixelThreshold

  // Movement right now = difference from the previous frame.
  let motionPixels = 0
  if (prev && prev.length === cur.length) {
    const drift = medianDelta(cur, prev)
    for (let i = 0; i < cur.length; i++) {
      if (Math.abs((cur[i] - prev[i]) - drift) > TH) motionPixels++
    }
  }

  // Persistent change = difference from the reference snapshot,
  // with global lighting drift cancelled out.
  const changedMask = new Uint8Array(cur.length)
  let changed = 0
  let lightShift = 0
  if (scene && scene.reference.length === cur.length) {
    lightShift = medianDelta(cur, scene.reference)
    for (let i = 0; i < cur.length; i++) {
      if (Math.abs((cur[i] - scene.reference[i]) - lightShift) > TH) { changedMask[i] = 1; changed++ }
    }
  }

  const motionRatio = motionPixels / cur.length
  const changedRatio = changed / cur.length

  return {
    current: cur,
    result: {
      changedRatio,
      motionRatio,
      lightShift: Math.abs(lightShift),
      moving: motionRatio > 0.012,
      motionConfidence: confidenceFrom(motionRatio, 0.012),
      changeConfidence: confidenceFrom(changedRatio, DETECT.displacementRatio),
      boxes: clusterBoxes(changedMask, w, h),
    },
  }
}

const MIN_CLUSTER = 6   // ignore specks — camera noise and compression artefacts

/** Groups changed pixels into bounding boxes via flood fill. */
function clusterBoxes(mask: Uint8Array, w: number, h: number): Box[] {
  const seen = new Uint8Array(mask.length)
  const boxes: Box[] = []
  const stack: number[] = []

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0

    while (stack.length) {
      const p = stack.pop()!
      const px = p % w, py = (p / w) | 0
      count++
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py

      // 4-connected neighbours
      const neigh = [
        px > 0 ? p - 1 : -1,
        px < w - 1 ? p + 1 : -1,
        py > 0 ? p - w : -1,
        py < h - 1 ? p + w : -1,
      ]
      for (const n of neigh) {
        if (n >= 0 && mask[n] && !seen[n]) { seen[n] = 1; stack.push(n) }
      }
    }

    if (count >= MIN_CLUSTER) {
      boxes.push({
        x: minX / w, y: minY / h,
        w: (maxX - minX + 1) / w, h: (maxY - minY + 1) / h,
      })
    }
  }

  // Biggest regions first, capped so the overlay stays readable.
  return boxes.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 5)
}

// ─── Optional person detector (COCO-SSD) ─────────────────────────────────────

let personModel: any = null
let modelState: 'idle' | 'loading' | 'ready' | 'unavailable' = 'idle'

export const getModelState = () => modelState

/**
 * Loads the bundled COCO-SSD model from /public/models/coco-ssd/.
 * If the files aren't there, we silently stay in pure-JS mode — the core
 * detection above is unaffected.
 */
export async function loadPersonModel(): Promise<boolean> {
  if (modelState === 'ready') return true
  if (modelState === 'loading' || modelState === 'unavailable') return false
  modelState = 'loading'
  try {
    // Probe first so a missing model doesn't spam the console with 404s.
    const probe = await fetch('/models/coco-ssd/model.json', { method: 'HEAD' })
    if (!probe.ok) { modelState = 'unavailable'; return false }

    const [tf, cocoSsd] = await Promise.all([
      import('@tensorflow/tfjs'),
      import('@tensorflow-models/coco-ssd'),
    ])
    await tf.ready()
    personModel = await cocoSsd.load({ modelUrl: '/models/coco-ssd/model.json' })
    modelState = 'ready'
    return true
  } catch (err) {
    console.warn('[ATHAR] person model unavailable, using motion-only mode:', err)
    modelState = 'unavailable'
    return false
  }
}

const AR_LABEL: Record<string, string> = {
  person: 'شخص', laptop: 'حاسوب محمول', 'cell phone': 'هاتف', backpack: 'حقيبة',
  handbag: 'حقيبة يد', chair: 'كرسي', tv: 'شاشة', keyboard: 'لوحة مفاتيح',
  mouse: 'فأرة', book: 'كتاب', bottle: 'زجاجة', cup: 'كوب', suitcase: 'حقيبة سفر',
}

/** Runs the person/object detector if it loaded; otherwise returns nothing. */
export async function detectPeople(video: HTMLVideoElement): Promise<VisionHit[]> {
  if (modelState !== 'ready' || !personModel || !video.videoWidth) return []
  try {
    const preds = await personModel.detect(video, 8, DETECT.personScore)
    return preds.map((p: any) => {
      const [x, y, w, h] = p.bbox
      const box = { x: x / video.videoWidth, y: y / video.videoHeight, w: w / video.videoWidth, h: h / video.videoHeight }
      const label = AR_LABEL[p.class] ?? p.class
      return p.class === 'person'
        ? { kind: 'person' as const, box, score: p.score, label }
        : { kind: 'object' as const, box, score: p.score, label }
    })
  } catch { return [] }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIRMATION GATE — بوابة التأكيد
//
//  A single frame is never trusted. A detection must repeat across N
//  consecutive checks AND clear the confidence bar before it fires.
//  This is what turns "something flickered" into "I am 80% sure".
// ══════════════════════════════════════════════════════════════════════════════

export class Confirmer {
  private streak = 0
  private lastKey = ''
  private lastFiredAt = 0

  constructor(
    private needed: number,
    private cooldownMs = 0,
  ) {}

  /**
   * Feed each frame's observation. Returns true only on the frame where the
   * detection becomes confirmed — not on every frame afterwards.
   *
   * @param present    did we observe it this frame?
   * @param confidence 0..1 for this observation
   * @param key        identity of the thing seen (e.g. the scanned ID), so a
   *                   different value restarts the streak instead of adding to it
   */
  feed(present: boolean, confidence: number, key = ''): boolean {
    if (!present || confidence < DETECT.minConfidence) { this.streak = 0; this.lastKey = key; return false }
    if (key !== this.lastKey) { this.streak = 0; this.lastKey = key }

    this.streak++
    if (this.streak < this.needed) return false

    const now = Date.now()
    if (this.cooldownMs && now - this.lastFiredAt < this.cooldownMs) return false

    this.lastFiredAt = now
    this.streak = 0            // require a fresh streak for the next alert
    return true
  }

  reset() { this.streak = 0; this.lastKey = ''; }

  /** How close we are to firing, 0..1 — useful for a progress indicator. */
  get progress() { return Math.min(1, this.streak / this.needed) }
}

// ══════════════════════════════════════════════════════════════════════════════
//  INVENTORY DETECTION — حصر الموجودات
//
//  A handover or an audit does not need frame-by-frame motion tracking. It
//  needs one reliable answer: what is in this room, and how many of each?
//
//  Counting on capture and comparing across sessions is both simpler to
//  explain and far more useful than live change detection — a missing device
//  is found by comparing two counts months apart, not by watching pixels.
// ══════════════════════════════════════════════════════════════════════════════

export type Counted = { label: string; count: number }

/** Arabic labels for the COCO classes that actually appear in a facility. */
const FACILITY_LABELS: Record<string, string> = {
  'laptop': 'حاسب محمول',
  'tv': 'شاشة',
  'keyboard': 'لوحة مفاتيح',
  'mouse': 'فأرة',
  'cell phone': 'هاتف',
  'chair': 'كرسي',
  'couch': 'أريكة',
  'book': 'كتاب',
  'bottle': 'زجاجة',
  'cup': 'كوب',
  'backpack': 'حقيبة',
  'handbag': 'حقيبة يد',
  'suitcase': 'حقيبة سفر',
  'clock': 'ساعة',
  'vase': 'وعاء',
  'potted plant': 'نبتة',
  'microwave': 'جهاز',
  'refrigerator': 'ثلاجة',
  'oven': 'فرن',
  'sink': 'حوض',
  'scissors': 'مقص',
  'remote': 'جهاز تحكم',
  'person': 'شخص',
}

/**
 * Takes several readings and keeps the most frequent count per label.
 *
 * A single frame is unreliable — an object can be occluded for an instant, or
 * a reflection can be double-counted. Sampling a few frames and taking the
 * mode gives a stable number without asking the operator to hold still.
 */
export async function countObjects(
  video: HTMLVideoElement,
  samples = 5,
  gapMs = 350,
): Promise<{ items: Counted[]; total: number; usedModel: boolean }> {

  if (modelState !== 'ready' || !personModel || !video.videoWidth) {
    return { items: [], total: 0, usedModel: false }
  }

  const readings: Map<string, number>[] = []

  for (let i = 0; i < samples; i++) {
    try {
      const preds = await personModel.detect(video, 20, DETECT.personScore)
      const m = new Map<string, number>()
      for (const p of preds) {
        // People are recorded as attendees elsewhere — they are not inventory.
        if (p.class === 'person') continue
        const label = FACILITY_LABELS[p.class] ?? p.class
        m.set(label, (m.get(label) ?? 0) + 1)
      }
      readings.push(m)
    } catch { /* skip a bad frame */ }
    if (i < samples - 1) await new Promise(r => setTimeout(r, gapMs))
  }

  if (!readings.length) return { items: [], total: 0, usedModel: true }

  // Mode per label across the readings.
  const labels = new Set<string>()
  readings.forEach(m => m.forEach((_, k) => labels.add(k)))

  const items: Counted[] = []
  labels.forEach(label => {
    const counts = readings.map(m => m.get(label) ?? 0)
    const freq = new Map<number, number>()
    counts.forEach(c => freq.set(c, (freq.get(c) ?? 0) + 1))
    let best = 0, bestFreq = -1
    freq.forEach((f, c) => {
      // Prefer the more frequent count; on a tie prefer the larger one,
      // since occlusion causes undercounting more often than overcounting.
      if (f > bestFreq || (f === bestFreq && c > best)) { best = c; bestFreq = f }
    })
    if (best > 0) items.push({ label, count: best })
  })

  items.sort((a, b) => b.count - a.count)
  return { items, total: items.reduce((s, i) => s + i.count, 0), usedModel: true }
}
