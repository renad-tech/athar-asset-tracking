// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ATHAR — أنواع الجلسات                                                  ║
// ║                                                                          ║
// ║  The session type is chosen on the home screen and drives everything     ║
// ║  after it: which fields are asked for, how many snapshots are taken,     ║
// ║  and which sections the final report renders.                            ║
// ║                                                                          ║
// ║  Adding a new type here is enough — no screen needs to change.           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export type SessionKind = 'document' | 'handover' | 'inventory' | 'inspection'

/**
 * How evidence is captured for a type.
 *  · 'single' — one snapshot now; the "before" comes from an earlier session
 *               on the same asset (handover, inventory, inspection).
 *  · 'pair'   — two snapshots inside the same session, before and after the
 *               intervention (incidents only — there is no earlier baseline).
 */
export type CaptureMode = 'single' | 'pair'

export type FieldKey =
  | 'assetName' | 'location' | 'notes'
  | 'fromParty' | 'toParty'
  | 'expectedCount'
  | 'severity' | 'description'

export type FieldDef = {
  key: FieldKey
  label: string
  placeholder?: string
  required?: boolean
  options?: string[]     // renders a dropdown instead of a text field
  multiline?: boolean
}

export type SessionTypeDef = {
  kind: SessionKind
  label: string           // home-screen title
  short: string           // chip / report label
  hint: string            // one line under the title
  icon: string            // key into the icon set
  color: 'green' | 'blue' | 'yellow' | 'red'
  capture: CaptureMode
  /** Can this session be compared against an earlier one on the same asset? */
  comparable: boolean
  fields: FieldDef[]
  /** Extra report sections beyond the shared ones. */
  reportSections: Array<'parties' | 'comparison' | 'counts' | 'severity' | 'pair'>
}

const COMMON: FieldDef[] = [
  { key: 'assetName', label: 'الأصل أو المرفق', placeholder: 'مثال: معمل الحاسب ٢٠٤', required: true },
  { key: 'location',  label: 'الموقع',          placeholder: 'مثال: كلية العلوم — الطابق الثاني', required: true },
]

export const SESSION_TYPES: Record<SessionKind, SessionTypeDef> = {

  document: {
    kind: 'document',
    label: 'توثيق الأصول',
    short: 'توثيق',
    hint: 'تسجيل الحالة المرجعية لأصل أو مرفق',
    icon: 'camera',
    color: 'green',
    capture: 'single',
    comparable: true,
    fields: [
      ...COMMON,
      { key: 'notes', label: 'ملاحظات', placeholder: 'أي ملاحظة على الحالة الحالية', multiline: true },
    ],
    reportSections: ['counts'],
  },

  handover: {
    kind: 'handover',
    label: 'التسليم والاستلام',
    short: 'تسليم',
    hint: 'نقل مسؤولية أصل بين طرفين بإثبات موثّق',
    icon: 'compare',
    color: 'blue',
    capture: 'single',
    comparable: true,
    fields: [
      ...COMMON,
      { key: 'fromParty', label: 'المُسلِّم', placeholder: 'اسم أو رقم من يسلّم', required: true },
      { key: 'toParty',   label: 'المُستلِم', placeholder: 'اسم أو رقم من يستلم', required: true },
      { key: 'notes',     label: 'ملاحظات التسليم', placeholder: 'أي ملاحظة يتفق عليها الطرفان', multiline: true },
    ],
    reportSections: ['parties', 'counts', 'comparison'],
  },

  inventory: {
    kind: 'inventory',
    label: 'الجرد الدوري',
    short: 'جرد',
    hint: 'حصر الموجودات ومطابقتها بالسجل',
    icon: 'clipboard',
    color: 'blue',
    capture: 'single',
    comparable: true,
    fields: [
      ...COMMON,
      { key: 'expectedCount', label: 'العدد المتوقع حسب السجل', placeholder: 'مثال: ٣٠' },
      { key: 'notes', label: 'ملاحظات', placeholder: 'أي فروقات أو ملاحظات', multiline: true },
    ],
    reportSections: ['counts', 'comparison'],
  },

  inspection: {
    kind: 'inspection',
    label: 'التفتيش الدوري',
    short: 'تفتيش',
    hint: 'فحص دوري للسلامة وحالة المرفق',
    icon: 'search',
    color: 'yellow',
    capture: 'single',
    comparable: true,
    fields: [
      ...COMMON,
      { key: 'notes', label: 'ملاحظات التفتيش', placeholder: 'الملاحظات والمخالفات إن وُجدت', multiline: true },
    ],
    reportSections: ['counts', 'comparison'],
  },
}

// الشاشة الرئيسية لا تعرض أي "جلسة عامة" — التسليم والاستلام والعهدة شاشتان
// مستقلتان بمعالجهما الخاص (انظر ScreenHome). قسم الحوادث أُزيل بالكامل.
export const TYPE_ORDER: SessionKind[] = []

export const typeOf = (k: SessionKind) => SESSION_TYPES[k]
