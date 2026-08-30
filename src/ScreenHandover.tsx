// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — التسليم والاستلام                                              ║
// ║                                                                          ║
// ║  مكوّن مستقل عن ScreenCustody.tsx (صرف عهدة جديدة) عمداً — لا يعدّله ولا  ║
// ║  يحذفه، فتبقى الشاشتان تعملان معاً. الفرق الجوهري: هنا طرفان معروفان     ║
// ║  بالاسم (مُسلِّم ومُستلِم)، لا "مستودع" يصرف لموظف واحد.                 ║
// ║                                                                          ║
// ║  ثلاث خطوات، وفي كل واحدة منها مبدأ واحد:                                ║
// ║    ١) الأطراف   — كلاهما يُقرأ من البطاقة أو يُختار من السجل، لا يُكتب.   ║
// ║    ٢) التصوير   — نفس محرّك الرؤية الحاسوبية المستخدم في صرف العهدة.     ║
// ║    ٣) الإقرار   — نص رسمي يوثّق انتقال المسؤولية من المُسلِّم إلى         ║
// ║                   المستلم الجديد، وتوقيع المستلم بمسح بطاقته.            ║
// ║                                                                          ║
// ║  يُحفظ بنفس جدول custody بحقل action: 'transfer'، فيظهر تلقائياً في      ║
// ║  سلسلة العهدة (ScreenChain) كحلقة "نقل عهدة" لا "صرف عهدة".              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { useEffect, useRef, useState } from 'react'
import { C } from './theme'
import { BadgeScanner, EmployeeCard } from './BadgeScanner'
import { ScreenChain } from './ScreenChain'
import {
  fetchAssets, saveAsset, exportReportPDF, printReportElement, deleteSession,
  type Asset, type Employee,
} from './services/api'
import {
  HANDOVER_ACK_TEXT, CONDITIONS, conditionLabel, currentHolder, downloadICS,
  inspectionOptions, saveCustody, fmtDate, arabicDate,
  type CustodyItem, type CustodyRecord, type ItemCondition,
} from './services/custody'
import {
  CaptureStep, Card, FieldLabel, Note, ErrorBox, selectStyle, CONDITION_COLOR, AssetPicker,
} from './ScreenCustody'

type Step = 1 | 2 | 3 | 4

const STEP_TITLES: Record<Step, string> = {
  1: 'الأطراف',
  2: 'التصوير',
  3: 'الإقرار',
  4: 'تم التسليم',
}

export function ScreenHandover({ officer }: {
  officer: { name: string; id: string; unit?: string; role?: string }
}) {
  const [mode, setMode] = useState<'handover' | 'chain'>('handover')
  const [chainAsset, setChainAsset] = useState<string | undefined>(undefined)

  const tab = (key: 'handover' | 'chain', label: string) => {
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
        {tab('handover', 'تسليم واستلام جديد')}
        {tab('chain', 'سلسلة العهدة')}
      </div>

      {mode === 'handover'
        ? <HandoverWizard officer={officer} onViewChain={id => { setChainAsset(id); setMode('chain') }} />
        : <ScreenChain initialAssetId={chainAsset} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// المعالج — ثلاث خطوات
// ══════════════════════════════════════════════════════════════════════════════

function HandoverWizard({ officer, onViewChain }: {
  officer: { name: string; id: string; unit?: string; role?: string }
  onViewChain: (assetId: string) => void
}) {
  const [step, setStep] = useState<Step>(1)

  // ── الخطوة ١ — الأطراف ────────────────────────────────────────────
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetQuery, setAssetQuery] = useState('')
  const [asset, setAsset] = useState<Asset | null>(null)
  const [customLocation, setCustomLocation] = useState('')
  const [creatingAsset, setCreatingAsset] = useState(false)
  const [fromMode, setFromMode] = useState<'employee' | 'external'>('employee')
  const [fromParty, setFromParty] = useState<Employee | null>(null)
  const [fromExternalName, setFromExternalName] = useState('')
  const [toParty, setToParty] = useState<Employee | null>(null)
  const [prev, setPrev] = useState<CustodyRecord | null>(null)
  const [samePersonWarn, setSamePersonWarn] = useState(false)

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
    if (!confirm(`حذف هذا التسليم؟\nلا يمكن التراجع.`)) return
    try {
      const ok = await deleteSession(id)
      if (ok) {
        alert('✓ تم حذف التسليم بنجاح')
        reset()
      } else {
        alert('✗ تعذّر الحذف')
      }
    } catch (e: any) {
      alert(`✗ خطأ: ${e.message}`)
    }
  }

  useEffect(() => { fetchAssets().then(setAssets).catch(() => {}) }, [])

  // مَن بيده الأصل الآن — يُعرض كمرجع، ولا يُفرض تلقائياً كطرف مُسلِّم حتى
  // يبقى الاختيار الفعلي (مسح بطاقة أو من السجل) هو مصدر الحقيقة.
  useEffect(() => {
    if (!asset?.id) { setPrev(null); return }
    currentHolder(asset.id).then(setPrev).catch(() => setPrev(null))
  }, [asset?.id])

  useEffect(() => {
    // مصدر خارجي لا رقم وظيفي له، فلا يمكن أن يتطابق مع المستلم أصلاً.
    setSamePersonWarn(!!(fromMode === 'employee' && fromParty && toParty && fromParty.emp_id === toParty.emp_id))
  }, [fromMode, fromParty, toParty])

  const totals = {
    count: items.reduce((s, i) => s + i.count, 0),
    damaged: items.filter(i => i.condition === 'damaged').length,
    noted: items.filter(i => i.condition === 'note').length,
  }

  const inspectLabel = opts.find(o => o.key === inspectKey)?.label ?? 'موعد مخصص'

  const ackText = HANDOVER_ACK_TEXT({
    fromName: fromMode === 'employee' ? fromParty?.name : fromExternalName.trim(),
    fromId: fromMode === 'employee' ? fromParty?.emp_id : undefined,
    fromIsExternal: fromMode === 'external',
    toName: toParty?.name,
    toId: toParty?.emp_id,
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
    const fromValid = fromMode === 'employee' ? !!fromParty : !!fromExternalName.trim()
    if (!fromValid || !toParty || !asset || !signer) return
    setSaving(true); setError(null)

    const res = await saveCustody({
      record: {
        asset_id: asset.id,
        asset_name: asset.name,
        location: asset.location,
        holder_id: toParty.emp_id,
        holder_name: toParty.name,
        holder_role: toParty.role,
        // مصدر خارجي: بلا رقم وظيفي عمداً — لا نخترع رقماً وهمياً يُخلط لاحقاً
        // بموظف حقيقي. الاسم فقط، وقيمة الدور تُثبت أنه ليس موظفاً.
        from_holder_id: fromMode === 'employee' ? fromParty!.emp_id : undefined,
        from_holder_name: fromMode === 'employee' ? fromParty!.name : fromExternalName.trim(),
        from_holder_role: fromMode === 'employee' ? fromParty!.role : 'مصدر خارجي (مورّد/مقاول)',
        issuer_badge: officer.id,
        issuer_name: officer.name,
        action: 'transfer',
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
   * يُوثَّق التسليم على أصل له معرّف حقيقي — لا وصف مكتوب بلا أصل خلفه.
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
    setFromMode('employee'); setFromParty(null); setFromExternalName('')
    setToParty(null); setPrev(null)
    setShot(null); setItems([]); setUsedModel(false)
    setInspectKey(opts[0].key); setInspectDate(opts[0].date)
    setNotes(''); setSigner(null); setSignedAt(null)
    setSavedId(null); setError(null)
  }

  const canNext =
    step === 1 ? !!((asset || assetQuery.trim()) && (fromMode === 'employee' ? fromParty : fromExternalName.trim()) && toParty && !samePersonWarn) :
    step === 2 ? !!shot :
    step === 3 ? !!signer :
    false

  return (
    <div style={{
      padding: 'clamp(14px, 3vw, 28px)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>

      <StepBar step={step} />

      {/* ═══ الخطوة ١ — الأطراف ═════════════════════════════════ */}
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
              background: 'rgba(0,83,135,0.12)', border: `1px solid ${C.blue}55`, color: C.white,
            }}>
              ● آخر ما هو مسجّل: هذا الأصل في عهدة <strong>{prev.holder_name}</strong>
              {' '}منذ {arabicDate(prev.created_at?.slice(0, 10))}. تأكد أن الطرف المُسلِّم
              أدناه مطابق لهذا الاسم قبل المتابعة.
            </div>
          )}

          {/* ── الطرف المُسلِّم ─────────────────────────────────── */}
          <div>
            <FieldLabel>المُسلِّم — الجهة المُسلمة سابقاً</FieldLabel>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['employee', 'external'] as const).map(m => {
                const active = fromMode === m
                return (
                  <button key={m} onClick={() => {
                    setFromMode(m)
                    // التبديل بين الوضعين يمسح اختيار الوضع الآخر — لا يبقى
                    // اسمان محتملان معاً فيُحفظ الخطأ منهما بالغلط.
                    if (m === 'employee') setFromExternalName(''); else setFromParty(null)
                  }} style={{
                    flex: 1, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    background: active ? C.blueDim : 'transparent',
                    border: `1px solid ${active ? C.blue : C.blue + '44'}`,
                    color: active ? C.white : C.whiteD,
                    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
                  }}>{m === 'employee' ? 'موظف مسجّل' : 'مصدر خارجي'}</button>
                )
              })}
            </div>

            {fromMode === 'employee' ? (
              fromParty ? (
                <EmployeeCard emp={fromParty} label="المُسلِّم" onChange={() => setFromParty(null)} />
              ) : (
                <BadgeScanner
                  title="امسح بطاقة المُسلِّم"
                  hint="امسح بطاقة من كانت العهدة بحوزته، أو اختره من السجل. الاسم والمنصب يأتيان تلقائياً — بلا كتابة."
                  onPick={setFromParty}
                />
              )
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: 9,
                border: `1px solid ${C.blue}33`, padding: 16,
              }}>
                <FieldLabel>اسم الجهة الخارجية (مورّد / مقاول)</FieldLabel>
                <input value={fromExternalName} onChange={e => setFromExternalName(e.target.value)}
                  placeholder="مثال: مؤسسة النور للصيانة"
                  style={{ ...selectStyle, cursor: 'text' }} />
                <Note>
                  لا رقم وظيفي ولا بطاقة لهذه الجهة، فيُحفظ الاسم فقط ويُثبت في المحضر
                  أنها مصدر خارجي — حتى لا تُخلط لاحقاً بموظف حقيقي.
                </Note>
              </div>
            )}
          </div>

          {/* ── الطرف المستلم ───────────────────────────────────── */}
          <div>
            <FieldLabel>المستلم — الطرف الجديد</FieldLabel>
            {toParty ? (
              <EmployeeCard emp={toParty} label="المستلم الجديد" onChange={() => setToParty(null)} />
            ) : (
              <BadgeScanner
                title="امسح بطاقة المستلم الجديد"
                hint="امسح بطاقة من ستنتقل إليه العهدة، أو اختره من السجل."
                onPick={setToParty}
              />
            )}
          </div>

          {samePersonWarn && (
            <ErrorBox text="المُسلِّم والمستلم نفس الشخص. اختر طرفين مختلفين للمتابعة." />
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
              الإقرار هنا يوثّق انتقال المسؤولية من {(fromMode === 'employee' ? fromParty?.name : fromExternalName.trim()) || 'المُسلِّم'} إلى{' '}
              {toParty?.name ?? 'المستلم الجديد'} — مربوط بالحالة الموثقة بالصورة وقائمة
              الأصناف أعلاه، لا بإقرار مجرّد.
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
              title="التوقيع — امسح بطاقة المستلم الجديد مرة أخرى"
              hint={`مسح البطاقة هو التوقيع. لن تُقبل بطاقة شخص آخر — يجب أن تكون بطاقة ${toParty?.name ?? 'المستلم الجديد'}.`}
              expectId={toParty?.emp_id}
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
            asset,
            from: fromMode === 'employee'
              ? (fromParty ? { name: fromParty.name, id: fromParty.emp_id, role: fromParty.role ?? null, isExternal: false } : null)
              : (fromExternalName.trim() ? { name: fromExternalName.trim(), id: null, role: 'مصدر خارجي (مورّد/مقاول)', isExternal: true } : null),
            toParty, signer, officer, items, shot, ackText,
            inspectDate, inspectLabel, notes, totals,
          }}
          onNew={reset}
          onRemove={() => remove(savedId)}
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

      {step < 4 && !canNext && !samePersonWarn && (
        <div style={{ fontSize: 11.5, color: C.whiteDD, lineHeight: 1.8 }}>
          {step === 1 && 'اكتبي الأصل أو الموقع، وحدّدي المُسلِّم والمستلم الجديد للمتابعة.'}
          {step === 2 && 'التقط صورة الحالة للمتابعة — المحضر بلا صورة يعود إلى مجرد كلام.'}
          {step === 3 && 'التوقيع مطلوب: امسح بطاقة المستلم الجديد لاعتماد الإقرار.'}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// الخطوة ٤ — المحضر النهائي
// ══════════════════════════════════════════════════════════════════════════════

type Receipt = {
  asset: Asset | null
  /** موحّد لكلا الحالتين: موظف مسجّل أو مصدر خارجي بلا رقم وظيفي. */
  from: { name: string; id: string | null; role: string | null; isExternal: boolean } | null
  toParty: Employee | null
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

  const filename = `HANDOVER_${receipt.asset?.id ?? 'asset'}_${new Date().toISOString().slice(0, 10)}`

  const run = async (kind: 'pdf' | 'print') => {
    setBusy(kind); setErr(null)
    try {
      if (kind === 'pdf') await exportReportPDF('athar-handover-receipt', filename)
      else printReportElement('athar-handover-receipt')
    } catch (e: any) {
      setErr(e?.message ?? 'تعذّر التصدير')
    } finally { setBusy(null) }
  }

  const ics = () => downloadICS({
    title: `تفتيش عهدة — ${receipt.asset?.name ?? ''}`,
    date: receipt.inspectDate,
    location: receipt.asset?.location,
    description:
      `المستلم الجديد: ${receipt.toParty?.name ?? ''} (${receipt.toParty?.emp_id ?? ''})\n` +
      `عدد الأصناف: ${receipt.totals.count}\n` +
      `أشرف على التسليم: ${receipt.officer.name}`,
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
        <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>✓ حُفظ محضر التسليم والاستلام</div>
        <div style={{ fontSize: 12.5, color: C.whiteD, marginTop: 6, lineHeight: 1.9 }}>
          صار هذا المحضر الحلقة الأحدث في سلسلة {receipt.asset?.name ?? 'الأصل'}، وانتقلت
          العهدة رسمياً من {receipt.from?.name ?? 'المُسلِّم'} إلى{' '}
          {receipt.toParty?.name ?? 'المستلم الجديد'}.
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
        }}>+ تسليم واستلام جديد</button>
        {onRemove && (
          <button onClick={onRemove} style={{
            flex: '1 1 160px', padding: '12px 18px', borderRadius: 7, cursor: 'pointer',
            background: C.red, border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700,
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            opacity: 0.9,
          }}>🗑 حذف التسليم</button>
        )}
      </div>

      <HandoverReceipt r={receipt} />
    </>
  )
}

/** المحضر المطبوع — خلفية بيضاء لأن الوجهة ورق أو PDF لا شاشة. */
function HandoverReceipt({ r }: { r: Receipt }) {
  const row: React.CSSProperties = { padding: '7px 9px', borderBottom: '1px solid #e2e2e2', fontSize: 12 }
  const head: React.CSSProperties = { ...row, background: '#f3f3f0', fontWeight: 700, color: '#111' }

  const condColorPrint: Record<ItemCondition, string> = {
    ok: '#1c6b45', note: '#8a6100', damaged: '#961b15',
  }

  return (
    <div id="athar-handover-receipt" style={{
      background: '#fff', color: '#111', padding: 28, borderRadius: 8,
      direction: 'rtl', fontFamily: "'IBM Plex Sans Arabic', sans-serif", lineHeight: 1.8,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        borderBottom: '2px solid #237F52', paddingBottom: 12, marginBottom: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#237F52' }}>أثَر — ATHAR</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>محضر تسليم واستلام عهدة</div>
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
          <tr><td style={head}>المُسلِّم</td>
              <td style={row}>
                {r.from?.name ?? '—'}
                {r.from?.isExternal && (
                  <span style={{ color: '#8a6100', fontWeight: 700 }}> (مصدر خارجي)</span>
                )}
              </td>
              <td style={head}>الرقم الوظيفي</td>
              <td style={{ ...row, fontFamily: "'JetBrains Mono', monospace" }}>
                {r.from?.id ?? (r.from?.isExternal ? '— مصدر خارجي —' : '—')}
              </td></tr>
          <tr><td style={head}>المستلم الجديد</td><td style={row}>{r.toParty?.name ?? '—'}</td>
              <td style={head}>الرقم الوظيفي</td>
              <td style={{ ...row, fontFamily: "'JetBrains Mono', monospace" }}>{r.toParty?.emp_id ?? '—'}</td></tr>
          <tr><td style={head}>أشرف على التسليم</td>
              <td style={row}>{r.officer.name} — {r.officer.id}</td>
              <td style={head}>التفتيش القادم</td>
              <td style={row}>{arabicDate(r.inspectDate)}</td></tr>
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
          <div style={{ fontSize: 11, color: '#555' }}>توقيع المستلم الجديد — بمسح البطاقة</div>
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
          <div style={{ fontSize: 11, color: '#555' }}>أشرف على التسليم</div>
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
// عناصر خاصة بهذه الشاشة
// ══════════════════════════════════════════════════════════════════════════════

function StepBar({ step }: { step: Step }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {([1, 2, 3] as Step[]).map(n => {
        const done = step > n
        const active = step === n
        return (
          <div key={n} style={{
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
