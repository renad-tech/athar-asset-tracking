// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — سلسلة العهدة                                                   ║
// ║                                                                          ║
// ║  أنظمة إدارة الأصول تسجّل مَن يملك الأصل. تطبيقات التصوير تحفظ صورة      ║
// ║  بتاريخ. ولا أحد يقول متى حدث النقص وفي فترة مسؤولية مَن.                ║
// ║                                                                          ║
// ║  هذا الملف يجيب على ذلك السؤال: كل محضر عهدة يرتبط بالذي قبله، فتصير     ║
// ║  حياة الأصل سلسلة متصلة بدل صور متفرقة.                                  ║
// ║                                                                          ║
// ║  ملف مستقل عن api.ts عمداً — يستورد منه ولا يعدّله، حتى لا يتأثر أي      ║
// ║  شيء يعمل الآن.                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { supabase, uploadFile, dataUrlToBlob } from './api'

// ══════════════════════════════════════════════════════════════════════════════
// الأنواع
// ══════════════════════════════════════════════════════════════════════════════

/** حالة الصنف لحظة التسليم. «سليم» قرار مثبّت بصورة، لا افتراض. */
export type ItemCondition = 'ok' | 'note' | 'damaged'

export const CONDITIONS: { key: ItemCondition; label: string; short: string }[] = [
  { key: 'ok',      label: 'سليم',       short: 'سليم' },
  { key: 'note',    label: 'به ملاحظة',  short: 'ملاحظة' },
  { key: 'damaged', label: 'تالف',       short: 'تالف' },
]

export const conditionLabel = (c: ItemCondition) =>
  CONDITIONS.find(x => x.key === c)?.label ?? c

/** ترتيب السوء — يُستخدم لكشف تدهور حالة صنف بين محضرين. */
const RANK: Record<ItemCondition, number> = { ok: 0, note: 1, damaged: 2 }

export type CustodyItem = {
  id?: string
  label: string
  count: number
  condition: ItemCondition
  note?: string
  source?: 'ai' | 'manual'
}

export type CustodyAction = 'issue' | 'return' | 'transfer'

export const ACTION_LABEL: Record<CustodyAction, string> = {
  issue:    'صرف عهدة',
  return:   'إرجاع عهدة',
  transfer: 'نقل عهدة',
}

export type CustodyRecord = {
  id?: string
  asset_id?: string | null
  asset_name?: string
  location?: string

  holder_id?: string
  holder_name?: string
  holder_role?: string

  // الطرف المُسلِّم — يُملأ فقط في عمليات النقل/التسليم بين موظفين (action: 'transfer').
  from_holder_id?: string
  from_holder_name?: string
  from_holder_role?: string

  issuer_badge?: string
  issuer_name?: string

  action?: CustodyAction
  prev_custody_id?: string | null

  snapshot_url?: string

  ack_text?: string
  ack_signed_by?: string
  ack_signed_at?: string

  next_inspection?: string | null
  next_inspection_label?: string

  total_items?: number
  damaged_count?: number
  noted_count?: number

  notes?: string
  created_at?: string

  /** تُملأ بواسطة fetchChain فقط — ليست عموداً في الجدول. */
  items?: CustodyItem[]
}

// ══════════════════════════════════════════════════════════════════════════════
// نص الإقرار
// ══════════════════════════════════════════════════════════════════════════════

/**
 * النموذج الحكومي المتداول يطلب من الموظف الإقرار بأن العهدة «بحالة صالحة
 * للاستخدام» — جملة بلا صورة ولا قائمة ولا دليل، فيتحمّل الموظف نتيجة خلل
 * قد يكون سابقاً لاستلامه.
 *
 * هذا النص يقلب المعادلة: الإقرار مرتبط بالحالة الموثقة في المحضر نفسه،
 * وما ثُبّت من ملاحظات أو تلف قبل الاستلام لا يُسأل عنه المستلم.
 */
export function ACK_TEXT(p: {
  holderName?: string
  holderId?: string
  assetName?: string
  location?: string
  totalItems?: number
  damaged?: number
  noted?: number
  nextInspectionLabel?: string
  nextInspection?: string | null
}): string {
  const name = p.holderName?.trim() || '……………'
  const id = p.holderId?.trim() || '………'
  const asset = p.assetName?.trim() || '……………'
  const place = p.location?.trim() ? ` الواقع في ${p.location.trim()}` : ''

  const flagged = (p.damaged ?? 0) + (p.noted ?? 0)
  const flaggedLine = flagged > 0
    ? `وقد أُثبت في المحضر ${countPhrase(flagged)} بملاحظة أو تلف قبل الاستلام، وهي مثبّتة قبل التسليم فلا تُحسب على المستلم.`
    : 'ولم تُثبت على الأصناف ملاحظات أو تلف عند الاستلام.'

  const inspect = p.nextInspection
    ? ` وأتعهد بإتاحة العهدة للتفتيش بتاريخ ${arabicDate(p.nextInspection)}` +
      (p.nextInspectionLabel ? ` (${p.nextInspectionLabel}).` : '.')
    : ''

  // محضر بلا أصناف حالة شاذة، لكن النص يجب أن يبقى مقروءاً لو وقعت.
  const total = p.totalItems ?? 0
  const countClause = total > 0 ? `وعددها ${countPhrase(total)}، ` : ''

  return (
    `أقر أنا / ${name} — الرقم الوظيفي ${id} — بأنني استلمت عهدة ${asset}${place}، ` +
    countClause +
    `بالحالة الموثقة في هذا المحضر بالصورة المرفقة وقائمة الأصناف وحالة كل صنف. ` +
    `${flaggedLine} ` +
    `وأتعهد بالمحافظة عليها واستخدامها في أغراض العمل الرسمية، ` +
    `وبإبلاغ وحدة المستودع والعهد فور وقوع أي فقد أو تلف.${inspect}`
  )
}

/**
 * نص إقرار مخصّص لنقل عهدة بين موظفين (تسليم واستلام) — بخلاف ACK_TEXT الذي
 * يفترض صرفاً أولياً من المستودع. هنا المُسلِّم طرف معروف بالاسم، والمسؤولية
 * تنتقل منه إلى المستلم الجديد، لا من "المستودع" إلى الموظف.
 */
export function HANDOVER_ACK_TEXT(p: {
  fromName?: string
  fromId?: string
  /** صحيح إن كان المُسلِّم مصدراً خارجياً (مورّد/مقاول) لا موظفاً مسجّلاً. */
  fromIsExternal?: boolean
  toName?: string
  toId?: string
  assetName?: string
  location?: string
  totalItems?: number
  damaged?: number
  noted?: number
  nextInspectionLabel?: string
  nextInspection?: string | null
}): string {
  const from = p.fromName?.trim() || '……………'
  const fromId = p.fromId?.trim() || '………'
  const to = p.toName?.trim() || '……………'
  const toId = p.toId?.trim() || '………'
  const asset = p.assetName?.trim() || '……………'
  const place = p.location?.trim() ? ` الواقع في ${p.location.trim()}` : ''

  // «الرقم الوظيفي» لا معنى له لمورّد أو مقاول — لا نكتب فراغاً بدله، بل نصاً
  // يوضح صراحة أن الطرف المُسلِّم خارجي، فلا يبدو المحضر وكأنه ناقص بيانات.
  const fromClause = p.fromIsExternal
    ? `من: ${from} — مصدر خارجي (مورّد/مقاول، غير مسجّل كموظف) — `
    : `من الزميل / ${from} — الرقم الوظيفي ${fromId} — `

  const flagged = (p.damaged ?? 0) + (p.noted ?? 0)
  const flaggedLine = flagged > 0
    ? `وقد أُثبت في المحضر ${countPhrase(flagged)} بملاحظة أو تلف قبل الاستلام، وهي مثبّتة قبل التسليم فلا تُحسب على المستلم الجديد.`
    : 'ولم تُثبت على الأصناف ملاحظات أو تلف عند الاستلام.'

  const inspect = p.nextInspection
    ? ` وأتعهد بإتاحة العهدة للتفتيش بتاريخ ${arabicDate(p.nextInspection)}` +
      (p.nextInspectionLabel ? ` (${p.nextInspectionLabel}).` : '.')
    : ''

  const total = p.totalItems ?? 0
  const countClause = total > 0 ? `وعددها ${countPhrase(total)}، ` : ''

  return (
    `أقر أنا / ${to} — الرقم الوظيفي ${toId} — بأنني استلمت عهدة ${asset}${place} ` +
    fromClause +
    countClause +
    `بالحالة الموثقة في هذا المحضر بالصورة المرفقة وقائمة الأصناف وحالة كل صنف، ` +
    `وبذلك تنتقل إليّ مسؤولية هذه العهدة اعتباراً من تاريخ هذا المحضر. ` +
    `${flaggedLine} ` +
    `وأتعهد بالمحافظة عليها واستخدامها في أغراض العمل الرسمية، ` +
    `وبإبلاغ وحدة المستودع والعهد فور وقوع أي فقد أو تلف.${inspect}`
  )
}

/** يحوّل الأرقام إلى صيغة عربية للعرض داخل النص الرسمي. */
function arabicNum(n: number): string {
  return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)])
}

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

/**
 * تاريخ مكتوب بالعربية بدل 2026-11-14.
 *
 * السبب ليس التجميل: المتصفح يقلب ترتيب المقاطع الرقمية داخل نص عربي، فيظهر
 * «2026-11-14» على الشاشة كأنه «14-11-2026». تاريخ يقرأه الموظف خطأً في محضر
 * رسمي مشكلة حقيقية، والحل أن يُكتب الشهر باسمه فلا يبقى ما يُقلب.
 */
export function arabicDate(isoDate?: string | null): string {
  if (!isoDate) return '—'
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return `${arabicNum(d)} ${AR_MONTHS[m - 1]} ${arabicNum(y)}`
}

/**
 * تمييز العدد في العربية يتغيّر بتغيّر الرقم: صنف واحد · صنفان · ثلاثة أصناف
 * · أحد عشر صنفاً. نص رسمي يقول «٣ صنفاً» يفقد جديته، والمحضر يُقرأ أمام موظف.
 */
function countPhrase(n: number): string {
  if (n === 0) return 'بلا أصناف مسجّلة'
  if (n === 1) return 'صنفاً واحداً'
  if (n === 2) return 'صنفين اثنين'
  if (n <= 10) return `${arabicNum(n)} أصناف`
  return `${arabicNum(n)} صنفاً`
}

// ══════════════════════════════════════════════════════════════════════════════
// مواعيد التفتيش
// ══════════════════════════════════════════════════════════════════════════════

export type InspectionOption = { key: '3m' | '6m' | 'term'; label: string; date: string }

const iso = (d: Date) => d.toISOString().slice(0, 10)

function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime())
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  // لا يوجد ٣١ في كل شهر — نأخذ آخر يوم متاح بدل القفز لشهر بعده.
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return d
}

/**
 * نهاية الفصل الدراسي تقديرية عمداً ومعروضة للمسؤول ليعدّلها.
 * لا نثبّت تقويماً أكاديمياً لم نتحقق منه.
 */
function nextTermEnd(from: Date): Date {
  const y = from.getFullYear()
  const candidates = [
    new Date(y, 0, 15),   // نهاية الفصل الأول تقريباً
    new Date(y, 4, 25),   // نهاية الفصل الثاني تقريباً
    new Date(y + 1, 0, 15),
  ]
  return candidates.find(d => d.getTime() > from.getTime()) ?? candidates[2]
}

export function inspectionOptions(from: Date = new Date()): InspectionOption[] {
  return [
    { key: '3m',   label: 'بعد ٣ أشهر',                 date: iso(addMonths(from, 3)) },
    { key: '6m',   label: 'بعد ٦ أشهر',                 date: iso(addMonths(from, 6)) },
    { key: 'term', label: 'نهاية الفصل الدراسي (تقديري)', date: iso(nextTermEnd(from)) },
  ]
}

// ══════════════════════════════════════════════════════════════════════════════
// الحفظ
// ══════════════════════════════════════════════════════════════════════════════

/**
 * يحفظ محضر عهدة كاملاً: يرفع الصورة، يربط المحضر بسابقه على نفس الأصل،
 * ثم يخزّن الأصناف. الربط بالسابق هو ما يحوّل السجلات إلى سلسلة.
 */
export async function saveCustody(input: {
  record: CustodyRecord
  items: CustodyItem[]
  snapshot?: string | null
}): Promise<{ ok: boolean; id?: string; error?: string }> {

  if (!supabase) return { ok: false, error: 'قاعدة البيانات غير متصلة — تحقق من ملف .env' }

  const items = input.items.filter(i => i.label.trim() && i.count > 0)

  // ١) الصورة — دليل الحالة. تُرفع أولاً حتى لا يُحفظ محضر بلا دليل.
  let snapshot_url = input.record.snapshot_url
  if (input.snapshot) {
    try {
      const url = await uploadFile(
        dataUrlToBlob(input.snapshot),
        `custody/${input.record.asset_id ?? 'asset'}-${Date.now()}.jpg`,
      )
      if (url) snapshot_url = url
    } catch (e: any) {
      console.error('[ATHAR] saveCustody upload:', e?.message)
    }
  }

  // ٢) الحلقة السابقة على نفس الأصل.
  let prev_custody_id: string | null = input.record.prev_custody_id ?? null
  if (!prev_custody_id && input.record.asset_id) {
    const { data } = await supabase
      .from('custody').select('id')
      .eq('asset_id', input.record.asset_id)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()
    prev_custody_id = data?.id ?? null
  }

  const row = {
    asset_id:      input.record.asset_id ?? null,
    asset_name:    input.record.asset_name ?? null,
    location:      input.record.location ?? null,
    holder_id:     input.record.holder_id ?? null,
    holder_name:   input.record.holder_name ?? null,
    holder_role:   input.record.holder_role ?? null,
    from_holder_id:   input.record.from_holder_id ?? null,
    from_holder_name: input.record.from_holder_name ?? null,
    from_holder_role: input.record.from_holder_role ?? null,
    issuer_badge:  input.record.issuer_badge ?? null,
    issuer_name:   input.record.issuer_name ?? null,
    action:        input.record.action ?? 'issue',
    prev_custody_id,
    snapshot_url:  snapshot_url ?? null,
    ack_text:      input.record.ack_text ?? null,
    ack_signed_by: input.record.ack_signed_by ?? null,
    ack_signed_at: input.record.ack_signed_at ?? null,
    next_inspection:       input.record.next_inspection || null,
    next_inspection_label: input.record.next_inspection_label ?? null,
    total_items:   items.reduce((s, i) => s + i.count, 0),
    damaged_count: items.filter(i => i.condition === 'damaged').length,
    noted_count:   items.filter(i => i.condition === 'note').length,
    notes:         input.record.notes ?? null,
  }

  const { data, error } = await supabase.from('custody').insert(row).select('id').single()
  if (error) return { ok: false, error: error.message }

  const id = data?.id as string

  // ٣) الأصناف.
  if (items.length) {
    const { error: itemsError } = await supabase.from('custody_items').insert(
      items.map(i => ({
        custody_id: id,
        label: i.label.trim(),
        count: i.count,
        condition: i.condition,
        note: i.note?.trim() || null,
        source: i.source ?? 'manual',
      })),
    )
    if (itemsError) return { ok: true, id, error: `حُفظ المحضر لكن تعذّر حفظ الأصناف: ${itemsError.message}` }
  }

  return { ok: true, id }
}

// ══════════════════════════════════════════════════════════════════════════════
// القراءة
// ══════════════════════════════════════════════════════════════════════════════

/**
 * سلسلة العهدة لأصل واحد — من الأقدم إلى الأحدث، بأصنافها.
 * الترتيب التصاعدي مقصود: السلسلة تُقرأ كقصة، لا كقائمة أحدث أولاً.
 */
export async function fetchChain(assetId: string): Promise<CustodyRecord[]> {
  if (!supabase || !assetId) return []

  const { data, error } = await supabase
    .from('custody').select('*')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: true })

  if (error) { console.error('[ATHAR] fetchChain:', error.message); return [] }

  const records = (data ?? []) as CustodyRecord[]
  if (!records.length) return []

  const ids = records.map(r => r.id).filter(Boolean) as string[]
  const { data: itemRows } = await supabase
    .from('custody_items').select('*').in('custody_id', ids)

  const byParent = new Map<string, CustodyItem[]>()
  for (const it of (itemRows ?? []) as any[]) {
    const list = byParent.get(it.custody_id) ?? []
    list.push({
      id: it.id, label: it.label, count: it.count,
      condition: (it.condition ?? 'ok') as ItemCondition,
      note: it.note ?? undefined, source: it.source ?? undefined,
    })
    byParent.set(it.custody_id, list)
  }

  return records.map(r => ({ ...r, items: byParent.get(r.id ?? '') ?? [] }))
}

/** آخر محضر عهدة على أصل — لمعرفة مَن بيده الآن. */
export async function currentHolder(assetId: string): Promise<CustodyRecord | null> {
  if (!supabase || !assetId) return null
  const { data } = await supabase
    .from('custody').select('*')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle()
  return (data as CustodyRecord) ?? null
}

/** كل محاضر موظف واحد — «ما في عهدتي». */
export async function fetchHolderCustody(holderId: string): Promise<CustodyRecord[]> {
  if (!supabase || !holderId) return []
  const { data, error } = await supabase
    .from('custody').select('*')
    .eq('holder_id', holderId)
    .order('created_at', { ascending: false })
  if (error) { console.error('[ATHAR] fetchHolderCustody:', error.message); return [] }
  return (data ?? []) as CustodyRecord[]
}

// ══════════════════════════════════════════════════════════════════════════════
// المقارنة
// ══════════════════════════════════════════════════════════════════════════════

export type ItemDiff = {
  label: string
  before: number
  after: number
  delta: number
  conditionBefore: ItemCondition | null
  conditionAfter: ItemCondition | null
  /** تدهورت حالته: سليم ← ملاحظة، أو ملاحظة ← تالف. */
  worsened: boolean
  /** تحسنت حالته — يحدث بعد صيانة. */
  improved: boolean
}

/**
 * يقارن قائمتَي أصناف بين محضرين.
 *
 * العدد وحده لا يكفي: جهاز موجود لكنه صار تالفاً هو خسارة أيضاً، ولا يظهر
 * في فرق الأعداد. لذلك تُقارَن الحالة إلى جانب العدد.
 */
export function diffItems(before: CustodyItem[], after: CustodyItem[]): {
  rows: ItemDiff[]
  missing: ItemDiff[]
  added: ItemDiff[]
  worsened: ItemDiff[]
  improved: ItemDiff[]
  totalBefore: number
  totalAfter: number
  unchanged: boolean
} {
  const fold = (list: CustodyItem[]) => {
    const m = new Map<string, { count: number; condition: ItemCondition }>()
    for (const i of list ?? []) {
      const prev = m.get(i.label)
      // عند تكرار نفس المسمى نأخذ أسوأ حالة — الأسوأ هو ما يستحق الانتباه.
      const condition = prev && RANK[prev.condition] > RANK[i.condition] ? prev.condition : i.condition
      m.set(i.label, { count: (prev?.count ?? 0) + i.count, condition })
    }
    return m
  }

  const b = fold(before), a = fold(after)
  const labels = Array.from(new Set([...b.keys(), ...a.keys()])).sort((x, y) => x.localeCompare(y, 'ar'))

  const rows: ItemDiff[] = labels.map(label => {
    const bv = b.get(label), av = a.get(label)
    const cb = bv?.condition ?? null, ca = av?.condition ?? null
    return {
      label,
      before: bv?.count ?? 0,
      after: av?.count ?? 0,
      delta: (av?.count ?? 0) - (bv?.count ?? 0),
      conditionBefore: cb,
      conditionAfter: ca,
      worsened: !!cb && !!ca && RANK[ca] > RANK[cb],
      improved: !!cb && !!ca && RANK[ca] < RANK[cb],
    }
  })

  const sum = (m: Map<string, { count: number }>) =>
    [...m.values()].reduce((s, v) => s + v.count, 0)

  const missing  = rows.filter(r => r.delta < 0)
  const added    = rows.filter(r => r.delta > 0)
  const worsened = rows.filter(r => r.worsened)
  const improved = rows.filter(r => r.improved)

  return {
    rows, missing, added, worsened, improved,
    totalBefore: sum(b),
    totalAfter: sum(a),
    unchanged: !missing.length && !added.length && !worsened.length,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// تاريخ التلف
// ══════════════════════════════════════════════════════════════════════════════

export type DamageEvent = {
  custodyId?: string
  at?: string
  holderName?: string
  holderId?: string
  condition: ItemCondition
  note?: string
}

export type DamageTrail = {
  label: string
  events: DamageEvent[]
  /** عدد المحاضر التي ظهر فيها الصنف بملاحظة أو تلف. */
  repeats: number
  /** مؤشر التلف المتكرر — صنفان أو أكثر من الأحداث على نفس المسمى. */
  repeated: boolean
  firstAt?: string
  firstHolder?: string
  lastCondition: ItemCondition
}

/**
 * يستخرج من السلسلة كل صنف تكرر تلفه.
 *
 * القيمة هنا ليست «هذا الجهاز تالف» — بل «هذا الجهاز تلف ثلاث مرات مع ثلاثة
 * موظفين مختلفين»، وهي جملة تنقل السؤال من محاسبة الموظف إلى صيانة الأصل.
 */
export function damageHistory(chain: CustodyRecord[]): DamageTrail[] {
  const map = new Map<string, DamageTrail>()

  for (const rec of chain) {
    for (const item of rec.items ?? []) {
      if (item.condition === 'ok') continue
      const trail = map.get(item.label) ?? {
        label: item.label, events: [], repeats: 0, repeated: false,
        lastCondition: item.condition,
      }
      trail.events.push({
        custodyId: rec.id,
        at: rec.created_at,
        holderName: rec.holder_name,
        holderId: rec.holder_id,
        condition: item.condition,
        note: item.note,
      })
      trail.lastCondition = item.condition
      map.set(item.label, trail)
    }
  }

  const out = [...map.values()].map(t => {
    // نعدّ المحاضر المتمايزة لا الأصناف: صنفان تالفان في محضر واحد ليسا تكراراً.
    const distinct = new Set(t.events.map(e => e.custodyId ?? e.at ?? '')).size
    return {
      ...t,
      repeats: distinct,
      repeated: distinct >= 2,
      firstAt: t.events[0]?.at,
      firstHolder: t.events[0]?.holderName,
    }
  })

  // الأكثر تكراراً أولاً — هذا ترتيب أولويات الصيانة.
  return out.sort((x, y) => y.repeats - x.repeats || x.label.localeCompare(y.label, 'ar'))
}

// ══════════════════════════════════════════════════════════════════════════════
// تصدير موعد التفتيش إلى التقويم
// ══════════════════════════════════════════════════════════════════════════════

/** الترميز الذي يطلبه معيار iCalendar للفواصل والفواصل المنقوطة. */
function icsEscape(s: string): string {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

/**
 * ينزّل موعد التفتيش القادم كملف تقويم يفتحه أي تطبيق مواعيد.
 *
 * الموعد يخرج من النظام إلى تقويم المسؤول لأن الموعد الذي لا يذكّر بنفسه
 * لا يُنفَّذ — وتُصبح دورية التفتيش سطراً في محضر فقط.
 */
export function downloadICS(o: {
  title: string
  date: string            // YYYY-MM-DD
  description?: string
  location?: string
  filename?: string
}): void {
  if (!o.date) return

  const start = o.date.replace(/-/g, '')
  const end = (() => {
    const d = new Date(o.date + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)          // الأحداث اليومية تنتهي في اليوم التالي
    return d.toISOString().slice(0, 10).replace(/-/g, '')
  })()

  const uid = `athar-${start}-${Math.random().toString(36).slice(2, 9)}@athar.app`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ATHAR//Custody Inspection//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${icsEscape(o.title)}`,
    o.location ? `LOCATION:${icsEscape(o.location)}` : '',
    o.description ? `DESCRIPTION:${icsEscape(o.description)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(o.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  // بلا BOM: ملفات CSV تحتاجه ليقرأ Excel العربية، أما ملفات التقويم فبعض
  // القارئات ترفض أي بايت قبل BEGIN:VCALENDAR.
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), {
    href: url, download: `ATHAR_${o.filename ?? 'inspection'}.ics`,
  })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * تنسيق موحّد لكل شاشات العهدة — بالعربية لا بصيغة ISO، للسبب نفسه المشروح
 * فوق arabicDate: الصيغة الرقمية تُقلب بصرياً داخل النص العربي.
 */
export const fmtDay = (v?: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  return arabicDate(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  )
}

export const fmtDate = (v?: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${fmtDay(v)} — ${time}`
}
