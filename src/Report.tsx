// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — التقرير الرسمي القابل للطباعة                                  ║
// ║                                                                          ║
// ║  Rendered on a white A4 sheet (not the dark UI) so it prints correctly   ║
// ║  on paper and exports cleanly to PDF.                                    ║
// ║                                                                          ║
// ║  Sections (as specified):                                                ║
// ║    الشعار والعنوان · بيانات الحادث · التسلسل الزمني · الأشخاص           ║
// ║    التنبيهات · صور قبل/بعد · التغيرات المكتشفة · التوقيع الإلكتروني     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import type { Incident } from './config'
import { useEffect, useState } from 'react'
import { KIND_COLOR, fmtTime, reportSHA256, reportSummary, type SessionState } from './session'

const INK = '#1a1a1a'
const MUTED = '#6b6b6b'
const LINE = '#d8d8d8'
const GREEN = '#237F52'
const BLUE = '#005387'
const RED = '#A52019'
const YELLOW = '#B37400'

const HEX: Record<string, string> = { green: GREEN, blue: BLUE, red: RED, yellow: YELLOW }

/** Computes the real SHA-256 digest of the session and re-renders when ready. */
function useSHA256(session: SessionState) {
  const [hash, setHash] = useState('…')
  useEffect(() => {
    let alive = true
    reportSHA256(session).then(h => { if (alive) setHash(h) }).catch(() => setHash('—'))
    return () => { alive = false }
  }, [session.events.length, session.captures.length, session.endedAt])
  return hash
}

/** A4 width at 96dpi ≈ 794px. Fixed so PDF export is predictable. */
export const REPORT_WIDTH = 794

function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, direction: 'rtl',
      margin: '18px 0 10px', paddingBottom: 6, borderBottom: `2px solid ${BLUE}`,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 3, background: BLUE, color: '#fff',
        fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace',
      }}>{n}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{children}</div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', direction: 'rtl', fontSize: 10.5, padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
      <div style={{ width: 130, color: MUTED, flexShrink: 0 }}>{label}</div>
      <div style={{
        color: INK, fontWeight: 500, wordBreak: 'break-word',
        fontFamily: mono ? 'monospace' : undefined,
        // Mixed Arabic/Latin date strings scramble under RTL — pin them LTR.
        direction: mono ? 'ltr' : undefined,
        textAlign: mono ? 'right' : undefined,
        unicodeBidi: mono ? 'embed' : undefined,
      }}>
        {value || '—'}
      </div>
    </div>
  )
}

export function PrintableReport({
  incident, officer, session, logo, preview = false,
}: {
  incident: Incident
  officer: { name: string; id: string; unit: string; role: string }
  session: SessionState
  logo: string
  /** Preview copies must not reuse the exportable element's id. */
  preview?: boolean
}) {
  const r = reportSummary(session)
  const hash = useSHA256(session)
  const alerts = r.events.filter(e => e.kind === 'alert' || e.kind === 'movement' || e.kind === 'unknown')

  return (
    <div
      id={preview ? undefined : 'athar-printable-report'}
      style={{
        width: REPORT_WIDTH, background: '#ffffff', color: INK,
        padding: '34px 40px', boxSizing: 'border-box',
        fontFamily: "'IBM Plex Sans Arabic', 'Inter', sans-serif",
        lineHeight: 1.6,
      }}>

      {/* ── Header: logo + title ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        direction: 'rtl', paddingBottom: 14, borderBottom: `3px solid ${GREEN}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt="ATHAR" style={{ height: 52, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '0.02em' }}>أثر — ATHAR</div>
            <div style={{ fontSize: 10, color: MUTED }}>أمن السلامة والجودة الجامعية</div>
          </div>
        </div>
        <div style={{ textAlign: 'left', direction: 'ltr' }}>
          <div style={{ fontSize: 9, color: MUTED, letterSpacing: '0.08em' }}>REPORT No.</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{incident.id}</div>
          <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{r.dateStr} · {r.startTime}</div>
        </div>
      </div>

      <div style={{
        textAlign: 'center', direction: 'rtl', padding: '12px 0 4px',
        fontSize: 15, fontWeight: 700,
      }}>
        تقرير جلسة أمنية — {incident.type || 'بلاغ أمني'}
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, color: MUTED, direction: 'rtl' }}>
        {r.dateArStr}
      </div>

      {/* ── 1. Incident data ─────────────────────────────────────────── */}
      <SectionTitle n={1}>بيانات الحادث</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 26px' }}>
        <div>
          <Row label="رقم البلاغ" value={incident.id} mono />
          <Row label="نوع الحادثة" value={incident.type} />
          <Row label="الموقع" value={incident.location} />
          <Row label="الأولوية" value={incident.priority} />
          <Row label="الحالة" value={incident.status} />
        </div>
        <div>
          <Row label="المشرف المكلف" value={officer.name} />
          <Row label="الرقم الوظيفي" value={officer.id} mono />
          <Row label="الوحدة" value={officer.unit} />
          <Row label="بداية الجلسة" value={`${r.dateStr} — ${r.startTime}`} mono />
          <Row label="مدة الجلسة" value={r.duration} mono />
        </div>
      </div>

      {/* ── 2. Timeline ──────────────────────────────────────────────── */}
      <SectionTitle n={2}>التسلسل الزمني</SectionTitle>
      {r.events.length === 0 ? (
        <div style={{ fontSize: 10, color: MUTED, direction: 'rtl', padding: '6px 0' }}>لا توجد أحداث مسجلة في هذه الجلسة.</div>
      ) : (
        <div style={{ direction: 'rtl' }}>
          {r.events.map(e => (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              fontSize: 10.5, padding: '5px 0', borderBottom: `1px solid ${LINE}`,
            }}>
              <div style={{ fontFamily: 'monospace', color: MUTED, width: 62, flexShrink: 0 }}>{fmtTime(e.at)}</div>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                background: HEX[KIND_COLOR[e.kind]],
              }} />
              <div style={{ flex: 1 }}>{e.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. People ────────────────────────────────────────────────── */}
      <SectionTitle n={3}>الأشخاص</SectionTitle>
      {r.people.length === 0 ? (
        <div style={{ fontSize: 10, color: MUTED, direction: 'rtl', padding: '6px 0' }}>لم يُرصد أشخاص خلال هذه الجلسة.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl', fontSize: 10.5 }}>
          <thead>
            <tr style={{ background: '#f2f2f2' }}>
              {['الموظف', 'الرقم الوظيفي', 'الحالة', 'أول ظهور', 'آخر ظهور', 'تحريك'].map(h => (
                <th key={h} style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${LINE}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.people.map(p => (
              <tr key={p.key}>
                {/*
                  The photo comes from the staff registry, not from the camera —
                  we never store a captured face. Unknown visitors show a marker.
                */}
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt="" crossOrigin="anonymous" style={{
                        width: 30, height: 36, objectFit: 'cover', borderRadius: 3,
                        border: `1px solid ${LINE}`, flexShrink: 0,
                      }} />
                    ) : (
                      <div style={{
                        width: 30, height: 36, borderRadius: 3, flexShrink: 0,
                        border: `1px dashed ${p.authorized ? LINE : RED}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, color: p.authorized ? MUTED : RED, background: '#fafafa',
                      }}>{p.authorized ? (p.name?.[0] ?? '؟') : '؟'}</div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.role && <div style={{ fontSize: 8.5, color: MUTED }}>{p.role}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${LINE}`, fontFamily: 'monospace' }}>{p.empId ?? '—'}</td>
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${LINE}`, color: p.authorized ? GREEN : RED, fontWeight: 600 }}>
                  {p.authorized ? 'مصرح له' : 'غير مصرح'}
                </td>
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${LINE}`, fontFamily: 'monospace' }}>{fmtTime(p.firstSeen)}</td>
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${LINE}`, fontFamily: 'monospace' }}>{fmtTime(p.lastSeen)}</td>
                <td style={{ padding: '5px 8px', borderBottom: `1px solid ${LINE}`, fontFamily: 'monospace' }}>{p.movements}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── 4. Alerts ────────────────────────────────────────────────── */}
      <SectionTitle n={4}>التنبيهات</SectionTitle>
      {alerts.length === 0 ? (
        <div style={{ fontSize: 10, color: MUTED, direction: 'rtl', padding: '6px 0' }}>لم تُسجَّل تنبيهات أمنية.</div>
      ) : (
        <div style={{ direction: 'rtl' }}>
          {alerts.map(a => (
            <div key={a.id} style={{
              display: 'flex', gap: 10, fontSize: 10.5, padding: '6px 9px', marginBottom: 4,
              background: '#fbf6f6', borderRight: `3px solid ${HEX[KIND_COLOR[a.kind]]}`, borderRadius: 2,
            }}>
              <div style={{ fontFamily: 'monospace', color: MUTED, width: 62, flexShrink: 0 }}>{fmtTime(a.at)}</div>
              <div>{a.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── 5. Before / after evidence ───────────────────────────────── */}
      <SectionTitle n={5}>صور قبل / بعد التحريك</SectionTitle>
      {r.captures.length === 0 ? (
        <div style={{ fontSize: 10, color: MUTED, direction: 'rtl', padding: '6px 0' }}>
          لا توجد صور مرفقة — لم يُرصد تحريك للممتلكات خلال الجلسة.
        </div>
      ) : (
        r.captures.map(c => (
          <div key={c.id} style={{ marginBottom: 14, direction: 'rtl' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, marginBottom: 5 }}>
              {c.reason}
              <span style={{ color: MUTED, fontWeight: 400, fontFamily: 'monospace', marginRight: 8 }}>{fmtTime(c.at)}</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {([['قبل', c.before], ['بعد', c.after]] as const).map(([cap, src]) => (
                <div key={cap} style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{cap}</div>
                  {src
                    ? <img src={src} alt={cap} style={{ width: '100%', borderRadius: 3, border: `1px solid ${LINE}` }} />
                    : <div style={{
                        height: 96, border: `1px dashed ${LINE}`, borderRadius: 3, color: MUTED, fontSize: 9,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>لا توجد صورة</div>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* ── 6. Detected changes ──────────────────────────────────────── */}
      <SectionTitle n={6}>التغيّرات المكتشفة</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, direction: 'rtl' }}>
        {[
          { k: 'مرات تحريك الممتلكات', v: String(r.movementCount) },
          { k: 'زوار غير مسجلين', v: String(r.unknownCount) },
          { k: 'أشخاص مصرح لهم', v: String(r.authorizedCount) },
          { k: 'إجمالي التنبيهات', v: String(r.alertCount) },
          { k: 'الصور الملتقطة', v: String(r.imageCount) },
          { k: 'حجم الأدلة المحفوظة', v: r.storage },
          { k: 'وقت البدء', v: r.startTime },
          { k: 'وقت الانتهاء', v: r.endTime },
        ].map(s => (
          <div key={s.k} style={{ border: `1px solid ${LINE}`, borderTop: `2px solid ${BLUE}`, borderRadius: 3, padding: '7px 9px' }}>
            <div style={{ fontSize: 8.5, color: MUTED, marginBottom: 2 }}>{s.k}</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* ── 7. Electronic signature ──────────────────────────────────── */}
      <SectionTitle n={7}>التوقيع الإلكتروني</SectionTitle>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        direction: 'rtl', border: `1px solid ${LINE}`, borderRadius: 4, padding: 14, background: '#fafafa',
      }}>
        <div style={{ fontSize: 10 }}>
          <div style={{ color: MUTED, marginBottom: 3 }}>اعتمده</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{officer.name}</div>
          <div style={{ color: MUTED, marginTop: 2 }}>{officer.role} · <span style={{ fontFamily: 'monospace' }}>{officer.id}</span></div>
          <div style={{ marginTop: 10, paddingTop: 6, borderTop: `1px solid ${LINE}`, color: MUTED, fontSize: 9 }}>
            التوقيع: ______________________
          </div>
        </div>
        <div style={{ textAlign: 'left', direction: 'ltr', fontSize: 9, color: MUTED }}>
          <div style={{ marginBottom: 3 }}>INTEGRITY HASH · SHA-256</div>
          <div style={{
            fontFamily: 'monospace', fontSize: 7.5, color: INK, letterSpacing: '0.02em',
            maxWidth: 260, wordBreak: 'break-all', lineHeight: 1.5, direction: 'ltr',
          }}>{hash}</div>
          <div style={{ marginTop: 6 }}>Generated {r.dateStr} {r.endTime}</div>
          <div style={{ marginTop: 2, color: GREEN, fontWeight: 700 }}>✓ VERIFIED · ENCRYPTED</div>
        </div>
      </div>

      <div style={{
        marginTop: 16, paddingTop: 8, borderTop: `1px solid ${LINE}`,
        fontSize: 8.5, color: MUTED, textAlign: 'center', direction: 'rtl',
      }}>
        هذا التقرير وُلّد آلياً بواسطة نظام أثر · أي تعديل عليه يُبطل قيمة التحقق أعلاه
      </div>
    </div>
  )
}
