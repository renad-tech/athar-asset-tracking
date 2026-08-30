// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — الشاشة الرئيسية                                                ║
// ║                                                                          ║
// ║  The first decision the operator makes. Everything downstream — which    ║
// ║  fields are asked for, how evidence is captured, and what the report     ║
// ║  contains — follows from the type chosen here.                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { C } from './theme'
import { SESSION_TYPES, TYPE_ORDER, type SessionKind } from './sessionTypes'

const ICONS: Record<string, string> = {
  camera:    '📷',
  compare:   '⇄',
  clipboard: '☑',
  search:    '🔍',
  alert:     '⚠',
  custody:   '🗄',
}

const TINT = { green: C.green, blue: C.blue, yellow: C.yellow, red: C.red } as const

export function ScreenHome({ officer, onPick, onCustody, onHandover }: {
  officer: { name: string; id: string }
  onPick: (k: SessionKind) => void
  onCustody: () => void
  onHandover: () => void
}) {
  return (
    <div style={{
      minHeight: '100%', background: C.bg, padding: 'clamp(16px, 4vw, 40px)',
      display: 'flex', flexDirection: 'column', direction: 'rtl',
    }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 'clamp(20px, 4vw, 36px)',
      }}>
        <div>
          <div style={{
            fontSize: 'clamp(20px, 3.4vw, 30px)', fontWeight: 700, color: C.white, lineHeight: 1.4,
          }}>
            توثيق الأصول والمرافق
          </div>
          <div style={{ fontSize: 'clamp(11px, 1.6vw, 14px)', color: C.whiteD, marginTop: 4 }}>
            نظام ذكي لحصر وتوثيق الأصول والمرافق
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.blue}33`,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: C.greenDim, border: `1px solid ${C.green}66`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: C.green, fontWeight: 700,
          }}>{officer.name?.[0] ?? '؟'}</div>
          <div>
            <div style={{ fontSize: 12, color: C.white, fontWeight: 600 }}>{officer.name}</div>
            <div className="mono" style={{ fontSize: 10, color: C.whiteDD }}>{officer.id}</div>
          </div>
        </div>
      </div>

      {/* ── Prompt ─────────────────────────────────────────────────── */}
      <div style={{
        fontSize: 'clamp(13px, 1.8vw, 16px)', color: C.white,
        marginBottom: 'clamp(12px, 2vw, 20px)', fontWeight: 600,
      }}>
        اختر نوع الجلسة للبدء
      </div>

      {/* ── Type cards ─────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        gap: 'clamp(10px, 1.6vw, 16px)',
      }}>
        {TYPE_ORDER.map(k => {
          const t = SESSION_TYPES[k]
          const tint = TINT[t.color]
          return (
            <button
              key={k}
              onClick={() => onPick(k)}
              style={{
                textAlign: 'right', direction: 'rtl', cursor: 'pointer',
                padding: 'clamp(14px, 2.2vw, 20px)',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${tint}44`,
                borderTop: `2px solid ${tint}`,
                color: C.white,
                fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                display: 'flex', flexDirection: 'column', gap: 8,
                transition: 'background 0.15s ease, transform 0.15s ease',
                minHeight: 118,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 9, flexShrink: 0,
                background: `${tint}22`, border: `1px solid ${tint}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 19,
              }}>{ICONS[t.icon] ?? '●'}</div>

              <div style={{ fontSize: 'clamp(14px, 1.9vw, 17px)', fontWeight: 700, color: tint }}>
                {t.label}
              </div>
              <div style={{ fontSize: 'clamp(10px, 1.4vw, 12.5px)', color: C.whiteD, lineHeight: 1.7 }}>
                {t.hint}
              </div>
            </button>
          )
        })}

        {/* بطاقة التسليم والاستلام — شاشة مستقلة بطرفين موثّقين، لا صرف من مستودع */}
        <button
          onClick={onHandover}
          style={{
            textAlign: 'right', direction: 'rtl', cursor: 'pointer',
            padding: 'clamp(14px, 2.2vw, 20px)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${C.blue}44`,
            borderTop: `2px solid ${C.blue}`,
            color: C.white,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            display: 'flex', flexDirection: 'column', gap: 8,
            transition: 'background 0.15s ease, transform 0.15s ease',
            minHeight: 118,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 9, flexShrink: 0,
            background: `${C.blue}22`, border: `1px solid ${C.blue}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19,
          }}>{ICONS.compare}</div>

          <div style={{ fontSize: 'clamp(14px, 1.9vw, 17px)', fontWeight: 700, color: C.blue }}>
            التسليم والاستلام
          </div>
          <div style={{ fontSize: 'clamp(10px, 1.4vw, 12.5px)', color: C.whiteD, lineHeight: 1.7 }}>
            نقل مسؤولية أصل بين طرفين — مُسلِّم ومستلم — بإثبات موثّق
          </div>
        </button>

        {/* بطاقة العهدة — منفصلة عن أنواع الجلسات، لها شاشتها الخاصة (صرف/سلسلة) */}
        <button
          onClick={onCustody}
          style={{
            textAlign: 'right', direction: 'rtl', cursor: 'pointer',
            padding: 'clamp(14px, 2.2vw, 20px)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${C.green}44`,
            borderTop: `2px solid ${C.green}`,
            color: C.white,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            display: 'flex', flexDirection: 'column', gap: 8,
            transition: 'background 0.15s ease, transform 0.15s ease',
            minHeight: 118,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 9, flexShrink: 0,
            background: `${C.green}22`, border: `1px solid ${C.green}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19,
          }}>{ICONS.custody}</div>

          <div style={{ fontSize: 'clamp(14px, 1.9vw, 17px)', fontWeight: 700, color: C.green }}>
            العهدة
          </div>
          <div style={{ fontSize: 'clamp(10px, 1.4vw, 12.5px)', color: C.whiteD, lineHeight: 1.7 }}>
            صرف عهدة جديدة أو مراجعة سلسلة عهدة أصل
          </div>
        </button>
      </div>

      {/* ── Device hint ────────────────────────────────────────────── */}
      <div style={{
        marginTop: 'auto', paddingTop: 'clamp(16px, 3vw, 28px)',
        fontSize: 11, color: C.whiteDD, lineHeight: 1.8,
      }}>
        يعمل النظام على الجوال والجهاز اللوحي والحاسب — ولتجربة التوثيق البصري كاملة يُفضّل الحاسب المحمول.
      </div>
    </div>
  )
}
