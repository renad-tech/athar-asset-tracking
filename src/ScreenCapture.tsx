// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — التوثيق البصري                                                 ║
// ║                                                                          ║
// ║  Captures the evidence for a session. Most types need one snapshot; an   ║
// ║  incident needs two — before the intervention and after it — because     ║
// ║  there is no earlier baseline to compare against.                        ║
// ║                                                                          ║
// ║  On capture the model counts what it sees. That count is what a later    ║
// ║  session is compared against, and it is how a missing device is found.   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useRef, useState } from 'react'
import { C } from './theme'
import { typeOf, type SessionKind } from './sessionTypes'
import { countObjects, getModelState, loadPersonModel, snapshot, type Counted } from './vision'
import { openCamera } from './services/api'
import { getSettings } from './settings'

export type Capture = {
  shot: string
  items: Counted[]
  total: number
  usedModel: boolean
  at: number
}

export function ScreenCapture({ kind, onBack, onDone }: {
  kind: SessionKind
  onBack: () => void
  onDone: (primary: Capture, after?: Capture) => void
}) {
  const t = typeOf(kind)
  const isPair = t.capture === 'pair'

  const videoRef = useRef<HTMLVideoElement>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [retry, setRetry] = useState(0)

  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'primary' | 'after'>('primary')
  const [primary, setPrimary] = useState<Capture | null>(null)
  const [after, setAfter] = useState<Capture | null>(null)
  const [modelReady, setModelReady] = useState(false)

  useEffect(() => { loadPersonModel().then(setModelReady) }, [])

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    const st = getSettings()
    openCamera(st.facingMode, st.cameraId || undefined).then(({ stream: s, error }) => {
      if (cancelled) { s?.getTracks().forEach(x => x.stop()); return }
      if (!s) { setCamError(error ?? 'تعذّر تشغيل الكاميرا'); return }
      stream = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.play().catch(() => {})
        setReady(true); setCamError(null)
      }
    })
    return () => { cancelled = true; stream?.getTracks().forEach(x => x.stop()) }
  }, [retry])

  const capture = async () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    setBusy(true)
    const shot = snapshot(v, 1280, 0.82)
    const { items, total, usedModel } = await countObjects(v)
    const cap: Capture = { shot, items, total, usedModel, at: Date.now() }
    setBusy(false)

    if (isPair && phase === 'primary') { setPrimary(cap); setPhase('after'); return }
    if (isPair) { setAfter(cap); return }
    setPrimary(cap)
  }

  const current = isPair && phase === 'after' ? after : primary
  const canFinish = isPair ? !!(primary && after) : !!primary

  const retake = () => {
    if (isPair && phase === 'after') setAfter(null)
    else { setPrimary(null); if (isPair) setPhase('primary') }
  }

  const shotLabel = isPair
    ? (phase === 'primary' ? 'اللقطة الأولى — قبل التدخل' : 'اللقطة الثانية — بعد التدخل')
    : 'اللقطة المرجعية'

  return (
    <div style={{
      minHeight: '100%', background: C.bg, direction: 'rtl',
      padding: 'clamp(14px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 14,
    }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: `1px solid ${C.blue}55`, color: C.white,
          borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 12,
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>→ رجوع</button>
        <div style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: C.greenDim, border: `1px solid ${C.green}66`, color: C.green,
        }}>{t.label}</div>
        <div style={{
          marginRight: 'auto', fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace",
          padding: '4px 9px', borderRadius: 4,
          border: `1px solid ${modelReady ? C.green : C.blue}55`,
          color: modelReady ? C.green : C.blue,
        }}>
          {modelReady ? '● الحصر الذكي جاهز' : '● وضع التصوير فقط'}
        </div>
      </div>

      <div style={{ fontSize: 'clamp(15px, 2.2vw, 19px)', fontWeight: 700, color: C.white }}>
        {shotLabel}
      </div>

      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
      }}>

        {/* ── camera / preview ─────────────────────────────────── */}
        <div style={{
          position: 'relative', background: '#080808', borderRadius: 9,
          border: `2px solid ${current ? C.green : C.blue}66`,
          overflow: 'hidden', aspectRatio: '4 / 3', minHeight: 200,
        }}>
          {current ? (
            <img src={current.shot} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <video ref={videoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: ready ? 0.95 : 0 }} />
          )}

          {!current && !ready && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: camError ? C.yellow : C.green }}>
                {camError ? '● الكاميرا غير متاحة' : '● جارٍ تشغيل الكاميرا…'}
              </div>
              {camError && (
                <>
                  <div style={{ fontSize: 12, color: C.white, lineHeight: 1.8, maxWidth: 340 }}>{camError}</div>
                  <button onClick={() => { setCamError(null); setRetry(r => r + 1) }} style={{
                    padding: '6px 16px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                    background: 'transparent', color: C.green, border: `1px solid ${C.green}`, fontWeight: 600,
                  }}>إعادة المحاولة ↻</button>
                </>
              )}
            </div>
          )}

          {busy && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: C.green, fontWeight: 700,
            }}>… جارٍ حصر الموجودات</div>
          )}
        </div>

        {/* ── detected inventory ───────────────────────────────── */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: 9,
          border: `1px solid ${C.blue}33`, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10, minHeight: 200,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>الموجودات المرصودة</div>

          {!current ? (
            <div style={{ fontSize: 12, color: C.whiteDD, lineHeight: 1.9 }}>
              وجّه الكاميرا نحو المكان ثم اضغط «التقاط».
              سيحصر النظام ما يراه تلقائياً، ويُقارَن لاحقاً بأي جلسة سابقة على نفس الأصل.
            </div>
          ) : current.items.length === 0 ? (
            <div style={{ fontSize: 12, color: C.yellow, lineHeight: 1.9 }}>
              {current.usedModel
                ? 'لم يُرصد شيء واضح. الصورة محفوظة، ويمكنك تسجيل الموجودات يدوياً في الملاحظات.'
                : 'الحصر الذكي غير مفعّل — الصورة محفوظة كدليل بصري.'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {current.items.map(it => (
                  <div key={it.label} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 20, fontSize: 12,
                    background: C.greenDim, border: `1px solid ${C.green}55`, color: C.white,
                  }}>
                    <span>{it.label}</span>
                    <span className="mono" style={{ color: C.green, fontWeight: 700 }}>{it.count}</span>
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${C.blue}22`,
                display: 'flex', justifyContent: 'space-between', fontSize: 12.5,
              }}>
                <span style={{ color: C.whiteD }}>الإجمالي</span>
                <span className="mono" style={{ color: C.green, fontWeight: 700 }}>{current.total}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* pair progress */}
      {isPair && (
        <div style={{ display: 'flex', gap: 8 }}>
          {(['primary', 'after'] as const).map((p, i) => {
            const done = p === 'primary' ? !!primary : !!after
            const active = phase === p
            return (
              <div key={p} style={{
                flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 11.5,
                background: done ? C.greenDim : 'rgba(255,255,255,0.03)',
                border: `1px solid ${done ? C.green : active ? C.blue : C.blue + '33'}`,
                color: done ? C.green : active ? C.white : C.whiteDD,
              }}>
                {done ? '✓ ' : ''}{i === 0 ? 'قبل التدخل' : 'بعد التدخل'}
              </div>
            )
          })}
        </div>
      )}

      {/* actions */}
      <div style={{ marginTop: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {current ? (
          <button onClick={retake} style={{
            flex: '1 1 140px', padding: '12px 18px', borderRadius: 7, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
            fontSize: 13.5, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }}>↻ إعادة الالتقاط</button>
        ) : (
          <button onClick={capture} disabled={!ready || busy} style={{
            flex: '1 1 100%', padding: '13px 20px', borderRadius: 7,
            cursor: ready && !busy ? 'pointer' : 'not-allowed',
            background: ready ? C.green : 'rgba(255,255,255,0.08)', border: 'none',
            color: '#fff', fontSize: 15, fontWeight: 700,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            opacity: ready && !busy ? 1 : 0.6,
          }}>📷 التقاط</button>
        )}

        {canFinish && (
          <button onClick={() => onDone(primary!, after ?? undefined)} style={{
            flex: '2 1 220px', padding: '12px 20px', borderRadius: 7, cursor: 'pointer',
            background: C.green, border: 'none', color: '#fff',
            fontSize: 14.5, fontWeight: 700, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }}>إنهاء الجلسة وإصدار التقرير ←</button>
        )}
      </div>
    </div>
  )
}
