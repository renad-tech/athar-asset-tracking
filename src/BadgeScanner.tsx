// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — ماسح البطاقات                                                  ║
// ║                                                                          ║
// ║  مبدأ «صفر كتابة»: الاسم والمنصب يأتيان من سجل الموظفين بمسح البطاقة،   ║
// ║  لا بكتابة المسؤول. الاسم المكتوب يدوياً يمكن أن يكون خطأً أو غير موجود؛ ║
// ║  البطاقة الممسوحة تُثبت أن الشخص مسجّل فعلاً.                            ║
// ║                                                                          ║
// ║  ولأن الكاميرا قد تُمنع أو تُظلم، هناك دائماً قائمة احتياطية من السجل    ║
// ║  نفسه — بديل عن المسح، لا عن قاعدة البيانات.                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useRef, useState } from 'react'
import { C } from './theme'
import { scanBadge } from './vision'
import { openCamera, fetchEmployees, findEmployee, isLive, type Employee } from './services/api'
import { getSettings } from './settings'

export function BadgeScanner({
  title = 'امسح بطاقة الموظف',
  hint,
  expectId,
  onPick,
  onCancel,
}: {
  title?: string
  hint?: string
  /** إن حُدّد، لا تُقبل إلا بطاقة هذا الموظف — يُستخدم في خطوة التوقيع. */
  expectId?: string
  onPick: (emp: Employee) => void
  onCancel?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lockRef = useRef(false)          // يمنع معالجة نفس البطاقة عدة مرات

  const [ready, setReady] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [msg, setMsg] = useState<{ kind: 'err' | 'wait'; text: string } | null>(null)

  const [showList, setShowList] = useState(false)
  const [list, setList] = useState<Employee[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [q, setQ] = useState('')

  // ── الكاميرا ────────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    const st = getSettings()
    openCamera(st.facingMode, st.cameraId || undefined).then(({ stream: s, error }) => {
      if (cancelled) { s?.getTracks().forEach(t => t.stop()); return }
      if (!s) {
        setCamError(error ?? 'تعذّر تشغيل الكاميرا')
        setShowList(true)              // القائمة الاحتياطية تفتح تلقائياً
        return
      }
      stream = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.play().catch(() => {})
        setReady(true); setCamError(null)
      }
    })
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [retry])

  // ── حلقة المسح ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return
    const timer = setInterval(async () => {
      if (lockRef.current) return
      const v = videoRef.current
      if (!v || !v.videoWidth) return

      const hit = scanBadge(v)
      if (!hit?.empId) return

      lockRef.current = true
      setMsg({ kind: 'wait', text: 'جارٍ التحقق من السجل…' })

      if (expectId && hit.empId !== expectId) {
        setMsg({ kind: 'err', text: `البطاقة الممسوحة (${hit.empId}) لا تخص المستلم. التوقيع يجب أن يكون ببطاقته هو.` })
        setTimeout(() => { lockRef.current = false; setMsg(null) }, 2600)
        return
      }

      const emp = await findEmployee(hit.empId)
      if (!emp) {
        setMsg({
          kind: 'err',
          text: isLive()
            ? `البطاقة رقم ${hit.empId} غير مسجّلة في سجل الموظفين. سجّلها أولاً من تبويب «الموظفون».`
            : 'قاعدة البيانات غير متصلة — تحقق من ملف .env',
        })
        setTimeout(() => { lockRef.current = false; setMsg(null) }, 2600)
        return
      }

      setMsg(null)
      onPick(emp)
    }, 320)
    return () => clearInterval(timer)
  }, [ready, expectId, onPick])

  // ── القائمة الاحتياطية ──────────────────────────────────────────────
  useEffect(() => {
    if (!showList || list.length) return
    setListLoading(true)
    fetchEmployees()
      .then(rows => setList(expectId ? rows.filter(r => r.emp_id === expectId) : rows))
      .catch(() => {})
      .finally(() => setListLoading(false))
  }, [showList, expectId, list.length])

  const filtered = list.filter(e =>
    !q.trim() ||
    e.name?.includes(q.trim()) ||
    e.emp_id?.includes(q.trim()) ||
    e.department?.includes(q.trim()),
  )

  const btn = (bg: string): React.CSSProperties => ({
    padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
    background: 'transparent', border: `1px solid ${bg}`, color: C.white,
    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
  })

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: 9,
      border: `1px solid ${C.blue}33`, padding: 16, direction: 'rtl',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.white }}>{title}</div>
        <div style={{
          marginRight: 'auto', fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace",
          padding: '3px 9px', borderRadius: 4,
          border: `1px solid ${ready ? C.green : C.yellow}55`,
          color: ready ? C.green : C.yellow,
        }}>
          {ready ? '● المسح نشط' : camError ? '● الكاميرا غير متاحة' : '● جارٍ التشغيل…'}
        </div>
      </div>

      {hint && (
        <div style={{ fontSize: 12, color: C.whiteD, lineHeight: 1.85 }}>{hint}</div>
      )}

      {/* ── نافذة الكاميرا ───────────────────────────────────────── */}
      {!showList && (
        <div style={{
          position: 'relative', background: '#080808', borderRadius: 8,
          border: `2px solid ${C.blue}55`, overflow: 'hidden',
          aspectRatio: '4 / 3', maxHeight: 340,
        }}>
          <video ref={videoRef} autoPlay muted playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: ready ? 0.95 : 0 }} />

          {/* إطار توجيه — يساعد المستخدم على وضع البطاقة في المنتصف */}
          {ready && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '48%', aspectRatio: '1 / 1',
              border: `2px dashed ${C.green}99`, borderRadius: 10, pointerEvents: 'none',
            }} />
          )}

          {!ready && !camError && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: C.green,
            }}>… جارٍ تشغيل الكاميرا</div>
          )}

          {msg && (
            <div style={{
              position: 'absolute', insetInline: 10, bottom: 10, padding: '9px 12px',
              borderRadius: 6, fontSize: 12, lineHeight: 1.7, textAlign: 'center',
              background: 'rgba(0,0,0,0.82)',
              border: `1px solid ${msg.kind === 'err' ? C.red : C.blue}77`,
              color: msg.kind === 'err' ? C.red : C.white,
            }}>{msg.text}</div>
          )}
        </div>
      )}

      {camError && !showList && (
        <div style={{
          padding: '10px 13px', borderRadius: 6, fontSize: 12, lineHeight: 1.85,
          background: C.yellowDim, border: `1px solid ${C.yellow}55`, color: C.white,
        }}>{camError}</div>
      )}

      {/* ── القائمة الاحتياطية ───────────────────────────────────── */}
      {showList && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="ابحث بالاسم أو الرقم الوظيفي…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              borderRadius: 6, background: 'rgba(0,0,0,0.3)', color: C.white,
              border: `1px solid ${C.blue}55`, outline: 'none',
              fontSize: 16, direction: 'rtl',   // ١٦px يمنع iOS من تكبير الصفحة
              fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            }} />

          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {listLoading && <div style={{ fontSize: 12, color: C.whiteD }}>… جارٍ تحميل السجل</div>}

            {!listLoading && filtered.length === 0 && (
              <div style={{ fontSize: 12, color: C.yellow, lineHeight: 1.85 }}>
                {isLive()
                  ? 'لا يوجد موظف مطابق في السجل. أضِفه من تبويب «الموظفون» أولاً.'
                  : 'قاعدة البيانات غير متصلة — تحقق من ملف .env'}
              </div>
            )}

            {filtered.map(e => (
              <button key={e.emp_id} onClick={() => onPick(e)} style={{
                display: 'flex', alignItems: 'center', gap: 11, textAlign: 'right',
                padding: '9px 11px', borderRadius: 7, cursor: 'pointer',
                background: 'rgba(0,83,135,0.10)', border: `1px solid ${C.blue}44`,
                color: C.white, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: C.greenDim, border: `1px solid ${C.green}55`,
                  overflow: 'hidden', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 13, color: C.green, fontWeight: 700,
                }}>
                  {e.photo_url
                    ? <img src={e.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (e.name?.[0] ?? '؟')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: C.whiteD }}>
                    <span className="mono">{e.emp_id}</span>
                    {e.role ? ` · ${e.role}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── أزرار ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setShowList(s => !s)} style={btn(C.blue + '77')}>
          {showList ? '↩ العودة إلى المسح' : '☰ اختيار من السجل'}
        </button>

        {camError && !showList && (
          <button onClick={() => { setCamError(null); setRetry(r => r + 1) }} style={btn(C.green)}>
            إعادة المحاولة ↻
          </button>
        )}

        {onCancel && (
          <button onClick={onCancel} style={{ ...btn(C.whiteDD), marginRight: 'auto' }}>
            إلغاء
          </button>
        )}
      </div>
    </div>
  )
}

/** بطاقة تعريف مختصرة — تُعرض بعد اختيار الموظف للتأكيد البصري. */
export function EmployeeCard({ emp, label, onChange }: {
  emp: Employee
  label?: string
  onChange?: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 13, direction: 'rtl',
      padding: '13px 15px', borderRadius: 9,
      background: C.greenDim, border: `1px solid ${C.green}66`,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.green}77`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, fontWeight: 700, color: C.green,
      }}>
        {emp.photo_url
          ? <img src={emp.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (emp.name?.[0] ?? '؟')}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        {label && (
          <div style={{ fontSize: 10, letterSpacing: '0.08em', color: C.green, fontWeight: 700 }}>
            {label}
          </div>
        )}
        <div style={{ fontSize: 14.5, fontWeight: 700, color: C.white }}>{emp.name}</div>
        <div style={{ fontSize: 11.5, color: C.whiteD }}>
          <span className="mono">{emp.emp_id}</span>
          {emp.role ? ` · ${emp.role}` : ''}
          {emp.department ? ` · ${emp.department}` : ''}
        </div>
      </div>

      {onChange && (
        <button onClick={onChange} style={{
          padding: '6px 13px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5,
          background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
          fontFamily: "'IBM Plex Sans Arabic', sans-serif", flexShrink: 0,
        }}>تغيير</button>
      )}
    </div>
  )
}
