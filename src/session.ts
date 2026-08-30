// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR SESSION STORE — الحالة الحيّة للجلسة                             ║
// ║                                                                          ║
// ║  Everything the final report needs is collected HERE while the patrol    ║
// ║  is running: when it started, what happened and at what exact time,      ║
// ║  who was seen, and any before/after evidence photos.                     ║
// ║                                                                          ║
// ║  Phase 2 (camera + AI) will simply call logEvent() / addCapture() —      ║
// ║  the report already knows how to render whatever lands here.             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export type EventKind = 'login' | 'biometric' | 'patrol' | 'authorized' | 'unknown' | 'movement' | 'alert' | 'end'

export type TimelineEvent = {
  id: number
  at: number                 // epoch ms — exact moment it happened
  kind: EventKind
  label: string              // Arabic description shown in the report
  person?: string            // employee name, or "مجهول"
  empId?: string
}

export type Capture = {
  id: number
  at: number
  reason: string             // why we saved it, e.g. "تحريك غرض — كرسي"
  before?: string            // data URL — scene before the change
  after?: string             // data URL — scene after the change
}

export type PersonSeen = {
  key: string                // empId, or "unknown-3"
  name: string
  empId?: string
  authorized: boolean
  firstSeen: number
  lastSeen: number
  movements: number          // how many times they moved something
  photoUrl?: string          // from the staff registry — NOT captured from the camera
  role?: string
}

const KIND_LABEL: Record<EventKind, string> = {
  login:      'دخول المشرف للنظام',
  biometric:  'التحقق البيومتري من المحيط',
  patrol:     'بدء الدورية',
  authorized: 'دخول مصرح به',
  unknown:    'زائر بلا تحقق',
  movement:   'تحريك ممتلكات',
  alert:      'تنبيه أمني',
  end:        'إنهاء الجلسة',
}

export const KIND_COLOR: Record<EventKind, 'green' | 'blue' | 'yellow' | 'red'> = {
  login: 'green', biometric: 'green', patrol: 'blue',
  authorized: 'green', unknown: 'yellow', movement: 'red', alert: 'red', end: 'green',
}

// ─── The store ────────────────────────────────────────────────────────────────

let _id = 0
const nextId = () => ++_id

export type SessionState = {
  startedAt: number
  endedAt: number | null
  events: TimelineEvent[]
  captures: Capture[]
  people: PersonSeen[]
  videoBytes: number          // real accumulated size of saved evidence
}

function blank(): SessionState {
  return { startedAt: Date.now(), endedAt: null, events: [], captures: [], people: [], videoBytes: 0 }
}

let state: SessionState = blank()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

/** Subscribe to session changes (used by React via useSession). */
export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export const getSession = () => state

/** Starts a brand-new patrol session and logs the opening events. */
export function startSession(officerName: string, officerId: string) {
  state = blank()
  logEvent('login', `${KIND_LABEL.login} — ${officerId}`, { person: officerName, empId: officerId })
  logEvent('biometric', KIND_LABEL.biometric)
  logEvent('patrol', KIND_LABEL.patrol)
  emit()
}

export function endSession() {
  if (state.endedAt) return
  state.endedAt = Date.now()
  logEvent('end', KIND_LABEL.end)
  emit()
}

/** Records one timeline entry with its exact timestamp. */
export function logEvent(kind: EventKind, label?: string, extra?: { person?: string; empId?: string }) {
  state.events.push({
    id: nextId(), at: Date.now(), kind,
    label: label ?? KIND_LABEL[kind],
    person: extra?.person, empId: extra?.empId,
  })
  emit()
}

/** Records a person entering the scene (authorized via QR, or unknown). */
export function seePerson(p: {
  key: string; name: string; empId?: string; authorized: boolean
  photoUrl?: string; role?: string
}) {
  const now = Date.now()
  const existing = state.people.find(x => x.key === p.key)
  if (existing) { existing.lastSeen = now; emit(); return }
  state.people.push({ ...p, firstSeen: now, lastSeen: now, movements: 0 })
  logEvent(p.authorized ? 'authorized' : 'unknown',
    p.authorized ? `${KIND_LABEL.authorized} — ${p.name}` : `${KIND_LABEL.unknown} — ${p.name}`,
    { person: p.name, empId: p.empId })
}

/** Records a before/after evidence pair when something gets moved. */
export function addCapture(c: { reason: string; before?: string; after?: string; personKey?: string }) {
  state.captures.push({ id: nextId(), at: Date.now(), reason: c.reason, before: c.before, after: c.after })
  // Track real storage used by the saved evidence (base64 → ~3/4 bytes).
  for (const img of [c.before, c.after]) {
    if (img) state.videoBytes += Math.round((img.length - (img.indexOf(',') + 1)) * 0.75)
  }
  if (c.personKey) {
    const p = state.people.find(x => x.key === c.personKey)
    if (p) p.movements++
  }
  logEvent('movement', `${KIND_LABEL.movement} — ${c.reason}`)
}

// ─── Derived values used by the report ───────────────────────────────────────

export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour12: false })
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export const fmtDateAr = (ms: number) =>
  new Date(ms).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

/** "2h 14m 33s" from a millisecond span. */
export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`
}

export function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

/** Everything the report/export needs, computed from live session state. */
export function reportSummary(s: SessionState = state) {
  const end = s.endedAt ?? Date.now()
  const unknowns = s.people.filter(p => !p.authorized)
  return {
    startedAt: s.startedAt,
    endedAt: end,
    durationMs: end - s.startedAt,
    duration: fmtDuration(end - s.startedAt),
    dateStr: fmtDate(s.startedAt),
    dateArStr: fmtDateAr(s.startedAt),
    startTime: fmtTime(s.startedAt),
    endTime: fmtTime(end),
    captureCount: s.captures.length,
    // Each capture holds up to two stills, so this is the true image count.
    imageCount: s.captures.reduce((n, c) => n + (c.before ? 1 : 0) + (c.after ? 1 : 0), 0),
    movementCount: s.captures.length,
    peopleCount: s.people.length,
    unknownCount: unknowns.length,
    authorizedCount: s.people.length - unknowns.length,
    alertCount: s.events.filter(e => e.kind === 'alert' || e.kind === 'movement' || e.kind === 'unknown').length,
    storage: fmtBytes(s.videoBytes),
    events: s.events,
    captures: s.captures,
    people: s.people,
  }
}

/** Canonical JSON of everything that must not change after signing. */
export function canonicalPayload(s: SessionState = state): string {
  return JSON.stringify({
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    events: s.events.map(e => [e.at, e.kind, e.label, e.person ?? '', e.empId ?? '']),
    people: s.people.map(p => [p.key, p.name, p.authorized, p.firstSeen, p.lastSeen, p.movements]),
    captures: s.captures.map(c => [c.at, c.reason, (c.before ?? '').length, (c.after ?? '').length]),
  })
}

/**
 * REAL SHA-256 via the browser's Web Crypto API — the same primitive used by
 * TLS and Git. Async because crypto.subtle is async.
 *
 * Any edit to a timestamp, a person, or an evidence image changes this value,
 * which is what makes it meaningful as a tamper indicator.
 */
export async function reportSHA256(s: SessionState = state): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPayload(s))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * Fast non-cryptographic checksum. Used only as an instant placeholder while
 * the real SHA-256 digest is being computed — never presented as SHA-256.
 */
export function reportHash(s: SessionState = state) {
  const src = JSON.stringify({ a: s.startedAt, b: s.endedAt, c: s.events.map(e => [e.at, e.kind, e.label]) })
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < src.length; i++) {
    h1 = Math.imul(h1 ^ src.charCodeAt(i), 0x01000193) >>> 0
    h2 = Math.imul(h2 + src.charCodeAt(i) + i, 0x85ebca6b) >>> 0
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).toUpperCase()
}
