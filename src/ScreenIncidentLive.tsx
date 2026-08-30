// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — بلاغ الأمن الجامعي الحي                                        ║
// ║                                                                          ║
// ║  ثلاث خطوات، ومبدأ واحد يربطها: صورة مرجعية أولاً — قبل أي تدخل — ثم      ║
// ║  الكاميرا تراقب وحدها وتُسجّل كل شيء بلحظته: مَن مسح بطاقته، مَن ظهر بلا   ║
// ║  بطاقة، وأي غرض تحرّك من مكانه. في النهاية تقرير واحد موقَّع ببصمة        ║
// ║  حقيقية، لا وصف مكتوب.                                                   ║
// ║                                                                          ║
// ║  الذكاء يرصد ويُسجّل — القرار والتوثيق يبقيان للمسؤول.                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useRef, useState } from 'react'
import { C } from './theme'
import {
  scanBadge, captureScene, detectChange, detectPeople, loadPersonModel, snapshot,
  Confirmer, DETECT, type Scene,
} from './vision'
import { openCamera, findEmployee, exportReportPDF, printReportElement, type Employee } from './services/api'
import { getSettings } from './settings'
import {
  genReportNo, sha256Hex, saveIncidentSession, fmtClock, fmtDuration,
  PRIORITY_LABEL, STATUS_LABEL, INCIDENT_TYPES,
  type Priority, type Status, type LogEntry, type LogColor, type PersonSeen, type IncidentSession,
} from './services/incidentLive'
import { Card, FieldLabel, Note, ErrorBox, selectStyle } from './ScreenCustody'

type Step = 1 | 2 | 3

export function ScreenIncidentLive({ officer, onArchive }: {
  officer: { name: string; id: string; unit?: string; role?: string }
  onArchive?: () => void
}) {
  const [step, setStep] = useState<Step>(1)
  const [reportNo] = useState(() => genReportNo())
  const [formOpenedAt] = useState(() => Date.now())

  // ── الخطوة ١ — بيانات البلاغ + الصورة المرجعية ───────────────────────
  const [location, setLocation] = useState('')
  const [incidentType, setIncidentType] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [status, setStatus] = useState<Status>('ACTIVE')
  const [notes, setNotes] = useState('')
  const [scene, setScene] = useState<Scene | null>(null)

  // ── الخطوة ٢ — المراقبة الحية ─────────────────────────────────────────
  const [monitorStart, setMonitorStart] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])
  const [people, setPeople] = useState<Record<string, PersonSeen>>({})
  const [detectedNow, setDetectedNow] = useState(0)
  const [frozen, setFrozen] = useState(false)
  const [toasts, setToasts] = useState<{ id: number; color: LogColor; text: string }[]>([])

  // ── الخطوة ٣ — الحفظ والتقرير ─────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedHash, setSavedHash] = useState<string | null>(null)
  const [endedAt, setEndedAt] = useState(0)

  const movementCount = log.filter(l => l.color === 'red').length
  const unauthorizedCount = Object.values(people).filter(p => !p.authorized).length
  const alertCount = log.filter(l => l.color !== 'blue').length
  const photoCount = (scene ? 1 : 0) + log.filter(l => l.beforeShot || l.afterShot).length * 2

  const canStart = !!(location.trim() && incidentType && scene)

  const pushLog = (color: LogColor, label: string, extra?: Partial<LogEntry>) => {
    setLog(l => [...l, { at: Date.now(), label, color, ...extra }])
  }
  const pushToast = (color: LogColor, text: string) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t.slice(-3), { id, color, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6000)
  }

  const beginMonitoring = () => {
    if (!canStart) return
    const now = Date.now()
    setMonitorStart(now)
    pushLog('blue', 'بدء المراقبة الحية')
    setStep(2)
  }

  const endSession = async () => {
    const now = Date.now()
    setEndedAt(now)
    pushLog('red', 'تسجيل بيانات البلاغ — إنهاء الجلسة')
    setSaving(true); setSaveError(null)

    const durationSeconds = Math.round((now - monitorStart) / 1000)
    const session: IncidentSession = {
      reportNo, officerBadge: officer.id, officerName: officer.name,
      location: location.trim(), incidentType, priority, status,
      referenceShot: scene?.referenceShot,
      aiAccuracy: `${Math.round(DETECT.minConfidence * 100)}%`,
      startedAt: monitorStart, endedAt: now, durationSeconds,
      movementCount, unregisteredCount: unauthorizedCount, unauthorizedCount,
      alertCount, photoCount, evidenceSizeKb: Math.round(photoCount * 180),
      notes: notes.trim() || undefined,
    }

    const finalLog = [...log, { at: now, label: 'إنهاء الجلسة', color: 'green' as LogColor }]
    setLog(finalLog)

    const res = await saveIncidentSession({ session, log: finalLog, people: Object.values(people) })
    setSaving(false)
    if (!res.ok) { setSaveError(res.error ?? 'تعذّر حفظ الجلسة'); setStep(3); return }
    if (res.error) setSaveError(res.error)
    setSavedHash(res.hash ?? null)
    setStep(3)
  }

  const addOrUpdatePerson = (key: string, name: string, authorized: boolean, at: number) => {
    setPeople(p => {
      const existing = p[key]
      return {
        ...p,
        [key]: existing
          ? { ...existing, lastSeen: at, movementCount: existing.movementCount + 1 }
          : { empId: authorized ? key : undefined, name, authorized, firstSeen: at, lastSeen: at, movementCount: 0 },
      }
    })
  }

  const reset = () => {
    setStep(1); setLocation(''); setIncidentType(''); setPriority('MEDIUM'); setStatus('ACTIVE')
    setNotes(''); setScene(null); setLog([]); setPeople({}); setDetectedNow(0); setFrozen(false)
    setToasts([]); setSaving(false); setSaveError(null); setSavedHash(null); setEndedAt(0)
  }

  return (
    <div style={{
      minHeight: '100%', background: C.bg, direction: 'rtl',
      padding: 'clamp(14px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {step === 1 && (
        <ReportStep
          reportNo={reportNo} formOpenedAt={formOpenedAt} officer={officer}
          location={location} onLocation={setLocation}
          incidentType={incidentType} onIncidentType={setIncidentType}
          priority={priority} onPriority={setPriority}
          status={status} onStatus={setStatus}
          notes={notes} onNotes={setNotes}
          scene={scene} onScene={setScene}
          canStart={canStart} onStart={beginMonitoring}
        />
      )}

      {step === 2 && (
        <LiveMonitorStep
          reportNo={reportNo} officer={officer} location={location} incidentType={incidentType}
          priority={priority} scene={scene} monitorStart={monitorStart}
          elapsed={elapsed} onElapsed={setElapsed}
          log={log} pushLog={pushLog} pushToast={pushToast} toasts={toasts}
          people={people} addOrUpdatePerson={addOrUpdatePerson}
          detectedNow={detectedNow} onDetectedNow={setDetectedNow}
          frozen={frozen} onFrozen={setFrozen}
          onEnd={endSession} saving={saving}
        />
      )}

      {step === 3 && (
        <FinalReportStep
          reportNo={reportNo} officer={officer} location={location} incidentType={incidentType}
          priority={priority} status={status} scene={scene}
          monitorStart={monitorStart} endedAt={endedAt}
          log={log} people={Object.values(people)}
          movementCount={movementCount} unauthorizedCount={unauthorizedCount}
          alertCount={alertCount} photoCount={photoCount} notes={notes}
          savedHash={savedHash} saveError={saveError}
          onNew={reset} onArchive={onArchive}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// الخطوة ١ — بلاغ أمن جامعي
// ══════════════════════════════════════════════════════════════════════════════

function ReportStep(p: {
  reportNo: string; formOpenedAt: number
  officer: { name: string; id: string }
  location: string; onLocation: (v: string) => void
  incidentType: string; onIncidentType: (v: string) => void
  priority: Priority; onPriority: (v: Priority) => void
  status: Status; onStatus: (v: Status) => void
  notes: string; onNotes: (v: string) => void
  scene: Scene | null; onScene: (s: Scene | null) => void
  canStart: boolean; onStart: () => void
}) {
  const priorityColor = p.priority === 'HIGH' ? C.red : p.priority === 'MEDIUM' ? C.yellow : C.blue

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: C.blue }}>
            بلاغ أمن جامعي
          </div>
          <div className="mono" style={{ fontSize: 'clamp(17px, 2.6vw, 22px)', fontWeight: 700, color: C.white }}>
            {p.reportNo}
          </div>
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Chip color={priorityColor}>{p.priority} PRIORITY</Chip>
          <Chip color={C.green}>{p.status}</Chip>
        </div>
      </div>

      <div style={{
        padding: '11px 15px', borderRadius: 7, fontSize: 12, lineHeight: 1.9,
        background: 'rgba(0,83,135,0.12)', border: `1px solid ${C.blue}55`, color: C.white,
      }}>
        سجّلي بيانات الحادثة — الحقول المعلَّمة بـ * إلزامية، ولا يمكن الانتقال للمراقبة الحية
        قبل تعبئتها والتقاط الصورة المرجعية.
      </div>

      <Card>
        <div style={{
          display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        }}>
          <ReadonlyField label="رقم البلاغ" value={p.reportNo} mono />
          <ReadonlyField label="التاريخ والوقت" value={new Date(p.formOpenedAt).toLocaleDateString('en-GB') + '  —  ' + fmtClock(p.formOpenedAt)} mono />
          <ReadonlyField label="المشرف المكلَّف" value={`${p.officer.name} — ${p.officer.id}`} />

          <div>
            <FieldLabel>الموقع *</FieldLabel>
            <input value={p.location} onChange={e => p.onLocation(e.target.value)}
              placeholder="مثال: مبنى المعامل — الطابق الثاني"
              style={{ ...selectStyle, cursor: 'text' }} />
          </div>

          <div>
            <FieldLabel>نوع الحادثة *</FieldLabel>
            <select value={p.incidentType} onChange={e => p.onIncidentType(e.target.value)} style={selectStyle}>
              <option value="" style={{ background: '#1a1a1a' }}>— اختاري —</option>
              {INCIDENT_TYPES.map(t => (
                <option key={t} value={t} style={{ background: '#1a1a1a' }}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>الأولوية *</FieldLabel>
            <select value={p.priority} onChange={e => p.onPriority(e.target.value as Priority)} style={selectStyle}>
              {(['HIGH', 'MEDIUM', 'LOW'] as Priority[]).map(k => (
                <option key={k} value={k} style={{ background: '#1a1a1a' }}>{PRIORITY_LABEL[k]}</option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>الحالة</FieldLabel>
            <select value={p.status} onChange={e => p.onStatus(e.target.value as Status)} style={selectStyle}>
              {(['ACTIVE', 'RESOLVED', 'ESCALATED'] as Status[]).map(k => (
                <option key={k} value={k} style={{ background: '#1a1a1a' }}>{STATUS_LABEL[k]}</option>
              ))}
            </select>
          </div>

          <ReadonlyField label="دقة الكشف الاصطناعي" value="يُملأ تلقائياً عند بدء المراقبة" faint />
        </div>

        <div style={{ marginTop: 12 }}>
          <FieldLabel>ملاحظات إضافية (اختياري)</FieldLabel>
          <textarea value={p.notes} onChange={e => p.onNotes(e.target.value)} rows={2}
            placeholder="أي تفصيل تريدين تثبيته في البلاغ"
            style={{ ...selectStyle, cursor: 'text', resize: 'vertical' }} />
        </div>
      </Card>

      <ReferenceCapture scene={p.scene} onScene={p.onScene} />

      <button onClick={p.onStart} disabled={!p.canStart} style={{
        padding: '13px 20px', borderRadius: 7, cursor: p.canStart ? 'pointer' : 'not-allowed',
        background: p.canStart ? C.green : 'rgba(255,255,255,0.08)', border: 'none',
        color: '#fff', fontSize: 14.5, fontWeight: 700,
        fontFamily: "'IBM Plex Sans Arabic', sans-serif", opacity: p.canStart ? 1 : 0.55,
      }}>
        حفظ والانتقال للمراقبة الحية ←
      </button>
      {!p.canStart && (
        <div style={{ fontSize: 11.5, color: C.whiteDD, lineHeight: 1.8 }}>
          الموقع ونوع الحادثة والصورة المرجعية كلها مطلوبة قبل بدء المراقبة.
        </div>
      )}

      <div style={{ fontSize: 10.5, color: C.whiteDD, textAlign: 'center' }}>
        جميع بيانات البلاغ الأمن الجامعي محفوظة محلياً حتى الحفظ — وضع الاتصال يحدّد إن كانت تُرفع.
      </div>
    </>
  )
}

/** الصورة المرجعية — تُلتقط قبل أي تدخل، وتصير أساس مقارنة كل تحريك لاحق. */
function ReferenceCapture({ scene, onScene }: { scene: Scene | null; onScene: (s: Scene | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (scene) return
    let stream: MediaStream | null = null
    let cancelled = false
    const st = getSettings()
    openCamera(st.facingMode, st.cameraId || undefined).then(({ stream: s, error }) => {
      if (cancelled) { s?.getTracks().forEach(t => t.stop()); return }
      if (!s) { setCamError(error ?? 'تعذّر تشغيل الكاميرا'); return }
      stream = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.play().catch(() => {})
        setReady(true); setCamError(null)
      }
    })
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [retry, scene])

  const capture = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const s = captureScene(v)
    if (s) onScene(s)
  }

  return (
    <Card>
      <FieldLabel>الأدلة والمرفقات — الصورة المرجعية *</FieldLabel>
      <Note>صوّري المكان قبل تعديل أو تحريك أي شيء — هذه الصورة أساس كل كشف تحريك لاحق.</Note>

      <div style={{
        marginTop: 10, position: 'relative', background: '#080808', borderRadius: 8,
        border: `2px solid ${scene ? C.green : C.blue}55`, overflow: 'hidden',
        aspectRatio: '4 / 3', maxHeight: 300,
      }}>
        {scene
          ? <img src={scene.referenceShot} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <video ref={videoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: ready ? 0.95 : 0 }} />}

        {!scene && !ready && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 11.5, color: camError ? C.yellow : C.green }}>
              {camError ? '● الكاميرا غير متاحة' : '● جارٍ تشغيل الكاميرا…'}
            </div>
            {camError && (
              <>
                <div style={{ fontSize: 12, color: C.white, lineHeight: 1.85, maxWidth: 340 }}>{camError}</div>
                <button onClick={() => { setCamError(null); setRetry(r => r + 1) }} style={{
                  padding: '7px 16px', fontSize: 11.5, cursor: 'pointer', borderRadius: 5,
                  background: 'transparent', color: C.green, border: `1px solid ${C.green}`, fontWeight: 600,
                }}>إعادة المحاولة ↻</button>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!scene ? (
          <button onClick={capture} disabled={!ready} style={{
            padding: '10px 18px', borderRadius: 6, cursor: ready ? 'pointer' : 'not-allowed',
            background: ready ? C.green : 'rgba(255,255,255,0.08)', border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 700,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif", opacity: ready ? 1 : 0.6,
          }}>📷 التقاط بالكاميرا</button>
        ) : (
          <button onClick={() => onScene(null)} style={{
            padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
            background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }}>↻ إعادة الالتقاط</button>
        )}
      </div>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// الخطوة ٢ — بلاغ أمن جامعي نشط
// ══════════════════════════════════════════════════════════════════════════════

function LiveMonitorStep(p: {
  reportNo: string; officer: { name: string; id: string }
  location: string; incidentType: string; priority: Priority
  scene: Scene | null; monitorStart: number
  elapsed: number; onElapsed: (n: number) => void
  log: LogEntry[]
  pushLog: (color: LogColor, label: string, extra?: Partial<LogEntry>) => void
  pushToast: (color: LogColor, text: string) => void
  toasts: { id: number; color: LogColor; text: string }[]
  people: Record<string, PersonSeen>
  addOrUpdatePerson: (key: string, name: string, authorized: boolean, at: number) => void
  detectedNow: number; onDetectedNow: (n: number) => void
  frozen: boolean; onFrozen: (b: boolean) => void
  onEnd: () => void; saving: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [modelReady, setModelReady] = useState(false)

  const badgeConfirmer = useRef(new Confirmer(DETECT.confirmFrames.badge))
  const dispConfirmer = useRef(new Confirmer(DETECT.confirmFrames.displacement, DETECT.captureCooldownMs))
  const prevLuma = useRef<Uint8ClampedArray | null>(null)
  const lastUnknownVisitorAt = useRef(0)
  const busyRef = useRef(false)

  // عدّاد مدة الجلسة — يتحدّث كل ثانية حتى مع تجميد الإطار.
  useEffect(() => {
    const t = setInterval(() => p.onElapsed(Math.round((Date.now() - p.monitorStart) / 1000)), 1000)
    return () => clearInterval(t)
  }, [p.monitorStart])

  useEffect(() => { loadPersonModel().then(setModelReady) }, [])

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    const st = getSettings()
    openCamera(st.facingMode, st.cameraId || undefined).then(({ stream: s, error }) => {
      if (cancelled) { s?.getTracks().forEach(t => t.stop()); return }
      if (!s) { setCamError(error ?? 'تعذّر تشغيل الكاميرا'); return }
      stream = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.play().catch(() => {})
        setReady(true); setCamError(null)
      }
    })
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  // حلقة الرصد — كل ٩٠٠ مللي ثانية، ما لم تكن الإطار مجمَّداً.
  useEffect(() => {
    if (!ready || p.frozen) return
    const timer = setInterval(async () => {
      if (busyRef.current) return
      const v = videoRef.current
      if (!v || !v.videoWidth) return
      busyRef.current = true
      try {
        // ── البطاقات ──
        const hit = scanBadge(v)
        const badgeConfirmed = badgeConfirmer.current.feed(!!hit, hit ? 0.95 : 0, hit?.empId ?? '')
        if (badgeConfirmed && hit) {
          const now = Date.now()
          const emp = await findEmployee(hit.empId)
          if (emp) {
            p.addOrUpdatePerson(hit.empId, emp.name, true, now)
            p.pushLog('green', `تم التحقق: ${emp.name} — ${p.location || 'الموقع'} [✓] ${hit.empId}`)
            p.pushToast('green', `✓ تم التحقق: ${emp.name} — ${hit.empId}`)
          } else {
            p.addOrUpdatePerson(hit.empId, 'غير مسجَّل بالنظام', false, now)
            p.pushLog('yellow', `رصد شخص غير مصرح له ببطاقة جامعية — ${hit.empId}`)
            p.pushToast('yellow', `⚠ رصد شخص غير مصرح له ببطاقة جامعية`)
          }
          lastUnknownVisitorAt.current = now
        }

        // ── الأشخاص (نموذج الذكاء الاصطناعي) ──
        if (modelReady) {
          const hits = await detectPeople(v)
          const n = hits.filter(h => h.kind === 'person').length
          p.onDetectedNow(n)

          // زائر بلا بطاقة: شخص مرصود بالكاميرا بلا أي مسح بطاقة لفترة —
          // تنبيه احترازي فقط، لا هوية دائمة له لأنه بلا بطاقة أصلاً.
          const now = Date.now()
          if (n > 0 && now - lastUnknownVisitorAt.current > 10000) {
            p.pushLog('yellow', 'زائر بلا تحقق — مجهول — بلا بطاقة')
            p.pushToast('yellow', '⚠ زائر بلا تحقق — لم تُمسح بطاقته')
            p.addOrUpdatePerson(`unknown-${Math.floor(now / 15000)}`, 'مجهول — بلا بطاقة', false, now)
            lastUnknownVisitorAt.current = now
          }
        }

        // ── تحريك الممتلكات ──
        if (p.scene) {
          const res = detectChange(v, p.scene, prevLuma.current)
          if (res) {
            prevLuma.current = res.current
            const confirmed = dispConfirmer.current.feed(
              res.result.changeConfidence > 0, res.result.changeConfidence, '')
            if (confirmed) {
              const after = snapshot(v, 640, 0.75)
              const pct = Math.round(res.result.changeConfidence * 100)
              p.pushLog('red', `تحريك ممتلكات — ثقة ${pct}%`, {
                beforeShot: p.scene.referenceShot, afterShot: after, confidence: res.result.changeConfidence,
              })
              p.pushToast('red', `🚨 تحريك عناصر ممتلكات من الموقع — ثقة ${pct}%`)
            }
          }
        }
      } finally {
        busyRef.current = false
      }
    }, 900)
    return () => clearInterval(timer)
  }, [ready, p.frozen, modelReady, p.scene, p.location])

  const badge = (
    <span style={{
      padding: '5px 14px', borderRadius: 4, fontSize: 10.5, fontWeight: 700,
      letterSpacing: '0.08em', background: C.redDim, border: `1px solid ${C.red}`, color: C.red,
    }} className="blink">● LIVE</span>
  )

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: C.blue }}>
            بلاغ أمن جامعي نشط
          </div>
          <div className="mono" style={{ fontSize: 'clamp(16px, 2.4vw, 20px)', fontWeight: 700, color: C.white }}>
            {p.reportNo}
          </div>
        </div>
        <div style={{ marginRight: 'auto' }}>{badge}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* لوحة المعلومات */}
        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
        }}>
          <MiniStat label="المسؤول" value={`${p.officer.name}`} />
          <MiniStat label="الرقم الوظيفي" value={p.officer.id} mono />
          <MiniStat label="النوع" value={p.incidentType} />
          <MiniStat label="مدة البلاغ" value={fmtDuration(p.elapsed)} mono />
          <MiniStat label="الأشخاص المكتشفون" value={`${p.detectedNow} Detected`} color={C.green} />
          <MiniStat label="التسجيل" value={p.frozen ? 'مجمَّد' : 'ACTIVE'} color={p.frozen ? C.yellow : C.green} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => p.onFrozen(!p.frozen)} style={{
            flex: 1, padding: '11px 18px', borderRadius: 7, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
            fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }}>{p.frozen ? '▶ استئناف' : '‖ تجميد الإطار'}</button>
          <button onClick={p.onEnd} disabled={p.saving} style={{
            flex: 1, padding: '11px 18px', borderRadius: 7, cursor: p.saving ? 'not-allowed' : 'pointer',
            background: C.red, border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 700, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            opacity: p.saving ? 0.6 : 1,
          }}>{p.saving ? '… جارٍ الحفظ' : '■ إنهاء الجلسة'}</button>
        </div>

        {/* الكاميرا الحية */}
        <div style={{
          position: 'relative', background: '#080808', borderRadius: 9,
          border: `2px solid ${C.red}55`, overflow: 'hidden', aspectRatio: '4 / 3', maxHeight: 380,
        }}>
          <video ref={videoRef} autoPlay muted playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: ready ? 0.95 : 0 }} />

          {!ready && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11.5, color: camError ? C.yellow : C.green }}>
                {camError ? '● CAMERA UNAVAILABLE' : '● جارٍ تشغيل الكاميرا…'}
              </div>
              {camError && (
                <div style={{ fontSize: 12, color: C.white, lineHeight: 1.85, maxWidth: 340 }}>
                  تم رفض إذن الكاميرا. اضغط على أيقونة القفل بجانب العنوان ← Camera ← Allow ← ثم
                  أعد تحميل الصفحة.
                </div>
              )}
            </div>
          )}

          {/* رقاقات الحالة */}
          <div style={{ position: 'absolute', bottom: 10, insetInlineStart: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <MiniChip>{p.frozen ? 'FROZEN' : 'SURVEYING…'}</MiniChip>
            <MiniChip color={modelReady ? C.green : C.whiteDD}>{modelReady ? 'PERSON AI ON' : 'MOTION ONLY'}</MiniChip>
          </div>
          <div style={{
            position: 'absolute', bottom: 10, insetInlineEnd: 10, fontSize: 10.5,
            fontFamily: "'JetBrains Mono', monospace", color: C.whiteD,
          }}>{fmtClock(Date.now())}</div>

          {/* التنبيهات العائمة */}
          <div style={{
            position: 'absolute', top: 10, insetInlineEnd: 10, insetInlineStart: 10,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {p.toasts.map(t => (
              <div key={t.id} style={{
                padding: '9px 12px', borderRadius: 6, fontSize: 11.5, lineHeight: 1.6,
                background: 'rgba(0,0,0,0.82)',
                border: `1px solid ${t.color === 'red' ? C.red : t.color === 'yellow' ? C.yellow : C.green}88`,
                color: t.color === 'red' ? C.red : t.color === 'yellow' ? C.yellow : C.green,
              }}>{t.text}</div>
            ))}
          </div>
        </div>

        {/* سجل النشاط */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 4 }}>
            سجل النشاط
          </div>
          <div style={{ fontSize: 11, color: C.whiteDD, marginBottom: 10 }}>{p.log.length} events</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 240, overflowY: 'auto' }}>
            {[...p.log].reverse().map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: l.color === 'red' ? C.red : l.color === 'green' ? C.green : l.color === 'yellow' ? C.yellow : C.blue,
                }} />
                <span className="mono" style={{ color: C.whiteDD, fontSize: 11 }}>{fmtClock(l.at)}</span>
                <span style={{ color: C.white }}>{l.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// الخطوة ٣ — انتهت الدورية
// ══════════════════════════════════════════════════════════════════════════════

function FinalReportStep(p: {
  reportNo: string; officer: { name: string; id: string; unit?: string; role?: string }
  location: string; incidentType: string; priority: Priority; status: Status
  scene: Scene | null; monitorStart: number; endedAt: number
  log: LogEntry[]; people: PersonSeen[]
  movementCount: number; unauthorizedCount: number; alertCount: number; photoCount: number
  notes: string
  savedHash: string | null; saveError: string | null
  onNew: () => void; onArchive?: () => void
}) {
  const durationSeconds = Math.round((p.endedAt - p.monitorStart) / 1000)
  const [busy, setBusy] = useState<string | null>(null)

  const runPDF = async () => {
    setBusy('pdf')
    try { await exportReportPDF('athar-incident-receipt', `${p.reportNo}`) }
    finally { setBusy(null) }
  }
  const runPrint = () => printReportElement('athar-incident-receipt')
  const runJSON = () => {
    const data = {
      reportNo: p.reportNo, officer: p.officer, location: p.location, incidentType: p.incidentType,
      priority: p.priority, status: p.status, startedAt: p.monitorStart, endedAt: p.endedAt,
      durationSeconds, log: p.log, people: p.people, hash: p.savedHash,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `${p.reportNo}.json` })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <div style={{
        padding: '16px 18px', borderRadius: 9,
        background: p.saveError && !p.savedHash ? C.redDim : C.greenDim,
        border: `1px solid ${p.saveError && !p.savedHash ? C.red : C.green}66`,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: p.saveError && !p.savedHash ? C.red : C.green }}>
          {p.savedHash ? '✓ انتهت دورية الأمن الجامعي' : '⚠ انتهت الدورية — تعذّر الحفظ الكامل'}
        </div>
        <div style={{ fontSize: 12.5, color: C.whiteD, marginTop: 6, lineHeight: 1.9 }}>
          {p.reportNo} — جاهز للتصدير. المدة {fmtDuration(durationSeconds)}.
        </div>
        {p.savedHash && (
          <div className="mono" style={{ fontSize: 10.5, color: C.whiteDD, marginTop: 7, wordBreak: 'break-all' }}>
            SHA-256: {p.savedHash}
          </div>
        )}
      </div>

      {p.saveError && <ErrorBox text={p.saveError} />}

      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
      }}>
        <MiniStat label="مدة الدورية" value={fmtDuration(durationSeconds)} mono />
        <MiniStat label="عدد الأحداث" value={String(p.log.length)} mono />
        <MiniStat label="الأشخاص المسجَّلون" value={String(p.people.length)} mono />
        <MiniStat label="تحريكات الممتلكات" value={String(p.movementCount)} color={p.movementCount ? C.red : C.green} mono />
        <MiniStat label="غير مصرَّح لهم" value={String(p.unauthorizedCount)} color={p.unauthorizedCount ? C.yellow : C.green} mono />
        <MiniStat label="الصور الملتقطة" value={String(p.photoCount)} mono />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ExportBtn onClick={runPDF} busy={busy === 'pdf'}>⬇ تنزيل PDF</ExportBtn>
        <ExportBtn onClick={runPrint}>🖨 طباعة</ExportBtn>
        <ExportBtn onClick={runJSON}>{'{ } JSON'}</ExportBtn>
      </div>

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        {p.onArchive && (
          <button onClick={p.onArchive} style={{
            flex: '1 1 160px', padding: '12px 18px', borderRadius: 7, cursor: 'pointer',
            background: C.blue, border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }}>أرشفة الجلسة ←</button>
        )}
        <button onClick={p.onNew} style={{
          flex: '1 1 160px', padding: '12px 18px', borderRadius: 7, cursor: 'pointer',
          background: C.green, border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700,
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>+ جلسة جديدة</button>
      </div>

      <IncidentReceipt
        reportNo={p.reportNo} officer={p.officer} location={p.location} incidentType={p.incidentType}
        priority={p.priority} status={p.status} scene={p.scene}
        monitorStart={p.monitorStart} endedAt={p.endedAt} durationSeconds={durationSeconds}
        log={p.log} people={p.people} movementCount={p.movementCount}
        unauthorizedCount={p.unauthorizedCount} alertCount={p.alertCount} photoCount={p.photoCount}
        notes={p.notes} hash={p.savedHash}
      />
    </>
  )
}

/** التقرير المطبوع — خلفية بيضاء، نفس بنية تقرير الحوادث المرجعي بالضبط. */
function IncidentReceipt(p: {
  reportNo: string; officer: { name: string; id: string; unit?: string; role?: string }
  location: string; incidentType: string; priority: Priority; status: Status
  scene: Scene | null; monitorStart: number; endedAt: number; durationSeconds: number
  log: LogEntry[]; people: PersonSeen[]
  movementCount: number; unauthorizedCount: number; alertCount: number; photoCount: number
  notes: string; hash: string | null
}) {
  const row: React.CSSProperties = { padding: '7px 9px', borderBottom: '1px solid #e2e2e2', fontSize: 12 }
  const head: React.CSSProperties = { ...row, background: '#f3f3f0', fontWeight: 700, color: '#111' }
  const colorHex: Record<LogColor, string> = { red: '#961b15', green: '#1c6b45', blue: '#0b5f8a', yellow: '#8a6100' }
  const withPair = p.log.filter(l => l.beforeShot && l.afterShot)

  return (
    <div id="athar-incident-receipt" style={{
      background: '#fff', color: '#111', padding: 28, borderRadius: 8,
      direction: 'rtl', fontFamily: "'IBM Plex Sans Arabic', sans-serif", lineHeight: 1.8,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        borderBottom: '2px solid #237F52', paddingBottom: 12, marginBottom: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#237F52' }}>أثَر — ATHAR</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>تقرير جلسة أمنية — {p.incidentType || '—'}</div>
        </div>
        <div style={{ marginRight: 'auto', textAlign: 'left', fontSize: 11, color: '#555' }}>
          <div className="mono">{p.reportNo}</div>
          <div>{new Date(p.endedAt || Date.now()).toLocaleString('en-GB', { hour12: false })}</div>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>بيانات الحادثة</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          <tr><td style={head}>رقم البلاغ</td><td style={row} className="mono">{p.reportNo}</td>
              <td style={head}>المشرف المكلَّف</td><td style={row}>{p.officer.name}</td></tr>
          <tr><td style={head}>نوع الحادثة</td><td style={row}>{p.incidentType}</td>
              <td style={head}>الرقم الوظيفي</td><td style={row} className="mono">{p.officer.id}</td></tr>
          <tr><td style={head}>الموقع</td><td style={row}>{p.location}</td>
              <td style={head}>الوحدة</td><td style={row}>{p.officer.unit ?? '—'}</td></tr>
          <tr><td style={head}>الأولوية</td><td style={row}>{p.priority}</td>
              <td style={head}>الحالة</td><td style={row}>{p.status}</td></tr>
          <tr><td style={head}>بداية الجلسة</td><td style={row}>{new Date(p.monitorStart).toLocaleString('en-GB', { hour12: false })}</td>
              <td style={head}>مدة الجلسة</td><td style={row}>{fmtDuration(p.durationSeconds)}</td></tr>
        </tbody>
      </table>

      {p.scene && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>الصورة المرجعية</div>
          <img src={p.scene.referenceShot} alt="" style={{ width: '100%', maxWidth: 460, borderRadius: 5, border: '1px solid #ccc' }} />
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>التسلسل الزمني</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          {p.log.map((l, i) => (
            <tr key={i}>
              <td style={{ ...row, width: 90 }} className="mono">{new Date(l.at).toLocaleTimeString('en-GB', { hour12: false })}</td>
              <td style={row}>{l.label}</td>
              <td style={{ ...row, width: 60, color: colorHex[l.color], fontWeight: 700, textAlign: 'left' }}>
                {l.color.toUpperCase()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>الأشخاص</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'right' }}>الاسم</th>
            <th style={{ ...head, textAlign: 'right' }}>الرقم الوظيفي</th>
            <th style={{ ...head, textAlign: 'right' }}>الحالة</th>
            <th style={{ ...head, textAlign: 'right' }}>أول ظهور</th>
            <th style={{ ...head, textAlign: 'right' }}>آخر ظهور</th>
          </tr>
        </thead>
        <tbody>
          {p.people.length === 0 && <tr><td style={row} colSpan={5}>لا يوجد أشخاص مسجَّلون.</td></tr>}
          {p.people.map((person, i) => (
            <tr key={i}>
              <td style={{ ...row, fontWeight: 600 }}>{person.name}</td>
              <td style={row} className="mono">{person.empId ?? '—'}</td>
              <td style={{ ...row, color: person.authorized ? '#1c6b45' : '#961b15', fontWeight: 700 }}>
                {person.authorized ? 'مصرَّح له' : 'غير مصرَّح'}
              </td>
              <td style={row} className="mono">{new Date(person.firstSeen).toLocaleTimeString('en-GB', { hour12: false })}</td>
              <td style={row} className="mono">{new Date(person.lastSeen).toLocaleTimeString('en-GB', { hour12: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {withPair.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>صور قبل / بعد التحريك</div>
          {withPair.map((l, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, marginBottom: 5 }}>
                {l.label} — {new Date(l.at).toLocaleTimeString('en-GB', { hour12: false })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>قبل</div>
                  <img src={l.beforeShot} alt="" style={{ width: '100%', borderRadius: 5, border: '1px solid #ccc' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>بعد</div>
                  <img src={l.afterShot} alt="" style={{ width: '100%', borderRadius: 5, border: '1px solid #ccc' }} />
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>التغيرات المكتشفة</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <StatBox label="تحريكات الممتلكات" value={p.movementCount} />
        <StatBox label="غير مصرَّح لهم" value={p.unauthorizedCount} />
        <StatBox label="إجمالي التنبيهات" value={p.alertCount} />
        <StatBox label="الصور الملتقطة" value={p.photoCount} />
      </div>

      {p.notes && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>ملاحظات</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>{p.notes}</div>
        </>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>التوقيع الإلكتروني</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <tbody>
          <tr><td style={head}>INTEGRITY HASH · SHA-256</td>
              <td style={{ ...row, fontSize: 10, wordBreak: 'break-all' }} className="mono">{p.hash ?? '— لم يُحفظ بعد —'}</td></tr>
          <tr><td style={head}>اعتمده</td>
              <td style={row}>{p.officer.name} — {p.officer.id}</td></tr>
          <tr><td style={head}>Generated</td>
              <td style={row}>{new Date(p.endedAt || Date.now()).toLocaleString('en-GB', { hour12: false })}</td></tr>
        </tbody>
      </table>

      <div style={{ fontSize: 9.5, color: '#888', marginTop: 14, textAlign: 'center' }}>
        هذا التقرير وُلِّد آلياً بواسطة نظام أثَر — أي تعديل عليه يُبطل قيمة التحقق أعلاه.
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// عناصر صغيرة مشتركة
// ══════════════════════════════════════════════════════════════════════════════

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      padding: '5px 14px', borderRadius: 4, fontSize: 10.5, fontWeight: 700,
      letterSpacing: '0.06em', background: `${color}22`, border: `1px solid ${color}`, color,
    }}>{children}</span>
  )
}

function MiniChip({ color = '#888', children }: { color?: string; children: React.ReactNode }) {
  return (
    <span dir="ltr" style={{
      padding: '3px 9px', borderRadius: 4, fontSize: 9.5, fontWeight: 700,
      letterSpacing: '0.04em', background: 'rgba(0,0,0,0.6)', border: `1px solid ${color}66`, color,
    }}>{children}</span>
  )
}

function MiniStat({ label, value, color = C.white, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div style={{
      padding: '9px 12px', borderRadius: 7,
      background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.blue}28`,
    }}>
      <div style={{ fontSize: 9.5, color: C.whiteDD, letterSpacing: '0.04em' }}>{label}</div>
      <div className={mono ? 'mono' : ''} style={{ fontSize: 13.5, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function ReadonlyField({ label, value, mono, faint }: { label: string; value: string; mono?: boolean; faint?: boolean }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div dir={mono ? 'ltr' : undefined} className={mono ? 'mono' : ''} style={{
        padding: '10px 12px', borderRadius: 6, fontSize: mono ? 12.5 : 13,
        background: 'rgba(0,0,0,0.22)', border: `1px solid ${C.blue}28`,
        color: faint ? C.whiteDD : C.whiteD, textAlign: mono ? 'right' : undefined,
      }}>{value}</div>
    </div>
  )
}

function ExportBtn({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      flex: '1 1 130px', padding: '11px 16px', borderRadius: 7, cursor: busy ? 'not-allowed' : 'pointer',
      background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
      fontSize: 12.5, fontWeight: 600, fontFamily: "'IBM Plex Sans Arabic', sans-serif", opacity: busy ? 0.6 : 1,
    }}>{busy ? '…' : children}</button>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '9px 10px', background: '#f7f7f4', borderRadius: 5, textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 9.5, color: '#666', marginTop: 2 }}>{label}</div>
    </div>
  )
}
