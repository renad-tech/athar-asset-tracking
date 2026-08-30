// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — شاشة التقرير                                                   ║
// ║                                                                          ║
// ║  Saves the finished session to the database, then offers the report as   ║
// ║  a real PDF, Word file, or print — and as CSV/JSON for the records team. ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useRef, useState } from 'react'
import { C } from './theme'
import { SessionReport, type ReportData } from './SessionReport'
import { typeOf } from './sessionTypes'
import {
  dataUrlToBlob, exportReportCSV, exportReportDOC, exportReportJSON,
  exportReportPDF, printReportElement, saveSession, uploadFile, isLive,
} from './services/api'

export function ScreenReport({ data, logo, onHome, onCompare }: {
  data: ReportData
  logo: string
  onHome: () => void
  onCompare: () => void
}) {
  const t = typeOf(data.kind)
  const [saving, setSaving] = useState(true)
  const [saved, setSaved] = useState<{ ok: boolean; msg: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const once = useRef(false)

  // Persist once on mount — uploading the snapshots first so the row stores
  // durable URLs rather than multi-megabyte base64 strings.
  useEffect(() => {
    if (once.current) return
    once.current = true
    ;(async () => {
      if (!isLive()) {
        setSaving(false)
        setSaved({ ok: false, msg: 'قاعدة البيانات غير متصلة — التقرير متاح للتصدير لكنه لم يُحفظ.' })
        return
      }
      try {
        const stamp = Date.now()
        const put = async (dataUrl?: string, tag = 'shot') => {
          if (!dataUrl) return undefined
          return await uploadFile(dataUrlToBlob(dataUrl), `sessions/${stamp}-${tag}.jpg`) ?? undefined
        }
        const shotUrl = await put(data.shot, 'main')
        const afterUrl = await put(data.shotAfter, 'after')

        const res = await saveSession({
          kind: data.kind,
          asset_name: data.assetName,
          location: data.location,
          officer_badge: data.officer.id,
          officer_name: data.officer.name,
          from_party: data.fromParty,
          to_party: data.toParty,
          expected_count: data.expectedCount ? Number(data.expectedCount) : null,
          severity: data.severity,
          description: data.description,
          notes: data.notes,
          snapshot_url: shotUrl,
          snapshot_after: afterUrl,
          detected: data.items,
          detected_total: data.total,
          started_at: new Date(data.startedAt).toISOString(),
          ended_at: new Date(data.endedAt).toISOString(),
        })
        setSaving(false)
        setSaved(res.ok
          ? { ok: true, msg: 'حُفظت الجلسة في سجل الأصول.' }
          : { ok: false, msg: res.error ?? 'تعذّر الحفظ.' })
      } catch (e: any) {
        setSaving(false)
        setSaved({ ok: false, msg: e?.message ?? 'تعذّر الحفظ.' })
      }
    })()
  }, [])

  const flat: Record<string, string> = {
    'نوع الجلسة': t.label,
    'الأصل أو المرفق': data.assetName,
    'الموقع': data.location,
    'المشرف': data.officer.name,
    'الرقم الوظيفي': data.officer.id,
    'التاريخ': new Date(data.startedAt).toLocaleString('en-GB', { hour12: false }),
    'المُسلِّم': data.fromParty ?? '',
    'المُستلِم': data.toParty ?? '',
    'الأولوية': data.severity ?? '',
    'العدد المتوقع': data.expectedCount ?? '',
    'الإجمالي المرصود': String(data.total),
    'الملاحظات': data.notes ?? '',
  }

  const run = async (fmt: string) => {
    setBusy(fmt); setErr(null)
    try {
      if (fmt === 'PDF') await exportReportPDF('athar-session-report', data.assetName)
      else if (fmt === 'DOC') exportReportDOC('athar-session-report', data.assetName)
      else if (fmt === 'CSV') exportReportCSV([flat], data.assetName)
      else if (fmt === 'JSON') exportReportJSON({ ...flat, الموجودات: data.items }, data.assetName)
      else if (fmt === 'PRINT') printReportElement('athar-session-report')
    } catch (e: any) { setErr(e?.message ?? 'تعذّر التنفيذ') }
    finally { setBusy(null) }
  }

  const btn = (label: string, key: string, primary = false): React.CSSProperties => ({
    padding: '10px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    fontWeight: primary ? 700 : 500, flex: '1 1 110px',
    background: primary ? C.green : 'transparent',
    border: primary ? 'none' : `1px solid ${C.blue}77`,
    color: primary ? '#fff' : C.white,
    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
    opacity: busy === key ? 0.6 : 1,
  })

  return (
    <div style={{
      minHeight: '100%', background: C.bg, direction: 'rtl',
      padding: 'clamp(14px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 14,
    }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'clamp(17px, 2.6vw, 22px)', fontWeight: 700, color: C.white }}>
          تقرير الجلسة
        </div>
        <div style={{
          padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 700,
          background: C.greenDim, border: `1px solid ${C.green}66`, color: C.green,
        }}>{t.label}</div>
      </div>

      {/* save state */}
      <div style={{
        padding: '10px 14px', borderRadius: 6, fontSize: 12.5, lineHeight: 1.7,
        background: saving ? 'rgba(255,255,255,0.04)' : saved?.ok ? C.greenDim : C.yellowDim,
        border: `1px solid ${saving ? C.blue + '44' : saved?.ok ? C.green + '66' : C.yellow + '66'}`,
        color: saving ? C.whiteD : saved?.ok ? C.green : C.yellow,
      }}>
        {saving ? '… جارٍ حفظ الجلسة' : saved?.msg}
      </div>

      {/* preview */}
      <div style={{
        background: '#111', borderRadius: 8, border: `1px solid ${C.blue}33`,
        padding: 14, overflowX: 'auto',
      }}>
        <div style={{ width: 'fit-content', margin: '0 auto', transform: 'scale(min(1, 1))', transformOrigin: 'top center' }}>
          <SessionReport data={data} logo={logo} preview />
        </div>
      </div>

      {err && (
        <div style={{
          padding: '9px 13px', borderRadius: 5, fontSize: 12,
          background: 'rgba(165,32,25,0.12)', border: `1px solid ${C.red}55`, color: C.red,
        }}>{err}</div>
      )}

      {/* actions */}
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <button style={btn('PDF', 'PDF', true)} onClick={() => run('PDF')}>
          {busy === 'PDF' ? '… جارٍ' : '⬇ تصدير PDF'}
        </button>
        <button style={btn('DOC', 'DOC')} onClick={() => run('DOC')}>Word</button>
        <button style={btn('CSV', 'CSV')} onClick={() => run('CSV')}>CSV</button>
        <button style={btn('JSON', 'JSON')} onClick={() => run('JSON')}>JSON</button>
        <button style={btn('PRINT', 'PRINT')} onClick={() => run('PRINT')}>🖨️ طباعة</button>
      </div>

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 8 }}>
        <button onClick={onCompare} style={{
          flex: '1 1 180px', padding: '11px 18px', borderRadius: 6, cursor: 'pointer',
          background: 'transparent', border: `1px solid ${C.green}88`, color: C.green,
          fontSize: 13.5, fontWeight: 600, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>⇄ مقارنة بجلسة سابقة</button>
        <button onClick={onHome} style={{
          flex: '1 1 180px', padding: '11px 18px', borderRadius: 6, cursor: 'pointer',
          background: C.green, border: 'none', color: '#fff',
          fontSize: 13.5, fontWeight: 700, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>جلسة جديدة ←</button>
      </div>

      {/* off-screen exportable copy */}
      <div aria-hidden style={{ position: 'fixed', left: -99999, top: 0, zIndex: -1 }}>
        <SessionReport data={data} logo={logo} />
      </div>
    </div>
  )
}
