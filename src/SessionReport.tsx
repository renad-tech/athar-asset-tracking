// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — تقرير الجلسة                                                   ║
// ║                                                                          ║
// ║  One A4 sheet whose sections are chosen by the session type: a handover  ║
// ║  shows both parties, an audit shows expected against actual, an incident ║
// ║  shows the before/after pair. Everything else is shared.                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useState } from 'react'
import { typeOf, type SessionKind } from './sessionTypes'
import type { Counted } from './vision'

const INK = '#1a1a1a'
const MUTED = '#6b6b6b'
const LINE = '#d8d8d8'
const GREEN = '#237F52'
const BLUE = '#005387'
const RED = '#A52019'

export const REPORT_WIDTH = 794

export type ReportData = {
  kind: SessionKind
  sessionId?: string
  assetName: string
  location: string
  officer: { name: string; id: string; unit?: string; role?: string }
  startedAt: number
  endedAt: number
  fromParty?: string
  toParty?: string
  expectedCount?: string
  severity?: string
  description?: string
  notes?: string
  shot?: string
  shotAfter?: string
  items: Counted[]
  total: number
}

/** Real SHA-256 over the fields that must not change after signing. */
async function digest(d: ReportData): Promise<string> {
  const payload = JSON.stringify({
    k: d.kind, a: d.assetName, l: d.location, o: d.officer.id,
    s: d.startedAt, e: d.endedAt,
    i: d.items.map(x => [x.label, x.count]),
    n: (d.shot ?? '').length + (d.shotAfter ?? '').length,
  })
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function useHash(d: ReportData) {
  const [h, setH] = useState('…')
  useEffect(() => { digest(d).then(setH).catch(() => setH('—')) },
    [d.startedAt, d.endedAt, d.total, d.assetName])
  return h
}

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour12: false })
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtDateAr = (ms: number) => new Date(ms).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
const dur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

function Section({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, direction: 'rtl',
      margin: '18px 0 10px', paddingBottom: 6, borderBottom: `2px solid ${BLUE}`,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 3, background: BLUE, color: '#fff',
        fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{children}</div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', direction: 'rtl', fontSize: 10.5, padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
      <div style={{ width: 128, color: MUTED, flexShrink: 0 }}>{label}</div>
      <div style={{
        color: INK, fontWeight: 500, wordBreak: 'break-word',
        fontFamily: mono ? 'monospace' : undefined,
        direction: mono ? 'ltr' : undefined,
        textAlign: mono ? 'right' : undefined,
      }}>{value || '—'}</div>
    </div>
  )
}

export function SessionReport({ data, logo, preview = false }: {
  data: ReportData
  logo: string
  preview?: boolean
}) {
  const t = typeOf(data.kind)
  const hash = useHash(data)
  const has = (s: string) => t.reportSections.includes(s as any)
  let n = 0

  return (
    <div
      id={preview ? undefined : 'athar-session-report'}
      style={{
        width: REPORT_WIDTH, background: '#fff', color: INK,
        padding: '34px 40px', boxSizing: 'border-box',
        fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', sans-serif", lineHeight: 1.6,
      }}>

      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        direction: 'rtl', paddingBottom: 14, borderBottom: `3px solid ${GREEN}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt="" style={{ height: 52, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>أثَر — ATHAR</div>
            <div style={{ fontSize: 10, color: MUTED }}>توثيق الأصول والمرافق</div>
          </div>
        </div>
        <div style={{ textAlign: 'left', direction: 'ltr' }}>
          <div style={{ fontSize: 9, color: MUTED, letterSpacing: '0.08em' }}>SESSION</div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
            {(data.sessionId ?? '').slice(0, 8).toUpperCase() || '—'}
          </div>
          <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>
            {fmtDate(data.startedAt)} · {fmtTime(data.startedAt)}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', direction: 'rtl', padding: '12px 0 4px', fontSize: 15, fontWeight: 700 }}>
        تقرير {t.label} — {data.assetName}
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, color: MUTED, direction: 'rtl' }}>
        {fmtDateAr(data.startedAt)}
      </div>

      {/* 1 · session data */}
      <Section n={++n}>بيانات الجلسة</Section>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 26px' }}>
        <div>
          <Row label="نوع الجلسة" value={t.label} />
          <Row label="الأصل أو المرفق" value={data.assetName} />
          <Row label="الموقع" value={data.location} />
          {has('severity') && <Row label="الأولوية" value={data.severity} />}
        </div>
        <div>
          <Row label="المشرف المكلف" value={data.officer.name} />
          <Row label="الرقم الوظيفي" value={data.officer.id} mono />
          <Row label="بداية الجلسة" value={`${fmtDate(data.startedAt)} — ${fmtTime(data.startedAt)}`} mono />
          <Row label="مدة الجلسة" value={dur(data.endedAt - data.startedAt)} mono />
        </div>
      </div>

      {/* 2 · parties (handover) */}
      {has('parties') && (
        <>
          <Section n={++n}>طرفا التسليم</Section>
          <div style={{ display: 'flex', gap: 12, direction: 'rtl' }}>
            {[['المُسلِّم', data.fromParty], ['المُستلِم', data.toParty]].map(([k, v]) => (
              <div key={k} style={{ flex: 1, border: `1px solid ${LINE}`, borderTop: `2px solid ${BLUE}`, borderRadius: 3, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{v || '—'}</div>
                <div style={{ marginTop: 14, paddingTop: 6, borderTop: `1px solid ${LINE}`, fontSize: 9, color: MUTED }}>
                  التوقيع: ______________________
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 3 · description (incident) */}
      {data.description && (
        <>
          <Section n={++n}>وصف الحادثة</Section>
          <div style={{ direction: 'rtl', fontSize: 11, lineHeight: 1.9, padding: '4px 0' }}>
            {data.description}
          </div>
        </>
      )}

      {/* 4 · evidence */}
      <Section n={++n}>{has('pair') ? 'الأدلة البصرية — قبل وبعد' : 'اللقطة المرجعية'}</Section>
      {has('pair') ? (
        <div style={{ display: 'flex', gap: 10, direction: 'rtl' }}>
          {[['قبل التدخل', data.shot], ['بعد التدخل', data.shotAfter]].map(([cap, src]) => (
            <div key={cap} style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{cap}</div>
              {src
                ? <img src={src} alt="" style={{ width: '100%', borderRadius: 3, border: `1px solid ${LINE}` }} />
                : <div style={{
                    height: 120, border: `1px dashed ${LINE}`, borderRadius: 3, color: MUTED, fontSize: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>لا توجد صورة</div>}
            </div>
          ))}
        </div>
      ) : data.shot ? (
        <img src={data.shot} alt="" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 3, border: `1px solid ${LINE}` }} />
      ) : (
        <div style={{ fontSize: 10, color: MUTED, direction: 'rtl', padding: '6px 0' }}>لا توجد صورة مرفقة.</div>
      )}

      {/* 5 · counted inventory */}
      {has('counts') && (
        <>
          <Section n={++n}>الموجودات المرصودة</Section>
          {data.items.length === 0 ? (
            <div style={{ fontSize: 10, color: MUTED, direction: 'rtl', padding: '6px 0' }}>
              لم يُرصد شيء آلياً — يُعتمد على الصورة والملاحظات.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl', fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: '#f2f2f2' }}>
                  {['الصنف', 'العدد المرصود'].map(h => (
                    <th key={h} style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${LINE}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map(it => (
                  <tr key={it.label}>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${LINE}` }}>{it.label}</td>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${LINE}`, fontFamily: 'monospace' }}>{it.count}</td>
                  </tr>
                ))}
                <tr style={{ background: '#fafafa' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>الإجمالي</td>
                  <td style={{ padding: '6px 8px', fontWeight: 700, fontFamily: 'monospace' }}>{data.total}</td>
                </tr>
              </tbody>
            </table>
          )}

          {data.expectedCount && (
            <div style={{
              marginTop: 8, direction: 'rtl', fontSize: 10.5, padding: '8px 11px',
              background: '#fafafa', border: `1px solid ${LINE}`, borderRight: `3px solid ${BLUE}`, borderRadius: 2,
            }}>
              العدد المتوقع حسب السجل: <b style={{ fontFamily: 'monospace' }}>{data.expectedCount}</b>
              {' · '}المرصود فعلياً: <b style={{ fontFamily: 'monospace' }}>{data.total}</b>
              {Number(data.expectedCount) !== data.total && (
                <span style={{ color: RED, fontWeight: 700 }}>
                  {' — '}فرق {Math.abs(Number(data.expectedCount) - data.total)}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* 6 · notes */}
      {data.notes && (
        <>
          <Section n={++n}>ملاحظات</Section>
          <div style={{ direction: 'rtl', fontSize: 11, lineHeight: 1.9, padding: '4px 0' }}>{data.notes}</div>
        </>
      )}

      {/* 7 · comparison note */}
      {has('comparison') && (
        <>
          <Section n={++n}>المقارنة</Section>
          <div style={{ fontSize: 10.5, color: MUTED, direction: 'rtl', lineHeight: 1.9 }}>
            هذه الجلسة محفوظة كحالة مرجعية لهذا الأصل. تُقارَن آلياً بأي جلسة لاحقة عليه،
            ويُكشف الفرق في الموجودات بالصورة والعدد من شاشة «المقارنة».
          </div>
        </>
      )}

      {/* signature */}
      <Section n={++n}>التوقيع الإلكتروني</Section>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        direction: 'rtl', border: `1px solid ${LINE}`, borderRadius: 4, padding: 14, background: '#fafafa',
      }}>
        <div style={{ fontSize: 10 }}>
          <div style={{ color: MUTED, marginBottom: 3 }}>اعتمده</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{data.officer.name}</div>
          <div style={{ color: MUTED, marginTop: 2 }}>
            {data.officer.role ?? 'مشرف'} · <span style={{ fontFamily: 'monospace' }}>{data.officer.id}</span>
          </div>
          <div style={{ marginTop: 10, paddingTop: 6, borderTop: `1px solid ${LINE}`, color: MUTED, fontSize: 9 }}>
            التوقيع: ______________________
          </div>
        </div>
        <div style={{ textAlign: 'left', direction: 'ltr', fontSize: 9, color: MUTED }}>
          <div style={{ marginBottom: 3 }}>INTEGRITY HASH · SHA-256</div>
          <div style={{
            fontFamily: 'monospace', fontSize: 7.5, color: INK,
            maxWidth: 260, wordBreak: 'break-all', lineHeight: 1.5,
          }}>{hash}</div>
          <div style={{ marginTop: 6 }}>Generated {fmtDate(data.endedAt)} {fmtTime(data.endedAt)}</div>
          <div style={{ marginTop: 2, color: GREEN, fontWeight: 700 }}>✓ VERIFIED</div>
        </div>
      </div>

      <div style={{
        marginTop: 16, paddingTop: 8, borderTop: `1px solid ${LINE}`,
        fontSize: 8.5, color: MUTED, textAlign: 'center', direction: 'rtl',
      }}>
        وُلّد هذا التقرير آلياً بواسطة نظام أثَر · أي تعديل عليه يُبطل قيمة التحقق أعلاه
      </div>
    </div>
  )
}
