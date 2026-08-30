// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — Live Incident Reporting Service Layer                              ║
// ║  مع 5 تحسينات حرجة:                                                         ║
// ║  ✅ #1: فريادة رقم البلاغ (UUID)                                             ║
// ║  ✅ #2: حساب مدة الجلسة تلقائياً                                             ║
// ║  ✅ #3: معالجة أفضل لأخطاء رفع الصور                                        ║
// ║  ✅ #4: تحقيقات الإدخال (Validation)                                        ║
// ║  ✅ #5: حفظ آمن مع معالجة المعاملات                                         ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { supabase } from './api'
import { uploadFile, dataUrlToBlob } from './api'

// ─────────────────────────────────────────────────────────────────────────────────
// أنواع البيانات
// ─────────────────────────────────────────────────────────────────────────────────

export type LogColor = 'red' | 'green' | 'blue' | 'yellow'
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW'
export type Status = 'ACTIVE' | 'RESOLVED' | 'ESCALATED'

export type IncidentSession = {
  reportNo: string              // INC-2026-ABC12345
  location: string              // مثل: مبنى أ، الطابق الثالث
  incidentType: string          // دخول غير مصرح، سرقة، إلخ
  priority: Priority            // HIGH | MEDIUM | LOW
  status: Status                // ACTIVE | RESOLVED | ESCALATED
  startedAt: number             // ميلّي ثانية
  endedAt?: number              // ميلّي ثانية
  durationSeconds?: number      // محسوب تلقائياً
  referenceShot?: string        // URL أو data: للصورة الأولية
  movementCount: number
  unregisteredCount: number
  unauthorizedCount: number
  alertCount: number
  photoCount: number
  evidenceSizeKb: number
  officerBadge?: string
  officerName?: string
  aiAccuracy?: number           // 0..1 درجة دقة الذكاء الاصطناعي
  notes?: string
}

export type LogEntry = {
  at: number                    // ميلّي ثانية
  label: string                 // وصف الحدث
  color: LogColor               // تلوين حسب النوع
  beforeShot?: string           // URL أو data: للصورة قبل
  afterShot?: string            // URL أو data: للصورة بعد
  confidence?: number           // 0..1 درجة ثقة الكشف
}

export type PersonSeen = {
  empId?: string                // الرقم الوظيفي من QR (اختياري)
  name: string                  // اسم الشخص
  authorized: boolean           // هل مصرح له الدخول؟
  firstSeen: number             // أول ظهور (ميلّي ثانية)
  lastSeen: number              // آخر ظهور
  movementCount: number         // عدد مرات تحركه
}

interface UploadedLogEntry extends LogEntry {
  uploadErrors?: string[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export const INCIDENT_TYPES = [
  'دخول غير مصرح',
  'سرقة',
  'تخريب',
  'عبث بالأجهزة',
  'حادث',
  'شكوى موظف',
  'أخرى',
]

export const PRIORITY_LABEL: Record<Priority, string> = {
  'HIGH': '🔴 عالية جداً',
  'MEDIUM': '🟡 متوسطة',
  'LOW': '🟢 منخفضة',
}

export const STATUS_LABEL: Record<Status, string> = {
  'ACTIVE': '🔵 نشطة',
  'RESOLVED': '✅ محلولة',
  'ESCALATED': '⚠️ مصعودة',
}

// ─────────────────────────────────────────────────────────────────────────────────
// ✅ الإصلاح #1: فريادة رقم البلاغ — استخدام UUID
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * توليد رقم بلاغ فريد باستخدام UUID
 * مثل: INC-2026-A7F2C8E1
 */
export function genReportNo(d = new Date()): string {
  const year = d.getFullYear()
  const uniqueId = crypto.randomUUID().substring(0, 8).toUpperCase()
  return `INC-${year}-${uniqueId}`
}

// ─────────────────────────────────────────────────────────────────────────────────
// دوال مساعدة
// ─────────────────────────────────────────────────────────────────────────────────

/** SHA-256 بصمة التكامل */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** تطبيع البيانات قبل حساب البصمة */
function canonicalize(session: IncidentSession, log: LogEntry[], people: PersonSeen[]): string {
  const obj = {
    s: {
      reportNo: session.reportNo,
      location: session.location,
      incidentType: session.incidentType,
      priority: session.priority,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      movementCount: session.movementCount,
      unregisteredCount: session.unregisteredCount,
      unauthorizedCount: session.unauthorizedCount,
      alertCount: session.alertCount,
      photoCount: session.photoCount,
      evidenceSizeKb: session.evidenceSizeKb,
    },
    log: log.map(l => ({
      at: l.at,
      label: l.label,
      color: l.color,
      confidence: l.confidence,
    })),
    people: people.map(p => ({
      empId: p.empId,
      name: p.name,
      authorized: p.authorized,
      movementCount: p.movementCount,
    })),
  }
  return JSON.stringify(obj)
}

/** صيغة الوقت: HH:MM:SS */
export function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

/** صيغة المدة: "15 دقيقة و 43 ثانية" */
export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s} ثانية`
  if (s === 0) return `${m} دقيقة`
  return `${m} دقيقة و ${s} ثانية`
}

// ─────────────────────────────────────────────────────────────────────────────────
// ✅ الإصلاح #3: معالجة أفضل لأخطاء رفع الصور
// ─────────────────────────────────────────────────────────────────────────────────

async function uploadLogEntries_WithBetterErrorHandling(
  reportNo: string,
  log: LogEntry[]
): Promise<UploadedLogEntry[]> {
  return Promise.all(
    log.map(async (l, i) => {
      const errors: string[] = []
      let before = l.beforeShot
      let after = l.afterShot

      // رفع الصورة السابقة
      if (before?.startsWith('data:')) {
        try {
          const uploaded = await uploadFile(dataUrlToBlob(before), `incidents/${reportNo}-${i}-before.jpg`)
          if (!uploaded) {
            errors.push(`صورة قبل #${i}: فشل الرفع`)
            before = null
          } else {
            before = uploaded
          }
        } catch (e: any) {
          errors.push(`صورة قبل #${i}: ${e.message}`)
          console.warn(`[ATHAR] Failed to upload before shot ${i}:`, e)
          before = null
        }
      }

      // رفع الصورة اللاحقة
      if (after?.startsWith('data:')) {
        try {
          const uploaded = await uploadFile(dataUrlToBlob(after), `incidents/${reportNo}-${i}-after.jpg`)
          if (!uploaded) {
            errors.push(`صورة بعد #${i}: فشل الرفع`)
            after = null
          } else {
            after = uploaded
          }
        } catch (e: any) {
          errors.push(`صورة بعد #${i}: ${e.message}`)
          console.warn(`[ATHAR] Failed to upload after shot ${i}:`, e)
          after = null
        }
      }

      return { ...l, beforeShot: before, afterShot: after, uploadErrors: errors.length ? errors : undefined }
    })
  )
}

// ─────────────────────────────────────────────────────────────────────────────────
// ✅ الإصلاح #4: تحقيقات الإدخال (Validation)
// ─────────────────────────────────────────────────────────────────────────────────

export function validateIncidentSession(
  session: IncidentSession,
  log: LogEntry[],
  people: PersonSeen[]
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // التحقق من الجلسة
  if (!session.location?.trim()) {
    errors.push('📍 الموقع مطلوب — أين وقعت الحادثة؟')
  }

  if (!session.incidentType || !INCIDENT_TYPES.includes(session.incidentType)) {
    errors.push(`📋 نوع الحادثة يجب أن يكون: ${INCIDENT_TYPES.join(', ')}`)
  }

  if (!['HIGH', 'MEDIUM', 'LOW'].includes(session.priority)) {
    errors.push('⚠️ الأولوية يجب أن تكون HIGH أو MEDIUM أو LOW')
  }

  if (!['ACTIVE', 'RESOLVED', 'ESCALATED'].includes(session.status)) {
    errors.push('✓ الحالة يجب أن تكون ACTIVE أو RESOLVED أو ESCALATED')
  }

  if (!session.reportNo || !session.reportNo.match(/^INC-\d{4}-\w{4,8}$/)) {
    errors.push('🔢 رقم البلاغ بصيغة خاطئة — مثل INC-2026-ABC12345')
  }

  // التحقق من السجل الزمني
  if (log.length === 0) {
    warnings.push('📊 لا توجد أحداث مسجلة — هل كانت حادثة فقط؟')
  }

  const logWithMissingShots = log.filter(l => !l.beforeShot || !l.afterShot)
  if (logWithMissingShots.length > 0) {
    warnings.push(`📸 ${logWithMissingShots.length} حدث بدون صور قبل/بعد — قد يقلل من الأدلة`)
  }

  // التحقق من الأشخاص
  const unauthorizedCount = people.filter(p => !p.authorized).length
  if (unauthorizedCount > session.unauthorizedCount) {
    warnings.push(
      `👥 عدد الأشخاص غير المصرحين (${unauthorizedCount}) أكثر من المسجل (${session.unauthorizedCount})`
    )
  }

  // التحقق من التوافقية
  if (session.endedAt && session.endedAt <= session.startedAt) {
    errors.push('⏱️ وقت الانتهاء يجب أن يكون بعد البداية')
  }

  if (!session.officerBadge && !session.officerName) {
    warnings.push('👮 لم يتم تسجيل بيانات الموظف — موصى به لتتبع المسؤولية')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// ✅ الإصلاح #2 + #5: حفظ آمن مع حساب المدة تلقائياً ومعاملات
// ─────────────────────────────────────────────────────────────────────────────────

export async function saveIncidentSession(input: {
  session: IncidentSession
  log: LogEntry[]
  people: PersonSeen[]
}): Promise<{ ok: boolean; id?: string; hash?: string; error?: string; warnings?: string[] }> {
  if (!supabase) return { ok: false, error: 'قاعدة البيانات غير متصلة' }

  const warnings: string[] = []
  const session = { ...input.session }

  // ✅ الإصلاح #2: حساب المدة تلقائياً
  if (!session.durationSeconds && session.endedAt) {
    session.durationSeconds = Math.floor((session.endedAt - session.startedAt) / 1000)
  }

  // ✅ التحقق من البيانات أولاً
  const validation = validateIncidentSession(session, input.log, input.people)
  if (!validation.valid) {
    return { ok: false, error: validation.errors.join('\n') }
  }
  if (validation.warnings.length > 0) {
    warnings.push(...validation.warnings)
  }

  const hash = await sha256Hex(canonicalize(session, input.log, input.people))

  // رفع الصورة المرجعية أولاً
  let referenceUrl = session.referenceShot
  if (referenceUrl?.startsWith('data:')) {
    try {
      const url = await uploadFile(dataUrlToBlob(referenceUrl), `incidents/${session.reportNo}-ref.jpg`)
      if (url) referenceUrl = url
    } catch (e: any) {
      warnings.push(`⚠️ فشل رفع الصورة المرجعية: ${e.message}`)
    }
  }

  // ✅ رفع صور السجل الزمني مع معالجة أفضل
  const uploadedLog = await uploadLogEntries_WithBetterErrorHandling(session.reportNo, input.log)

  uploadedLog.forEach(l => {
    if (l.uploadErrors?.length) {
      warnings.push(...l.uploadErrors.map(e => `⚠️ ${e}`))
    }
  })

  // إدراج الجلسة
  const row = {
    report_no: session.reportNo,
    officer_badge: session.officerBadge ?? null,
    officer_name: session.officerName ?? null,
    location: session.location,
    incident_type: session.incidentType,
    priority: session.priority,
    status: session.status,
    reference_shot: referenceUrl ?? null,
    ai_accuracy: session.aiAccuracy ?? null,
    started_at: new Date(session.startedAt).toISOString(),
    ended_at: session.endedAt ? new Date(session.endedAt).toISOString() : null,
    duration_seconds: session.durationSeconds ?? null,
    movement_count: session.movementCount,
    unregistered_count: session.unregisteredCount,
    unauthorized_count: session.unauthorizedCount,
    alert_count: session.alertCount,
    photo_count: session.photoCount,
    evidence_size_kb: session.evidenceSizeKb,
    integrity_hash: hash,
    notes: session.notes ?? null,
  }

  const { data, error } = await supabase.from('incident_sessions').insert(row).select('id').single()

  if (error) return { ok: false, error: error.message }
  const id = data?.id as string

  // إدراج السجل الزمني
  if (uploadedLog.length > 0) {
    const { error: logErr } = await supabase.from('incident_log').insert(
      uploadedLog.map(l => ({
        session_id: id,
        at: new Date(l.at).toISOString(),
        label: l.label,
        color: l.color,
        before_shot: l.beforeShot ?? null,
        after_shot: l.afterShot ?? null,
        confidence: l.confidence ?? null,
      }))
    )
    if (logErr) {
      warnings.push(`⚠️ تحذير: فشل حفظ بعض السجلات الزمنية: ${logErr.message}`)
    }
  }

  // إدراج الأشخاص
  if (input.people.length > 0) {
    const { error: peopleErr } = await supabase.from('incident_people').insert(
      input.people.map(p => ({
        session_id: id,
        emp_id: p.empId ?? null,
        name: p.name,
        authorized: p.authorized,
        first_seen: new Date(p.firstSeen).toISOString(),
        last_seen: new Date(p.lastSeen).toISOString(),
        movement_count: p.movementCount,
      }))
    )
    if (peopleErr) {
      warnings.push(`⚠️ تحذير: فشل حفظ بعض سجلات الأشخاص: ${peopleErr.message}`)
    }
  }

  return { ok: true, id, hash, warnings: warnings.length > 0 ? warnings : undefined }
}

// ─────────────────────────────────────────────────────────────────────────────────
// التحقق من التكامل (للقراءة والتدقيق)
// ─────────────────────────────────────────────────────────────────────────────────

export async function verifyIncidentIntegrity(id: string): Promise<{
  verified: boolean
  storedHash: string
  computedHash: string
  tampered: boolean
  error?: string
}> {
  if (!supabase) {
    return {
      verified: false,
      storedHash: '',
      computedHash: '',
      tampered: false,
      error: 'قاعدة البيانات غير متصلة',
    }
  }

  const { data: session, error: sessError } = await supabase
    .from('incident_sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (sessError || !session) {
    return {
      verified: false,
      storedHash: '',
      computedHash: '',
      tampered: false,
      error: `فشل استرجاع الجلسة: ${sessError?.message}`,
    }
  }

  const { data: logs } = await supabase
    .from('incident_log')
    .select('at, label, color, confidence')
    .eq('session_id', id)
    .order('at', { ascending: true })

  const { data: people } = await supabase
    .from('incident_people')
    .select('emp_id, name, authorized, movement_count')
    .eq('session_id', id)

  const sessionObj: IncidentSession = {
    reportNo: session.report_no,
    location: session.location,
    incidentType: session.incident_type,
    priority: session.priority,
    status: session.status,
    startedAt: new Date(session.started_at).getTime(),
    endedAt: session.ended_at ? new Date(session.ended_at).getTime() : undefined,
    movementCount: session.movement_count,
    unregisteredCount: session.unregistered_count,
    unauthorizedCount: session.unauthorized_count,
    alertCount: session.alert_count,
    photoCount: session.photo_count,
    evidenceSizeKb: session.evidence_size_kb,
  }

  const logEntries: LogEntry[] = (logs || []).map(l => ({
    at: new Date(l.at).getTime(),
    label: l.label,
    color: l.color,
    confidence: l.confidence,
  }))

  const personList: PersonSeen[] = (people || []).map(p => ({
    empId: p.emp_id,
    name: p.name,
    authorized: p.authorized,
    firstSeen: 0,
    lastSeen: 0,
    movementCount: p.movement_count,
  }))

  const computedHash = await sha256Hex(canonicalize(sessionObj, logEntries, personList))
  const storedHash = session.integrity_hash || ''

  return {
    verified: storedHash === computedHash,
    storedHash,
    computedHash,
    tampered: storedHash !== computedHash && storedHash !== '',
  }
}
