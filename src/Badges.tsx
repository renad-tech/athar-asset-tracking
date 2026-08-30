// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — بطاقات الموظفين مع رمز QR                                      ║
// ║                                                                          ║
// ║  Each badge encodes the employee's emp_id in a QR code. When Phase 3     ║
// ║  turns the camera on, scanning this badge looks the ID up in Supabase    ║
// ║  and the person becomes "مصرح له — <name>" instead of "مجهول".          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Employee } from './services/api'

const GREEN = '#237F52'
const BLUE = '#005387'
const INK = '#1a1a1a'
const MUTED = '#6b6b6b'

/** Standard ID-1 card: 85.6 × 54 mm. At 96dpi that's ~324 × 204 px. */
export const BADGE_W = 324
export const BADGE_H = 212

/** Generates QR data URLs for a list of employees (one per emp_id). */
export function useQRCodes(employees: Employee[]) {
  const [codes, setCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const ids = employees.map(e => e.emp_id).filter(Boolean)
    if (!ids.length) { setCodes({}); return }

    Promise.all(ids.map(async id => {
      // High error correction so the badge still scans if it gets scuffed.
      const url = await QRCode.toDataURL(id, {
        margin: 0, width: 320, errorCorrectionLevel: 'H',
        color: { dark: '#000000', light: '#ffffff' },
      })
      return [id, url] as const
    })).then(pairs => {
      if (!cancelled) setCodes(Object.fromEntries(pairs))
    }).catch(err => console.error('[ATHAR] QR generation failed:', err))

    return () => { cancelled = true }
  }, [employees.map(e => e.emp_id).join(',')])

  return codes
}

/** A single printable badge. */
export function Badge({ emp, qr, logo }: { emp: Employee; qr?: string; logo: string }) {
  return (
    <div style={{
      width: BADGE_W, height: BADGE_H, background: '#ffffff', color: INK,
      border: `1px solid #cfcfcf`, borderRadius: 8, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      fontFamily: "'IBM Plex Sans Arabic', 'Inter', sans-serif",
      pageBreakInside: 'avoid', breakInside: 'avoid',
    }}>

      {/* Header strip */}
      <div style={{
        background: GREEN, color: '#fff', padding: '7px 10px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        direction: 'rtl', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={logo} alt="" style={{ height: 26, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.6 }}>أثر — ATHAR</div>
            <div style={{ fontSize: 6.5, opacity: 0.9, lineHeight: 1.6 }}>أمن السلامة والجودة الجامعية</div>
          </div>
        </div>
        <div style={{ fontSize: 6.5, letterSpacing: '0.08em', opacity: 0.95 }}>STAFF ID</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', direction: 'rtl', padding: 9, gap: 9, minHeight: 0 }}>

        {/* Photo */}
        {emp.photo_url ? (
          <img src={emp.photo_url} alt="" crossOrigin="anonymous" style={{
            width: 58, height: 72, objectFit: 'cover', borderRadius: 4,
            border: `1px solid #ddd`, flexShrink: 0,
          }} />
        ) : (
          <div style={{
            width: 58, height: 72, borderRadius: 4, background: '#f0f0f0',
            border: `1px solid #ddd`, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, color: '#bbb', fontWeight: 700,
          }}>{emp.name?.[0] ?? '?'}</div>
        )}

        {/* Details */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/*
            Arabic glyphs sit taller than the Latin box model expects. A tight
            line-height plus overflow:hidden clipped the name top and bottom,
            so we give it room and only clip horizontally.
          */}
          <div style={{
            fontSize: 13, fontWeight: 700, lineHeight: 1.75,
            whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflowX: 'hidden', overflowY: 'visible',
          }}>{emp.name}</div>
          {emp.role && <div style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.7 }}>{emp.role}</div>}
          {emp.department && <div style={{ fontSize: 8, color: MUTED, lineHeight: 1.7 }}>{emp.department}</div>}

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 6.5, color: MUTED, letterSpacing: '0.06em', lineHeight: 1.8 }}>الرقم الوظيفي</div>
            <div style={{
              fontFamily: 'monospace', fontSize: 13, fontWeight: 700, lineHeight: 1.4,
              color: BLUE, direction: 'ltr', textAlign: 'right', letterSpacing: '0.02em',
            }}>{emp.emp_id}</div>
          </div>
        </div>

        {/* QR */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {qr
            ? <img src={qr} alt={emp.emp_id} style={{ width: 66, height: 66, display: 'block' }} />
            : <div style={{
                width: 66, height: 66, border: '1px dashed #ccc', borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, color: '#bbb',
              }}>…</div>}
          <div style={{ fontSize: 5.5, color: MUTED, letterSpacing: '0.04em' }}>SCAN TO VERIFY</div>
        </div>
      </div>

      {/* Footer strip */}
      <div style={{
        background: '#f5f5f5', borderTop: `1px solid #e5e5e5`,
        padding: '5px 10px 6px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', direction: 'rtl', flexShrink: 0,
      }}>
        <div style={{ fontSize: 6.5, color: MUTED, lineHeight: 1.7 }}>
          {emp.authorized === false ? 'موقوف — غير مصرح' : 'مصرح له بدخول الحرم الجامعي'}
        </div>
        <div style={{
          fontSize: 6.5, fontWeight: 700, lineHeight: 1.7,
          color: emp.authorized === false ? '#A52019' : GREEN,
        }}>
          {emp.authorized === false ? '● SUSPENDED' : '● ACTIVE'}
        </div>
      </div>
    </div>
  )
}

/** An A4 sheet holding up to 10 badges (2 columns × 5 rows) for batch printing. */
export function BadgeSheet({ employees, codes, logo, id }: {
  employees: Employee[]
  codes: Record<string, string>
  logo: string
  id?: string
}) {
  return (
    <div id={id} style={{
      width: 794, background: '#fff', padding: 24, boxSizing: 'border-box',
      display: 'grid', gridTemplateColumns: `repeat(2, ${BADGE_W}px)`,
      gap: 14, justifyContent: 'center', alignContent: 'start',
    }}>
      {employees.map(e => (
        <Badge key={e.emp_id} emp={e} qr={codes[e.emp_id]} logo={logo} />
      ))}
    </div>
  )
}
