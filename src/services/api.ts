// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR API SERVICE LAYER                                                ║
// ║  Every function below is a "stub" that works offline right now.         ║
// ║  To go live, uncomment the matching Supabase / AI block and fill in     ║
// ║  your keys in the .env file.  No other file needs to change.            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// QUICK-START LIBRARIES TO INSTALL (run in your terminal):
//
//   Supabase (database + auth + storage):
//     npm install @supabase/supabase-js
//
//   Real PDF generation:
//     npm install jspdf html2canvas
//
//   AI vision (alternative to direct API calls — easier):
//     npm install @anthropic-ai/sdk          ← Claude AI
//     npm install openai                     ← OpenAI / GPT
//
//   Excel / CSV export:
//     npm install xlsx
//
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import { AI, BACKEND, OFFICER } from '../config'

// ─── Supabase client — connects automatically when .env has your keys ────────
export const supabase = BACKEND.enabled
  ? createClient(BACKEND.supabaseUrl, BACKEND.supabaseKey)
  : null

export const isLive = () => Boolean(supabase)

// ══════════════════════════════════════════════════════════════════════════════
// EMPLOYEES  (الموظفون المصرح لهم)
// ══════════════════════════════════════════════════════════════════════════════

export type Employee = {
  emp_id: string          // الرقم الوظيفي — this is what the QR code contains
  name: string
  role?: string
  department?: string
  photo_url?: string
  authorized?: boolean
  created_at?: string
}

/** All employees, newest first. */
export async function fetchEmployees(): Promise<Employee[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(BACKEND.tables.employees).select('*').order('created_at', { ascending: false })
  if (error) { console.error('[ATHAR] fetchEmployees:', error.message); return [] }
  return data ?? []
}

/** Look up one employee by their ID (used when a QR badge is scanned). */
export async function findEmployee(empId: string): Promise<Employee | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from(BACKEND.tables.employees).select('*').eq('emp_id', empId).maybeSingle()
  return data ?? null
}

/** Create/update an employee. `photo` is optional and gets uploaded to Storage. */
export async function saveEmployee(emp: Employee, photo?: Blob | null): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'قاعدة البيانات غير متصلة — تحقق من ملف .env' }
  let photo_url = emp.photo_url
  if (photo) {
    const up = await uploadFile(photo, `employees/${emp.emp_id}-${Date.now()}.jpg`)
    if (up) photo_url = up
  }
  const { error } = await supabase
    .from(BACKEND.tables.employees)
    .upsert({ ...emp, photo_url, authorized: emp.authorized ?? true }, { onConflict: 'emp_id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteEmployee(empId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from(BACKEND.tables.employees).delete().eq('emp_id', empId)
  return !error
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPERVISOR PROFILE  (ملف مشرف الأمن — من قاعدة البيانات)
// ══════════════════════════════════════════════════════════════════════════════

/** Load a supervisor's full profile by badge ID. Falls back to config defaults. */
export async function fetchOfficer(badgeId: string): Promise<typeof OFFICER> {
  if (!supabase) return OFFICER
  const { data } = await supabase
    .from(BACKEND.tables.supervisors).select('*').eq('badge_id', badgeId).maybeSingle()
  if (!data) return OFFICER
  return {
    name: data.name ?? OFFICER.name,
    id: data.badge_id ?? badgeId,
    role: data.role ?? OFFICER.role,
    clearance: data.clearance ?? OFFICER.clearance,
    unit: data.unit ?? OFFICER.unit,
    shift: data.shift ?? OFFICER.shift,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Verify a supervisor badge ID.
 * Currently validates format offline.
 * ─ TO CONNECT SUPABASE ─
 *   1. Create a table called "supervisors" with columns: badge_id, name, role, clearance
 *   2. Uncomment the supabase block below
 */
export async function verifySupervisor(
  badgeId: string,
): Promise<{ valid: boolean; name?: string; role?: string }> {

  if (supabase) {
    const { data } = await supabase
      .from(BACKEND.tables.supervisors)
      .select('name, role, clearance')
      .eq('badge_id', badgeId)
      .maybeSingle()
    if (!data) return { valid: false }
    return { valid: true, name: data.name, role: data.role }
  }

  // ── Offline fallback (only when .env is empty) ───────────────────────────
  const valid = /^(BADGE|[0-9])/i.test(badgeId) && badgeId.length >= 3
  return { valid, name: valid ? '[اسم المشرف]' : undefined }
}

// ══════════════════════════════════════════════════════════════════════════════
// CAMERA FRAME CAPTURE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Capture a JPEG snapshot from an HTML <video> element.
 * Returns a base64 data URL. Pass to analyzeFrame() for AI detection.
 *
 * HOW TO USE IN YOUR COMPONENT:
 *   const dataUrl = captureFrame(videoRef.current!)
 *   const detections = await analyzeFrame(dataUrl)
 */
export function captureFrame(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas')
  canvas.width  = video.videoWidth  || 640
  canvas.height = video.videoHeight || 480
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.85)   // base64 JPEG
}

// ══════════════════════════════════════════════════════════════════════════════
// AI DETECTION
// ══════════════════════════════════════════════════════════════════════════════

export type Detection = { label: string; confidence: number; color: string }

const SIMULATED_DETECTIONS: Detection[] = [
  { label: 'MOTION · 94%',     confidence: 0.94, color: '#F9A900' },
  { label: 'NO CARD · 88%',    confidence: 0.88, color: '#F9A900' },
  { label: 'FACE ID · 99%',    confidence: 0.99, color: '#237F52' },
  { label: 'ASSET MOVE · 91%', confidence: 0.91, color: '#A52019' },
  { label: 'UNREGISTERED · 97%', confidence: 0.97, color: '#A52019' },
]

/**
 * Analyse a camera frame and return detected security events.
 *
 * ─ TO CONNECT CLAUDE AI ─
 *   1. npm install @anthropic-ai/sdk
 *   2. Add VITE_AI_API_KEY to your .env file
 *   3. Set AI.enabled = true in config.ts
 *   4. Uncomment the Anthropic block below
 *
 * ─ TO CONNECT OPENAI ─
 *   Same steps but use the OpenAI block instead.
 *
 * NOTE: For a camera-analysis app it is often easier to use a dedicated
 * computer-vision service (e.g. AWS Rekognition, Google Cloud Vision, or
 * Roboflow) rather than a general LLM.  Those services return bounding-box
 * coordinates which you can draw directly on the camera feed.
 */
export async function analyzeFrame(imageDataUrl: string): Promise<Detection[]> {

  if (!AI.enabled || !AI.apiKey) {
    // Offline simulation — randomly return 1-2 detections
    const shuffled = [...SIMULATED_DETECTIONS].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 1 + Math.floor(Math.random() * 2))
  }

  // ── Claude AI (Anthropic) ──────────────────────────────────────────────────
  // import Anthropic from '@anthropic-ai/sdk'
  // const client = new Anthropic({ apiKey: AI.apiKey, dangerouslyAllowBrowser: true })
  // const base64 = imageDataUrl.split(',')[1]
  // const msg = await client.messages.create({
  //   model: AI.model,
  //   max_tokens: 256,
  //   messages: [{
  //     role: 'user',
  //     content: [
  //       { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
  //       { type: 'text', text:
  //         'You are a university campus security AI. Analyse this camera frame. '
  //         + 'List any people, suspicious behaviour, or security concerns. '
  //         + 'Respond ONLY with a JSON array: [{"label":"SHORT_LABEL","confidence":0.0-1.0}]. '
  //         + 'Labels must be under 20 characters, uppercase.' },
  //     ],
  //   }],
  // })
  // try {
  //   const text = (msg.content[0] as { text: string }).text
  //   const raw: { label: string; confidence: number }[] = JSON.parse(text)
  //   return raw
  //     .filter(d => d.confidence >= AI.detectionThreshold)
  //     .map(d => ({ ...d, color: d.confidence > 0.9 ? '#A52019' : '#F9A900' }))
  // } catch { return [] }

  // ── OpenAI (GPT-4 Vision) ─────────────────────────────────────────────────
  // import OpenAI from 'openai'
  // const openai = new OpenAI({ apiKey: AI.apiKey, dangerouslyAllowBrowser: true })
  // const res = await openai.chat.completions.create({
  //   model: 'gpt-4o',
  //   messages: [{
  //     role: 'user',
  //     content: [
  //       { type: 'image_url', image_url: { url: imageDataUrl } },
  //       { type: 'text', text: 'Security camera analysis. Return JSON array [{"label":"LABEL","confidence":0.0}]' },
  //     ],
  //   }],
  //   max_tokens: 256,
  // })
  // try {
  //   return JSON.parse(res.choices[0].message.content ?? '[]')
  // } catch { return [] }

  return []
}

// ══════════════════════════════════════════════════════════════════════════════
// FILE EXPORT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Download a text string as a PDF file.
 * Currently creates a plain-text .pdf blob which most PDF readers open.
 *
 * ─ FOR PROPER STYLED PDF ─
 *   npm install jspdf html2canvas
 *   Then replace the body below:
 *
 *   import jsPDF from 'jspdf'
 *   import html2canvas from 'html2canvas'
 *   const el = document.getElementById('report-preview')!
 *   const canvas = await html2canvas(el, { scale: 2 })
 *   const pdf = new jsPDF('p', 'mm', 'a4')
 *   pdf.addImage(canvas.toDataURL(), 'PNG', 0, 0, 210, 297)
 *   pdf.save(`ATHAR_${filename}.pdf`)
 */
export function downloadPDF(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/pdf' })
  _triggerDownload(blob, `${filename}.pdf`)
}

/**
 * Download incident data as CSV.
 * Works out of the box — no extra library needed.
 *
 * ─ FOR EXCEL (.xlsx) ─
 *   npm install xlsx
 *   import * as XLSX from 'xlsx'
 *   const ws = XLSX.utils.json_to_sheet(rows)
 *   const wb = XLSX.utils.book_new()
 *   XLSX.utils.book_append_sheet(wb, ws, 'Incidents')
 *   XLSX.writeFile(wb, `${filename}.xlsx`)
 */
export function downloadCSV(rows: Record<string, string>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0]).join(',')
  const body    = rows.map(r => Object.values(r).map(v => `"${v}"`).join(',')).join('\n')
  const blob    = new Blob([`${headers}\n${body}`], { type: 'text/csv;charset=utf-8;' })
  _triggerDownload(blob, `${filename}.csv`)
}

/** Download any data object as a JSON file. */
export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  _triggerDownload(blob, `${filename}.json`)
}

/**
 * Upload a file blob to Supabase Storage and return its public URL.
 * Call this after capturing a camera photo or generating a report.
 */
export async function uploadFile(blob: Blob, path: string): Promise<string | null> {

  if (supabase) {
    const { data, error } = await supabase.storage
      .from(BACKEND.storageBucket).upload(path, blob, { upsert: true })
    if (error) { console.error('[ATHAR] uploadFile:', error.message); return null }
    const { data: urlData } = supabase.storage
      .from(BACKEND.storageBucket).getPublicUrl(data.path)
    return urlData.publicUrl
  }

  console.log('[ATHAR] uploadFile (offline):', path)
  return null
}

// ─── Internal helper ──────────────────────────────────────────────────────────
function _triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}


// ══════════════════════════════════════════════════════════════════════════════
// CAMERA  (تشغيل الكاميرا مع تشخيص واضح للأخطاء)
// ══════════════════════════════════════════════════════════════════════════════

export type CamResult = { stream: MediaStream | null; error?: string }

/**
 * Opens the camera and — crucially — returns a HUMAN-READABLE Arabic reason
 * when it fails, instead of silently showing "denied" for every possible cause.
 */
export async function openCamera(
  facingMode: 'user' | 'environment' = 'environment',
  deviceId?: string,
): Promise<CamResult> {
  // Browsers only expose cameras on https:// or localhost. Opening the built
  // index.html straight from disk (file://) or via a LAN IP will always fail.
  if (!window.isSecureContext) {
    return { stream: null, error: 'المتصفح يمنع الكاميرا لأن الصفحة غير آمنة. افتح الموقع عبر http://localhost:5173 أو https:// — وليس بالضغط على ملف index.html مباشرة.' }
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: null, error: 'هذا المتصفح لا يدعم الكاميرا. جرّب Chrome أو Safari.' }
  }
  try {
    // An explicit deviceId (a USB webcam the operator picked) wins over
    // facingMode, which only makes sense on phones and tablets.
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    return { stream }
  } catch (e: any) {
    const map: Record<string, string> = {
      NotAllowedError:   'تم رفض إذن الكاميرا. اضغط على أيقونة القفل بجانب العنوان ← Camera ← Allow، ثم حدّث الصفحة.',
      NotFoundError:     'لا توجد كاميرا متصلة بهذا الجهاز.',
      NotReadableError:  'الكاميرا مستخدمة من تطبيق آخر (Zoom / Teams). أغلقه ثم حدّث الصفحة.',
      OverconstrainedError: 'إعدادات الكاميرا المطلوبة غير مدعومة على هذا الجهاز.',
      SecurityError:     'المتصفح منع الكاميرا لأسباب أمنية. تأكد أن الصفحة على https أو localhost.',
    }
    return { stream: null, error: map[e?.name] ?? `تعذّر تشغيل الكاميرا (${e?.name ?? 'خطأ غير معروف'}).` }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT EXPORT — تصدير حقيقي إلى الجهاز
// ══════════════════════════════════════════════════════════════════════════════

/** Rasterises the on-screen report and saves a real multi-page A4 PDF. */
export async function exportReportPDF(elementId: string, filename: string) {
  const el = document.getElementById(elementId)
  if (!el) throw new Error(`عنصر التقرير غير موجود (${elementId})`)

  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'), import('html2canvas'),
  ])

  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgH = (canvas.height * pageW) / canvas.width
  const img = canvas.toDataURL('image/jpeg', 0.92)

  // Slice across A4 pages. The 2mm tolerance stops a nearly-empty trailing
  // page from being added when the content ends just past a page boundary.
  const TOLERANCE = 2
  pdf.addImage(img, 'JPEG', 0, 0, pageW, imgH)
  let printed = pageH
  let offset = 0
  while (imgH - printed > TOLERANCE) {
    offset -= pageH
    pdf.addPage()
    pdf.addImage(img, 'JPEG', 0, offset, pageW, imgH)
    printed += pageH
  }
  pdf.save(`ATHAR_${filename}.pdf`)
}

/** Opens the browser's print dialog with only the report on the page. */
export function printReportElement(elementId: string) {
  const el = document.getElementById(elementId)
  if (!el) throw new Error(`عنصر التقرير غير موجود (${elementId})`)
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) throw new Error('المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع.')
  w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>ATHAR Report</title>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      @page { size: A4; margin: 10mm; }
      body { margin:0; background:#fff; font-family:'IBM Plex Sans Arabic',sans-serif; }
      img { max-width:100%; }
    </style></head><body>${el.outerHTML}</body></html>`)
  w.document.close()
  w.focus()
  // Give fonts and images a moment before the dialog opens.
  setTimeout(() => { w.print() }, 700)
}

/** Flat key/value rows — the shape CSV and DOC both consume. */
export function reportRows(data: Record<string, any>): Record<string, string>[] {
  return Object.entries(data).map(([k, v]) => ({ 'الحقل': k, 'القيمة': String(v ?? '') }))
}

export function exportReportCSV(rows: Record<string, string>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  const body = rows.map(r => headers.map(h => esc(r[h] ?? '')).join(',')).join('\r\n')
  // BOM keeps Arabic readable when the file is opened in Excel.
  const blob = new Blob(['\uFEFF' + headers.map(esc).join(',') + '\r\n' + body], { type: 'text/csv;charset=utf-8;' })
  _triggerDownload(blob, `ATHAR_${filename}.csv`)
}

export function exportReportJSON(data: unknown, filename: string) {
  _triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), `ATHAR_${filename}.json`)
}

/** Word-compatible .doc built from the rendered report markup. */
export function exportReportDOC(elementId: string, filename: string) {
  const el = document.getElementById(elementId)
  if (!el) throw new Error(`عنصر التقرير غير موجود (${elementId})`)
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>ATHAR Report</title>
    <style>@page { size:A4; margin:2cm } body { font-family:'Arial',sans-serif; direction:rtl }</style>
    </head><body dir="rtl">${el.outerHTML}</body></html>`
  _triggerDownload(new Blob(['\uFEFF' + html], { type: 'application/msword;charset=utf-8' }), `ATHAR_${filename}.doc`)
}

// ══════════════════════════════════════════════════════════════════════════════
// ARCHIVE — أرشفة الجلسات المنتهية
// ══════════════════════════════════════════════════════════════════════════════

export type ArchivedRow = {
  id: string
  incident_id: string
  title: string          // العنوان يأتي من نوع الحادثة
  officer_badge: string
  priority: string
  size_bytes: number
  hash: string
  created_at: string
}

/** Saves a finished session into the `reports` table so it shows in the archive. */
export async function archiveReport(r: {
  incidentId: string; title: string; officerBadge: string
  priority: string; sizeBytes: number; hash: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'قاعدة البيانات غير متصلة' }
  const { error } = await supabase.from(BACKEND.tables.reports).insert({
    incident_id: r.incidentId,
    officer_badge: r.officerBadge,
    format: 'PDF',
    hash: r.hash,
    title: r.title,
    priority: r.priority,
    size_bytes: r.sizeBytes,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Archive list, newest first. Empty until real sessions are archived. */
export async function fetchArchive(): Promise<ArchivedRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(BACKEND.tables.reports).select('*').order('created_at', { ascending: false })
  if (error) { console.error('[ATHAR] fetchArchive:', error.message); return [] }
  return (data ?? []) as ArchivedRow[]
}

/** Converts a base64 data URL (from a camera snapshot) into an uploadable Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const bytes = atob(b64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** Removes one archived report. */
export async function deleteArchived(incidentId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from(BACKEND.tables.reports).delete().eq('incident_id', incidentId)
  if (error) { console.error('[ATHAR] deleteArchived:', error.message); return false }
  return true
}

// ══════════════════════════════════════════════════════════════════════════════
// ASSETS & TYPED SESSIONS — سجل الأصول والجلسات
// ══════════════════════════════════════════════════════════════════════════════

export type Asset = {
  id: string
  name: string
  location?: string
  category?: string
  created_at?: string
}

export type DetectedItem = { label: string; count: number }

export type SessionRow = {
  id?: string
  kind: string
  asset_id?: string | null
  asset_name?: string
  location?: string
  officer_badge?: string
  officer_name?: string
  from_party?: string
  to_party?: string
  expected_count?: number | null
  severity?: string
  description?: string
  notes?: string
  snapshot_url?: string
  snapshot_after?: string
  detected?: DetectedItem[]
  detected_total?: number
  hash?: string
  started_at?: string
  ended_at?: string
  created_at?: string
}

const SAMPLE_ASSETS: Asset[] = [
  { id: 'LAB-204',  name: 'معمل الحاسب ٢٠٤',       location: 'كلية علوم الحاسب — الطابق الثاني', category: 'معمل' },
  { id: 'LAB-CHEM', name: 'معمل الكيمياء العام',    location: 'كلية العلوم — الطابق الأول',       category: 'معمل' },
  { id: 'STO-01',   name: 'مستودع الأجهزة الرئيسي', location: 'مبنى الخدمات المساندة',            category: 'مستودع' },
  { id: 'HALL-A',   name: 'قاعة المحاضرات أ',       location: 'المبنى الأكاديمي — الدور الأرضي',  category: 'قاعة' },
]

export async function fetchAssets(): Promise<Asset[]> {
  if (!supabase) return SAMPLE_ASSETS
  const { data, error } = await supabase.from('assets').select('*').order('name')
  if (error) { console.error('[ATHAR] fetchAssets:', error.message); return SAMPLE_ASSETS }
  return (data ?? []) as Asset[]
}

export async function saveAsset(a: Asset): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('assets').upsert(a, { onConflict: 'id' })
  if (error) { console.error('[ATHAR] saveAsset:', error.message); return false }
  return true
}

/** Stores a finished session. Returns its id so the report can link to it. */
export async function saveSession(row: SessionRow): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!supabase) return { ok: false, error: 'قاعدة البيانات غير متصلة — تحقق من ملف .env' }
  const { data, error } = await supabase.from('sessions').insert(row).select('id').single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data?.id }
}

/** All sessions, newest first. Optionally filtered by asset or by kind. */
export async function fetchSessions(opts: { assetId?: string; kind?: string; limit?: number } = {}): Promise<SessionRow[]> {
  if (!supabase) return []
  let q = supabase.from('sessions').select('*').order('created_at', { ascending: false })
  if (opts.assetId) q = q.eq('asset_id', opts.assetId)
  if (opts.kind)    q = q.eq('kind', opts.kind)
  if (opts.limit)   q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) { console.error('[ATHAR] fetchSessions:', error.message); return [] }
  return (data ?? []) as SessionRow[]
}

export async function deleteSession(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  return !error
}

/**
 * Compares two sessions on the same asset and reports what changed.
 *
 * This is the core of the product: a single session only records a state —
 * the value appears when two states are placed side by side.
 */
export type Diff = {
  label: string
  before: number
  after: number
  delta: number
}

export function compareSessions(before: SessionRow, after: SessionRow): {
  diffs: Diff[]
  missing: Diff[]
  added: Diff[]
  totalBefore: number
  totalAfter: number
} {
  const map = (rows?: DetectedItem[]) => {
    const m = new Map<string, number>()
    for (const d of rows ?? []) m.set(d.label, (m.get(d.label) ?? 0) + d.count)
    return m
  }
  const b = map(before.detected), a = map(after.detected)
  const labels = Array.from(new Set([...b.keys(), ...a.keys()])).sort()

  const diffs: Diff[] = labels.map(label => {
    const bv = b.get(label) ?? 0, av = a.get(label) ?? 0
    return { label, before: bv, after: av, delta: av - bv }
  })

  return {
    diffs,
    missing: diffs.filter(d => d.delta < 0),
    added:   diffs.filter(d => d.delta > 0),
    totalBefore: [...b.values()].reduce((s, n) => s + n, 0),
    totalAfter:  [...a.values()].reduce((s, n) => s + n, 0),
  }
}
