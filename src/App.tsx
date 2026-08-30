// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — UI Shell                                                       ║
// ║                                                                         ║
// ║  WHERE TO EDIT THINGS:                                                  ║
// ║  • Names / IDs / settings   →  src/config.ts                           ║
// ║  • Backend / AI / files     →  src/services/api.ts                     ║
// ║  • Environment variables    →  .env  (copy from .env.example)          ║
// ║                                                                         ║
// ║  INTEGRATION POINTS IN THIS FILE (search the tag to find them):        ║
// ║  [HOOK:AUTH]    Screen 1   — swap offline badge check for real auth     ║
// ║  [HOOK:CAMERA]  Screens 2,4— LiveCameraFeed uses getUserMedia already  ║
// ║  [HOOK:AI]      Screen 4   — replace simulated pings with analyzeFrame ║
// ║  [HOOK:EXPORT]  Screen 5   — wire PDF/CSV/JSON buttons to api.ts       ║
// ║  [HOOK:ARCHIVE] Screen 6   — wire preview/download to Supabase Storage ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useState, useRef, useCallback, useEffect } from 'react'
import { OFFICER as OFFICER_DEFAULT, APP as APP_CFG } from './config'
import { ScreenHome } from './ScreenHome'
import { ScreenSessionData, type SessionDraft } from './ScreenSessionData'
import { ScreenCapture, type Capture } from './ScreenCapture'
import { ScreenCompare } from './ScreenCompare'
import { ScreenReport } from './ScreenReport'
import { ScreenArchive } from './ScreenArchive'
import { ScreenCustody } from './ScreenCustody'
import { ScreenHandover } from './ScreenHandover'
import type { ReportData } from './SessionReport'
import type { SessionKind } from './sessionTypes'
import {
  getSettings, subscribeSettings, updateSettings, resetSettings,
  listCameras, beep, PRESETS, type CamDevice, type Sensitivity,
} from './settings'
import { Badge as IdBadge, BadgeSheet, useQRCodes } from './Badges'
import {
  captureScene, detectChange, detectPeople, loadPersonModel, scanBadge, snapshot,
  Confirmer, DETECT, getModelState, type Scene, type VisionHit,
} from './vision'
import {
  getSession, subscribe, startSession, endSession as endSessionStore,
  reportSummary, reportHash, reportSHA256, fmtDuration, KIND_COLOR, logEvent, seePerson, addCapture,
} from './session'
import {
  exportReportPDF, printReportElement, exportReportCSV, exportReportJSON,
  exportReportDOC, reportRows, archiveReport, fetchArchive, deleteArchived, type ArchivedRow,
  isLive, openCamera, verifySupervisor, fetchOfficer,
  fetchEmployees, saveEmployee, deleteEmployee, uploadFile, findEmployee, dataUrlToBlob, type Employee,
} from './services/api'

// ─── Live officer profile ────────────────────────────────────────────────────
// Mutable module object: filled from the DB right after login, so every screen
// that reads OFFICER.* picks up the real values without prop-drilling.
const OFFICER = { ...OFFICER_DEFAULT }

// ─── Live clock ──────────────────────────────────────────────────────────────
/** Ticks every second. Returns Arabic date + 24h time strings. */
function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return {
    now,
    time: now.toLocaleTimeString('en-GB', { hour12: false }),
    dateAr: now.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    dateEn: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
  }
}

/** Re-renders whenever settings change. */
function useSettings() {
  const [, force] = useState(0)
  useEffect(() => subscribeSettings(() => force(n => n + 1)), [])
  return getSettings()
}

/** Re-renders whenever the live session store changes. */
function useSession() {
  const [, force] = useState(0)
  useEffect(() => subscribe(() => force(n => n + 1)), [])
  return getSession()
}

/** Counts up from a start time. Used for real session / incident duration. */
function useElapsed(startedAt: number) {
  const [ms, setMs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setMs(Date.now() - startedAt), 1000)
    return () => clearInterval(t)
  }, [startedAt])
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`
}
const atharLogo = '/athar-logo.png'

// ─── Color tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#282828',
  card: 'rgba(30,30,30,0.65)',
  green: '#237F52',
  greenDim: 'rgba(35,127,82,0.12)',
  greenGlow: 'rgba(35,127,82,0.25)',
  red: '#A52019',
  redDim: 'rgba(165,32,25,0.15)',
  blue: '#005387',
  blueDim: 'rgba(0,83,135,0.15)',
  white: '#ECECE7',
  whiteD: 'rgba(236,236,231,0.6)',
  whiteDD: 'rgba(236,236,231,0.3)',
  yellow: '#F9A900',
  yellowDim: 'rgba(249,169,0,0.15)',
}


// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function Badge({ color, children, live = false }: { color: string; children: React.ReactNode; live?: boolean }) {
  return (
    <div
      className={live ? 'live-flash' : ''}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 16px', borderRadius: 4,
        background: color === 'green' ? C.greenDim : color === 'red' ? C.redDim : C.blueDim,
        border: `1px solid ${color === 'green' ? C.green : color === 'red' ? C.red : C.blue}`,
        color: color === 'green' ? C.green : color === 'red' ? C.red : C.blue,
        fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        backdropFilter: 'blur(8px)',
      }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color === 'green' ? C.green : color === 'red' ? C.red : C.blue,
        display: 'inline-block', flexShrink: 0,
      }} className={color === 'green' || live ? 'blink' : ''} />
      {children}
    </div>
  )
}

function Btn({
  children, color = 'green', onClick, style = {}, size = 'md',
}: {
  children: React.ReactNode; color?: 'green' | 'red' | 'blue'; onClick?: () => void;
  style?: React.CSSProperties; size?: 'sm' | 'md' | 'lg';
}) {
  const bg = color === 'green' ? C.green : color === 'red' ? C.red : C.blue
  const pad = size === 'sm' ? '8px 20px' : size === 'lg' ? '16px 40px' : '12px 28px'
  const fs = size === 'sm' ? 12 : size === 'lg' ? 15 : 13
  return (
    <button onClick={onClick} style={{
      background: bg, color: C.white, border: 'none', borderRadius: 4,
      padding: pad, fontSize: fs, fontWeight: 600, letterSpacing: '0.04em',
      cursor: 'pointer', fontFamily: "'Inter', 'IBM Plex Sans Arabic', sans-serif",
      boxShadow: `0 4px 20px ${bg}44`, transition: 'all 0.18s ease', ...style,
    }}>
      {children}
    </button>
  )
}

function OutlineBtn({ children, onClick, style = {} }: {
  children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', color: C.white, border: `1.5px solid ${C.blue}`,
      borderRadius: 4, padding: '10px 24px', fontSize: 13, fontWeight: 500,
      cursor: 'pointer', fontFamily: "'Inter', 'IBM Plex Sans Arabic', sans-serif",
      letterSpacing: '0.04em', transition: 'all 0.18s ease', ...style,
    }}>
      {children}
    </button>
  )
}

function Divider({ color = C.blue }: { color?: string }) {
  return <div style={{ height: 1, background: `${color}55`, margin: '0 0' }} />
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: C.blue, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{
        fontSize: 13, color: C.white, fontWeight: 500,
        fontFamily: mono ? 'JetBrains Mono, monospace' : "'Inter', 'IBM Plex Sans Arabic', sans-serif",
      }}>
        {value}
      </span>
    </div>
  )
}

function EditableField({ label, value, onChange, mono = false, required = false, invalid = false, placeholder, readOnly = false }: {
  label: string; value: string; onChange: (v: string) => void; mono?: boolean
  required?: boolean; invalid?: boolean; placeholder?: string; readOnly?: boolean
}) {
  const [focused, setFocused] = useState(false)
  // Red while empty-and-flagged, blue once it has content — so the operator
  // can see at a glance what still needs writing.
  const accent = invalid ? C.red : focused ? C.blue : C.blue + '50'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 10, color: invalid ? C.red : C.blue, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {label}{required && <span style={{ color: C.red, marginRight: 3 }}>*</span>}
      </span>
      <input
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          background: readOnly ? 'rgba(255,255,255,0.03)'
            : invalid ? 'rgba(165,32,25,0.10)'
            : focused ? 'rgba(0,83,135,0.10)' : 'rgba(0,83,135,0.04)',
          border: 'none',
          borderBottom: `1.5px solid ${accent}`,
          color: readOnly ? C.whiteD : C.white,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: mono ? "'JetBrains Mono', monospace" : "'Inter', 'IBM Plex Sans Arabic', sans-serif",
          padding: '5px 6px 4px',
          outline: 'none',
          width: '100%',
          borderRadius: '2px 2px 0 0',
          transition: 'all 0.2s ease',
          direction: 'auto' as any,
          userSelect: 'text',
          cursor: readOnly ? 'default' : 'text',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options, required = false, invalid = false }: {
  label: string; value: string; onChange: (v: string) => void
  options: string[]; required?: boolean; invalid?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const accent = invalid ? C.red : focused ? C.blue : C.blue + '50'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 10, color: invalid ? C.red : C.blue, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {label}{required && <span style={{ color: C.red, marginRight: 3 }}>*</span>}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          background: invalid ? 'rgba(165,32,25,0.10)' : focused ? 'rgba(0,83,135,0.10)' : 'rgba(0,83,135,0.04)',
          border: 'none', borderBottom: `1.5px solid ${accent}`,
          color: value ? C.white : C.whiteDD,
          fontSize: 13, fontWeight: 500,
          fontFamily: "'Inter', 'IBM Plex Sans Arabic', sans-serif",
          padding: '5px 6px 4px', outline: 'none', width: '100%',
          borderRadius: '2px 2px 0 0', cursor: 'pointer',
          direction: 'rtl', boxSizing: 'border-box',
        }}>
        <option value="" style={{ background: '#1a1a1a', color: '#888' }}>— اختر —</option>
        {options.map(o => (
          <option key={o} value={o} style={{ background: '#1a1a1a', color: '#fff' }}>{o}</option>
        ))}
      </select>
    </div>
  )
}

function LiveCameraFeed({ frozen = false, onVideoReady }: {
  frozen?: boolean
  onVideoReady?: (v: HTMLVideoElement) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState<'connecting' | 'active' | 'denied'>('connecting')
  const [camError, setCamError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  // Re-open the stream whenever the operator picks a different camera.
  const { cameraId: camId, facingMode: facing } = useSettings()

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    openCamera(getSettings().facingMode, getSettings().cameraId || undefined).then(({ stream: s, error }) => {
      if (cancelled) { s?.getTracks().forEach(t => t.stop()); return }
      if (!s) { setStatus('denied'); setCamError(error ?? null); return }
      stream = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        // Some browsers ignore autoPlay when the element mounts hidden.
        videoRef.current.play().catch(() => {})
        setActive(true); setStatus('active'); setCamError(null)
        onVideoReady?.(videoRef.current)
      }
    })

    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [retry, camId, facing])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Live video element */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: active ? 0.9 : 0,
          transition: 'opacity 0.6s ease',
          filter: frozen ? 'saturate(0.25) brightness(0.75)' : 'none',
        }}
      />
      {/* Grid texture (subtle when camera active, full when not) */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(${C.green}${active ? '08' : '14'} 1px, transparent 1px),
          linear-gradient(90deg, ${C.green}${active ? '08' : '14'} 1px, transparent 1px)`,
        backgroundSize: '30px 30px',
      }} />
      {/* Status when no feed */}
      {!active && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', padding: '0 18px', maxWidth: 420 }}>
            <div style={{
              fontSize: 9, color: status === 'denied' ? C.yellow : C.green,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em', lineHeight: 2,
            }} className={status === 'connecting' ? 'blink' : ''}>
              {status === 'connecting' ? '● CONNECTING TO CAMERA...' : '● CAMERA UNAVAILABLE'}
            </div>
            {/* Show the real reason instead of a generic "denied" */}
            {camError && (
              <>
                <div style={{
                  fontSize: 11, color: C.white, direction: 'rtl', lineHeight: 1.8,
                  marginTop: 10, opacity: 0.9,
                }}>{camError}</div>
                <button
                  onClick={() => { setStatus('connecting'); setCamError(null); setRetry(r => r + 1) }}
                  style={{
                    marginTop: 12, padding: '6px 18px', fontSize: 11, cursor: 'pointer',
                    background: 'transparent', color: C.green,
                    border: `1px solid ${C.green}`, borderRadius: 4, fontWeight: 600,
                  }}>
                  إعادة المحاولة ↻
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SystemHeader({ title, subtitle, screen }: { title: string; subtitle?: string; screen: number }) {
  const { time: timeStr, dateEn } = useClock()   // live — updates every second
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', rowGap: 8,
      padding: 'clamp(10px, 3vw, 14px) clamp(12px, 3vw, 24px)',
      borderBottom: `1px solid rgba(255,255,255,0.08)`,
      background: 'rgba(20,20,20,0.72)',
      backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <img src={atharLogo} alt="ATHAR Logo" style={{ width: 'clamp(38px, 10vw, 52px)', height: 'auto', aspectRatio: '1 / 1', objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 0 8px rgba(35,127,82,0.4))' }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.white, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.3 }}>
            ATHAR
            <div style={{ fontSize: 9, color: C.whiteD, fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginTop: 1, fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>توثيق الأصول والمرافق</div>
          </div>
          <div style={{ fontSize: 10, color: C.whiteD, letterSpacing: 0, fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>{subtitle || 'نظام أمن جامعي — غير متصل'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2.5vw, 20px)', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 14, color: C.green, fontWeight: 600 }}>{timeStr}</div>
          <div style={{ fontSize: 10, color: C.whiteDD, letterSpacing: '0.06em' }}>
            {dateEn}
          </div>
        </div>
        <div className="offline-glow" style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          border: `1px solid ${C.green}88`, borderRadius: 3,
          background: C.greenDim, backdropFilter: 'blur(8px)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} className="blink" />
          <span style={{ fontSize: 10, color: C.green, fontWeight: 700, letterSpacing: '0.1em' }}>OFFLINE</span>
        </div>
        <div style={{ color: C.whiteDD, fontSize: 10, letterSpacing: '0.06em' }}>SCR {screen}/5</div>
      </div>
    </div>
  )
}

// ─── Shared Modal backdrop ────────────────────────────────────────────────────
function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fade-in 0.2s ease forwards',
      }}
    >
      <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

// ─── Screen 1: Login & Verification ──────────────────────────────────────────

function Screen1({ onNext, onOfficerLoaded }: { onNext: () => void; onOfficerLoaded?: () => void }) {
  const [id, setId] = useState('')
  const [focused, setFocused] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [checking, setChecking] = useState(false)
  const { time, dateAr } = useClock()

  const handleSubmit = async () => {
    if (id.trim().length < 3) { setAccessDenied(true); return }
    setChecking(true); setAccessDenied(false)

    // Real check against the `supervisors` table in Supabase.
    const { valid } = await verifySupervisor(id.trim())
    if (!valid) { setChecking(false); setAccessDenied(true); return }

    // Pull the full profile so every later screen shows real DB values.
    const profile = await fetchOfficer(id.trim())
    Object.assign(OFFICER, profile)
    // Session clock starts here — the report's duration is measured from now.
    startSession(profile.name, profile.id)
    onOfficerLoaded?.()

    setChecking(false)
    setSubmitted(true)
    setTimeout(onNext, 900)
  }

  const handleReset = () => {
    setAccessDenied(false)
    setId('')
    setSubmitted(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: C.bg, position: 'relative', overflowX: 'hidden' }}>

      {/* ── Animated background ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {[
          { w: 340, h: 340, top: '-10%', left: '-8%', color: 'rgba(180,200,190,0.07)', anim: 'float-1 14s ease-in-out infinite' },
          { w: 260, h: 260, top: '55%', left: '-5%', color: 'rgba(35,127,82,0.06)', anim: 'float-2 18s ease-in-out infinite' },
          { w: 400, h: 400, top: '-15%', left: '55%', color: 'rgba(160,180,175,0.06)', anim: 'float-3 22s ease-in-out infinite' },
          { w: 200, h: 200, top: '60%', left: '70%', color: 'rgba(35,127,82,0.05)', anim: 'float-1 16s ease-in-out infinite reverse' },
          { w: 180, h: 180, top: '30%', left: '42%', color: 'rgba(200,215,210,0.04)', anim: 'float-2 20s ease-in-out infinite reverse' },
        ].map((o, i) => (
          <div key={i} style={{
            position: 'absolute', width: o.w, height: o.h, top: o.top, left: o.left,
            borderRadius: '50%',
            background: `radial-gradient(circle at center, ${o.color}, transparent 70%)`,
            animation: o.anim,
          }} />
        ))}
        {[
          { size: 480, top: '50%', left: '22%', delay: '0s' },
          { size: 320, top: '20%', left: '60%', delay: '3s' },
          { size: 220, top: '70%', left: '55%', delay: '6s' },
        ].map((r, i) => (
          <div key={i} style={{
            position: 'absolute', width: r.size, height: r.size, top: r.top, left: r.left,
            transform: 'translate(-50%, -50%)', borderRadius: '50%',
            border: '1px solid rgba(180,210,195,0.12)',
            animation: `shimmer-ring 7s ease-in-out ${r.delay} infinite`,
          }} />
        ))}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(180,200,190,0.15) 1px, transparent 1px)',
          backgroundSize: '28px 28px', opacity: 0.5,
        }} />
      </div>

      <SystemHeader title="ATHAR" subtitle="بوابة دخول نظام توثيق الأصول" screen={1} />

      <div className="login-wrap">

        {/* Left branding panel */}
        <div className="login-brand">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.whiteD, marginTop: 8, letterSpacing: '0.02em', lineHeight: 1.8, direction: 'rtl' }}>
              نظام توثيق الأصول والمرافق · يعمل بلا اتصال<br />مخصص لمشرفي المستودعات والمرافق
            </div>
          </div>
          <img src={atharLogo} alt="ATHAR Logo" style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 24px rgba(35,127,82,0.35))', border: '1px solid rgb(0,0,0)', marginTop: 4 }} className="pulse-green login-brand-logo" />
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8, width: '100%',
            padding: 16, background: 'rgba(35,127,82,0.10)',
            backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
            border: `1px solid rgba(35,127,82,0.20)`, borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}>
            {['بنية بلا اتصال بالإنترنت', 'حصر ذكي للموجودات', 'تشفير شامل من طرف لطرف', 'سجل تدقيق محمي لكل أصل'].map(ar => (
              <div key={ar} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.whiteD, direction: 'rtl' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                {ar}
              </div>
            ))}
          </div>
        </div>

        {/* Login / Error card */}
        <div className="login-card" style={{
          background: 'rgba(30,30,30,0.65)',
          backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
          border: `1px solid ${accessDenied ? 'rgba(165,32,25,0.40)' : 'rgba(0,83,135,0.20)'}`,
          borderRadius: 8, padding: 'clamp(18px, 5vw, 32px)', display: 'flex', flexDirection: 'column', gap: 24,
          boxShadow: accessDenied
            ? `0 8px 24px rgba(0,0,0,0.35), 0 0 24px rgba(165,32,25,0.20)`
            : `0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04)`,
          transition: 'border 0.3s ease, box-shadow 0.3s ease',
        }}>

          {accessDenied ? (
            /* ── ACCESS DENIED STATE ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', textAlign: 'center' }}>
              {/* Red pulsing shield icon */}
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: C.redDim, border: `2px solid ${C.red}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, boxShadow: `0 0 24px rgba(165,32,25,0.35)`,
                animation: 'pulse-red 1.4s ease-in-out infinite',
              }}>🚫</div>

              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.red, letterSpacing: '0.12em', marginBottom: 6 }}>
                  ACCESS DENIED
                </div>
                <div style={{ fontSize: 13, color: C.whiteD, direction: 'rtl', lineHeight: 1.8 }}>
                  رقم الشارة غير صحيح أو غير مسجّل<br />
                  <span style={{ fontSize: 11, color: C.whiteDD }}>يجب أن يبدأ بـ BADGE أو رقم وظيفي صالح</span>
                </div>
              </div>

              <div style={{
                width: '100%', padding: '10px 16px',
                background: C.redDim, border: `1px solid ${C.red}44`, borderRadius: 4,
              }}>
                <div className="mono" style={{ fontSize: 10, color: C.red, letterSpacing: '0.06em' }}>
                  ATTEMPT LOGGED · {new Date().toLocaleTimeString('en-US', { hour12: false })} · IP: 192.168.1.1
                </div>
              </div>

              <Btn color="red" size="lg" onClick={handleReset} style={{ width: '100%' }}>
                ← إعادة المحاولة
              </Btn>

              <div style={{ fontSize: 9, color: C.whiteDD, letterSpacing: '0.02em', lineHeight: 1.8, direction: 'rtl' }}>
                تمّ تسجيل محاولة الدخول الفاشلة · يُرجى التواصل مع مسؤول النظام
              </div>
            </div>
          ) : (
            /* ── NORMAL LOGIN STATE ── */
            <>
              <div>
                <div style={{ fontSize: 11, color: C.blue, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Campus Security Supervisor Auth
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.white, direction: 'rtl' }}>دخول آمن — مشرف المرافق</div>
                <div style={{ fontSize: 11, color: C.whiteD, marginTop: 4, direction: 'rtl' }}>أدخل رقمك الوظيفي للوصول إلى نظام توثيق الأصول</div>
              </div>
              <Divider />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.blue, fontWeight: 600, letterSpacing: '0.06em', display: 'block', marginBottom: 8, direction: 'rtl' }}>
                    الرقم الوظيفي للمشرف — Campus Supervisor ID
                  </label>
                  <div style={{
                    position: 'relative',
                    border: `1.5px solid ${focused ? C.blue : C.blue + '66'}`,
                    borderRadius: 4, background: 'rgba(0,83,135,0.06)',
                    transition: 'all 0.2s',
                    boxShadow: focused ? `0 0 0 3px ${C.blue}22` : 'none',
                  }}>
                    <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: C.blue }}>⊡</div>
                    <input
                      value={id}
                      onChange={e => setId(e.target.value)}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      placeholder="أدخل رقم المشرف"
                      style={{
                        width: '100%', background: 'transparent', border: 'none', outline: 'none',
                        padding: '14px 14px 14px 38px',
                        color: C.white, fontSize: 14, fontFamily: "'JetBrains Mono', 'IBM Plex Sans Arabic', monospace",
                        letterSpacing: '0.05em', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>
              <Btn color="green" size="lg" onClick={handleSubmit} style={{ width: '100%', opacity: submitted ? 0.7 : 1 }}>
                {submitted ? 'جارٍ التحقق...' : 'متابعة ←'}
              </Btn>
              <div style={{ textAlign: 'center', fontSize: 9, color: C.whiteDD, letterSpacing: '0.02em', lineHeight: 1.8, direction: 'rtl' }}>
                يعمل النظام في وضع OFFLINE · جميع الجلسات مشفرة محلياً
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Screen 2: Access Granted & Photo Capture ─────────────────────────────────

// ─── LockGate — بوابة القفل ───────────────────────────────────────────────────
// The personnel registry holds names and photos, so it must not be open to
// anyone who walks past the device. Unlocking uses the same supervisor badge
// used to sign in — no second password to manage.

function LockGate({ title, note, children, unlocked, onUnlock }: {
  title: string
  note?: string
  children: React.ReactNode
  unlocked: boolean
  onUnlock: () => void
}) {
  const [pin, setPin] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!unlocked) inputRef.current?.focus() }, [unlocked])

  const submit = async () => {
    if (!pin.trim()) { setError('أدخل رقم المشرف'); return }
    setChecking(true); setError('')
    const { valid } = await verifySupervisor(pin.trim())
    setChecking(false)
    if (valid) { onUnlock(); logEvent('login', `فتح ${title} — تحقق ناجح`) }
    else { setError('رقم غير صحيح'); setPin(''); inputRef.current?.focus() }
  }

  if (unlocked) return <>{children}</>

  return (
    <div style={{
      minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.bg, padding: 24,
    }}>
      <div style={{
        width: 'min(92vw, 380px)', background: C.card, borderRadius: 10,
        border: `1px solid ${error ? C.red + '66' : C.blue + '33'}`,
        padding: 28, direction: 'rtl', textAlign: 'center',
        display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', margin: '0 auto 2px',
          background: C.greenDim, border: `1px solid ${C.green}66`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>🔒</div>

        <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{title}</div>
        {note && <div style={{ fontSize: 11.5, color: C.whiteD, lineHeight: 1.8 }}>{note}</div>}

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          value={pin}
          placeholder="• • • •"
          autoComplete="off"
          onChange={e => { setPin(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          onClick={e => e.currentTarget.focus()}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 6,
            textAlign: 'center', background: 'rgba(0,0,0,0.4)', color: C.white,
            border: `1px solid ${error ? C.red : C.blue + '55'}`,
            outline: 'none', fontSize: 20, letterSpacing: '0.4em',
            fontFamily: "'JetBrains Mono', monospace",
            userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text',
          } as React.CSSProperties} />

        {error && <div style={{ fontSize: 11, color: C.red }}>{error}</div>}

        <button onClick={submit} style={{
          width: '100%', padding: '12px 18px', borderRadius: 6, cursor: 'pointer',
          background: C.green, border: 'none', color: '#fff',
          fontSize: 14, fontWeight: 700, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>{checking ? '… جارٍ التحقق' : 'فتح'}</button>
      </div>
    </div>
  )
}

function ScreenEmployees() {

  const [list, setList] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [form, setForm] = useState<Employee>({ emp_id: '', name: '', role: '', department: '', authorized: true })
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [badgeFor, setBadgeFor] = useState<Employee | null>(null)   // null = closed, {} = all
  const [badgeBusy, setBadgeBusy] = useState<string | null>(null)

  // One QR per employee, regenerated whenever the roster changes.
  const qrCodes = useQRCodes(list)
  const badgeList = badgeFor?.emp_id ? [badgeFor] : list

  const load = useCallback(async () => {
    setLoading(true)
    setList(await fetchEmployees())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const onPhoto = (f: File | null) => {
    setPhoto(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  const submit = async () => {
    if (!form.emp_id.trim() || !form.name.trim()) {
      setMsg({ kind: 'err', text: 'الرقم الوظيفي والاسم مطلوبان' }); return
    }
    setSaving(true); setMsg(null)
    const { ok, error } = await saveEmployee(form, photo)
    setSaving(false)
    if (!ok) { setMsg({ kind: 'err', text: error ?? 'تعذّر الحفظ' }); return }
    setMsg({ kind: 'ok', text: `تم حفظ ${form.name} بنجاح` })
    setForm({ emp_id: '', name: '', role: '', department: '', authorized: true })
    onPhoto(null)
    load()
  }

  const remove = async (empId: string) => {
    if (!confirm(`حذف الموظف ${empId}؟`)) return
    await deleteEmployee(empId)
    load()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg }}>
      <SystemHeader title="سجل الموظفين المصرح لهم" subtitle="AUTHORIZED PERSONNEL REGISTRY" screen={7} />

      {/* ── Badge preview / print modal ──────────────────────────────── */}
      {badgeFor && (
        <ModalBackdrop onClose={() => setBadgeFor(null)}>
          <div style={{
            background: '#1a1a1a', border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 10,
            width: 'min(92vw, 900px)', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
            overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
            animation: 'slide-up 0.25s ease forwards',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px', borderBottom: `1px solid rgba(255,255,255,0.08)`, direction: 'rtl',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>
                  {badgeFor.emp_id ? `بطاقة ${badgeFor.name}` : `بطاقات جميع الموظفين (${list.length})`}
                </div>
                <div style={{ fontSize: 10, color: C.whiteDD }}>يحتوي رمز QR على الرقم الوظيفي للتحقق من الكاميرا</div>
              </div>
              <button onClick={() => setBadgeFor(null)} style={{
                background: 'rgba(255,255,255,0.08)', border: 'none', color: C.white,
                width: 28, height: 28, borderRadius: 4, cursor: 'pointer', fontSize: 14,
              }}>✕</button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 20, background: '#111', display: 'flex', justifyContent: 'center' }}>
              <BadgeSheet id="athar-badge-sheet" employees={badgeList} codes={qrCodes} logo={atharLogo} />
            </div>

            <div style={{
              display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px',
              borderTop: `1px solid rgba(255,255,255,0.08)`, background: 'rgba(0,0,0,0.2)',
            }}>
              <OutlineBtn onClick={() => setBadgeFor(null)} style={{ fontSize: 12, padding: '8px 20px' }}>إغلاق</OutlineBtn>
              <Btn color="blue" style={{ fontSize: 12, padding: '8px 20px' }}
                onClick={() => { try { printReportElement('athar-badge-sheet') } catch (e: any) { alert(e.message) } }}>
                🖨️ طباعة
              </Btn>
              <Btn color="green" style={{ fontSize: 12, padding: '8px 20px' }}
                onClick={async () => {
                  setBadgeBusy('pdf')
                  try { await exportReportPDF('athar-badge-sheet', badgeFor.emp_id || 'ALL_BADGES') }
                  catch (e: any) { alert(e.message) }
                  finally { setBadgeBusy(null) }
                }}>
                {badgeBusy === 'pdf' ? '… جارٍ التصدير' : 'PDF ⬇ تصدير'}
              </Btn>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {!isLive() && (
        <div style={{
          margin: '14px 24px 0', padding: '10px 14px', borderRadius: 6, direction: 'rtl',
          background: 'rgba(249,169,0,0.10)', border: `1px solid ${C.yellow}55`, color: C.yellow, fontSize: 12,
        }}>
          قاعدة البيانات غير متصلة — تأكد من ملف <span className="mono">.env</span> ثم أعد تشغيل الخادم.
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>

        {/* ── Add form ────────────────────────────────────────────────── */}
        <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.blue}33`, padding: 18, direction: 'rtl', alignSelf: 'start' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 14 }}>إضافة موظف جديد</div>

          {([
            ['emp_id', 'الرقم الوظيفي *', 'EMP-1004'],
            ['name', 'الاسم الكامل *', 'محمد العلي'],
            ['role', 'المسمى الوظيفي', 'فني مختبر'],
            ['department', 'القسم', 'المعامل المركزية'],
          ] as const).map(([key, label, ph]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.whiteD, marginBottom: 5 }}>{label}</div>
              <input
                value={(form as any)[key] ?? ''}
                placeholder={ph}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{
                  width: '100%', padding: '9px 11px', fontSize: 13, borderRadius: 4,
                  background: 'rgba(0,0,0,0.35)', color: C.white,
                  border: `1px solid ${C.blue}44`, outline: 'none', direction: 'rtl',
                  fontFamily: key === 'emp_id' ? "'JetBrains Mono', monospace" : 'inherit',
                }} />
            </div>
          ))}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.whiteD, marginBottom: 5 }}>صورة الموظف (للتحقق)</div>
            <input type="file" accept="image/*"
              onChange={e => onPhoto(e.target.files?.[0] ?? null)}
              style={{ fontSize: 11, color: C.whiteD, width: '100%' }} />
            {preview && (
              <img src={preview} alt="" style={{
                marginTop: 10, width: 82, height: 82, objectFit: 'cover',
                borderRadius: 6, border: `1px solid ${C.green}66`,
              }} />
            )}
          </div>

          <Btn color="green" onClick={submit} style={{ width: '100%' }}>
            {saving ? 'جارٍ الحفظ…' : '+ حفظ في قاعدة البيانات'}
          </Btn>

          {msg && (
            <div style={{
              marginTop: 12, fontSize: 12, padding: '8px 11px', borderRadius: 4,
              color: msg.kind === 'ok' ? C.green : C.red,
              background: msg.kind === 'ok' ? 'rgba(35,127,82,0.12)' : 'rgba(165,32,25,0.12)',
              border: `1px solid ${msg.kind === 'ok' ? C.green : C.red}44`,
            }}>{msg.text}</div>
          )}
        </div>

        {/* ── Registry list ───────────────────────────────────────────── */}
        <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.blue}33`, padding: 18, direction: 'rtl' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>الموظفون المسجّلون</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {list.length > 0 && (
                <OutlineBtn style={{ fontSize: 10, padding: '5px 12px' }}
                  onClick={() => setBadgeFor({ emp_id: '', name: '' } as Employee)}>
                  🖨️ طباعة كل البطاقات
                </OutlineBtn>
              )}
              <Badge color="blue">{list.length} موظف</Badge>
            </div>
          </div>

          {loading ? (
            <div style={{ color: C.whiteD, fontSize: 12, padding: 20 }}>جارٍ التحميل…</div>
          ) : list.length === 0 ? (
            <div style={{ color: C.whiteDD, fontSize: 12, padding: 20, lineHeight: 1.9 }}>
              لا يوجد موظفون بعد. أضف أول موظف من النموذج على اليمين.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map(e => (
                <div key={e.emp_id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 10,
                  background: 'rgba(0,0,0,0.28)', borderRadius: 6, border: `1px solid ${C.blue}22`,
                }}>
                  {e.photo_url
                    ? <img src={e.photo_url} alt="" style={{ width: 42, height: 42, borderRadius: 5, objectFit: 'cover' }} />
                    : <div style={{
                        width: 42, height: 42, borderRadius: 5, background: `${C.blue}33`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, color: C.whiteD,
                      }}>{e.name?.[0] ?? '?'}</div>}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: C.white, fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 10, color: C.whiteDD, marginTop: 2 }}>
                      <span className="mono">{e.emp_id}</span>
                      {e.role ? ` · ${e.role}` : ''}{e.department ? ` · ${e.department}` : ''}
                    </div>
                  </div>
                  <Badge color={e.authorized ? 'green' : 'red'}>{e.authorized ? 'مصرح' : 'موقوف'}</Badge>
                  <button onClick={() => setBadgeFor(e)} title="عرض البطاقة" style={{
                    background: 'transparent', border: `1px solid ${C.green}66`, color: C.green,
                    borderRadius: 4, padding: '4px 9px', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                    fontFamily: "'IBM Plex Sans Arabic', sans-serif", whiteSpace: 'nowrap',
                  }}>بطاقة</button>
                  <button onClick={() => remove(e.emp_id)} title="حذف" style={{
                    background: 'transparent', border: `1px solid ${C.red}55`, color: C.red,
                    borderRadius: 4, width: 26, height: 26, cursor: 'pointer', fontSize: 13,
                  }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Settings UI atoms ────────────────────────────────────────────────────────
// Defined at module level on purpose: nesting them inside ScreenSettings made
// React treat them as brand-new component types on every render, unmounting
// and remounting each field — so inputs lost focus after a single keystroke.

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{
    background: C.card, borderRadius: 8, border: `1px solid ${C.blue}33`,
    padding: 18, direction: 'rtl', display: 'flex', flexDirection: 'column', gap: 12,
  }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{title}</div>
    <Divider />
    {children}
  </div>
)

const Toggle = ({ on, onChange, label, hint }: {
  on: boolean; onChange: (v: boolean) => void; label: string; hint?: string
}) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, color: C.white }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: C.whiteDD, marginTop: 2, lineHeight: 1.6 }}>{hint}</div>}
    </div>
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{
      width: 46, height: 25, borderRadius: 13, flexShrink: 0, cursor: 'pointer',
      background: on ? C.green : 'rgba(255,255,255,0.14)',
      border: `1px solid ${on ? C.green : 'rgba(255,255,255,0.2)'}`,
      position: 'relative', transition: 'all 0.2s ease',
    }}>
      <div style={{
        position: 'absolute', top: 2, [on ? 'left' : 'right']: 3,
        width: 17, height: 17, borderRadius: '50%', background: '#fff',
        transition: 'all 0.2s ease',
      } as React.CSSProperties} />
    </button>
  </div>
)

const StatusRow = ({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
    <div style={{
      width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
      background: ok === null ? C.whiteDD : ok ? C.green : C.red,
      boxShadow: ok ? `0 0 7px ${C.green}` : 'none',
    }} />
    <div style={{ flex: 1, color: C.white }}>{label}</div>
    <div style={{ fontSize: 10, color: ok === null ? C.whiteDD : ok ? C.green : C.red, fontFamily: "'JetBrains Mono', monospace" }}>
      {detail}
    </div>
  </div>
)

const Num = ({ label, value, min, max, step, onChange, suffix }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; suffix?: string
}) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
      <span style={{ color: C.whiteD }}>{label}</span>
      <span className="mono" style={{ color: C.green }}>{suffix === '%' ? Math.round(value * 100) + '%' : value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{ width: '100%', accentColor: C.green }} />
  </div>
)


// ═══════════════════════════════════════════════════════════════════════════
//  ScreenSettings — الإعدادات
// ═══════════════════════════════════════════════════════════════════════════

function ScreenSettings() {
  const st = useSettings()
  const session = useSession()
  const [cams, setCams] = useState<CamDevice[]>([])
  const [empCount, setEmpCount] = useState<number | null>(null)
  const [camOk, setCamOk] = useState<boolean | null>(null)
  const [advanced, setAdvanced] = useState(st.sensitivity === 'custom')

  useEffect(() => {
    listCameras().then(setCams)
    fetchEmployees().then(l => setEmpCount(l.length)).catch(() => setEmpCount(null))
    // A quick probe so the status panel reflects reality, not assumptions.
    openCamera(st.facingMode, st.cameraId || undefined).then(({ stream, error }) => {
      setCamOk(!error && !!stream)
      stream?.getTracks().forEach(t => t.stop())
    })
  }, [st.cameraId, st.facingMode])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg }}>
      <SystemHeader title="الإعدادات" subtitle="SYSTEM SETTINGS" screen={8} />

      <div style={{
        flex: 1, overflow: 'auto', padding: 20,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
        gap: 16, alignContent: 'start',
      }}>

        {/* ── Detection master switch + sensitivity ─────────────────── */}
        <Card title="الكشف والحساسية">
          <Toggle
            on={st.detectionEnabled}
            onChange={v => updateSettings({ detectionEnabled: v })}
            label="تشغيل الكشف التلقائي"
            hint="أطفئه أثناء التجهيز، وشغّله وقت العرض. الكاميرا تبقى تعمل في الحالتين."
          />
          <Toggle
            on={st.soundEnabled}
            onChange={v => { updateSettings({ soundEnabled: v }); if (v) beep() }}
            label="نغمة تنبيه عند الكشف"
          />

          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: C.whiteD, marginBottom: 7 }}>مستوى الحساسية</div>
            <div style={{ display: 'flex', gap: 7 }}>
              {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map(k => {
                const active = st.sensitivity === k
                return (
                  <button key={k} onClick={() => { updateSettings({ sensitivity: k as Sensitivity }); setAdvanced(false) }}
                    style={{
                      flex: 1, padding: '9px 6px', borderRadius: 5, cursor: 'pointer',
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                      background: active ? C.green : 'transparent',
                      color: active ? C.bg : C.white,
                      border: `1px solid ${active ? C.green : C.blue + '55'}`,
                      transition: 'all 0.18s ease',
                    }}>{PRESETS[k].label}</button>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: C.whiteDD, marginTop: 8, lineHeight: 1.7, minHeight: 30 }}>
              {st.sensitivity === 'custom' ? 'إعدادات مخصّصة.' : PRESETS[st.sensitivity as keyof typeof PRESETS].hint}
            </div>
          </div>

          <button onClick={() => setAdvanced(a => !a)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 11, color: C.blue, textAlign: 'right',
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }}>
            {advanced ? '▲ إخفاء الإعدادات المتقدمة' : '▼ إعدادات متقدمة'}
          </button>

          {advanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
              <Num label="أقل ثقة مقبولة" value={st.minConfidence} min={0.5} max={0.99} step={0.01} suffix="%"
                onChange={v => updateSettings({ sensitivity: 'custom', minConfidence: v })} />
              <Num label="أقل نسبة تغيّر تُعتبر تحريكاً" value={st.displacementRatio} min={0.01} max={0.2} step={0.005} suffix="%"
                onChange={v => updateSettings({ sensitivity: 'custom', displacementRatio: v })} />
              <Num label="عدد الإطارات المتتالية للتأكيد" value={st.displacementFrames} min={2} max={8} step={1}
                onChange={v => updateSettings({ sensitivity: 'custom', displacementFrames: v })} />
              <Num label="ثقة كشف الأشخاص" value={st.personScore} min={0.4} max={0.95} step={0.05} suffix="%"
                onChange={v => updateSettings({ sensitivity: 'custom', personScore: v })} />
            </div>
          )}
        </Card>

        {/* ── Camera selection ──────────────────────────────────────── */}
        <Card title="الكاميرا">
          <div style={{ fontSize: 10, color: C.whiteDD, lineHeight: 1.7 }}>
            اختر الكاميرا المستخدمة للمراقبة. كاميرا USB على ستاند تظهر هنا بعد توصيلها.
          </div>

          {cams.length === 0 ? (
            <div style={{ fontSize: 11, color: C.yellow, direction: 'rtl' }}>
              لم يُعثر على كاميرات. وصّل الكاميرا واسمح بالإذن ثم اضغط تحديث.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[{ id: '', label: 'تلقائي (يختار المتصفح)' }, ...cams].map(cam => {
                const active = st.cameraId === cam.id
                return (
                  <button key={cam.id || 'auto'} onClick={() => updateSettings({ cameraId: cam.id })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px',
                      borderRadius: 5, cursor: 'pointer', textAlign: 'right', direction: 'rtl',
                      background: active ? C.greenDim : 'rgba(0,0,0,0.25)',
                      border: `1px solid ${active ? C.green : C.blue + '33'}`,
                      color: C.white, fontSize: 11,
                      fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                    }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: active ? C.green : 'transparent',
                      border: `1px solid ${active ? C.green : C.whiteDD}`,
                    }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cam.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, color: C.whiteD, marginBottom: 7 }}>اتجاه الكاميرا (للأجهزة اللوحية)</div>
            <div style={{ display: 'flex', gap: 7 }}>
              {([['environment', 'الخلفية'], ['user', 'الأمامية']] as const).map(([v, label]) => {
                const active = st.facingMode === v
                return (
                  <button key={v} onClick={() => updateSettings({ facingMode: v })} style={{
                    flex: 1, padding: '9px 6px', borderRadius: 5, cursor: 'pointer',
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                    background: active ? C.green : 'transparent',
                    color: active ? C.bg : C.white,
                    border: `1px solid ${active ? C.green : C.blue + '55'}`,
                  }}>{label}</button>
                )
              })}
            </div>
          </div>

          <OutlineBtn style={{ fontSize: 11, padding: '7px 12px' }}
            onClick={() => listCameras().then(setCams)}>↻ تحديث قائمة الكاميرات</OutlineBtn>
        </Card>

        {/* ── System status ─────────────────────────────────────────── */}
        <Card title="حالة النظام">
          <StatusRow label="قاعدة البيانات (Supabase)" ok={isLive()} detail={isLive() ? 'متصلة' : 'غير متصلة'} />
          <StatusRow label="الكاميرا" ok={camOk} detail={camOk === null ? 'جارٍ الفحص' : camOk ? 'تعمل' : 'لا تعمل'} />
          <StatusRow label="نموذج كشف الأشخاص" ok={getModelState() === 'ready'}
            detail={getModelState() === 'ready' ? 'محمّل' : 'وضع الحركة + QR'} />
          <StatusRow label="سجل الموظفين" ok={empCount !== null && empCount > 0}
            detail={empCount === null ? '—' : `${empCount} موظف`} />
          <StatusRow label="الكشف التلقائي" ok={st.detectionEnabled}
            detail={st.detectionEnabled ? 'يعمل' : 'متوقف'} />

          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.whiteD }}>
            <span>أحداث الجلسة الحالية</span>
            <span className="mono" style={{ color: C.white }}>{session.events.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.whiteD }}>
            <span>صور الأدلة</span>
            <span className="mono" style={{ color: C.white }}>{session.captures.length}</span>
          </div>

          {getModelState() !== 'ready' && (
            <div style={{
              fontSize: 10, color: C.blue, lineHeight: 1.8, padding: '8px 10px',
              background: C.blueDim, borderRadius: 4, border: `1px solid ${C.blue}44`,
            }}>
              لتفعيل كشف الأشخاص بالاسم، شغّل مرة واحدة في الطرفية:
              <div className="mono" style={{ color: C.white, marginTop: 4, direction: 'ltr', textAlign: 'left' }}>
                npm run download-model
              </div>
            </div>
          )}
        </Card>

        {/* ── Facility details ──────────────────────────────────────── */}
        <Card title="بيانات المنشأة">
          <div style={{ fontSize: 10, color: C.whiteDD, lineHeight: 1.7 }}>
            تظهر هذه البيانات في ترويسة التقارير المطبوعة.
          </div>
          {([['facilityName', 'اسم الجهة'], ['facilityUnit', 'الوحدة']] as const).map(([k, label]) => (
            <div key={k}>
              <div style={{ fontSize: 10, color: C.whiteD, marginBottom: 5 }}>{label}</div>
              <input value={st[k]} onChange={e => updateSettings({ [k]: e.target.value } as any)}
                style={{
                  width: '100%', padding: '9px 11px', fontSize: 12, borderRadius: 4,
                  background: 'rgba(0,0,0,0.35)', color: C.white,
                  border: `1px solid ${C.blue}44`, outline: 'none', direction: 'rtl',
                }} />
            </div>
          ))}

          <Divider />
          <OutlineBtn style={{ fontSize: 11, padding: '7px 12px' }}
            onClick={() => { if (confirm('استعادة كل الإعدادات الافتراضية؟')) resetSettings() }}>
            ↺ استعادة الإعدادات الافتراضية
          </OutlineBtn>
        </Card>
      </div>
    </div>
  )
}

// ─── Global styles (fonts, keyframes, scrollbar) ─────────────────────────────

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');

      .athar-root, .athar-root * {
        box-sizing: border-box;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      .athar-root {
        font-family: 'IBM Plex Sans Arabic', 'Inter', sans-serif;
      }
      .athar-root ::-webkit-scrollbar { width: 5px; height: 5px; }
      .athar-root ::-webkit-scrollbar-track { background: transparent; }
      .athar-root ::-webkit-scrollbar-thumb { background: rgba(35,127,82,0.4); border-radius: 3px; }

      @keyframes pulse-green {
        0%, 100% { box-shadow: 0 0 0 0 rgba(35,127,82,0.5); }
        50% { box-shadow: 0 0 0 8px rgba(35,127,82,0); }
      }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      @keyframes screen-enter {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes slide-up {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* ── شاشة الدخول — تخطيط يتكيّف مع الجوال واللوحي ── */
      .login-wrap {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        align-content: center;
        gap: clamp(18px, 4vw, 48px);
        padding: clamp(14px, 4vw, 32px);
        position: relative;
      }
      .login-brand {
        flex: 1 1 240px;
        max-width: 320px;
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 20px;
        align-items: center;
      }
      .login-brand-logo {
        width: min(240px, 46vw);
        height: auto;
        aspect-ratio: 1 / 1;
      }
      .login-card {
        flex: 1 1 300px;
        max-width: 380px;
        width: 100%;
      }
      /* على الجوال: بطاقة الدخول أولاً، والشعار تحتها */
      @media (max-width: 760px) {
        .login-card  { order: 1; }
        .login-brand { order: 2; }
      }

      .pulse-green { animation: pulse-green 2s ease-in-out infinite; }
      .blink { animation: blink 1.2s ease-in-out infinite; }
      .fade-in { animation: fade-in 0.5s ease forwards; }
      .slide-up { animation: slide-up 0.4s ease forwards; }
      .screen-enter { animation: screen-enter 0.28s cubic-bezier(0.25,0.46,0.45,0.94) forwards; }
      .mono { font-family: 'JetBrains Mono', monospace; }
    `}</style>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  App shell — a real multi-page website: top nav, no swiping, no arrows.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//  App shell — flow driven by the chosen session type
// ═══════════════════════════════════════════════════════════════════════════

type Step = 'home' | 'data' | 'capture' | 'report' | 'custody' | 'handover'

const TABS = [
  { key: 'session',   label: 'جلسة جديدة' },
  { key: 'compare',   label: 'المقارنة' },
  { key: 'archive',   label: 'السجل' },
  { key: 'employees', label: 'الموظفون' },
  { key: 'settings',  label: 'الإعدادات' },
]

export default function App() {
  const [tab, setTab] = useState(0)
  const [loggedIn, setLoggedIn] = useState(false)
  const [officerVersion, setOfficerVersion] = useState(0)
  const [personnelUnlocked, setPersonnelUnlocked] = useState(false)

  // ── session flow state ──────────────────────────────────────────────
  const [step, setStep] = useState<Step>('home')
  const [kind, setKind] = useState<SessionKind>('document')
  const [draft, setDraft] = useState<SessionDraft>({})
  const [startedAt, setStartedAt] = useState(0)
  const [report, setReport] = useState<ReportData | null>(null)

  const goTab = useCallback((i: number) => {
    setTab(i)
    window.scrollTo({ top: 0 })
  }, [])

  const resetFlow = () => { setStep('home'); setDraft({}); setReport(null) }

  const finish = (primary: Capture, after?: Capture) => {
    setReport({
      kind,
      assetName: draft.assetName ?? '—',
      location: draft.location ?? '—',
      officer: { name: OFFICER.name, id: OFFICER.id, unit: OFFICER.unit, role: OFFICER.role },
      startedAt: startedAt || primary.at,
      endedAt: Date.now(),
      fromParty: draft.fromParty,
      toParty: draft.toParty,
      expectedCount: draft.expectedCount,
      severity: draft.severity,
      description: draft.description,
      notes: draft.notes,
      shot: primary.shot,
      shotAfter: after?.shot,
      items: primary.items,
      total: primary.total,
    })
    setStep('report')
  }

  // ── login gate ──────────────────────────────────────────────────────
  if (!loggedIn) {
    return (
      <div className="athar-root" style={{ minHeight: '100vh', background: C.bg }}>
        <GlobalStyles />
        <Screen1
          onNext={() => {}}
          onOfficerLoaded={() => { setOfficerVersion(v => v + 1); setLoggedIn(true) }}
        />
      </div>
    )
  }

  const sessionFlow = () => {
    switch (step) {
      case 'home':
        return <ScreenHome
          officer={{ name: OFFICER.name, id: OFFICER.id }}
          onPick={k => { setKind(k); setDraft({}); setStartedAt(Date.now()); setStep('data') }}
          onCustody={() => setStep('custody')}
          onHandover={() => setStep('handover')} />
      case 'custody':
        return <ScreenCustody officer={{
          name: OFFICER.name, id: OFFICER.id,
          unit: OFFICER.unit, role: OFFICER.role,
        }} />
      case 'handover':
        return <ScreenHandover officer={{
          name: OFFICER.name, id: OFFICER.id,
          unit: OFFICER.unit, role: OFFICER.role,
        }} />
      case 'data':
        return <ScreenSessionData
          kind={kind}
          officer={{ name: OFFICER.name, id: OFFICER.id }}
          onBack={() => setStep('home')}
          onNext={d => { setDraft(d); setStep('capture') }} />
      case 'capture':
        return <ScreenCapture
          kind={kind}
          onBack={() => setStep('data')}
          onDone={finish} />
      case 'report':
        return report
          ? <ScreenReport
              data={report}
              logo={atharLogo}
              onHome={resetFlow}
              onCompare={() => { resetFlow(); goTab(1) }} />
          : null
    }
  }

  const renderTab = () => {
    switch (tab) {
      case 0: return sessionFlow()
      case 1: return <ScreenCompare />
      case 2: return <ScreenArchive onCompare={() => goTab(1)} />
      case 3: return (
        <LockGate
          title="سجل الموظفين"
          note="بيانات الموظفين محمية. أدخل رقم المشرف للمتابعة."
          unlocked={personnelUnlocked}
          onUnlock={() => setPersonnelUnlocked(true)}
        >
          <ScreenEmployees />
        </LockGate>
      )
      case 4: return <ScreenSettings />
      default: return null
    }
  }

  return (
    <div className="athar-root" style={{
      minHeight: '100vh', width: '100%', background: C.bg,
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      <GlobalStyles />

      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `radial-gradient(circle at 85% 8%, ${C.greenGlow} 0%, transparent 42%),
          radial-gradient(circle at 10% 92%, rgba(0,83,135,0.10) 0%, transparent 45%)`,
      }} />

      {/* ── navigation ───────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 12px', minHeight: 52,
        background: 'rgba(16,16,16,0.94)',
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        overflowX: 'auto', direction: 'rtl',
      }}>
        <img src={atharLogo} alt="ATHAR" style={{ height: 24, marginLeft: 10, objectFit: 'contain', flexShrink: 0 }} />
        {TABS.map((t, i) => {
          const active = i === tab
          return (
            <button key={t.key} onClick={() => { if (i === 0) resetFlow(); goTab(i) }} style={{
              padding: '7px 13px', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0,
              fontSize: 12, fontWeight: active ? 700 : 500,
              fontFamily: "'IBM Plex Sans Arabic', sans-serif",
              color: active ? C.bg : C.white,
              background: active ? C.green : 'transparent',
              border: `1px solid ${active ? C.green : 'transparent'}`,
              cursor: 'pointer', transition: 'all 0.18s ease',
            }}>{t.label}</button>
          )
        })}
        <div style={{ flex: 1 }} />
        <NavClock />
      </nav>

      <main key={`${tab}-${step}-${officerVersion}`} className="screen-enter" style={{
        flex: 1, position: 'relative',
        maxWidth: '1320px', width: '100%', margin: '0 auto', padding: 'clamp(6px, 1.4vw, 16px)',
        boxSizing: 'border-box',
      }}>
        <div style={{
          borderRadius: 10, overflow: 'hidden', minHeight: 'calc(100vh - 110px)',
          border: '1px solid rgba(0,83,135,0.25)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
        }}>
          {renderTab()}
        </div>
      </main>
    </div>
  )
}

/** Small live clock pinned to the navigation bar. */
function NavClock() {
  const { time, dateEn } = useClock()
  return (
    <div style={{ textAlign: 'left', direction: 'ltr', paddingRight: 8, flexShrink: 0 }}>
      <div className="mono" style={{ fontSize: 12.5, color: C.green, fontWeight: 600, lineHeight: 1.2 }}>{time}</div>
      <div style={{ fontSize: 8.5, color: C.whiteDD, letterSpacing: '0.05em' }}>{dateEn}</div>
    </div>
  )
}
