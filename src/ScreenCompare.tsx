// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — المقارنة                                                       ║
// ║                                                                          ║
// ║  A single session only records a state. The value appears when two       ║
// ║  states on the same asset are placed side by side — that is what turns   ║
// ║  "we documented it" into "this is what went missing, and when".          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useState } from 'react'
import { C } from './theme'
import { SESSION_TYPES, type SessionKind } from './sessionTypes'
import {
  compareSessions, fetchAssets, fetchSessions,
  type Asset, type SessionRow,
} from './services/api'

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'

export function ScreenCompare() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetId, setAssetId] = useState('')
  const [rows, setRows] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [aId, setAId] = useState('')   // earlier session
  const [bId, setBId] = useState('')   // later session

  useEffect(() => { fetchAssets().then(setAssets).catch(() => {}) }, [])

  useEffect(() => {
    if (!assetId) { setRows([]); setAId(''); setBId(''); return }
    setLoading(true)
    fetchSessions({ assetId }).then(r => {
      setRows(r)
      // Default to the two most recent: oldest of the pair on the left.
      if (r.length >= 2) { setBId(r[0].id ?? ''); setAId(r[1].id ?? '') }
      else { setAId(''); setBId('') }
      setLoading(false)
    })
  }, [assetId])

  const a = rows.find(r => r.id === aId)
  const b = rows.find(r => r.id === bId)
  const cmp = a && b ? compareSessions(a, b) : null

  const sel = (v: string, on: (s: string) => void, exclude: string, placeholder: string) => (
    <select value={v} onChange={e => on(e.target.value)} style={{
      width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 5,
      background: 'rgba(0,0,0,0.3)', color: C.white, fontSize: 12.5, direction: 'rtl',
      border: `1px solid ${C.blue}55`, outline: 'none', cursor: 'pointer',
      fontFamily: "'IBM Plex Sans Arabic', sans-serif",
    }}>
      <option value="" style={{ background: '#1a1a1a' }}>{placeholder}</option>
      {rows.filter(r => r.id !== exclude).map(r => (
        <option key={r.id} value={r.id} style={{ background: '#1a1a1a' }}>
          {SESSION_TYPES[r.kind as SessionKind]?.short ?? r.kind} — {fmt(r.created_at)}
        </option>
      ))}
    </select>
  )

  const shotPane = (row: SessionRow | undefined, tag: string, tint: string) => (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: 9,
      border: `1px solid ${tint}44`, overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', fontSize: 11.5, fontWeight: 700, color: tint,
        borderBottom: `1px solid ${tint}33`, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{tag}</span>
        <span style={{ color: C.whiteD, fontWeight: 400 }}>{fmt(row?.created_at)}</span>
      </div>
      <div style={{ aspectRatio: '4 / 3', background: '#080808' }}>
        {row?.snapshot_url
          ? <img src={row.snapshot_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: C.whiteDD, fontSize: 12,
            }}>لا توجد صورة</div>}
      </div>
      <div style={{ padding: '9px 12px', fontSize: 12, color: C.whiteD, display: 'flex', justifyContent: 'space-between' }}>
        <span>الإجمالي المرصود</span>
        <span className="mono" style={{ color: C.white, fontWeight: 700 }}>{row?.detected_total ?? 0}</span>
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100%', background: C.bg, direction: 'rtl',
      padding: 'clamp(16px, 3.5vw, 32px)', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 'clamp(18px, 2.8vw, 24px)', fontWeight: 700, color: C.white }}>
          مقارنة الجلسات
        </div>
        <div style={{ fontSize: 12.5, color: C.whiteD, marginTop: 5, lineHeight: 1.8 }}>
          اختر أصلاً ثم جلستين — يعرض النظام الفرق بينهما بالصورة والعدد.
        </div>
      </div>

      {/* pickers */}
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
      }}>
        <div>
          <div style={{ fontSize: 10.5, color: C.blue, fontWeight: 600, marginBottom: 5 }}>الأصل</div>
          <select value={assetId} onChange={e => setAssetId(e.target.value)} style={{
            width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 5,
            background: 'rgba(0,0,0,0.3)', color: C.white, fontSize: 12.5, direction: 'rtl',
            border: `1px solid ${C.blue}55`, outline: 'none', cursor: 'pointer',
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          }}>
            <option value="" style={{ background: '#1a1a1a' }}>— اختر أصلاً —</option>
            {assets.map(x => (
              <option key={x.id} value={x.id} style={{ background: '#1a1a1a' }}>{x.name}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: C.blue, fontWeight: 600, marginBottom: 5 }}>الجلسة الأقدم</div>
          {sel(aId, setAId, bId, rows.length ? '— اختر —' : 'لا توجد جلسات')}
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: C.blue, fontWeight: 600, marginBottom: 5 }}>الجلسة الأحدث</div>
          {sel(bId, setBId, aId, rows.length ? '— اختر —' : 'لا توجد جلسات')}
        </div>
      </div>

      {loading && <div style={{ fontSize: 12, color: C.whiteD }}>جارٍ التحميل…</div>}

      {!loading && assetId && rows.length < 2 && (
        <div style={{
          padding: '14px 16px', borderRadius: 7, fontSize: 12.5, lineHeight: 1.9,
          background: C.yellowDim, border: `1px solid ${C.yellow}55`, color: C.yellow,
        }}>
          يحتاج هذا الأصل جلستين على الأقل للمقارنة. سجّل جلسة جديدة عليه ثم عد إلى هنا.
        </div>
      )}

      {a && b && (
        <>
          <div style={{
            display: 'grid', gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
          }}>
            {shotPane(b, 'الأحدث', C.blue)}
            {shotPane(a, 'الأقدم', C.green)}
          </div>

          {/* verdict */}
          {cmp && (
            <div style={{
              padding: '14px 16px', borderRadius: 8,
              background: cmp.missing.length ? 'rgba(165,32,25,0.10)' : C.greenDim,
              border: `1px solid ${cmp.missing.length ? C.red : C.green}66`,
            }}>
              <div style={{
                fontSize: 15, fontWeight: 700, marginBottom: 6,
                color: cmp.missing.length ? C.red : C.green,
              }}>
                {cmp.missing.length
                  ? `رُصد نقص في ${cmp.missing.length} صنف`
                  : 'لا يوجد نقص — الموجودات مطابقة'}
              </div>
              <div style={{ fontSize: 12.5, color: C.white, lineHeight: 1.8 }}>
                الإجمالي: <span className="mono">{cmp.totalBefore}</span> في الجلسة الأقدم،
                و<span className="mono"> {cmp.totalAfter} </span>في الأحدث.
              </div>
            </div>
          )}

          {/* per-item table */}
          {cmp && cmp.diffs.length > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: 9,
              border: `1px solid ${C.blue}33`, overflow: 'hidden',
            }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                padding: '9px 14px', fontSize: 11, fontWeight: 700, color: C.whiteD,
                borderBottom: `1px solid ${C.blue}33`, background: 'rgba(0,0,0,0.25)',
              }}>
                <span>الصنف</span><span>الأقدم</span><span>الأحدث</span><span>الفرق</span>
              </div>
              {cmp.diffs.map(d => {
                const tint = d.delta < 0 ? C.red : d.delta > 0 ? C.yellow : C.whiteD
                return (
                  <div key={d.label} style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    padding: '10px 14px', fontSize: 12.5, color: C.white,
                    borderBottom: `1px solid ${C.blue}18`,
                  }}>
                    <span>{d.label}</span>
                    <span className="mono">{d.before}</span>
                    <span className="mono">{d.after}</span>
                    <span className="mono" style={{ color: tint, fontWeight: 700 }}>
                      {d.delta > 0 ? `+${d.delta}` : d.delta === 0 ? '—' : d.delta}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
