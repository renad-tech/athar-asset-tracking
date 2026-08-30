// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — صرف العهدة                                                     ║
// ║                                                                          ║
// ║  ثلاث خطوات، وفي كل واحدة منها مبدأ واحد:                                ║
// ║    ١) المستلم  — يُقرأ من البطاقة، لا يُكتب. الاسم المكتوب ادعاء،        ║
// ║                  والبطاقة الممسوحة إثبات.                                ║
// ║    ٢) التصوير  — الكاميرا تحصر، والمسؤول يصحّح ويحدد حالة كل صنف.        ║
// ║                  «سليم» قرار مثبّت بصورة، لا خانة افتراضية.              ║
// ║    ٣) الإقرار  — نص رسمي مربوط بالحالة الموثقة، وتوقيع بمسح البطاقة.     ║
// ║                                                                          ║
// ║  الذكاء يقترح والمسؤول يعتمد — لا نستبدل الإنسان.                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useRef, useState } from 'react'
import { C } from './theme'
import { BadgeScanner, EmployeeCard } from './BadgeScanner'
import { ScreenChain } from './ScreenChain'
import { countObjects, loadPersonModel, snapshot } from './vision'
import {
  fetchAssets, saveAsset, openCamera, exportReportPDF, printReportElement,
  deleteSession,  // ✅ أضيفي هذا السطر فقط
  type Asset, type Employee,
} from './services/api'
import {
  ACK_TEXT, CONDITIONS, conditionLabel, currentHolder, downloadICS,
  inspectionOptions, saveCustody, fmtDay, fmtDate, arabicDate,
  type CustodyItem, type CustodyRecord, type ItemCondition,
} from './services/custody'
import { getSettings } from './settings'

export const CONDITION_COLOR: Record<ItemCondition, string> = {
  ok: C.green, note: C.yellow, damaged: C.red,
}

type Step = 1 | 2 | 3 | 4

// عناوين قصيرة عمداً: الطويلة تكسر الشريط إلى سطرين على شاشة الجوال.
const STEP_TITLES: Record<Step, string> = {
  1: 'المستلم',
  2: 'التصوير',
  3: 'الإقرار',
  4: 'تم الصرف',
}

export function ScreenCustody({ officer }: {
  officer: { name: string; id: string; unit?: string; role?: string }
}) {
  const [mode, setMode] = useState<'issue' | 'chain'>('issue')
  const [chainAsset, setChainAsset] = useState<string | undefined>(undefined)

  const tab = (key: 'issue' | 'chain', label: string) => {
    const active = mode === key
    return (
      <button key={key} onClick={() => setMode(key)} style={{
        padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
        fontSize: 12.5, fontWeight: active ? 700 : 500,
        background: active ? C.green : 'transparent',
        border: `1px solid ${active ? C.green : C.blue + '55'}`,
        color: active ? '#fff' : C.white,
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
      }}>{label}</button>
    )
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, direction: 'rtl' }}>
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap',
        padding: 'clamp(12px, 2.5vw, 20px) clamp(14px, 3vw, 28px) 0',
      }}>
        {tab('issue', 'صرف عهدة جديدة')}
        {tab('chain', 'سلسلة العهدة')}
      </div>

      {mode === 'issue'
        ? <CustodyWizard officer={officer} onViewChain={id => { setChainAsset(id); setMode('chain') }} />
        : <ScreenChain initialAssetId={chainAsset} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// المعالج — ثلاث خطوات
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// اختيار الأصل — قائمة أو كتابة حرة
// ══════════════════════════════════════════════════════════════════════════════

/**
 * لا تُقصر المستخدمة على قائمة مغلقة: تقدر تختار أصلاً مسجّلاً، أو تكتب موقعاً
 * جديداً لم يُسجَّل بعد. الكتابة الحرة لا تُفقد ميزة سلسلة العهدة — الموقع
 * الجديد يُسجَّل تلقائياً كأصل عند المتابعة، فتبدأ له سلسلته الخاصة من هذا
 * المحضر بالضبط.
 */
export function AssetPicker({ assets, asset, query, onQueryChange, onAssetChange, customLocation, onCustomLocationChange }: {
  assets: Asset[]
  asset: Asset | null
  query: string
  onQueryChange: (q: string) => void
  onAssetChange: (a: Asset | null) => void
  customLocation: string
  onCustomLocationChange: (v: string) => void
}) {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ')
  const listId = 'athar-assets-datalist'

  return (
    <Card>
      <FieldLabel>الأصل أو الموقع</FieldLabel>
      <input
        list={listId}
        value={query}
        onChange={e => {
          const v = e.target.value
          onQueryChange(v)
          const match = assets.find(a =>
            norm(`${a.name} — ${a.location ?? ''}`) === norm(v) || norm(a.name) === norm(v))
          onAssetChange(match ?? null)
        }}
        placeholder="اختاري من القائمة، أو اكتبي موقعاً جديداً — مثال: مخزن كلية الهندسة"
        style={{ ...selectStyle, cursor: 'text' }}
      />
      <datalist id={listId}>
        {assets.map(a => (
          <option key={a.id} value={`${a.name} — ${a.location ?? ''}`} />
        ))}
      </datalist>

      {asset ? (
        <Note>
          أصل مسجّل: {asset.name}{asset.location ? ` — ${asset.location}` : ''}
        </Note>
      ) : query.trim() ? (
        <>
          <div style={{ marginTop: 12 }}>
            <FieldLabel>تفاصيل الموقع (اختياري)</FieldLabel>
            <input value={customLocation} onChange={e => onCustomLocationChange(e.target.value)}
              placeholder="مثال: الطابق الثاني، بجانب المصعد"
              style={{ ...selectStyle, cursor: 'text' }} />
          </div>
          <Note>
            «{query.trim()}» غير مسجّل في سجل الأصول. سيُسجَّل تلقائياً كأصل جديد عند المتابعة،
            وتبدأ له سلسلة عهدة خاصة من هذا المحضر. تنبيه: كتابة الاسم بصيغة مختلفة كل مرة
            («معمل ٢٠٥» ثم «معمل 205» مثلاً) تُنشئ أصلين منفصلين لا واحداً — اختاري من القائمة
            متى توفّرت لتفادي هذا.
          </Note>
        </>
      ) : (
        <Note>
          الأصول المسجّلة تأتي من سجل الأصول. اكتبي اسماً جديداً إن لم يكن الموقع مسجّلاً بعد.
        </Note>
      )}
    </Card>
  )
}

function CustodyWizard({ officer, onViewChain }: {
  officer: { name: string; id: string; unit?: string; role?: string }
  onViewChain: (assetId: string) => void
}) {
  const [step, setStep] = useState<Step>(1)

  // ── الخطوة ١ ────────────────────────────────────────────────────────
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetQuery, setAssetQuery] = useState('')
  const [asset, setAsset] = useState<Asset | null>(null)
  const [customLocation, setCustomLocation] = useState('')
  const [creatingAsset, setCreatingAsset] = useState(false)
  const [holder, setHolder] = useState<Employee | null>(null)
  const [prev, setPrev] = useState<CustodyRecord | null>(null)

  // ── الخطوة ٢ ────────────────────────────────────────────────────────
  const [shot, setShot] = useState<string | null>(null)
  const [items, setItems] = useState<CustodyItem[]>([])
  const [usedModel, setUsedModel] = useState(false)

  // ── الخطوة ٣ ────────────────────────────────────────────────────────
  const opts = useRef(inspectionOptions()).current
  const [inspectKey, setInspectKey] = useState<string>(opts[0].key)
  const [inspectDate, setInspectDate] = useState<string>(opts[0].date)
  const [notes, setNotes] = useState('')
  const [signer, setSigner] = useState<Employee | null>(null)
  const [signedAt, setSignedAt] = useState<string | null>(null)

  // ── الحفظ ───────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const remove = async (id: string) => {
  if (!id) return
  if (!confirm(`حذف هذه العهدة؟\nلا يمكن التراجع.`)) return
  try {
    const ok = await deleteSession(id)
    if (ok) {
      alert('✓ تم حذف العهدة بنجاح')
      reset()
    } else {
      alert('✗ تعذّر الحذف')
    }
  } catch (e: any) {
    alert(`✗ خطأ: ${e.message}`)
  }
}

  useEffect(() => { fetchAssets().then(setAssets).catch(() => {}) }, [])

  // مَن بيده الأصل الآن — يظهر للمسؤول قبل الصرف حتى لا يُصرف مرتين.
  // لا تُستعلم إلا لأصل معروف بالفعل (مسجّل أو أُنشئ للتو) — أصل لم يُنشأ
  // بعد بداهة ليس له تاريخ عهدة.
  useEffect(() => {
    if (!asset?.id) { setPrev(null); return }
    currentHolder(asset.id).then(setPrev).catch(() => setPrev(null))
  }, [asset?.id])

  const totals = {
    count: items.reduce((s, i) => s + i.count, 0),
    damaged: items.filter(i => i.condition === 'damaged').length,
    noted: items.filter(i => i.condition === 'note').length,
  }

  const inspectLabel = opts.find(o => o.key === inspectKey)?.label ?? 'موعد مخصص'

  const ackText = ACK_TEXT({
    holderName: holder?.name,
    holderId: holder?.emp_id,
    assetName: asset?.name,
    location: asset?.location,
    totalItems: totals.count,
    damaged: totals.damaged,
    noted: totals.noted,
    nextInspectionLabel: inspectLabel,
    nextInspection: inspectDate,
  })

  // ── الحفظ النهائي ───────────────────────────────────────────────────
  const save = async () => {
    if (!holder || !asset || !signer) return
    setSaving(true); setError(null)

    const res = await saveCustody({
      record: {
        asset_id: asset.id,
        asset_name: asset.name,
        location: asset.location,
        holder_id: holder.emp_id,
        holder_name: holder.name,
        holder_role: holder.role,
        issuer_badge: officer.id,
        issuer_name: officer.name,
        action: 'issue',
        ack_text: ackText,
        ack_signed_by: signer.emp_id,
        ack_signed_at: signedAt ?? new Date().toISOString(),
        next_inspection: inspectDate || null,
        next_inspection_label: inspectLabel,
        notes: notes.trim() || undefined,
      },
      items,
      snapshot: shot,
    })

    setSaving(false)
    if (!res.ok) { setError(res.error ?? 'تعذّر حفظ المحضر'); return }
    if (res.error) setError(res.error)      // حُفظ المحضر لكن مع تحذير
    setSavedId(res.id ?? null)
    setStep(4)
  }

  /**
   * تُستدعى عند الانتقال من الخطوة ١. إن كانت الكتابة تطابق أصلاً مسجّلاً
   * فلا شيء يتغيّر. وإن كانت موقعاً جديداً، تُسجّله في سجل الأصول أولاً حتى
   * يُصرف عليه محضر له معرّف حقيقي — لا وصف مكتوب بلا أصل خلفه.
   */
  const resolveAsset = async (): Promise<Asset | null> => {
    if (asset) return asset
    const name = assetQuery.trim()
    if (!name) return null

    setCreatingAsset(true)
    const created: Asset = {
      id: `CUSTOM-${Date.now().toString(36).toUpperCase()}`,
      name,
      location: customLocation.trim() || name,
    }
    const ok = await saveAsset(created)
    setCreatingAsset(false)

    if (!ok) {
      setError('تعذّر تسجيل الموقع الجديد كأصل — تحقّقي من الاتصال ثم أعيدي المحاولة.')
      return null
    }
    setAssets(list => [...list, created])
    setAsset(created)
    return created
  }

  const reset = () => {
    setStep(1); setAssetQuery(''); setAsset(null); setCustomLocation('')
    setHolder(null); setPrev(null)
    setShot(null); setItems([]); setUsedModel(false)
    setInspectKey(opts[0].key); setInspectDate(opts[0].date)
    setNotes(''); setSigner(null); setSignedAt(null)
    setSavedId(null); setError(null)
  }

  const canNext =
    step === 1 ? !!((asset || assetQuery.trim()) && holder) :
    step === 2 ? !!shot :
    step === 3 ? !!signer :
    false

  return (
    <div style={{
      padding: 'clamp(14px, 3vw, 28px)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>

      <StepBar step={step} />

      {/* ═══ الخطوة ١ — المستلم ═════════════════════════════════ */}
      {step === 1 && (
        <>
          <AssetPicker
            assets={assets} asset={asset}
            query={assetQuery} onQueryChange={setAssetQuery}
            onAssetChange={setAsset}
            customLocation={customLocation} onCustomLocationChange={setCustomLocation}
          />

          {prev && (
            <div style={{
              padding: '12px 15px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.9,
              background: C.yellowDim, border: `1px solid ${C.yellow}55`, color: C.white,
            }}>
              ⚠ هذا الأصل مسجّل حالياً في عهدة <strong>{prev.holder_name}</strong>
              {' '}منذ {fmtDay(prev.created_at)}. صرفه لشخص آخر سيُسجَّل كحلقة جديدة في
              السلسلة، وتُنسب أي فروقات إلى فترة الحائز السابق.
            </div>
          )}

          {holder ? (
            <EmployeeCard emp={holder} label="المستلم" onChange={() => setHolder(null)} />
          ) : (
            <BadgeScanner
              title="امسح بطاقة المستلم"
              hint="ارفع البطاقة أمام الكاميرا داخل الإطار. الاسم والمنصب سيأتيان من سجل الموظفين تلقائياً — بلا كتابة."
              onPick={setHolder}
            />
          )}
        </>
      )}

      {/* ═══ الخطوة ٢ — التصوير والحصر ══════════════════════════ */}
      {step === 2 && (
        <CaptureStep
          shot={shot} items={items} usedModel={usedModel}
          onCaptured={(s, list, model) => { setShot(s); setItems(list); setUsedModel(model) }}
          onItems={setItems}
          onRetake={() => { setShot(null); setItems([]) }}
        />
      )}

      {/* ═══ الخطوة ٣ — الإقرار والتوقيع ════════════════════════ */}
      {step === 3 && (
        <>
          <Card>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.white, marginBottom: 9 }}>
              نص الإقرار
            </div>
            <div style={{
              fontSize: 12.5, color: C.white, lineHeight: 2.15,
              padding: '13px 15px', borderRadius: 7,
              background: 'rgba(0,0,0,0.28)', borderRight: `3px solid ${C.green}`,
            }}>{ackText}</div>
            <Note>
              النموذج الورقي المعتاد يطلب الإقرار بأن العهدة «بحالة صالحة للاستخدام» بلا
              صورة ولا قائمة. هنا الإقرار مربوط بالحالة الموثقة أعلاه — وما ثُبّت من تلف
              قبل الاستلام لا يُسأل عنه المستلم.
            </Note>
          </Card>

          <Card>
            <FieldLabel>موعد التفتيش القادم</FieldLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {opts.map(o => {
                const active = inspectKey === o.key
                return (
                  <button key={o.key}
                    onClick={() => { setInspectKey(o.key); setInspectDate(o.date) }}
                    style={{
                      padding: '9px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
                      background: active ? C.greenDim : 'transparent',
                      border: `1px solid ${active ? C.green : C.blue + '55'}`,
                      color: active ? C.green : C.white, fontWeight: active ? 700 : 500,
                      fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                    }}>
                    {o.label}
                    <span style={{ fontSize: 10.5, color: C.whiteDD, marginRight: 7 }}>
                      {arabicDate(o.date)}
                    </span>
                  </button>
                )
              })}
            </div>

            <div style={{ marginTop: 12 }}>
              <FieldLabel>أو حدّد تاريخاً بنفسك</FieldLabel>
              <input type="date" value={inspectDate}
                onChange={e => { setInspectDate(e.target.value); setInspectKey('custom') }}
                style={{ ...selectStyle, cursor: 'text', maxWidth: 240 }} />
              {inspectDate && (
                <div style={{ fontSize: 12, color: C.green, marginTop: 7, fontWeight: 600 }}>
                  الموعد المعتمد: {arabicDate(inspectDate)}
                </div>
              )}
            </div>
            <Note>
              «نهاية الفصل الدراسي» تقدير مبدئي معروض لتعديله — لم نثبّت تقويماً أكاديمياً
              لم نتحقق منه.
            </Note>
          </Card>

          <Card>
            <FieldLabel>ملاحظات المحضر (اختياري)</FieldLabel>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="أي اتفاق أو ملاحظة يريد الطرفان تثبيتها"
              style={{ ...selectStyle, cursor: 'text', resize: 'vertical' }} />
          </Card>

          {signer ? (
            <div style={{
              padding: '13px 15px', borderRadius: 9,
              background: C.greenDim, border: `1px solid ${C.green}66`,
            }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: C.green }}>
                ✓ وُقّع بمسح البطاقة
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.white, marginTop: 4 }}>
                {signer.name} — <span className="mono">{signer.emp_id}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.whiteD, marginTop: 3 }}>
                {signedAt ? fmtDate(signedAt) : ''}
              </div>
              <button onClick={() => { setSigner(null); setSignedAt(null) }} style={{
                marginTop: 9, padding: '6px 13px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5,
                background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
                fontFamily: "'IBM Plex Sans Arabic', sans-serif",
              }}>إعادة التوقيع</button>
            </div>
          ) : (
            <BadgeScanner
              title="التوقيع — امسح بطاقة المستلم مرة أخرى"
              hint={`مسح البطاقة هو التوقيع. لن تُقبل بطاقة شخص آخر — يجب أن تكون بطاقة ${holder?.name ?? 'المستلم'}.`}
              expectId={holder?.emp_id}
              onPick={emp => { setSigner(emp); setSignedAt(new Date().toISOString()) }}
            />
          )}

          {error && <ErrorBox text={error} />}
        </>
      )}

      {/* ═══ الخطوة ٤ — تم ══════════════════════════════════════ */}
      {step === 4 && (
        <DoneStep
          savedId={savedId}
          warning={error}
          receipt={{
            asset, holder, signer, officer, items, shot, ackText,
            inspectDate, inspectLabel, notes, totals,
          }}
          onNew={reset}
          onRemove={savedId ? () => remove(savedId) : undefined}
          onChain={() => asset && onViewChain(asset.id)}
        />
      )}

      {/* ── التنقل ──────────────────────────────────────────────── */}
      {step < 4 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          {step > 1 && (
            <button onClick={() => setStep((step - 1) as Step)} style={{
              flex: '1 1 130px', padding: '12px 18px', borderRadius: 7, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
              fontSize: 13.5, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            }}>→ السابق</button>
          )}

          {step < 3 ? (
            <button onClick={async () => {
              if (!canNext) return
              if (step === 1) { const a = await resolveAsset(); if (!a) return }
              setStep((step + 1) as Step)
            }} disabled={!canNext || creatingAsset} style={{
              flex: '2 1 220px', padding: '13px 20px', borderRadius: 7,
              cursor: canNext && !creatingAsset ? 'pointer' : 'not-allowed',
              background: canNext ? C.green : 'rgba(255,255,255,0.08)', border: 'none',
              color: '#fff', fontSize: 14.5, fontWeight: 700,
              fontFamily: "'IBM Plex Sans Arabic', sans-serif", opacity: canNext && !creatingAsset ? 1 : 0.55,
            }}>
              {creatingAsset ? '… جارٍ تسجيل الموقع' : step === 1 ? 'المتابعة إلى التصوير ←' : 'المتابعة إلى الإقرار ←'}
            </button>
          ) : (
            <button onClick={save} disabled={!canNext || saving} style={{
              flex: '2 1 220px', padding: '13px 20px', borderRadius: 7,
              cursor: canNext && !saving ? 'pointer' : 'not-allowed',
              background: canNext ? C.green : 'rgba(255,255,255,0.08)', border: 'none',
              color: '#fff', fontSize: 14.5, fontWeight: 700,
              fontFamily: "'IBM Plex Sans Arabic', sans-serif",
              opacity: canNext && !saving ? 1 : 0.55,
            }}>
              {saving ? '… جارٍ الحفظ' : 'اعتماد المحضر وحفظه'}
            </button>
          )}
        </div>
      )}

      {step < 4 && !canNext && (
        <div style={{ fontSize: 11.5, color: C.whiteDD, lineHeight: 1.8 }}>
          {step === 1 && 'اكتبي الأصل أو الموقع، وامسحي بطاقة المستلم للمتابعة.'}
          {step === 2 && 'التقط صورة الحالة للمتابعة — المحضر بلا صورة يعود إلى مجرد كلام.'}
          {step === 3 && 'التوقيع مطلوب: امسح بطاقة المستلم لاعتماد الإقرار.'}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// الخطوة ٢ — الكاميرا ومحرّر الأصناف
// ══════════════════════════════════════════════════════════════════════════════

export function CaptureStep({ shot, items, usedModel, onCaptured, onItems, onRetake }: {
  shot: string | null
  items: CustodyItem[]
  usedModel: boolean
  onCaptured: (shot: string, items: CustodyItem[], usedModel: boolean) => void
  onItems: (items: CustodyItem[]) => void
  onRetake: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => { loadPersonModel().then(setModelReady) }, [])

  useEffect(() => {
    if (shot) return                      // الصورة أُخذت — لا حاجة للكاميرا
    let stream: MediaStream | null = null
    let cancelled = false
    const st = getSettings()
    openCamera(st.facingMode, st.cameraId || undefined).then(({ stream: s, error }) => {
      if (cancelled) { s?.getTracks().forEach(t => t.stop()); return }
      if (!s) { setCamError(error ?? 'تعذّر تشغيل الكاميرا'); return }
      stream = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.play().catch(() => {})
        setReady(true); setCamError(null)
      }
    })
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [retry, shot])

  const capture = async () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    setBusy(true)
    const img = snapshot(v, 1280, 0.82)
    const { items: counted, usedModel: model } = await countObjects(v)
    setBusy(false)
    onCaptured(
      img,
      counted.map(c => ({ label: c.label, count: c.count, condition: 'ok' as ItemCondition, source: 'ai' as const })),
      model,
    )
  }

  const update = (i: number, patch: Partial<CustodyItem>) =>
    onItems(items.map((it, x) => x === i ? { ...it, ...patch } : it))

  const remove = (i: number) => onItems(items.filter((_, x) => x !== i))

  const add = () => {
    const label = newLabel.trim()
    if (!label) return
    onItems([...items, { label, count: 1, condition: 'ok', source: 'manual' }])
    setNewLabel('')
  }

  return (
    <>
      {/* ── الكاميرا أو الصورة ───────────────────────────────────── */}
      <div style={{
        position: 'relative', background: '#080808', borderRadius: 9,
        border: `2px solid ${shot ? C.green : C.blue}66`, overflow: 'hidden',
        aspectRatio: '4 / 3', maxHeight: 380,
      }}>
        {shot
          ? <img src={shot} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <video ref={videoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: ready ? 0.95 : 0 }} />}

        {!shot && !ready && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 11.5, color: camError ? C.yellow : C.green }}>
              {camError ? '● الكاميرا غير متاحة' : '● جارٍ تشغيل الكاميرا…'}
            </div>
            {camError && (
              <>
                <div style={{ fontSize: 12, color: C.white, lineHeight: 1.85, maxWidth: 340 }}>{camError}</div>
                <button onClick={() => { setCamError(null); setRetry(r => r + 1) }} style={{
                  padding: '7px 16px', fontSize: 11.5, cursor: 'pointer', borderRadius: 5,
                  background: 'transparent', color: C.green, border: `1px solid ${C.green}`, fontWeight: 600,
                }}>إعادة المحاولة ↻</button>
              </>
            )}
          </div>
        )}

        {busy && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.58)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13.5, color: C.green, fontWeight: 700,
          }}>… جارٍ حصر الأصناف</div>
        )}

        <div style={{
          position: 'absolute', top: 10, insetInlineStart: 10,
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          padding: '4px 9px', borderRadius: 4, background: 'rgba(0,0,0,0.66)',
          border: `1px solid ${modelReady ? C.green : C.blue}66`,
          color: modelReady ? C.green : C.blue,
        }}>
          {modelReady ? '● الحصر الذكي جاهز' : '● وضع التصوير فقط'}
        </div>
      </div>

      {!shot ? (
        <button onClick={capture} disabled={!ready || busy} style={{
          padding: '13px 20px', borderRadius: 7,
          cursor: ready && !busy ? 'pointer' : 'not-allowed',
          background: ready ? C.green : 'rgba(255,255,255,0.08)', border: 'none',
          color: '#fff', fontSize: 15, fontWeight: 700,
          fontFamily: "'IBM Plex Sans Arabic', sans-serif", opacity: ready && !busy ? 1 : 0.6,
        }}>📷 التقاط وحصر الأصناف</button>
      ) : (
        <button onClick={onRetake} style={{
          padding: '11px 18px', borderRadius: 7, cursor: 'pointer',
          background: 'transparent', border: `1px solid ${C.blue}77`, color: C.white,
          fontSize: 13, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>↻ إعادة الالتقاط</button>
      )}

      {/* ── محرّر الأصناف ────────────────────────────────────────── */}
      {shot && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 5 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.white }}>الأصناف وحالة كل صنف</div>
            <div style={{ marginRight: 'auto', fontSize: 11.5, color: C.whiteD }}>
              الإجمالي: <span className="mono" style={{ color: C.green, fontWeight: 700 }}>
                {items.reduce((s, i) => s + i.count, 0)}
              </span>
            </div>
          </div>

          <Note>
            {usedModel
              ? 'ما تراه أدناه اقتراح من الكاميرا. صحّحه وأضِف ما فاته — الاعتماد قرارك أنت.'
              : 'الحصر الذكي غير مفعّل، فالصورة محفوظة كدليل بصري. أضِف الأصناف يدوياً أدناه.'}
          </Note>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
            {items.map((it, i) => (
              <div key={i} style={{
                padding: '11px 12px', borderRadius: 7,
                background: 'rgba(0,0,0,0.26)',
                border: `1px solid ${C.blue}33`,
                borderRight: `3px solid ${CONDITION_COLOR[it.condition]}`,
                display: 'flex', flexDirection: 'column', gap: 9,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <input value={it.label} onChange={e => update(i, { label: e.target.value })}
                    style={{
                      flex: '1 1 140px', minWidth: 0, boxSizing: 'border-box',
                      background: 'transparent', border: 'none',
                      borderBottom: `1px solid ${C.blue}44`,
                      color: C.white, fontSize: 14, fontWeight: 600, padding: '4px 2px',
                      outline: 'none', direction: 'rtl',
                      fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                    }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <StepBtn onClick={() => update(i, { count: Math.max(1, it.count - 1) })}>−</StepBtn>
                    <span className="mono" style={{
                      minWidth: 28, textAlign: 'center', fontSize: 15,
                      fontWeight: 700, color: C.green,
                    }}>{it.count}</span>
                    <StepBtn onClick={() => update(i, { count: it.count + 1 })}>+</StepBtn>
                  </div>

                  <button onClick={() => remove(i)} title="حذف الصنف" style={{
                    padding: '5px 11px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5,
                    background: 'transparent', border: `1px solid ${C.red}55`, color: C.red,
                    fontFamily: "'IBM Plex Sans Arabic', sans-serif", flexShrink: 0,
                  }}>حذف</button>
                </div>

                {/* الحالة — القرار الذي يحمي المستلم لاحقاً */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CONDITIONS.map(c => {
                    const active = it.condition === c.key
                    return (
                      <button key={c.key}
                        onClick={() => update(i, { condition: c.key, note: c.key === 'ok' ? undefined : it.note })}
                        style={{
                          padding: '6px 13px', borderRadius: 20, cursor: 'pointer', fontSize: 11.5,
                          fontWeight: active ? 700 : 500,
                          background: active ? `${CONDITION_COLOR[c.key]}22` : 'transparent',
                          border: `1px solid ${active ? CONDITION_COLOR[c.key] : C.whiteDD}`,
                          color: active ? CONDITION_COLOR[c.key] : C.whiteD,
                          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                        }}>{c.label}</button>
                    )
                  })}
                </div>

                {it.condition !== 'ok' && (
                  <input value={it.note ?? ''} onChange={e => update(i, { note: e.target.value })}
                    placeholder={it.condition === 'damaged' ? 'وصف التلف — يُثبت أنه قبل الاستلام' : 'الملاحظة'}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 5,
                      background: 'rgba(0,0,0,0.3)', color: C.white, fontSize: 16,
                      border: `1px solid ${CONDITION_COLOR[it.condition]}55`, outline: 'none',
                      direction: 'rtl', fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                    }} />
                )}
              </div>
            ))}

            {items.length === 0 && (
              <div style={{ fontSize: 12, color: C.yellow, lineHeight: 1.9 }}>
                لم تُرصد أصناف. أضِفها يدوياً أدناه — محضر بلا أصناف لا يمكن مقارنته لاحقاً.
              </div>
            )}
          </div>

          {/* إضافة يدوية */}
          <div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add() }}
              placeholder="اسم صنف لم ترصده الكاميرا…"
              style={{
                flex: '1 1 180px', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6,
                background: 'rgba(0,0,0,0.3)', color: C.white, fontSize: 16,
                border: `1px solid ${C.blue}55`, outline: 'none', direction: 'rtl',
                fontFamily: "'IBM Plex Sans Arabic', sans-serif",
              }} />
            <button onClick={add} style={{
              padding: '10px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
              background: 'transparent', border: `1px solid ${C.green}`, color: C.green, fontWeight: 600,
              fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            }}>+ إضافة</button>
          </div>
        </Card>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// الخطوة ٤ — المحضر النهائي
// ══════════════════════════════════════════════════════════════════════════════

type Receipt = {
  asset: Asset | null
  holder: Employee | null
  signer: Employee | null
  officer: { name: string; id: string; unit?: string; role?: string }
  items: CustodyItem[]
  shot: string | null
  ackText: string
  inspectDate: string
  inspectLabel: string
  notes: string
  totals: { count: number; damaged: number; noted: number }
}

function DoneStep({ savedId, warning, receipt, onNew, onRemove, onChain }: {
  savedId: string | null
  warning: string | null
  receipt: Receipt
  onNew: () => void
  onRemove?: () => void
  onChain: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const filename = `CUSTODY_${receipt.asset?.id ?? 'asset'}_${new Date().toISOString().slice(0, 10)}`

  const run = async (kind: 'pdf' | 'print') => {
    setBusy(kind); setErr(null)
    try {
      if (kind === 'pdf') await exportReportPDF('athar-custody-receipt', filename)
      else printReportElement('athar-custody-receipt')
    } catch (e: any) {
      setErr(e?.message ?? 'تعذّر التصدير')
    } finally { setBusy(null) }
  }

  const ics = () => downloadICS({
    title: `تفتيش عهدة — ${receipt.asset?.name ?? ''}`,
    date: receipt.inspectDate,
    location: receipt.asset?.location,
    description:
      `المستلم: ${receipt.holder?.name ?? ''} (${receipt.holder?.emp_id ?? ''})\n` +
      `عدد الأصناف: ${receipt.totals.count}\n` +
      `صرفها: ${receipt.officer.name}`,
    filename,
  })

  const btn = (border: string, color: string): React.CSSProperties => ({
    flex: '1 1 150px', padding: '11px 16px', borderRadius: 7, cursor: 'pointer',
    background: 'transparent', border: `1px solid ${border}`, color,
    fontSize: 12.5, fontWeight: 600, fontFamily: "'IBM Plex Sans Arabic', sans-serif",
  })

  return (
    <>
      <div style={{
        padding: '16px 18px', borderRadius: 9,
        background: C.greenDim, border: `1px solid ${C.green}66`,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>✓ حُفظ محضر صرف العهدة</div>
        <div style={{ fontSize: 12.5, color: C.whiteD, marginTop: 6, lineHeight: 1.9 }}>
          صار هذا المحضر الحلقة الأحدث في سلسلة {receipt.asset?.name ?? 'الأصل'}. أي جلسة
          لاحقة على نفس الأصل ستُقارَن به تلقائياً.
        </div>
        {savedId && (
          <div className="mono" style={{ fontSize: 10.5, color: C.whiteDD, marginTop: 7 }}>
            {savedId}
          </div>
        )}
      </div>

      {warning && <ErrorBox text={warning} />}
      {err && <ErrorBox text={err} />}

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <button onClick={() => run('pdf')} disabled={!!busy} style={btn(C.green, C.green)}>
          {busy === 'pdf' ? '… جارٍ' : '⬇ تنزيل المحضر PDF'}
        </button>
        <button onClick={() => run('print')} disabled={!!busy} style={btn(C.blue, C.white)}>
          🖨 طباعة
        </button>
        {receipt.inspectDate && (
          <button onClick={ics} style={btn(C.yellow, C.yellow)}>
            📅 إضافة موعد التفتيش للتقويم
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <button onClick={onChain} style={{
          flex: '1 1 160px', padding: '12px 18px', borderRadius: 7, cursor: 'pointer',
          background: C.blue, border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700,
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>عرض سلسلة العهدة ←</button>
        <button onClick={onNew} style={{
          flex: '1 1 160px', padding: '12px 18px', borderRadius: 7, cursor: 'pointer',
          background: C.green, border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700,
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        }}>+ صرف عهدة جديدة</button>
        {onRemove && (
          <button onClick={onRemove} style={{
            flex: '1 1 160px', padding: '12px 18px', borderRadius: 7, cursor: 'pointer',
            background: C.red, border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            opacity: 0.9,
          }}>🗑 حذف العهدة</button>
        )}
      </div>

      <CustodyReceipt r={receipt} />
    </>
  )
}

/** المحضر المطبوع — خلفية بيضاء لأن الوجهة ورق أو PDF لا شاشة. */
function CustodyReceipt({ r }: { r: Receipt }) {
  const row: React.CSSProperties = { padding: '7px 9px', borderBottom: '1px solid #e2e2e2', fontSize: 12 }
  const head: React.CSSProperties = { ...row, background: '#f3f3f0', fontWeight: 700, color: '#111' }

  const condColorPrint: Record<ItemCondition, string> = {
    ok: '#1c6b45', note: '#8a6100', damaged: '#961b15',
  }

  return (
    <div id="athar-custody-receipt" style={{
      background: '#fff', color: '#111', padding: 28, borderRadius: 8,
      direction: 'rtl', fontFamily: "'IBM Plex Sans Arabic', sans-serif", lineHeight: 1.8,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        borderBottom: '2px solid #237F52', paddingBottom: 12, marginBottom: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#237F52' }}>أثَر — ATHAR</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>محضر صرف عهدة</div>
        </div>
        <div style={{ marginRight: 'auto', textAlign: 'left', fontSize: 11, color: '#555' }}>
          <div>{r.officer.unit ?? 'وحدة المستودع والعهد'}</div>
          <div>{fmtDate(new Date().toISOString())}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          <tr><td style={head}>الأصل</td><td style={row}>{r.asset?.name ?? '—'}</td>
              <td style={head}>الموقع</td><td style={row}>{r.asset?.location ?? '—'}</td></tr>
          <tr><td style={head}>المستلم</td><td style={row}>{r.holder?.name ?? '—'}</td>
              <td style={head}>الرقم الوظيفي</td>
              <td style={{ ...row, fontFamily: "'JetBrains Mono', monospace" }}>{r.holder?.emp_id ?? '—'}</td></tr>
          <tr><td style={head}>المنصب</td><td style={row}>{r.holder?.role ?? '—'}</td>
              <td style={head}>صرفها</td>
              <td style={row}>{r.officer.name} — {r.officer.id}</td></tr>
          <tr><td style={head}>التفتيش القادم</td>
              <td style={row}>{arabicDate(r.inspectDate)}</td>
              <td style={head}>الدورية</td><td style={row}>{r.inspectLabel}</td></tr>
        </tbody>
      </table>

      {r.shot && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            صورة الحالة لحظة التسليم
          </div>
          <img src={r.shot} alt="" style={{
            width: '100%', maxWidth: 460, borderRadius: 5, border: '1px solid #ccc',
          }} />
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        الأصناف — {r.totals.count} إجمالاً
        {(r.totals.damaged + r.totals.noted) > 0 && (
          <span style={{ color: '#961b15', fontWeight: 700 }}>
            {' '}· {r.totals.damaged + r.totals.noted} بملاحظة أو تلف مثبّت قبل الاستلام
          </span>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'right' }}>الصنف</th>
            <th style={{ ...head, textAlign: 'right', width: 60 }}>العدد</th>
            <th style={{ ...head, textAlign: 'right', width: 90 }}>الحالة</th>
            <th style={{ ...head, textAlign: 'right' }}>الملاحظة</th>
          </tr>
        </thead>
        <tbody>
          {r.items.length === 0 && (
            <tr><td style={row} colSpan={4}>لا توجد أصناف مسجّلة.</td></tr>
          )}
          {r.items.map((it, i) => (
            <tr key={i}>
              <td style={{ ...row, fontWeight: 600 }}>{it.label}</td>
              <td style={{ ...row, fontFamily: "'JetBrains Mono', monospace" }}>{it.count}</td>
              <td style={{ ...row, color: condColorPrint[it.condition], fontWeight: 700 }}>
                {conditionLabel(it.condition)}
              </td>
              <td style={row}>{it.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>الإقرار</div>
      <div style={{
        fontSize: 12, padding: '11px 13px', background: '#f7f7f4',
        borderRight: '3px solid #237F52', marginBottom: 16,
      }}>{r.ackText}</div>

      {r.notes && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>ملاحظات</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>{r.notes}</div>
        </>
      )}

      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap',
        borderTop: '1px solid #ddd', paddingTop: 12,
      }}>
        <div style={{ flex: '1 1 220px' }}>
          <div style={{ fontSize: 11, color: '#555' }}>توقيع المستلم — بمسح البطاقة</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>
            {r.signer?.name ?? '—'}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
              {' '}· {r.signer?.emp_id ?? ''}
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: '#666' }}>
            {fmtDate(new Date().toISOString())}
          </div>
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <div style={{ fontSize: 11, color: '#555' }}>مسؤول الصرف</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 3 }}>
            {r.officer.name}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
              {' '}· {r.officer.id}
            </span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 9.5, color: '#888', marginTop: 14, textAlign: 'center' }}>
        وُثّق عبر نظام أثَر — الحالة مثبّتة بصورة وقائمة أصناف، لا بإقرار مجرّد.
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// عناصر مشتركة
// ══════════════════════════════════════════════════════════════════════════════

function StepBar({ step }: { step: Step }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {([1, 2, 3] as Step[]).map(n => {
        const done = step > n
        const active = step === n
        return (
          <div key={n} style={{
            // بلا border-box يُضاف الحشو فوق الأساس ١١٠px فتنزل الخطوة الثالثة سطراً وحدها
            flex: '1 1 110px', boxSizing: 'border-box', textAlign: 'center',
            padding: '9px 12px', borderRadius: 6, fontSize: 11.5,
            background: done ? C.greenDim : active ? 'rgba(0,83,135,0.14)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${done ? C.green : active ? C.blue : C.blue + '28'}`,
            color: done ? C.green : active ? C.white : C.whiteDD,
            fontWeight: active ? 700 : 500,
          }}>
            {done ? '✓ ' : `${n}. `}{STEP_TITLES[n]}
          </div>
        )
      })}
    </div>
  )
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: 9,
      border: `1px solid ${C.blue}33`, padding: 16,
    }}>{children}</div>
  )
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
      color: C.blue, marginBottom: 6,
    }}>{children}</div>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, color: C.whiteD, lineHeight: 1.9, marginTop: 9 }}>
      {children}
    </div>
  )
}

export function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{
      padding: '11px 14px', borderRadius: 7, fontSize: 12.5, lineHeight: 1.85,
      background: C.redDim, border: `1px solid ${C.red}55`, color: C.red,
    }}>{text}</div>
  )
}

function StepBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 30, height: 30, borderRadius: 5, cursor: 'pointer',
      background: 'transparent', border: `1px solid ${C.blue}66`, color: C.white,
      fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  )
}

export const selectStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6,
  background: 'rgba(0,0,0,0.3)', color: C.white, fontSize: 16, direction: 'rtl',
  border: `1px solid ${C.blue}55`, outline: 'none', cursor: 'pointer',
  fontFamily: "'IBM Plex Sans Arabic', sans-serif",
}
