// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — بيانات الجلسة                                                  ║
// ║                                                                          ║
// ║  Fields are generated from the chosen session type, so a handover asks   ║
// ║  who hands over to whom, an audit asks for the expected count, and an    ║
// ║  incident asks for severity — without any screen knowing about the       ║
// ║  others.                                                                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useState } from 'react'
import { C } from './theme'
import { typeOf, type FieldKey, type SessionKind } from './sessionTypes'
import { fetchAssets, type Asset } from './services/api'

export type SessionDraft = Partial<Record<FieldKey, string>> & { assetId?: string }

export function ScreenSessionData({ kind, officer, onBack, onNext }: {
  kind: SessionKind
  officer: { name: string; id: string }
  onBack: () => void
  onNext: (draft: SessionDraft) => void
}) {
  const t = typeOf(kind)
  const [draft, setDraft] = useState<SessionDraft>({})
  const [missing, setMissing] = useState<FieldKey[]>([])
  const [assets, setAssets] = useState<Asset[]>([])

  useEffect(() => { fetchAssets().then(setAssets).catch(() => {}) }, [])

  const set = (k: FieldKey, v: string) => {
    setDraft(d => ({ ...d, [k]: v }))
    setMissing(m => m.filter(x => x !== k))
  }

  /** Picking a registered asset fills the name and location in one tap. */
  const pickAsset = (id: string) => {
    const a = assets.find(x => x.id === id)
    if (!a) return
    setDraft(d => ({ ...d, assetId: a.id, assetName: a.name, location: a.location ?? d.location }))
    setMissing(m => m.filter(x => x !== 'assetName' && x !== 'location'))
  }

  const submit = () => {
    const blanks = t.fields.filter(f => f.required && !String(draft[f.key] ?? '').trim()).map(f => f.key)
    if (blanks.length) { setMissing(blanks); return }
    onNext(draft)
  }

  const label = (txt: string, required?: boolean, invalid?: boolean) => (
    <span style={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
      color: invalid ? C.red : C.blue, textTransform: 'uppercase',
    }}>
      {txt}{required && <span style={{ color: C.red, marginRight: 3 }}> *</span>}
    </span>
  )

  const box = (invalid?: boolean): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box',
    background: invalid ? 'rgba(165,32,25,0.10)' : 'rgba(0,83,135,0.06)',
    border: 'none', borderBottom: `1.5px solid ${invalid ? C.red : C.blue + '55'}`,
    borderRadius: '3px 3px 0 0',
    color: C.white, fontSize: 14, padding: '9px 10px',
    outline: 'none', direction: 'rtl',
    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
  })

  return (
    <div style={{
      minHeight: '100%', background: C.bg, direction: 'rtl',
      padding: 'clamp(16px, 3.5vw, 32px)', display: 'flex', flexDirection: 'column',
    }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: `1px solid ${C.blue}55`, color: C.white,
          borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 12,
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>→ رجوع</button>

        <div style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: C.greenDim, border: `1px solid ${C.green}66`, color: C.green,
        }}>{t.label}</div>

        <div style={{ fontSize: 12, color: C.whiteD, marginRight: 'auto' }}>
          {officer.name} · <span className="mono">{officer.id}</span>
        </div>
      </div>

      <div style={{ fontSize: 'clamp(17px, 2.6vw, 22px)', fontWeight: 700, color: C.white, marginBottom: 6 }}>
        بيانات الجلسة
      </div>
      <div style={{ fontSize: 12.5, color: C.whiteD, marginBottom: 20, lineHeight: 1.8 }}>
        الحقول المعلّمة بـ <span style={{ color: C.red, fontWeight: 700 }}>*</span> إلزامية.
        بقية البيانات يرصدها النظام تلقائياً في الخطوة التالية.
      </div>

      {/* registered asset picker */}
      {assets.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          {label('اختيار أصل مسجّل (اختياري)')}
          <select
            value={draft.assetId ?? ''}
            onChange={e => pickAsset(e.target.value)}
            style={{ ...box(), marginTop: 5, cursor: 'pointer' }}>
            <option value="" style={{ background: '#1a1a1a' }}>— أو اكتب البيانات يدوياً —</option>
            {assets.map(a => (
              <option key={a.id} value={a.id} style={{ background: '#1a1a1a' }}>
                {a.name} — {a.location}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* type-driven fields */}
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
      }}>
        {t.fields.map(f => {
          const invalid = missing.includes(f.key)
          const v = draft[f.key] ?? ''
          return (
            <div key={f.key} style={{ gridColumn: f.multiline ? '1 / -1' : undefined }}>
              {label(f.label, f.required, invalid)}
              {f.options ? (
                <select value={v} onChange={e => set(f.key, e.target.value)}
                  style={{ ...box(invalid), marginTop: 5, cursor: 'pointer' }}>
                  <option value="" style={{ background: '#1a1a1a' }}>— اختر —</option>
                  {f.options.map(o => (
                    <option key={o} value={o} style={{ background: '#1a1a1a' }}>{o}</option>
                  ))}
                </select>
              ) : f.multiline ? (
                <textarea value={v} placeholder={f.placeholder} rows={3}
                  onChange={e => set(f.key, e.target.value)}
                  style={{ ...box(invalid), marginTop: 5, resize: 'vertical' }} />
              ) : (
                <input value={v} placeholder={f.placeholder}
                  onChange={e => set(f.key, e.target.value)}
                  style={{ ...box(invalid), marginTop: 5 }} />
              )}
            </div>
          )
        })}
      </div>

      {missing.length > 0 && (
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 6, fontSize: 12.5,
          background: 'rgba(165,32,25,0.10)', border: `1px solid ${C.red}55`, color: C.red,
        }}>
          يرجى تعبئة: {t.fields.filter(f => missing.includes(f.key)).map(f => f.label).join(' · ')}
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 24 }}>
        <button onClick={submit} style={{
          width: '100%', padding: '13px 20px', borderRadius: 7, cursor: 'pointer',
          background: C.green, border: 'none', color: '#fff',
          fontSize: 15, fontWeight: 700, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>
          المتابعة إلى التوثيق البصري ←
        </button>
      </div>
    </div>
  )
}
