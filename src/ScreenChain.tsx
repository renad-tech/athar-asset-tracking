// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — سلسلة العهدة                                                   ║
// ║                                                                          ║
// ║  المشكلة التي تحلها هذه الشاشة: موظف يستلم مكاناً فيه خلل ليس منه، ثم    ║
// ║  يُسأل عنه لأن لا أحد وثّق الحالة قبل استلامه.                           ║
// ║                                                                          ║
// ║  السلسلة تعرض حياة الأصل كاملة: مَن استلمه ومتى وبأي حالة، فيصير السؤال ║
// ║  «في فترة مسؤولية مَن حدث النقص؟» سؤالاً له جواب.                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useState } from 'react'
import { C } from './theme'
import { fetchAssets, type Asset } from './services/api'
import {
  fetchChain, diffItems, damageHistory, conditionLabel, ACTION_LABEL,
  fmtDate, fmtDay,
  type CustodyRecord, type ItemCondition, type CustodyAction,
} from './services/custody'

const CONDITION_COLOR: Record<ItemCondition, string> = {
  ok: C.green, note: C.yellow, damaged: C.red,
}

export function ScreenChain({ initialAssetId }: { initialAssetId?: string }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetId, setAssetId] = useState(initialAssetId ?? '')
  const [chain, setChain] = useState<CustodyRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [aId, setAId] = useState('')     // المحضر الأقدم في المقارنة
  const [bId, setBId] = useState('')     // المحضر الأحدث
  const [open, setOpen] = useState<string | null>(null)   // المحضر المفتوح تفصيلياً

  useEffect(() => { fetchAssets().then(setAssets).catch(() => {}) }, [])

  useEffect(() => {
    if (!assetId) { setChain([]); setAId(''); setBId(''); return }
    setLoading(true)
    fetchChain(assetId)
      .then(rows => {
        setChain(rows)
        // الافتراضي: آخر محضرين — أكثر مقارنة يحتاجها المسؤول.
        if (rows.length >= 2) {
          setAId(rows[rows.length - 2].id ?? '')
          setBId(rows[rows.length - 1].id ?? '')
        } else { setAId(''); setBId('') }
        setOpen(null)
      })
      .finally(() => setLoading(false))
  }, [assetId])

  const a = chain.find(r => r.id === aId)
  const b = chain.find(r => r.id === bId)
  const cmp = a && b ? diffItems(a.items ?? [], b.items ?? []) : null
  const damage = damageHistory(chain)
  const current = chain.length ? chain[chain.length - 1] : null

  const selectStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6,
    background: 'rgba(0,0,0,0.3)', color: C.white, fontSize: 13, direction: 'rtl',
    border: `1px solid ${C.blue}55`, outline: 'none', cursor: 'pointer',
    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
  }

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)', borderRadius: 9,
    border: `1px solid ${C.blue}33`, padding: 16,
  }

  const recordOption = (r: CustodyRecord, i: number) =>
    `${i + 1}. ${fmtDay(r.created_at)} — ${r.holder_name ?? 'غير محدد'}`

  return (
    <div style={{
      minHeight: '100%', background: C.bg, direction: 'rtl',
      padding: 'clamp(14px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16,
    }}>

      <div>
        <div style={{ fontSize: 'clamp(17px, 2.6vw, 22px)', fontWeight: 700, color: C.white }}>
          سلسلة العهدة
        </div>
        <div style={{ fontSize: 12.5, color: C.whiteD, marginTop: 6, lineHeight: 1.85 }}>
          تاريخ الأصل كاملاً: مَن استلمه، ومتى، وبأي حالة — ليُعرف في فترة مسؤولية مَن حدث التغيّر.
        </div>
      </div>

      {/* ── اختيار الأصل ─────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: C.blue, marginBottom: 6 }}>
          الأصل أو المرفق
        </div>
        <select value={assetId} onChange={e => setAssetId(e.target.value)} style={selectStyle}>
          <option value="" style={{ background: '#1a1a1a' }}>— اختر أصلاً —</option>
          {assets.map(x => (
            <option key={x.id} value={x.id} style={{ background: '#1a1a1a' }}>
              {x.name} — {x.location}
            </option>
          ))}
        </select>
      </div>

      {loading && <div style={{ fontSize: 12.5, color: C.whiteD }}>… جارٍ تحميل السلسلة</div>}

      {!loading && assetId && chain.length === 0 && (
        <div style={{
          ...cardStyle, borderColor: `${C.yellow}55`, background: C.yellowDim,
          fontSize: 12.5, color: C.white, lineHeight: 1.9,
        }}>
          لا توجد محاضر عهدة على هذا الأصل بعد. ابدأ من تبويب «صرف عهدة جديدة» — أول محضر
          يصبح الحالة المرجعية التي تُقاس عليها كل التغيّرات لاحقاً.
        </div>
      )}

      {/* ── مَن بيده الآن ─────────────────────────────────────────── */}
      {current && (
        <div style={{
          ...cardStyle, borderColor: `${C.green}66`, background: C.greenDim,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: C.green }}>
              العهدة الآن لدى
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginTop: 3 }}>
              {current.holder_name ?? '—'}
            </div>
            <div style={{ fontSize: 11.5, color: C.whiteD, marginTop: 2 }}>
              <span className="mono">{current.holder_id}</span>
              {current.holder_role ? ` · ${current.holder_role}` : ''}
              {' · منذ '}{fmtDay(current.created_at)}
            </div>
          </div>

          <div style={{ marginRight: 'auto', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Stat label="الأصناف" value={current.total_items ?? 0} color={C.white} />
            <Stat label="بملاحظة" value={current.noted_count ?? 0} color={C.yellow} />
            <Stat label="تالف" value={current.damaged_count ?? 0} color={C.red} />
          </div>

          {current.next_inspection && (
            <div style={{
              width: '100%', paddingTop: 11, borderTop: `1px solid ${C.green}33`,
              fontSize: 12, color: C.whiteD,
            }}>
              التفتيش القادم: <span style={{ color: C.white, fontWeight: 600 }}>
                {fmtDay(current.next_inspection)}
              </span>
              {current.next_inspection_label ? ` — ${current.next_inspection_label}` : ''}
            </div>
          )}
        </div>
      )}

      {/* ── مؤشر التلف المتكرر ───────────────────────────────────── */}
      {damage.some(d => d.repeated) && (
        <div style={{
          ...cardStyle, borderColor: `${C.red}66`, background: C.redDim,
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.red, marginBottom: 4 }}>
            ⚠ مؤشر التلف المتكرر
          </div>
          <div style={{ fontSize: 12, color: C.whiteD, lineHeight: 1.85, marginBottom: 12 }}>
            هذه الأصناف تكرر تلفها عبر أكثر من محضر. التكرار مع أشخاص مختلفين يرجّح أن
            المشكلة في الأصل نفسه لا في مَن استعمله — وهذا قرار صيانة لا مساءلة.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {damage.filter(d => d.repeated).map(d => (
              <div key={d.label} style={{
                padding: '11px 13px', borderRadius: 7,
                background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.red}44`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: C.white }}>{d.label}</span>
                  <span style={{
                    padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                    background: C.redDim, border: `1px solid ${C.red}66`, color: C.red,
                  }}>{d.repeats} مرات</span>
                  <span style={{ marginRight: 'auto', fontSize: 11, color: C.whiteD }}>
                    أول مرة: {fmtDay(d.firstAt)}
                    {d.firstHolder ? ` — لدى ${d.firstHolder}` : ''}
                  </span>
                </div>

                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {d.events.map((ev, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: C.whiteD, lineHeight: 1.7 }}>
                      <span className="mono" style={{ color: C.whiteDD }}>{fmtDay(ev.at)}</span>
                      {' · '}
                      <span style={{ color: CONDITION_COLOR[ev.condition], fontWeight: 600 }}>
                        {conditionLabel(ev.condition)}
                      </span>
                      {ev.holderName ? ` · في فترة ${ev.holderName}` : ''}
                      {ev.note ? ` — ${ev.note}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── الخط الزمني ──────────────────────────────────────────── */}
      {chain.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.white, marginBottom: 12 }}>
            الخط الزمني — {chain.length} محضر
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {chain.map((r, i) => {
              const isOpen = open === r.id
              const flagged = (r.damaged_count ?? 0) + (r.noted_count ?? 0)
              return (
                <div key={r.id} style={{ display: 'flex', gap: 12 }}>

                  {/* عمود الخط */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    flexShrink: 0, width: 16,
                  }}>
                    <div style={{
                      width: 11, height: 11, borderRadius: '50%', marginTop: 15,
                      background: i === chain.length - 1 ? C.green : C.blue,
                      border: `2px solid ${C.bg}`, boxShadow: `0 0 0 2px ${i === chain.length - 1 ? C.green : C.blue}55`,
                    }} />
                    {i < chain.length - 1 && (
                      <div style={{ flex: 1, width: 2, background: `${C.blue}44`, minHeight: 20 }} />
                    )}
                  </div>

                  {/* المحتوى */}
                  <div style={{ flex: 1, paddingBottom: i < chain.length - 1 ? 12 : 0, minWidth: 0 }}>
                    <button onClick={() => setOpen(isOpen ? null : (r.id ?? null))} style={{
                      width: '100%', textAlign: 'right', cursor: 'pointer',
                      padding: '11px 13px', borderRadius: 7,
                      background: isOpen ? 'rgba(0,83,135,0.14)' : 'rgba(0,0,0,0.22)',
                      border: `1px solid ${isOpen ? C.blue : C.blue + '33'}`,
                      color: C.white, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '2px 9px', borderRadius: 12, fontSize: 10.5, fontWeight: 700,
                          background: C.blueDim, border: `1px solid ${C.blue}66`, color: C.white,
                        }}>{ACTION_LABEL[(r.action ?? 'issue') as CustodyAction]}</span>

                        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{r.holder_name ?? '—'}</span>

                        <span className="mono" style={{ fontSize: 11, color: C.whiteDD }}>
                          {fmtDate(r.created_at)}
                        </span>

                        <span style={{ marginRight: 'auto', fontSize: 11.5, color: C.whiteD }}>
                          {r.total_items ?? 0} صنف
                          {flagged > 0 && (
                            <span style={{ color: (r.damaged_count ?? 0) > 0 ? C.red : C.yellow, fontWeight: 700 }}>
                              {' '}· {flagged} بملاحظة/تالف
                            </span>
                          )}
                          <span style={{ color: C.whiteDD }}> {isOpen ? '▲' : '▼'}</span>
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div style={{
                        marginTop: 8, padding: '13px 14px', borderRadius: 7,
                        background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.blue}22`,
                        display: 'flex', flexDirection: 'column', gap: 12,
                      }}>
                        {r.snapshot_url && (
                          <img src={r.snapshot_url} alt="" style={{
                            width: '100%', maxWidth: 420, borderRadius: 6,
                            border: `1px solid ${C.blue}44`,
                          }} />
                        )}

                        <ItemTable items={r.items ?? []} />

                        <div style={{ fontSize: 11.5, color: C.whiteD, lineHeight: 1.9 }}>
                          {r.from_holder_name && (
                            <div>من: {r.from_holder_name} <span className="mono">{r.from_holder_id}</span></div>
                          )}
                          <div>صرفها: {r.issuer_name ?? '—'} <span className="mono">{r.issuer_badge}</span></div>
                          {r.ack_signed_by && (
                            <div>
                              وقّع بالبطاقة: <span className="mono">{r.ack_signed_by}</span>
                              {' · '}{fmtDate(r.ack_signed_at)}
                            </div>
                          )}
                          {r.next_inspection && (
                            <div>التفتيش القادم: {fmtDay(r.next_inspection)}</div>
                          )}
                          {r.notes && <div>ملاحظات: {r.notes}</div>}
                        </div>

                        {r.ack_text && (
                          <div style={{
                            fontSize: 11.5, color: C.whiteD, lineHeight: 2,
                            padding: '10px 12px', borderRadius: 6,
                            background: 'rgba(255,255,255,0.03)',
                            borderRight: `3px solid ${C.green}77`,
                          }}>{r.ack_text}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── المقارنة بين محضرين ──────────────────────────────────── */}
      {chain.length >= 2 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.white, marginBottom: 4 }}>
            ما الذي تغيّر بين محضرين
          </div>
          <div style={{ fontSize: 12, color: C.whiteD, marginBottom: 13, lineHeight: 1.85 }}>
            المحضر الأول هو الحالة المرجعية، والثاني هو الحالة اللاحقة. الفرق بينهما وقع
            في فترة مسؤولية مَن استلم في المحضر الأول.
          </div>

          <div style={{
            display: 'grid', gap: 10, marginBottom: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          }}>
            <div>
              <div style={{ fontSize: 10.5, color: C.blue, fontWeight: 600, marginBottom: 5 }}>المحضر الأقدم</div>
              <select value={aId} onChange={e => setAId(e.target.value)} style={selectStyle}>
                <option value="" style={{ background: '#1a1a1a' }}>— اختر —</option>
                {chain.map((r, i) => r.id !== bId && (
                  <option key={r.id} value={r.id} style={{ background: '#1a1a1a' }}>{recordOption(r, i)}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: C.blue, fontWeight: 600, marginBottom: 5 }}>المحضر الأحدث</div>
              <select value={bId} onChange={e => setBId(e.target.value)} style={selectStyle}>
                <option value="" style={{ background: '#1a1a1a' }}>— اختر —</option>
                {chain.map((r, i) => r.id !== aId && (
                  <option key={r.id} value={r.id} style={{ background: '#1a1a1a' }}>{recordOption(r, i)}</option>
                ))}
              </select>
            </div>
          </div>

          {cmp && a && b && (
            <>
              {/* الصورتان جنباً إلى جنب */}
              {(a.snapshot_url || b.snapshot_url) && (
                <div style={{
                  display: 'grid', gap: 10, marginBottom: 14,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                }}>
                  {[a, b].map((r, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 11, color: C.whiteD, marginBottom: 5 }}>
                        {i === 0 ? 'قبل' : 'بعد'} — {fmtDay(r.created_at)} · {r.holder_name}
                      </div>
                      {r.snapshot_url
                        ? <img src={r.snapshot_url} alt="" style={{
                            width: '100%', borderRadius: 6, border: `1px solid ${C.blue}44`,
                          }} />
                        : <div style={{
                            padding: 20, borderRadius: 6, fontSize: 11.5, textAlign: 'center',
                            background: 'rgba(0,0,0,0.3)', border: `1px dashed ${C.blue}44`, color: C.whiteDD,
                          }}>لا توجد صورة</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* الخلاصة */}
              <div style={{
                display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12,
                padding: '11px 14px', borderRadius: 7,
                background: cmp.unchanged ? C.greenDim : C.redDim,
                border: `1px solid ${cmp.unchanged ? C.green : C.red}55`,
              }}>
                <Stat label="الإجمالي قبل" value={cmp.totalBefore} color={C.white} />
                <Stat label="الإجمالي بعد" value={cmp.totalAfter} color={C.white} />
                <Stat label="نقص" value={cmp.missing.length} color={C.red} />
                <Stat label="تدهورت حالته" value={cmp.worsened.length} color={C.yellow} />
                <div style={{
                  marginRight: 'auto', alignSelf: 'center', fontSize: 12.5, fontWeight: 700,
                  color: cmp.unchanged ? C.green : C.red,
                }}>
                  {cmp.unchanged ? '✓ لا فرق مسجّل' : '⚠ يوجد فرق يستوجب المراجعة'}
                </div>
              </div>

              <DiffTable rows={cmp.rows} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── مكونات صغيرة ─────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.whiteDD, letterSpacing: '0.06em' }}>{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function ItemTable({ items }: { items: { label: string; count: number; condition: ItemCondition; note?: string }[] }) {
  if (!items.length) {
    return <div style={{ fontSize: 12, color: C.whiteDD }}>لا توجد أصناف مسجّلة في هذا المحضر.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
          padding: '7px 10px', borderRadius: 5,
          background: 'rgba(255,255,255,0.03)',
          borderRight: `3px solid ${CONDITION_COLOR[it.condition]}`,
        }}>
          <span style={{ fontSize: 12.5, color: C.white, fontWeight: 600 }}>{it.label}</span>
          <span className="mono" style={{ fontSize: 12.5, color: C.green, fontWeight: 700 }}>×{it.count}</span>
          <span style={{ fontSize: 11, color: CONDITION_COLOR[it.condition], fontWeight: 600 }}>
            {conditionLabel(it.condition)}
          </span>
          {it.note && (
            <span style={{ fontSize: 11, color: C.whiteD, marginRight: 'auto' }}>— {it.note}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function DiffTable({ rows }: { rows: ReturnType<typeof diffItems>['rows'] }) {
  if (!rows.length) {
    return <div style={{ fontSize: 12, color: C.whiteDD }}>لا توجد أصناف للمقارنة.</div>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, direction: 'rtl' }}>
        <thead>
          <tr style={{ color: C.blue, fontSize: 10.5, letterSpacing: '0.06em' }}>
            <th style={th}>الصنف</th>
            <th style={th}>قبل</th>
            <th style={th}>بعد</th>
            <th style={th}>الفرق</th>
            <th style={th}>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const bad = r.delta < 0 || r.worsened
            return (
              <tr key={r.label} style={{
                borderTop: `1px solid ${C.blue}22`,
                background: bad ? 'rgba(165,32,25,0.08)' : 'transparent',
              }}>
                <td style={{ ...td, fontWeight: 600, color: C.white }}>{r.label}</td>
                <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{r.before}</td>
                <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{r.after}</td>
                <td style={{
                  ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                  color: r.delta < 0 ? C.red : r.delta > 0 ? C.green : C.whiteDD,
                }}>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                <td style={td}>
                  {r.conditionBefore && r.conditionAfter ? (
                    <span style={{ color: r.worsened ? C.red : r.improved ? C.green : C.whiteD }}>
                      {conditionLabel(r.conditionBefore)}
                      {r.conditionBefore !== r.conditionAfter ? ` ← ${conditionLabel(r.conditionAfter)}` : ''}
                      {r.worsened ? ' ⚠' : ''}
                    </span>
                  ) : (
                    <span style={{ color: C.whiteDD }}>
                      {r.after === 0 ? 'غير موجود في المحضر الأحدث' : 'صنف جديد'}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'right', padding: '7px 9px', fontWeight: 600 }
const td: React.CSSProperties = { textAlign: 'right', padding: '8px 9px', color: C.whiteD }
