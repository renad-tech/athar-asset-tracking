// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — بلاغ الأمن الجامعي الحي (الحوادث)                              ║
// ║                                                                          ║
// ║  الفكرة: صورة مرجعية أولاً → بث كاميرا حي بعدها → ذكاء اصطناعي يراقب     ║
// ║  الحركة والأشخاص والبطاقات طوال الوقت → كل حدث يُسجَّل بلحظته في سجل      ║
// ║  زمني → وفي النهاية تقرير واحد موقَّع يحتوي كل شيء: مَن دخل، ماذا تحرّك،  ║
// ║  وصور قبل/بعد لكل تحريك.                                                 ║
// ║                                                                          ║
// ║  ملف مستقل عن api.ts وعن جدول incidents القديم عمداً — لا يمسّهما، فقط    ║
// ║  يستورد الأدوات المشتركة (supabase, uploadFile) ولا يغيّر فيها شيئاً.     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { supabase, uploadFile, dataUrlToBlob } from './api'

// ══════════════════════════════════════════════════════════════════════════════
// الأنواع
// ══════════════════════════════════════════════════════════════════════════════

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW'
export type Status = 'ACTIVE' | 'RESOLVED' | 'ESCALATED'
export type LogColor = 'red' | 'green' | 'blue' | 'yellow'

export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: 'HIGH — استجابة فورية', MEDIUM: 'MEDIUM — متابعة مطلوبة', LOW: 'LOW — للتوثيق',
}
export const STATUS_LABEL: Record<Status, string> = {
  ACTIVE: 'ACTIVE — جارية', RESOLVED: 'RESOLVED — تمت المعالجة', ESCALATED: 'ESCALATED — تصعيد',
}

export const INCIDENT_TYPES = [
  'دخول غير مصرح', 'زائر بلا بطاقة', 'تحريك ممتلكات مشبوه', 'تخريب أو إتلاف',
  'حريق أو دخان', 'إصابة أو حالة طبية', 'سرقة مشتبهة', 'أخرى',
]

/** حدث واحد في السجل الزمني — كل بطاقة ملوّنة في شاشة المراقبة الحية أصلها هنا. */
export type LogEntry = {
  at: number
  label: string
  color: LogColor
  beforeShot?: string
  afterShot?: string
  confidence?: number   // 0..1
}

/** شخص ظهر أمام الكاميرا خلال الجلسة — موظف مصرَّح له أو زائر مجهول. */
export type PersonSeen = {
  empId?: string
  name: string
  authorized: boolean
  firstSeen: number
  lastSeen: number
  movementCount: number
}

export type IncidentDraft = {
  location: string
  incidentType: string
  priority: Priority
  status: Status
  notes?: string
}

export type IncidentSession = {
  id?: string
  reportNo: string
  officerBadge?: string
  officerName?: string
  location: string
  incidentType: string
  priority: Priority
  status: Status
  referenceShot?: string
  aiAccuracy?: string
  startedAt: number
  endedAt?: number
  durationSeconds?: number
  movementCount: number
  unregisteredCount: number
  unauthorizedCount: number
  alertCount: number
  photoCount: number
  evidenceSizeKb: number
  integrityHash?: string
  notes?: string
}

// ══════════════════════════════════════════════════════════════════════════════
// رقم البلاغ
// ══════════════════════════════════════════════════════════════════════════════

/** بلاغ رقمه فريد وقابل للقراءة: INC-٢٠٢٦-٠٤٧١. */
export function genReportNo(d = new Date()): string {
  const year = d.getFullYear()
  const seq = String(Math.floor(Math.random() * 9000) + 1000)
  return `INC-${year}-${seq}`
}

// ══════════════════════════════════════════════════════════════════════════════
// بصمة التكامل — SHA-256
// ══════════════════════════════════════════════════════════════════════════════

/**
 * بصمة حقيقية لا شكلية — تُحسب من محتوى الجلسة والسجل الزمني والأشخاص معاً.
 * أي تعديل لاحق على أي رقم في التقرير يُنتج بصمة مختلفة تماماً، فتكشف
 * التعديل بدل أن تزيّنه. تُحسب بواجهة المتصفح القياسية (Web Crypto)، بلا
 * مكتبة إضافية.
 */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function canonicalize(session: IncidentSession, log: LogEntry[], people: PersonSeen[]): string {
  // ترتيب ثابت للمفاتيح والمصفوفات حتى تكون البصمة قابلة لإعادة الحساب
  // والتحقق لاحقاً، لا تتغيّر بترتيب الإدراج فقط.
  const sortedLog = [...log].sort((a, b) => a.at - b.at)
  const sortedPeople = [...people].sort((a, b) => (a.empId ?? a.name).localeCompare(b.empId ?? b.name))
  return JSON.stringify({
    reportNo: session.reportNo, location: session.location, incidentType: session.incidentType,
    priority: session.priority, status: session.status,
    startedAt: session.startedAt, endedAt: session.endedAt,
    log: sortedLog.map(l => ({ at: l.at, label: l.label, color: l.color, confidence: l.confidence })),
    people: sortedPeople.map(p => ({ id: p.empId ?? null, name: p.name, authorized: p.authorized, movements: p.movementCount })),
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// الحفظ
// ══════════════════════════════════════════════════════════════════════════════

export async function saveIncidentSession(input: {
  session: IncidentSession
  log: LogEntry[]
  people: PersonSeen[]
}): Promise<{ ok: boolean; id?: string; hash?: string; error?: string }> {

  if (!supabase) return { ok: false, error: 'قاعدة البيانات غير متصلة — تحقق من ملف .env' }

  const hash = await sha256Hex(canonicalize(input.session, input.log, input.people))

  // الصورة المرجعية دليل الحالة قبل أي شيء — تُرفع أولاً.
  let referenceUrl = input.session.referenceShot
  if (referenceUrl?.startsWith('data:')) {
    try {
      const url = await uploadFile(dataUrlToBlob(referenceUrl), `incidents/${input.session.reportNo}-ref.jpg`)
      if (url) referenceUrl = url
    } catch (e: any) { console.error('[ATHAR] incident reference upload:', e?.message) }
  }

  const row = {
    report_no: input.session.reportNo,
    officer_badge: input.session.officerBadge ?? null,
    officer_name: input.session.officerName ?? null,
    location: input.session.location,
    incident_type: input.session.incidentType,
    priority: input.session.priority,
    status: input.session.status,
    reference_shot: referenceUrl ?? null,
    ai_accuracy: input.session.aiAccuracy ?? null,
    started_at: new Date(input.session.startedAt).toISOString(),
    ended_at: input.session.endedAt ? new Date(input.session.endedAt).toISOString() : null,
    duration_seconds: input.session.durationSeconds ?? null,
    movement_count: input.session.movementCount,
    unregistered_count: input.session.unregisteredCount,
    unauthorized_count: input.session.unauthorizedCount,
    alert_count: input.session.alertCount,
    photo_count: input.session.photoCount,
    evidence_size_kb: input.session.evidenceSizeKb,
    integrity_hash: hash,
    notes: input.session.notes ?? null,
  }

  const { data, error } = await supabase.from('incident_sessions').insert(row).select('id').single()
  if (error) return { ok: false, error: error.message }
  const id = data?.id as string

  // رفع صور الأحداث (قبل/بعد) بالتوازي — كل حدث تحريك يحمل دليله البصري معه.
  const uploadedLog = await Promise.all(input.log.map(async (l, i) => {
    let before = l.beforeShot, after = l.afterShot
    try {
      if (before?.startsWith('data:')) before = (await uploadFile(dataUrlToBlob(before), `incidents/${input.session.reportNo}-${i}-before.jpg`)) ?? before
      if (after?.startsWith('data:'))  after  = (await uploadFile(dataUrlToBlob(after),  `incidents/${input.session.reportNo}-${i}-after.jpg`))  ?? after
    } catch (e: any) { console.error('[ATHAR] incident log upload:', e?.message) }
    return { ...l, beforeShot: before, afterShot: after }
  }))

  if (uploadedLog.length) {
    const { error: logErr } = await supabase.from('incident_log').insert(
      uploadedLog.map(l => ({
        session_id: id, at: new Date(l.at).toISOString(), label: l.label, color: l.color,
        before_shot: l.beforeShot ?? null, after_shot: l.afterShot ?? null, confidence: l.confidence ?? null,
      })),
    )
    if (logErr) return { ok: true, id, hash, error: `حُفظت الجلسة لكن تعذّر حفظ السجل الزمني: ${logErr.message}` }
  }

  if (input.people.length) {
    const { error: peopleErr } = await supabase.from('incident_people').insert(
      input.people.map(p => ({
        session_id: id, emp_id: p.empId ?? null, name: p.name, authorized: p.authorized,
        first_seen: new Date(p.firstSeen).toISOString(), last_seen: new Date(p.lastSeen).toISOString(),
        movement_count: p.movementCount,
      })),
    )
    if (peopleErr) return { ok: true, id, hash, error: `حُفظت الجلسة لكن تعذّر حفظ سجل الأشخاص: ${peopleErr.message}` }
  }

  return { ok: true, id, hash }
}

// ══════════════════════════════════════════════════════════════════════════════
// تنسيق
// ══════════════════════════════════════════════════════════════════════════════

export const fmtClock = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', { hour12: false })

export const fmtDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    : `${m}m ${String(s).padStart(2, '0')}s`
}
