// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — سجل الجلسات                                                    ║
// ║                                                                          ║
// ║  Every session ever recorded, filterable by type and by asset. This is   ║
// ║  what turns a pile of one-off reports into an asset history: open any    ║
// ║  asset and see how often it was documented and what changed each time.   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useMemo, useState } from 'react'
import { C } from './theme'
import { SESSION_TYPES, TYPE_ORDER, type SessionKind } from './sessionTypes'
import { deleteSession, fetchSessions, type SessionRow } from './services/api'
import { exportReportCSV, exportReportJSON } from './services/api'

const TINT = { green: C.green, blue: C.blue, yellow: C.yellow, red: C.red } as const

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '—'

export function ScreenArchive({ onCompare }: { onCompare?: () => void }) {
  const [rows, setRows] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SessionKind | 'all'>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<SessionRow | null>(null)

  const load = () => {
    setLoading(true)
    fetchSessions({ limit: 300 }).then(r => { setRows(r); setLoading(false) })
  }
  useEffect(load, [])

  const shown = useMemo(() => rows.filter(r => {
    if (filter !== 'all' && r.kind !== filter) return false
    if (!q.trim()) return true
    const hay = `${r.asset_name ?? ''} ${r.location ?? ''} ${r.officer_name ?? ''}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  }), [rows, filter, q])

  /** Assets ranked by how often they were documented — the audit view. */
  const byAsset = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach(r => { const k = r.asset_name ?? '—'; m.set(k, (m.get(k) ?? 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [rows])

  const remove = async (r: SessionRow) => {
    if (!r.id) return
    if (!confirm(`حذف جلسة «${r.asset_name}»؟\nلا يمكن التراجع.`)) return
    const ok = await deleteSession(r.id)
    if (ok) setRows(prev => prev.filter(x => x.id !== r.id))
    else alert('تعذّر الحذف — تحقّق من الاتصال بقاعدة البيانات')
  }

  const exportAll = (fmtKind: 'CSV' | 'JSON') => {
    const flat = shown.map(r => ({
      'النوع': SESSION_TYPES[r.kind as SessionKind]?.label ?? r.kind,
      'الأصل': r.asset_name ?? '',
      'الموقع': r.location ?? '',
      'المشرف': r.officer_name ?? '',
      'التاريخ': fmt(r.created_at),
      'الإجمالي المرصود': String(r.detected_total ?? 0),
      'ملاحظات': r.notes ?? '',
    }))
    if (!flat.length) return
    if (fmtKind === 'CSV') exportReportCSV(flat, 'ATHAR_sessions')
    else exportReportJSON(shown, 'ATHAR_sessions')
  }

  const chip = (key: string, label: string, active: boolean, on: () => void, tint = C.green) => (
    <button key={key} onClick={on} style={{
      padding: '6px 13px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
      fontSize: 12, fontWeight: active ? 700 : 500,
      background: active ? tint : 'transparent',
      border: `1px solid ${active ? tint : C.blue + '55'}`,
      color: active ? C.bg : C.white,
      fontFamily: "'IBM Plex Sans Arabic', sans-serif",
    }}>{label}</button>
  )

  return (
    <div style={{
      minHeight: '100%', background: C.bg, direction: 'rtl',
      padding: 'clamp(16px, 3.5vw, 30px)', display: 'flex', flexDirection: 'column', gap: 14,
    }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 'clamp(18px, 2.8vw, 24px)', fontWeight: 700, color: C.white }}>
            سجل الجلسات
          </div>
          <div style={{ fontSize: 12.5, color: C.whiteD, marginTop: 4 }}>
            كل جلسة موثّقة على الأصول والمرافق
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => exportAll('CSV')} style={{
            padding: '7px 13px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5,
            background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }}>⬇ CSV</button>
          <button onClick={() => exportAll('JSON')} style={{
            padding: '7px 13px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5,
            background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }}>⬇ JSON</button>
        </div>
      </div>

      {/* stats */}
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
      }}>
        {[
          { k: 'إجمالي الجلسات', v: String(rows.length), c: C.green },
          { k: 'الأصول الموثّقة', v: String(new Set(rows.map(r => r.asset_name)).size), c: C.blue },
          { k: 'جلسات التسليم', v: String(rows.filter(r => r.kind === 'handover').length), c: C.blue },
        ].map(s => (
          <div key={s.k} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            border: `1px solid ${s.c}33`, borderTop: `2px solid ${s.c}`, padding: '11px 14px',
          }}>
            <div style={{ fontSize: 10.5, color: C.whiteD }}>{s.k}</div>
            <div className="mono" style={{ fontSize: 21, fontWeight: 700, color: s.c, marginTop: 3 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* most documented assets */}
      {byAsset.length > 1 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: 8,
          border: `1px solid ${C.green}33`, padding: '12px 15px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 8 }}>
            الأصول الأكثر توثيقاً
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {byAsset.map(([name, n]) => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px',
                borderRadius: 20, fontSize: 11.5, background: C.greenDim,
                border: `1px solid ${C.green}44`, color: C.white,
              }}>
                <span>{name}</span>
                <span className="mono" style={{ color: C.green, fontWeight: 700 }}>{n}</span>
              </div>
            ))}
          </div>
          {onCompare && (
            <button onClick={onCompare} style={{
              marginTop: 10, padding: '7px 14px', borderRadius: 5, cursor: 'pointer',
              fontSize: 11.5, background: 'transparent',
              border: `1px solid ${C.green}88`, color: C.green, fontWeight: 600,
              fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            }}>⇄ قارن جلستين على نفس الأصل</button>
          )}
        </div>
      )}

      {/* filters */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {chip('all', 'الكل', filter === 'all', () => setFilter('all'))}
        {TYPE_ORDER.map(k => chip(
          k,
          SESSION_TYPES[k].short,
          filter === k,
          () => setFilter(k),
          TINT[SESSION_TYPES[k].color],
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="بحث باسم الأصل أو الموقع…"
          style={{
            flex: '1 1 190px', minWidth: 0, padding: '8px 12px', borderRadius: 5,
            background: 'rgba(0,0,0,0.3)', color: C.white, fontSize: 12.5, direction: 'rtl',
            border: `1px solid ${C.blue}44`, outline: 'none',
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }} />
      </div>

      {/* list */}
      {loading ? (
        <div style={{ fontSize: 12.5, color: C.whiteD, padding: 20 }}>جارٍ التحميل…</div>
      ) : shown.length === 0 ? (
        <div style={{
          padding: '18px 16px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.9,
          background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.blue}33`, color: C.whiteD,
        }}>
          {rows.length === 0
            ? 'لا توجد جلسات محفوظة بعد. ابدأ جلسة جديدة من الشاشة الرئيسية، وستظهر هنا فور إنهائها.'
            : 'لا توجد نتائج مطابقة للبحث.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(r => {
            const t = SESSION_TYPES[r.kind as SessionKind]
            const tint = t ? TINT[t.color] : C.blue
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '11px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${C.blue}22`, borderRight: `3px solid ${tint}`,
              }}>
                {r.snapshot_url ? (
                  <img src={r.snapshot_url} alt="" style={{
                    width: 52, height: 40, objectFit: 'cover', borderRadius: 4, flexShrink: 0,
                  }} />
                ) : (
                  <div style={{
                    width: 52, height: 40, borderRadius: 4, flexShrink: 0,
                    background: 'rgba(255,255,255,0.05)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 15, color: C.whiteDD,
                  }}>▦</div>
                )}

                <div style={{ flex: '1 1 190px', minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.white }}>
                    {r.asset_name || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: C.whiteDD, marginTop: 2 }}>
                    {r.location || '—'} · {r.officer_name || '—'}
                  </div>
                </div>

                <div style={{
                  padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: `${tint}22`, border: `1px solid ${tint}55`, color: tint, flexShrink: 0,
                }}>{t?.short ?? r.kind}</div>

                <div className="mono" style={{ fontSize: 11, color: C.whiteD, flexShrink: 0 }}>
                  {fmt(r.created_at)}
                </div>

                <div className="mono" style={{
                  fontSize: 11.5, color: C.green, fontWeight: 700, flexShrink: 0, minWidth: 34,
                }}>{r.detected_total ?? 0}</div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setOpen(r)} title="عرض" style={{
                    background: C.greenDim, border: `1px solid ${C.green}77`, color: C.green,
                    borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                  }}>عرض</button>
                  <button onClick={() => remove(r)} title="حذف" style={{
                    background: 'transparent', border: `1px solid ${C.red}66`, color: C.red,
                    borderRadius: 4, padding: '5px 9px', cursor: 'pointer', fontSize: 11,
                  }}>🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* detail */}
      {open && (
        <div
          onClick={() => setOpen(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200, padding: 16,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#181818', border: `1px solid ${C.blue}44`, borderRadius: 10,
              width: 'min(94vw, 640px)', maxHeight: '88vh', overflow: 'auto',
              padding: 20, direction: 'rtl',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{open.asset_name}</div>
              <button onClick={() => setOpen(null)} style={{
                background: 'rgba(255,255,255,0.08)', border: 'none', color: C.white,
                width: 28, height: 28, borderRadius: 4, cursor: 'pointer', fontSize: 14,
              }}>✕</button>
            </div>

            {open.snapshot_url && (
              <img src={open.snapshot_url} alt="" style={{
                width: '100%', borderRadius: 6, marginBottom: 14, border: `1px solid ${C.blue}33`,
              }} />
            )}
            {open.snapshot_after && (
              <>
                <div style={{ fontSize: 11, color: C.whiteD, marginBottom: 5 }}>بعد التدخل</div>
                <img src={open.snapshot_after} alt="" style={{
                  width: '100%', borderRadius: 6, marginBottom: 14, border: `1px solid ${C.blue}33`,
                }} />
              </>
            )}

            {([
              ['النوع', SESSION_TYPES[open.kind as SessionKind]?.label ?? open.kind],
              ['الموقع', open.location],
              ['المشرف', open.officer_name],
              ['التاريخ', fmt(open.created_at)],
              ['المُسلِّم', open.from_party],
              ['المُستلِم', open.to_party],
              ['الأولوية', open.severity],
              ['الوصف', open.description],
              ['الملاحظات', open.notes],
            ] as const).filter(([, v]) => Boolean(v)).map(([k, v]) => (
              <div key={String(k)} style={{
                display: 'flex', gap: 10, fontSize: 12.5, padding: '7px 0',
                borderBottom: `1px solid ${C.blue}18`,
              }}>
                <span style={{ color: C.whiteD, width: 90, flexShrink: 0 }}>{k}</span>
                <span style={{ color: C.white }}>{v}</span>
              </div>
            ))}

            {(open.detected ?? []).length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.green, margin: '14px 0 8px' }}>
                  الموجودات المرصودة ({open.detected_total})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(open.detected ?? []).map(d => (
                    <div key={d.label} style={{
                      display: 'flex', gap: 6, padding: '5px 10px', borderRadius: 20, fontSize: 11.5,
                      background: C.greenDim, border: `1px solid ${C.green}44`, color: C.white,
                    }}>
                      <span>{d.label}</span>
                      <span className="mono" style={{ color: C.green, fontWeight: 700 }}>{d.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
