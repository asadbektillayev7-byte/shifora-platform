import type {
  AlertItem, AuthContextPayload, BloodPressureReading, CarePlan, DailyPlan, GlucoseReading,
  Medication, MonitoringConfig, NotificationItem, PatientRecord, PlanItem, QuestionDetail,
  SymptomCheck, User,
} from './types'

/** Browser-only fictional records. A demo token can never reach the production API. */
const STORAGE_KEY = 'shifora.demo.v1'
const VERSION = 1
const PREFIX = 'shifora-demo:'
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' })
const DEMO_NOTE = 'Namuna ma’lumot. Davolash tavsiyasi emas.'
const HOSPITAL = { id: 1, name: 'Shifora namuna klinikasi', region: 'Toshkent', phone: '000000000' }
type Payload = Record<string, any>
type DemoPatient = PatientRecord & { language: string; assigned_nurse_id: number; assigned_doctor_id: number }
type Profile = { diabetes_type: 'type1' | 'type2' | 'other'; diagnosis_date: string; hba1c: number | null; recent_hospitalization: number; prior_hypoglycemia: number; clinical_notes: string; cgm_enabled: number }
type Caregiver = { id: number; user_id: number; patient_id: number; relation: string; status: string; full_name: string; phone: string; permissions: Record<string, boolean> }
type Dose = PlanItem & { patient_id: number; care_plan_id: number; medication_id?: number; name?: string; dose?: string; unit?: string }
type Measurements = { glucose: GlucoseReading[]; blood_pressure: BloodPressureReading[]; symptoms: SymptomCheck[] }
export interface DemoDrug { id: number; name: string; generic_name: string; strength: string; form: string; unit: string; notes: string; instructions: string; is_active: number; created_at: string }
interface DemoState {
  version: number; next_id: number; created_date: string
  patients: DemoPatient[]; profiles: Record<number, Profile>; plans: CarePlan[]; doses: Dose[]
  measurements: Record<number, Measurements>; caregivers: Caregiver[]; alerts: AlertItem[]
  questions: QuestionDetail[]; notifications: (NotificationItem & { user_id: number })[]
  drugs: DemoDrug[]
}

const STAFF: User[] = [
  { id: 101, hospital_id: 1, role: 'doctor', full_name: 'Anvar Qodirov · namuna', phone: '000000101', language: 'uz' },
  { id: 102, hospital_id: 1, role: 'nurse', full_name: 'Dilnoza Rahimova · namuna', phone: '000000102', language: 'uz' },
  { id: 103, hospital_id: 1, role: 'hospital_admin', full_name: 'Nodira Yusupova · namuna', phone: '000000103', language: 'uz' },
]
const PERMISSIONS = { view_today_plan: true, view_adherence: true, view_alerts: true, view_measurements: true, view_care_plan: true, view_clinical_notes: false }
const PRESETS: Record<string, { label: string; times: string[] }> = {
  morning: { label: 'Ertalab', times: ['08:00'] }, evening: { label: 'Kechqurun', times: ['20:00'] },
  morning_noon: { label: 'Ertalab va tushda', times: ['08:00', '13:00'] },
  morning_evening: { label: 'Ertalab va kechqurun', times: ['08:00', '20:00'] },
  noon: { label: 'Tushda', times: ['13:00'] }, noon_evening: { label: 'Tushda va kechqurun', times: ['13:00', '20:00'] },
  every_8h: { label: 'Har 8 soatda', times: ['06:00', '14:00', '22:00'] }, every_12h: { label: 'Har 12 soatda', times: ['08:00', '20:00'] },
  twice_daily: { label: 'Kuniga 2 marta', times: ['08:00', '20:00'] },
  three_daily: { label: 'Kuniga 3 marta', times: ['08:00', '13:00', '20:00'] },
  before_meal: { label: 'Ovqatdan oldin', times: ['07:30', '12:30', '18:30'] },
  after_meal: { label: 'Ovqatdan keyin', times: ['08:30', '13:30', '19:30'] },
  bedtime: { label: 'Uyqudan oldin', times: ['22:00'] }, custom: { label: 'Belgilangan vaqtda', times: [] },
  as_needed: { label: 'Zaruratga ko‘ra', times: [] },
}
let fallbackState: DemoState | null = null

function storage(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }
function today(): string { return DAY_FORMAT.format(new Date()) }
function dateOffset(day: string, offset: number) { const d = new Date(`${day}T12:00:00+05:00`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10) }
function at(day: string, time = '09:00') { return `${day}T${time}:00+05:00` }
function now() { return new Date().toISOString() }
function id(s: DemoState) { return s.next_id++ }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) }
function fail(status: number, message: string): never { throw Object.assign(new Error(localizeText(message)), { status, details: null }) }
function bounded(value: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, value)) }
function fieldString(value: unknown, fallback = '') { return value == null ? fallback : String(value) }
function requireText(value: unknown, label: string) { const text = fieldString(value).trim(); if (!text) fail(400, `${label} kiriting.`); return text }
function onlyStaff(user: User) { if (!['doctor', 'nurse', 'hospital_admin'].includes(user.role)) fail(403, 'Bu bo‘lim faqat klinika xodimlari uchun.') }
function onlyClinician(user: User) { if (!['doctor', 'nurse'].includes(user.role)) fail(403, 'Rejani faqat shifokor yoki hamshira tasdiqlaydi.') }
function patientById(s: DemoState, patientId: number) { return s.patients.find(p => p.id === patientId) ?? fail(404, 'Bemor topilmadi.') }
function activePlan(s: DemoState, patientId: number) { return s.plans.find(p => p.patient_id === patientId && p.status === 'active') ?? null }
function access(s: DemoState, user: User, patientId: number, permission?: string) {
  const p = patientById(s, patientId)
  if (user.role === 'patient' && p.user_id !== user.id) fail(403, 'Boshqa bemor ma’lumotlariga ruxsat yo‘q.')
  if (user.role === 'caregiver') {
    const cg = s.caregivers.find(c => c.user_id === user.id && c.patient_id === patientId && c.status === 'active')
    if (!cg || (permission && !cg.permissions[permission])) fail(403, 'Bu ma’lumot uchun ruxsat berilmagan.')
  }
  return p
}
function selfPatient(s: DemoState, user: User) {
  if (user.role !== 'patient') fail(403, 'Bu bo‘lim bemor uchun.')
  return s.patients.find(p => p.user_id === user.id) ?? fail(403, 'Bemor hisobi bog‘lanmagan.')
}
function currentUser(s: DemoState, token: string | null | undefined): User {
  if (!isDemoToken(token ?? null)) fail(401, 'Namuna sessiyasini qayta oching.')
  const [, role, rawId] = token!.split(':')
  const userId = Number(rawId)
  const staff = STAFF.find(u => u.id === userId && u.role === role)
  if (staff) return staff
  const p = s.patients.find(p => p.user_id === userId)
  if (role === 'patient' && p) return { id: userId, role: 'patient', hospital_id: 1, full_name: `${p.first_name} ${p.last_name}`, phone: p.phone, language: p.language }
  const cg = s.caregivers.find(c => c.user_id === userId)
  if (role === 'caregiver' && cg) return { id: userId, role: 'caregiver', hospital_id: 1, full_name: cg.full_name, phone: cg.phone, language: 'uz' }
  return fail(401, 'Namuna sessiyasi topilmadi.')
}
function contextFor(s: DemoState, user: User): AuthContextPayload {
  return { hospital: HOSPITAL, patient: user.role === 'patient' ? selfPatient(s, user) : null,
    patients: user.role === 'caregiver' ? s.caregivers.filter(c => c.user_id === user.id && c.status === 'active').map(c => ({ ...patientById(s, c.patient_id), relation: c.relation })) : [] }
}

function normalizePlan(s: DemoState, patientId: number, payload: Payload, source = 'manual'): CarePlan {
  const meds: Medication[] = (payload.medications ?? []).map((m: Payload) => {
    const scheduleType = m.schedule_type === 'twice_daily' ? 'morning_evening' : fieldString(m.schedule_type, 'custom')
    const rawTimes = m.times ?? m.schedules?.map((x: Payload) => x.time_of_day) ?? PRESETS[scheduleType]?.times ?? []
    const times = [...new Set<string>(rawTimes.map((t: unknown) => fieldString(t)).filter((t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort()
    return { id: id(s), name: fieldString(m.name), dose: fieldString(m.dose), unit: fieldString(m.unit, 'namuna'), doses_per_day: times.length,
      schedule_type: scheduleType, priority: m.priority ?? 'normal', start_date: m.start_date || payload.start_date || today(), end_date: m.end_date || null,
      notes: m.notes || DEMO_NOTE, reminders_enabled: m.reminders_enabled === false || m.reminders_enabled === 0 ? 0 : 1,
      schedule_label: m.schedule_label ?? m.schedules?.[0]?.label ?? null,
      schedules: times.map(t => ({ id: id(s), time_of_day: t, label: m.schedule_label ?? m.schedules?.find((slot: Payload) => slot.time_of_day === t)?.label ?? null })) }
  })
  const monitoring: MonitoringConfig[] = (payload.monitoring ?? []).map((m: Payload) => ({
    id: id(s), type: m.type, enabled: m.enabled ? 1 : 0, frequency_per_day: m.times?.length ?? m.frequency_per_day ?? 0, notes: m.notes ?? null,
    times: (m.times ?? []).map((t: string | Payload) => ({ id: id(s), time_of_day: typeof t === 'string' ? t : t.time_of_day, context: typeof t === 'string' ? 'any' : t.context ?? 'any' })).sort((a: Payload, b: Payload) => a.time_of_day.localeCompare(b.time_of_day)),
  }))
  const defaultRules = [
    { code: 'glucose_critical_low', comparator: 'lt', value_1: 54, severity: 'urgent', message_uz: 'Namuna: juda past glyukoza' },
    { code: 'glucose_low', comparator: 'lt', value_1: 70, severity: 'warning', message_uz: 'Namuna: past glyukoza' },
    { code: 'glucose_high', comparator: 'gt', value_1: 180, severity: 'warning', message_uz: 'Namuna: yuqori glyukoza' },
    { code: 'glucose_critical_high', comparator: 'gt', value_1: 300, severity: 'urgent', message_uz: 'Namuna: juda yuqori glyukoza' },
    { code: 'bp_high', comparator: 'gt', value_1: 140, value_2: 90, severity: 'warning', message_uz: 'Namuna: qon bosimi ko‘rigi' },
  ]
  return {
    id: id(s), patient_id: patientId, version: Math.max(0, ...s.plans.filter(p => p.patient_id === patientId).map(p => p.version)) + 1,
    status: 'draft', source: payload.source ?? source, start_date: payload.start_date || today(), end_date: payload.end_date || null, notes: payload.notes || DEMO_NOTE,
    reminder_repeat_minutes: payload.reminder_repeat_minutes ?? 30, reminder_max_count: payload.reminder_max_count ?? 2, snooze_minutes: payload.snooze_minutes ?? 15,
    escalate_normal_minutes: payload.escalate_normal_minutes ?? 240, escalate_important_minutes: payload.escalate_important_minutes ?? 120, escalate_critical_minutes: payload.escalate_critical_minutes ?? 60,
    approved_at: null, approver: null, medications: meds, monitoring,
    rules: defaultRules.map(r => ({ id: id(s), enabled: 1, value_2: null, ...r, ...(payload.rules ?? []).find((v: Payload) => v.code === r.code) })) as CarePlan['rules'],
  }
}
function makeTasks(s: DemoState, plan: CarePlan, day: string, seeded = false) {
  if (plan.status !== 'active' || (plan.start_date && day < plan.start_date) || (plan.end_date && day > plan.end_date)) return
  const add = (item: Omit<Dose, 'id'>) => {
    if (s.doses.some(d => d.care_plan_id === plan.id && d.kind === item.kind && d.scheduled_at === item.scheduled_at && d.medication_id === item.medication_id)) return
    const seed = (plan.patient_id * 3 + Number(day.slice(-2)) + Number(item.time.slice(0, 2))) % 13
    const historical = day < today()
    const completed = seeded && (historical ? seed !== 0 && seed !== 1 : Number(item.time.slice(0, 2)) < 12 && seed !== 0)
    const status = completed ? item.kind === 'medication' ? 'taken' : 'done' : historical && seeded ? 'missed' : 'pending'
    s.doses.push({ ...item, id: id(s), status, taken_at: completed ? item.scheduled_at : null })
  }
  for (const med of plan.medications) {
    if (med.schedule_type === 'as_needed' || (med.start_date && day < med.start_date) || (med.end_date && day > med.end_date)) continue
    for (const slot of med.schedules) add({ patient_id: plan.patient_id, care_plan_id: plan.id, medication_id: med.id, kind: 'medication', time: slot.time_of_day,
      scheduled_at: at(day, slot.time_of_day), status: 'pending', title: `${med.name} · ${med.dose} ${med.unit}`, name: med.name, dose: med.dose, unit: med.unit, priority: med.priority, note: med.notes })
  }
  for (const cfg of plan.monitoring.filter(m => m.enabled && (!seeded || day === today()))) for (const slot of cfg.times) add({ patient_id: plan.patient_id, care_plan_id: plan.id,
    kind: cfg.type, time: slot.time_of_day, scheduled_at: at(day, slot.time_of_day), status: 'pending', context: slot.context,
    title: cfg.type === 'glucose' ? 'Glyukoza o‘lchovi' : cfg.type === 'blood_pressure' ? 'Qon bosimi' : 'Holat so‘rovi', note: DEMO_NOTE })
}
function dailyPlan(s: DemoState, patientId: number, day = today()): DailyPlan {
  const p = activePlan(s, patientId)
  if (p) makeTasks(s, p, day)
  const items = s.doses.filter(d => d.patient_id === patientId && d.scheduled_at.startsWith(day)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at) || a.id - b.id)
  const done = items.filter(i => ['taken', 'done'].includes(i.status)).length
  const meds = items.filter(i => i.kind === 'medication')
  return { date: day, items, summary: { total: items.length, done, pending: items.filter(i => ['pending', 'snoozed'].includes(i.status)).length,
    missed: items.filter(i => i.status === 'missed').length, medications_total: meds.length, medications_done: meds.filter(i => i.status === 'taken').length, complete: items.length > 0 && done === items.length } }
}
function adherence(s: DemoState, patientId: number, days = 7) {
  const from = dateOffset(today(), -days + 1)
  const doses = s.doses.filter(d => d.patient_id === patientId && d.kind === 'medication' && d.scheduled_at.slice(0, 10) >= from && new Date(d.scheduled_at).getTime() <= Date.now())
  const taken = doses.filter(d => d.status === 'taken').length
  return { total: doses.length, taken, rate: doses.length ? Math.round(100 * taken / doses.length) : null }
}
function lastActivity(s: DemoState, patientId: number) {
  const m = s.measurements[patientId]
  return [...(m?.glucose ?? []).map(r => r.measured_at), ...(m?.blood_pressure ?? []).map(r => r.measured_at), ...(m?.symptoms ?? []).map(r => r.reported_at),
    ...s.doses.filter(d => d.patient_id === patientId && d.taken_at).map(d => d.taken_at!)].sort().at(-1) ?? null
}
function decorateAlert(s: DemoState, alert: AlertItem): AlertItem {
  const p = patientById(s, alert.patient_id)
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(alert.created_at).getTime()) / 60_000))
  return { ...alert, first_name: p.first_name, last_name: p.last_name, phone: p.phone, emergency_contact_name: p.emergency_contact_name ?? undefined,
    emergency_contact_phone: p.emergency_contact_phone ?? undefined, elapsed: elapsed < 60 ? `${elapsed} daqiqa` : `${Math.floor(elapsed / 60)} soat` }
}
function refreshStatus(s: DemoState, patientId: number) {
  const open = s.alerts.filter(a => a.patient_id === patientId && a.status !== 'closed')
  patientById(s, patientId).status = open.some(a => a.severity === 'urgent') ? 'urgent' : open.length ? 'attention' : 'stable'
}
function addNotification(s: DemoState, userId: number, title: string, body: string, entityId: number | null = null, type = 'info') {
  s.notifications.unshift({ id: id(s), user_id: userId, title, body, type, read_at: null, created_at: now(), entity_type: entityId ? 'patient_question' : null, entity_id: entityId })
}
function raiseAlert(s: DemoState, patientId: number, severity: AlertItem['severity'], title: string, detail: string, ruleCode = 'demo_review') {
  const a: AlertItem = { id: id(s), patient_id: patientId, rule_code: ruleCode, severity, title, detail, status: 'new', assigned_user_id: null, assigned_name: null,
    created_at: now(), elapsed: '0 daqiqa', context: { demo: true }, notes: [] }
  s.alerts.unshift(a); refreshStatus(s, patientId)
  addNotification(s, 102, title, detail, a.id, severity === 'urgent' ? 'alert_urgent' : 'alert')
  return a.id
}

function seed(): DemoState {
  const day = today()
  const s: DemoState = { version: VERSION, next_id: 10000, created_date: day, patients: [], profiles: {}, plans: [], doses: [], measurements: {}, caregivers: [], alerts: [], questions: [], notifications: [], drugs: [] }
  const first = ['Zilola', 'Bahodir', 'Malika', 'Rustam', 'Nargiza', 'Jasur', 'Dilbar', 'Aziz', 'Shahnoza', 'Akmal', 'Gulnoza', 'Bekzod', 'Feruza', 'Otabek', 'Lola', 'Sardor', 'Madina', 'Temur', 'Dilorom', 'Ulug‘bek', 'Munisa', 'Bobur', 'Nigora', 'Sanjar', 'Rano', 'Farruh', 'Saida', 'Jamshid', 'Shahlo', 'Davron', 'Nasiba', 'Islom', 'Gulbahor', 'Shavkat', 'Ozoda', 'Sherzod', 'Yulduz', 'Mirjalol', 'Mukarram', 'Anvar']
  const last = ['Karimova', 'To‘xtayev', 'Usmonova', 'Saidov', 'Yusupova', 'Rahmonov', 'Abdullayeva', 'Ismoilov', 'Rasulova', 'Tursunov']
  const names = [
    ['Metformin', 'Metformin', 'Tabletka', '500 mg', 'mg'], ['Gliklazid', 'Gliclazide', 'Tabletka', '30 mg', 'mg'],
    ['Insulin glargin', 'Insulin glargine', 'Inʼeksiya', '100 birlik/ml', 'birlik'], ['Empagliflozin', 'Empagliflozin', 'Tabletka', '10 mg', 'mg'],
    ['Sitagliptin', 'Sitagliptin', 'Tabletka', '100 mg', 'mg'], ['Amlodipin', 'Amlodipine', 'Tabletka', '5 mg', 'mg'],
    ['Atorvastatin', 'Atorvastatin', 'Tabletka', '20 mg', 'mg'], ['Losartan', 'Losartan', 'Tabletka', '50 mg', 'mg'],
  ]
  s.drugs = names.map((m, index) => ({ id: index + 1, name: m[0], generic_name: m[1], form: m[2], strength: m[3], unit: m[4], notes: DEMO_NOTE, instructions: DEMO_NOTE, is_active: 1, created_at: at(day) }))
  first.forEach((name, i) => {
    const patientId = i + 1
    const p: DemoPatient = { id: patientId, hospital_id: 1, user_id: 1000 + patientId, first_name: name, last_name: last[i % last.length], birth_date: `${1956 + i % 35}-${String(i % 12 + 1).padStart(2, '0')}-15`,
      gender: i % 2 ? 'male' : 'female', phone: `000${String(patientId).padStart(6, '0')}`, address: 'Toshkent · namuna manzil', emergency_contact_name: `Yaqin kishi ${patientId} · namuna`,
      emergency_contact_phone: `000${String(500 + patientId).padStart(6, '0')}`, status: 'stable', discharge_date: dateOffset(day, -6 - i % 17), language: i % 6 === 0 ? 'ru' : 'uz', assigned_nurse_id: 102, assigned_doctor_id: 101 }
    s.patients.push(p)
    s.profiles[patientId] = { diabetes_type: i % 7 === 0 ? 'type1' : 'type2', diagnosis_date: `${2012 + i % 12}-04-10`, hba1c: Number((6.4 + (i % 22) / 10).toFixed(1)), recent_hospitalization: 1, prior_hypoglycemia: i % 9 === 0 ? 1 : 0, clinical_notes: 'O‘quv namoyishi uchun xayoliy bemor kartasi. Klinik qaror uchun ishlatilmaydi.', cgm_enabled: 0 }
    s.caregivers.push({ id: patientId, user_id: 2000 + patientId, patient_id: patientId, relation: i % 2 ? 'Qizi' : 'O‘g‘li', status: 'active', full_name: `Yaqin kishi ${patientId} · namuna`, phone: p.emergency_contact_phone!, permissions: { ...PERMISSIONS, view_measurements: i % 3 !== 2, view_care_plan: i % 4 !== 3 } })
    const plan = normalizePlan(s, patientId, { start_date: dateOffset(day, -30), notes: DEMO_NOTE,
      medications: [{ name: `${s.drugs[i % 5].name} (namuna)`, dose: '1', unit: 'namuna', schedule_type: 'morning_evening', times: ['08:00', '20:00'], priority: 'important', start_date: dateOffset(day, -30), notes: 'Namuna jadval. Ovqat bilan bog‘liq qayd shifokor tomonidan tekshiriladi.' }],
      monitoring: [{ type: 'glucose', enabled: true, times: [{ time_of_day: '07:30', context: 'fasting' }, { time_of_day: '13:00', context: 'after_meal' }] },
        { type: 'blood_pressure', enabled: true, times: [{ time_of_day: '09:00', context: 'any' }] }, { type: 'symptom', enabled: true, times: [{ time_of_day: '19:00', context: 'any' }] }] })
    plan.status = 'active'; plan.approved_at = at(dateOffset(day, -29)); plan.approver = { id: 101, full_name: STAFF[0].full_name, role: 'doctor' }; s.plans.push(plan)
    const m: Measurements = { glucose: [], blood_pressure: [], symptoms: [] }
    for (let offset = 27; offset >= 0; offset--) {
      const date = dateOffset(day, -offset)
      const value = 95 + ((i * 11 + offset * 7) % 96)
      m.glucose.unshift({ id: id(s), value, unit: 'mg/dL', measured_at: at(date, '07:35'), context: 'fasting', note: DEMO_NOTE })
      if (offset % 2 === 0) m.glucose.unshift({ id: id(s), value: bounded(value + 28 - (i % 10), 80, 250), unit: 'mg/dL', measured_at: at(date, '13:05'), context: 'after_meal', note: DEMO_NOTE })
      if (offset % 3 === 0) {
        m.blood_pressure.unshift({ id: id(s), systolic: 116 + (i * 3 + offset) % 35, diastolic: 72 + (i + offset) % 19, pulse: 65 + (i + offset) % 20, measured_at: at(date, '09:05'), note: DEMO_NOTE })
        m.symptoms.unshift({ id: id(s), feeling: (i + offset) % 8 === 0 ? 'not_good' : 'good', symptoms: (i + offset) % 8 === 0 ? ['weakness'] : [], reported_at: at(date, '19:00'), note: DEMO_NOTE })
      }
      makeTasks(s, plan, date, true)
    }
    s.measurements[patientId] = m
    if (i < 13) {
      const severity = i < 4 ? 'urgent' : 'warning'
      const alertId = raiseAlert(s, patientId, severity, i < 4 ? 'Glyukoza ko‘rigini talab qiladi' : i % 2 ? 'Dori tasdig‘i kutilmoqda' : 'O‘lchov hali kiritilmagan', `${DEMO_NOTE} Kuzatuv jamoasi namunaviy holatni ko‘rib chiqadi.`, i < 4 ? 'glucose_critical_high' : 'missed_task')
      const a = s.alerts.find(a => a.id === alertId)!
      a.created_at = new Date(Date.now() - (15 + i * 13) * 60_000).toISOString()
      if (i % 3 === 1) { a.status = 'in_review'; a.assigned_user_id = 102; a.assigned_name = STAFF[1].full_name }
      if (i < 4) m.glucose.unshift({ id: id(s), value: 310 + i * 13, unit: 'mg/dL', measured_at: a.created_at, context: 'after_meal', note: DEMO_NOTE })
    }
    if (i >= 13 && i < 17) {
      const closedId = raiseAlert(s, patientId, 'info', 'Namuna kuzatuv yakunlandi', 'Namuna holat ko‘rib chiqildi va yopildi.', 'demo_resolved')
      const closed = s.alerts.find(a => a.id === closedId)!
      closed.status = 'closed'; closed.assigned_user_id = 102; closed.assigned_name = STAFF[1].full_name
      closed.created_at = at(dateOffset(day, -1 - i % 3), '10:15'); refreshStatus(s, patientId)
      closed.notes = [{ id: id(s), note: 'Namuna: bemor bilan aloqa qayd etildi.', full_name: STAFF[1].full_name, created_at: at(dateOffset(day, -1), '11:00') }]
    }
    if (i < 16) {
      const status = i < 6 ? 'unanswered' : i < 9 ? 'assigned' : i < 14 ? 'answered' : 'closed'
      s.questions.push({ id: id(s), patient_id: patientId, question: ['Bugungi o‘lchovni qachon kiritaman?', 'Ko‘rsatkichlarimni hamshira ko‘rdimi?', 'Rejamdagi vaqtni aniqlashtirib bera olasizmi?', 'Navbatdagi nazorat qachon?'][i % 4], language: 'uz', status, priority: i < 2 ? 'high' : 'normal', ai_attempted: 0, ai_answer: null, refused: 0, refusal_reason: null,
        answer: ['answered', 'closed'].includes(status) ? 'Namuna javob: kuzatuv jamoasi bilan reja tafsilotlarini aniqlashtiring.' : null, answer_source: status === 'answered' ? 'hospital_staff_answer' : null,
        assigned_to: status === 'unanswered' ? null : 102, assigned_name: status === 'unanswered' ? null : STAFF[1].full_name, answered_by: status === 'answered' ? 102 : null, answered_by_name: status === 'answered' ? STAFF[1].full_name : null,
        alert_id: null, created_at: new Date(Date.now() - (i + 1) * 32 * 60_000).toISOString(), answered_at: status === 'answered' ? new Date(Date.now() - i * 20 * 60_000).toISOString() : null, references: [], notes: [] })
    }
    addNotification(s, 1000 + patientId, 'Namuna rejangiz tayyor', 'Bugungi jadvalingiz va kuzatuv vaqtlarini ko‘ring. Bu xayoliy ma’lumot.', null, 'info')
    addNotification(s, 2000 + patientId, 'Yaqiningizning namuna rejasi', 'Sizga berilgan ruxsatlar asosida kuzatuvni ko‘rishingiz mumkin.')
  })
  // A draft and an archived version make plan status filters useful immediately.
  const archived = copy(s.plans[0]); archived.id = id(s); archived.version = 1; archived.status = 'archived'; s.plans[0].version = 2; s.plans.push(archived)
  const draft = normalizePlan(s, 2, { ...s.plans[1], medications: s.plans[1].medications, monitoring: s.plans[1].monitoring, start_date: day, notes: `Ko‘rib chiqish uchun namuna loyiha. ${DEMO_NOTE}` }); s.plans.push(draft)
  addNotification(s, 101, 'Namuna ko‘rik navbati', '40 ta xayoliy bemor va kuzatuv navbati ko‘rib chiqishga tayyor.')
  addNotification(s, 103, 'Namuna klinika tayyor', 'Bemorlar, rejalar va kuzatuv jamoasi xayoliy ma’lumotlar bilan to‘ldirilgan.')
  return s
}
function save(s: DemoState) { fallbackState = s; try { storage()?.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* Private browsing / full storage: keep this session usable. */ } }
function load(): DemoState {
  try { const raw = storage()?.getItem(STORAGE_KEY); if (raw) { const s = JSON.parse(raw) as DemoState; if (s.version === VERSION && s.patients?.length && s.drugs) { s.plans.forEach(p => p.medications.forEach(m => { if (m.schedule_type === 'twice_daily') m.schedule_type = 'morning_evening' })); return s } } } catch { /* Reseed only our own invalid demo namespace. */ }
  if (fallbackState?.version === VERSION) return fallbackState
  const s = seed(); save(s); return s
}
export function isDemoToken(token: string | null): boolean { return Boolean(token?.startsWith(PREFIX)) }
export function isDemoMode(): boolean { return isDemoToken(storage()?.getItem('shifora.token') ?? null) }
export function resetDemoData(): void { fallbackState = null; storage()?.removeItem(STORAGE_KEY); save(seed()) }
export function startDemoSession(roleGroup: 'hospital' | 'patient' | 'caregiver', staffRole: 'doctor' | 'nurse' = 'doctor'): { token: string; user: User; context: AuthContextPayload } {
  const s = load()
  const user: User = roleGroup === 'hospital' ? STAFF.find(u => u.role === staffRole)! : roleGroup === 'patient'
    ? { id: 1001, hospital_id: 1, role: 'patient', full_name: `${s.patients[0].first_name} ${s.patients[0].last_name}`, phone: s.patients[0].phone, language: 'uz' }
    : { id: 2001, hospital_id: 1, role: 'caregiver', full_name: s.caregivers[0].full_name, phone: s.caregivers[0].phone, language: 'uz' }
  return localizeResult(copy({ token: `${PREFIX}${user.role}:${user.id}`, user, context: contextFor(s, user) })) as { token: string; user: User; context: AuthContextPayload }
}

function report(s: DemoState, patientId: number, days: number) {
  const from = dateOffset(today(), -days + 1), to = today()
  const doses = s.doses.filter(d => d.patient_id === patientId && d.kind === 'medication' && d.scheduled_at.slice(0, 10) >= from && d.scheduled_at.slice(0, 10) <= to)
  const ms = s.measurements[patientId] ?? { glucose: [], blood_pressure: [], symptoms: [] }
  const glucose = ms.glucose.filter(r => r.measured_at.slice(0, 10) >= from)
  const bp = ms.blood_pressure.filter(r => r.measured_at.slice(0, 10) >= from)
  const symptoms = ms.symptoms.filter(r => r.reported_at.slice(0, 10) >= from)
  const alerts = s.alerts.filter(a => a.patient_id === patientId && a.created_at.slice(0, 10) >= from).map(a => decorateAlert(s, a))
  const ad = adherence(s, patientId, days)
  return { period_days: days, from, to, adherence: { ...ad, missed: doses.filter(d => d.status === 'missed').length, pending: doses.filter(d => ['pending', 'snoozed'].includes(d.status)).length,
    by_day: Array.from({ length: days }, (_, i) => { const date = dateOffset(from, i); const items = doses.filter(d => d.scheduled_at.startsWith(date)); const taken = items.filter(d => d.status === 'taken').length; return { date, total: items.length, taken, rate: items.length ? Math.round(taken / items.length * 100) : null } }) },
    glucose: { count: glucose.length, average: glucose.length ? Math.round(glucose.reduce((a, r) => a + r.value, 0) / glucose.length) : null, min: glucose.length ? Math.min(...glucose.map(r => r.value)) : null, max: glucose.length ? Math.max(...glucose.map(r => r.value)) : null, readings: glucose },
    blood_pressure: { count: bp.length, readings: bp }, symptoms: { count: symptoms.length, not_good: symptoms.filter(r => r.feeling !== 'good').length, checks: symptoms }, alerts: { count: alerts.length, urgent: alerts.filter(a => a.severity === 'urgent').length, items: alerts } }
}
function patientList(s: DemoState, p: DemoPatient) {
  const alerts = s.alerts.filter(a => a.patient_id === p.id && a.status !== 'closed')
  const glucose = s.measurements[p.id]?.glucose[0]
  return { ...p, diabetes_type: s.profiles[p.id]?.diabetes_type ?? null, adherence: adherence(s, p.id).rate,
    last_glucose: glucose ? { value: glucose.value, measured_at: glucose.measured_at } : null, last_activity: lastActivity(s, p.id), open_alerts: alerts.length, has_urgent_alert: alerts.some(a => a.severity === 'urgent') }
}
function profileResponse(s: DemoState, p: DemoPatient) {
  return { patient: p, profile: s.profiles[p.id], care_plan: activePlan(s, p.id), adherence: { d7: adherence(s, p.id), d30: adherence(s, p.id, 30) }, last_activity: lastActivity(s, p.id),
    today: dailyPlan(s, p.id), ...s.measurements[p.id], alerts: s.alerts.filter(a => a.patient_id === p.id).map(a => decorateAlert(s, a)), caregivers: s.caregivers.filter(c => c.patient_id === p.id),
    plan_history: s.plans.filter(plan => plan.patient_id === p.id).sort((a, b) => b.version - a.version).map(p => ({ ...p, approver: p.approver?.full_name ?? null })) }
}
function decorateQuestion(s: DemoState, q: QuestionDetail) { const p = patientById(s, q.patient_id); return { ...q, first_name: p.first_name, last_name: p.last_name, patient_phone: p.phone } }
function approve(s: DemoState, plan: CarePlan, user: User) {
  onlyClinician(user)
  if (plan.status === 'archived') fail(400, 'Arxivlangan reja tasdiqlanmaydi.')
  if (plan.status === 'active') return plan
  const previous = activePlan(s, plan.patient_id)
  if (previous) {
    previous.status = 'archived'
    // Completed/history rows stay intact. Untouched current/future rows cannot duplicate the new schedule.
    s.doses = s.doses.filter(d => !(d.care_plan_id === previous.id && ['pending', 'snoozed'].includes(d.status) && d.scheduled_at.slice(0, 10) >= today()))
  }
  plan.status = 'active'; plan.approved_at = now(); plan.approver = { id: user.id, role: user.role, full_name: user.full_name }
  makeTasks(s, plan, today())
  addNotification(s, patientById(s, plan.patient_id).user_id!, 'Namuna rejangiz yangilandi', `v${plan.version} namuna rejasi tasdiqlandi. Bugungi jadvalni tekshiring.`)
  return plan
}
function glucoseStats(s: DemoState, patientId: number) {
  const readings = (s.measurements[patientId]?.glucose ?? []).filter(r => r.measured_at.slice(0, 10) >= dateOffset(today(), -6))
  const values = readings.map(r => r.value), plan = activePlan(s, patientId)
  const low = plan?.rules.find(r => r.code === 'glucose_low')?.value_1 ?? 70
  const high = plan?.rules.find(r => r.code === 'glucose_high')?.value_1 ?? 180
  return { count: values.length, unit: 'mg/dL', avg: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
    change: values.length > 1 ? values[0] - values[values.length - 1] : null, first_value: values.at(-1) ?? null, last_value: values[0] ?? null, days: 7,
    in_range_pct: values.length ? Math.round(values.filter(v => v >= low && v <= high).length / values.length * 100) : null, readings }
}

function medicationHistoryRange(params: URLSearchParams): { from: string; to: string } | null {
  if (!params.has('from') && !params.has('to')) return null
  const from = params.get('from'), to = params.get('to')
  if (!from || !to || params.getAll('from').length !== 1 || params.getAll('to').length !== 1) fail(400, 'Davrning boshlanish va tugash sanalarini kiriting.')
  const parse = (value: string) => {
    const stamp = Date.parse(`${value}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) fail(400, 'Yaroqli sanani YYYY-MM-DD shaklida kiriting.')
    return stamp
  }
  const start = parse(from), end = parse(to)
  if (start > end) fail(400, 'Boshlanish sanasi tugash sanasidan keyin bo‘lmasin.')
  if ((end - start) / 86_400_000 + 1 > 366) fail(400, 'Bir so‘rovda ko‘pi bilan 366 kunni tanlang.')
  return { from, to }
}

const DEMO_RU: Record<string, string> = {
  [DEMO_NOTE]: 'Демонстрационные данные. Не является назначением лечения.',
  'Shifora namuna klinikasi': 'Демонстрационная клиника Shifora', 'Toshkent': 'Ташкент',
  'Toshkent · namuna manzil': 'Ташкент · вымышленный адрес', 'O‘g‘li': 'Сын', 'Qizi': 'Дочь', 'Yaqin kishi': 'Близкий человек',
  'Tabletka': 'Таблетка', 'Inʼeksiya': 'Инъекция', 'namuna': 'демо',
  'O‘quv namoyishi uchun xayoliy bemor kartasi. Klinik qaror uchun ishlatilmaydi.': 'Вымышленная карта пациента для демонстрации. Не используется для клинических решений.',
  'Namuna jadval. Ovqat bilan bog‘liq qayd shifokor tomonidan tekshiriladi.': 'Демонстрационное расписание. Связь с приёмом пищи проверяет врач.',
  'Glyukoza o‘lchovi': 'Измерение глюкозы', 'Qon bosimi': 'Артериальное давление', 'Holat so‘rovi': 'Проверка самочувствия',
  'Glyukoza ko‘rigini talab qiladi': 'Требуется проверка глюкозы', 'Dori tasdig‘i kutilmoqda': 'Ожидается подтверждение приёма', 'O‘lchov hali kiritilmagan': 'Измерение ещё не внесено',
  'Namuna ma’lumot. Davolash tavsiyasi emas. Kuzatuv jamoasi namunaviy holatni ko‘rib chiqadi.': 'Демонстрационные данные. Команда наблюдения проверяет пример ситуации. Не является назначением лечения.',
  'Bugungi o‘lchovni qachon kiritaman?': 'Когда внести сегодняшнее измерение?', 'Ko‘rsatkichlarimni hamshira ko‘rdimi?': 'Медсестра уже посмотрела мои показатели?',
  'Rejamdagi vaqtni aniqlashtirib bera olasizmi?': 'Можно уточнить время в моём плане?', 'Navbatdagi nazorat qachon?': 'Когда следующая проверка?',
  'Namuna javob: kuzatuv jamoasi bilan reja tafsilotlarini aniqlashtiring.': 'Пример ответа: уточните детали плана у команды наблюдения.',
  'Namuna rejangiz tayyor': 'Демонстрационный план готов', 'Bugungi jadvalingiz va kuzatuv vaqtlarini ko‘ring. Bu xayoliy ma’lumot.': 'Посмотрите расписание и время измерений. Это вымышленные данные.',
  'Yaqiningizning namuna rejasi': 'Демонстрационный план близкого', 'Sizga berilgan ruxsatlar asosida kuzatuvni ko‘rishingiz mumkin.': 'Данные наблюдения доступны в пределах выданных разрешений.',
  'Namuna rejangiz yangilandi': 'Демонстрационный план обновлён', 'Namuna savolingizga javob keldi': 'Получен ответ на демонстрационный вопрос', 'Namuna bemordan savol': 'Вопрос демонстрационного пациента',
  'Namuna kuzatuv yakunlandi': 'Демонстрационное наблюдение завершено', 'Namuna holat ko‘rib chiqildi va yopildi.': 'Демонстрационный случай рассмотрен и закрыт.', 'Namuna: bemor bilan aloqa qayd etildi.': 'Демо: контакт с пациентом зафиксирован.',
  'Namuna ko‘rik navbati': 'Демонстрационная очередь проверки', '40 ta xayoliy bemor va kuzatuv navbati ko‘rib chiqishga tayyor.': '40 вымышленных пациентов и очередь наблюдения готовы к просмотру.',
  'Namuna klinika tayyor': 'Демонстрационная клиника готова', 'Bemorlar, rejalar va kuzatuv jamoasi xayoliy ma’lumotlar bilan to‘ldirilgan.': 'Пациенты, планы и команда заполнены вымышленными данными.',
  'Namuna glyukoza ko‘rigi': 'Проверка глюкозы · демо', 'Namuna holat so‘rovi': 'Проверка самочувствия · демо', 'Yaqin kishidan namuna murojaat': 'Обращение близкого · демо',
  'Namuna murojaatingiz yuborildi': 'Демонстрационное обращение отправлено', 'Kuzatuv jamoasi murojaatni ko‘rib chiqadi.': 'Команда наблюдения рассмотрит обращение.',
  'Namuna savolingiz kuzatuv jamoasiga yuborildi. Javob “Savollarim” bo‘limida ko‘rinadi.': 'Демонстрационный вопрос отправлен команде наблюдения. Ответ появится в разделе «Мои вопросы».',
  'Namuna ko‘rinishi: kiritilgan jadval tibbiyot xodimi tomonidan tekshiriladi.': 'Демонстрация: введённое расписание проверяет медицинский работник.',
  'Bu namuna hech qanday individual doza yoki davolash tavsiyasini yaratmaydi.': 'Этот пример не создаёт индивидуальные дозировки или рекомендации по лечению.',
  'Namuna: juda past glyukoza': 'Демо: очень низкая глюкоза', 'Namuna: past glyukoza': 'Демо: низкая глюкоза', 'Namuna: yuqori glyukoza': 'Демо: высокая глюкоза', 'Namuna: juda yuqori glyukoza': 'Демо: очень высокая глюкоза', 'Namuna: qon bosimi ko‘rigi': 'Демо: проверка давления',
  'Ko‘rib chiqish uchun namuna loyiha. Namuna ma’lumot. Davolash tavsiyasi emas.': 'Демонстрационный черновик для проверки. Не является назначением лечения.',
  'Ertalab': 'Утром', 'Kechqurun': 'Вечером', 'Kuniga 2 marta': '2 раза в день', 'Kuniga 3 marta': '3 раза в день', 'Ovqatdan oldin': 'До еды', 'Ovqatdan keyin': 'После еды', 'Uyqudan oldin': 'Перед сном', 'Belgilangan vaqtda': 'В указанное время', 'Zaruratga ko‘ra': 'По необходимости',
  'Ertalab va tushda': 'Утром и днём', 'Ertalab va kechqurun': 'Утром и вечером', 'Tushda': 'Днём', 'Tushda va kechqurun': 'Днём и вечером', 'Har 8 soatda': 'Каждые 8 часов', 'Har 12 soatda': 'Каждые 12 часов',
  'Namuna sessiyasini qayta oching.': 'Откройте демонстрационную сессию заново.', 'Namuna sessiyasi topilmadi.': 'Демонстрационная сессия не найдена.',
  'Bu bo‘lim faqat klinika xodimlari uchun.': 'Этот раздел доступен только сотрудникам клиники.', 'Rejani faqat shifokor yoki hamshira tasdiqlaydi.': 'План может утвердить только врач или медсестра.',
  'Bemor topilmadi.': 'Пациент не найден.', 'Boshqa bemor ma’lumotlariga ruxsat yo‘q.': 'Нет доступа к данным другого пациента.', 'Bu ma’lumot uchun ruxsat berilmagan.': 'Доступ к этим данным не разрешён.',
  'Bu bo‘lim bemor uchun.': 'Этот раздел предназначен для пациента.', 'Bemor hisobi bog‘lanmagan.': 'Учётная запись пациента не привязана.',
  'Arxivlangan reja tasdiqlanmaydi.': 'Нельзя утвердить архивный план.', 'Dori topilmadi.': 'Препарат не найден.', 'Reja topilmadi.': 'План не найден.', 'Ogohlantirish topilmadi.': 'Уведомление не найдено.', 'Savol topilmadi.': 'Вопрос не найден.',
  'Bu bo‘lim yaqin kishi uchun.': 'Этот раздел предназначен для близкого человека.', 'Yaqin kishi o‘lchov kiritmaydi.': 'Близкий человек не может вносить измерения.',
  'Davrning boshlanish va tugash sanalarini kiriting.': 'Укажите даты начала и окончания периода.',
  'Yaroqli sanani YYYY-MM-DD shaklida kiriting.': 'Введите действительную дату в формате ГГГГ-ММ-ДД.',
  'Boshlanish sanasi tugash sanasidan keyin bo‘lmasin.': 'Дата начала не должна быть позже даты окончания.',
  'Bir so‘rovda ko‘pi bilan 366 kunni tanlang.': 'В одном запросе можно выбрать не более 366 дней.',
}
function localizeText(text: string): string {
  if (storage()?.getItem('shifora.language') !== 'ru') return text
  if (DEMO_RU[text]) return DEMO_RU[text]
  if (/^Yaqin kishi \d+ · namuna$/.test(text)) return text.replace('Yaqin kishi', 'Близкий человек').replace('namuna', 'демо')
  if (/^(Anvar Qodirov|Dilnoza Rahimova|Nodira Yusupova) · namuna$/.test(text)) return text.replace('namuna', 'демо')
  if (/^\d+ daqiqa$/.test(text)) return text.replace('daqiqa', 'мин.')
  if (/^\d+ soat$/.test(text)) return text.replace('soat', 'ч.')
  if (/^v\d+ namuna rejasi tasdiqlandi\./.test(text)) return text.replace(/namuna rejasi tasdiqlandi\. Bugungi jadvalni tekshiring\./, 'демонстрационного плана утверждена. Проверьте расписание на сегодня.')
  if (text.includes('(namuna)')) return text.replace('(namuna)', '(демо)').replace(/ namuna$/, ' демо')
  if (/^Namuna: oxirgi 7 kunda dori tasdig‘i /.test(text)) return text.replace('Namuna: oxirgi 7 kunda dori tasdig‘i ', 'Демо: подтверждение приёма за 7 дней — ')
  if (/^Namuna: \d+ ta o‘lchov, o‘rtacha /.test(text)) return text.replace('Namuna: ', 'Демо: ').replace(' ta o‘lchov, o‘rtacha ', ' измерений, среднее ').replace('Klinik tavsiya emas.', 'Не является клинической рекомендацией.')
  return text
}
function localizeResult(value: unknown): unknown {
  if (typeof value === 'string') return localizeText(value)
  if (Array.isArray(value)) return value.map(localizeResult)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, localizeResult(entry)]))
  return value
}

/** Matches the app's REST contracts, without fetch, cookies, secrets or database access. */
export async function demoRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const s = load(), user = currentUser(s, token ?? storage()?.getItem('shifora.token'))
  const url = new URL(path.replace(/^\/api\//, '/'), 'https://shifora.demo.invalid')
  const route = url.pathname.replace(/\/$/, '') || '/', method = (options.method ?? 'GET').toUpperCase()
  let body: Payload = {}
  if (options.body) { try { body = typeof options.body === 'string' ? JSON.parse(options.body) : {} } catch { fail(400, 'So‘rov ma’lumotlari noto‘g‘ri.') } }
  const limit = bounded(Number(url.searchParams.get('limit') || 200), 1, 1000)
  let result: unknown
  const match = (pattern: RegExp) => route.match(pattern)
  const finish = (value: unknown) => { save(s); return localizeResult(copy(value)) as T }
  if (route === '/auth/me' && method === 'GET') return finish({ user, context: contextFor(s, user) })
  if (route === '/auth/logout' && method === 'POST') return finish({ ok: true })
  if (route === '/health') return finish({ ok: true, service: 'shifora-demo' })

  if (route === '/team' || route === '/clinic/team') {
    onlyStaff(user)
    return finish({ staff: STAFF, nurse: STAFF[1], doctor: STAFF[0], capacity: 40, active_patients: s.patients.length, assignments: s.patients.map(p => ({ patient_id: p.id, nurse_id: p.assigned_nurse_id, doctor_id: p.assigned_doctor_id })) })
  }
  if (route === '/medications' || /^\/medications\/\d+$/.test(route)) {
    onlyStaff(user)
    if (method === 'GET') return finish({ medications: s.drugs.filter(d => d.is_active && `${d.name} ${d.generic_name}`.toLowerCase().includes((url.searchParams.get('query') ?? '').toLowerCase())) })
    if (method === 'POST' || method === 'PATCH') {
      const existing = method === 'PATCH' ? s.drugs.find(d => d.id === Number(route.split('/')[2])) ?? fail(404, 'Dori topilmadi.') : null
      const drug: DemoDrug = { id: existing?.id ?? id(s), name: requireText(body.name ?? existing?.name, 'Dori nomini'), generic_name: fieldString(body.generic_name ?? existing?.generic_name),
        strength: fieldString(body.strength ?? existing?.strength), form: fieldString(body.form ?? existing?.form, 'Tabletka'), unit: fieldString(body.unit ?? existing?.unit, 'mg'),
        notes: fieldString(body.notes ?? body.instructions ?? existing?.notes, DEMO_NOTE), instructions: fieldString(body.notes ?? body.instructions ?? existing?.notes, DEMO_NOTE), is_active: body.is_active === false || body.is_active === 0 ? 0 : 1, created_at: existing?.created_at ?? now() }
      if (existing) Object.assign(existing, drug); else s.drugs.push(drug)
      return finish({ medication: drug })
    }
  }
  if (route === '/patients/stats') {
    onlyStaff(user)
    return finish({ total: s.patients.length, stable: s.patients.filter(p => p.status === 'stable').length, attention: s.patients.filter(p => p.status === 'attention').length, urgent: s.patients.filter(p => p.status === 'urgent').length, open_alerts: s.alerts.filter(a => a.status !== 'closed').length })
  }
  if (route === '/patients') {
    onlyStaff(user)
    if (method === 'GET') {
      const query = (url.searchParams.get('query') ?? '').toLowerCase(), status = url.searchParams.get('status')
      return finish({ patients: s.patients.filter(p => (!status || status === 'all' || p.status === status) && `${p.first_name} ${p.last_name} ${p.phone}`.toLowerCase().includes(query)).map(p => patientList(s, p)).sort((a, b) => ['urgent', 'attention', 'stable'].indexOf(a.status) - ['urgent', 'attention', 'stable'].indexOf(b.status) || a.last_name.localeCompare(b.last_name)) })
    }
    if (method === 'POST') {
      if (body.approve) onlyClinician(user)
      const input = body.patient ?? {}, patientId = Math.max(...s.patients.map(p => p.id)) + 1
      const p: DemoPatient = { id: patientId, hospital_id: 1, user_id: 1000 + patientId, first_name: requireText(input.first_name, 'Ismni'), last_name: requireText(input.last_name, 'Familiyani'), birth_date: input.birth_date || '1970-01-01', gender: input.gender || 'female', phone: input.phone || `000${patientId}`, address: input.address || null,
        emergency_contact_name: input.emergency_contact_name || null, emergency_contact_phone: input.emergency_contact_phone || null, discharge_date: today(), status: 'stable', language: input.language || 'uz', assigned_nurse_id: 102, assigned_doctor_id: 101 }
      s.patients.push(p); s.profiles[patientId] = { diabetes_type: 'type2', diagnosis_date: today(), hba1c: null, recent_hospitalization: 1, prior_hypoglycemia: 0, cgm_enabled: 0, clinical_notes: DEMO_NOTE, ...body.profile }; s.measurements[patientId] = { glucose: [], blood_pressure: [], symptoms: [] }
      if (body.caregiver?.create) s.caregivers.push({ id: id(s), patient_id: patientId, user_id: 2000 + patientId, full_name: body.caregiver.full_name, phone: body.caregiver.phone, relation: body.caregiver.relation || 'Yaqin kishi', status: 'active', permissions: { ...PERMISSIONS, ...body.caregiver.permissions } })
      const plan = normalizePlan(s, patientId, body.care_plan ?? {}); s.plans.push(plan); if (body.approve) approve(s, plan, user)
      return finish({ patient_id: patientId, care_plan: plan })
    }
  }
  let m = match(/^\/patients\/(\d+)(?:\/(report|plan-day|care-plans|measurements|caregivers))?$/)
  if (m) {
    const patientId = Number(m[1]), sub = m[2], p = access(s, user, patientId, sub === 'report' || sub === 'measurements' ? 'view_measurements' : sub === 'care-plans' ? 'view_care_plan' : undefined)
    if (!sub && method === 'GET') { if (user.role === 'caregiver') fail(403, 'Yaqin kishi ma’lumotlarini o‘z bo‘limidan ko‘ring.'); return finish(profileResponse(s, p)) }
    if (!sub && method === 'PATCH') { onlyStaff(user); for (const key of ['first_name', 'last_name', 'phone', 'address', 'emergency_contact_name', 'emergency_contact_phone'] as const) if (body[key] !== undefined) p[key] = body[key]; return finish(p) }
    if (sub === 'report') return finish(report(s, patientId, [7, 14, 30].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 7))
    if (sub === 'plan-day') { access(s, user, patientId, 'view_today_plan'); return finish(dailyPlan(s, patientId, url.searchParams.get('date') || today())) }
    if (sub === 'measurements') return finish(s.measurements[patientId])
    if (sub === 'care-plans' && method === 'GET') { onlyStaff(user); return finish({ plans: s.plans.filter(p => p.patient_id === patientId).sort((a, b) => b.version - a.version) }) }
    if (sub === 'care-plans' && method === 'POST') { onlyClinician(user); if (!(body.medications?.length || body.monitoring?.length)) fail(400, 'Rejaga kamida bitta vazifa kiriting.'); const plan = normalizePlan(s, patientId, body); s.plans.push(plan); return finish(plan) }
    if (sub === 'caregivers' && method === 'POST') { onlyStaff(user); const cg: Caregiver = { id: id(s), user_id: id(s), patient_id: patientId, relation: body.relation || 'Yaqin kishi', status: 'active', full_name: requireText(body.full_name, 'Ismni'), phone: body.phone || '000000000', permissions: { ...PERMISSIONS, ...body.permissions } }; s.caregivers.push(cg); return finish(cg) }
  }
  m = match(/^\/patients\/(\d+)\/caregivers\/(\d+)$/)
  if (m && method === 'PATCH') { onlyStaff(user); const cg = s.caregivers.find(c => c.patient_id === Number(m![1]) && c.id === Number(m![2])) ?? fail(404, 'Yaqin kishi topilmadi.'); if (body.permissions) Object.assign(cg.permissions, body.permissions); if (body.status) cg.status = body.status; return finish(cg) }

  if (route === '/care-plans/schedule-presets') return finish({ presets: Object.entries(PRESETS).map(([key, p]) => ({ key, label: p.label, default_times: p.times })) })
  if (route === '/care-plans') {
    onlyStaff(user); const status = url.searchParams.get('status') || 'active', query = (url.searchParams.get('query') || '').toLowerCase()
    return finish({ plans: s.plans.filter(p => (status === 'all' || p.status === status) && `${patientById(s, p.patient_id).first_name} ${patientById(s, p.patient_id).last_name}`.toLowerCase().includes(query)).map(plan => { const p = patientById(s, plan.patient_id); return { ...plan, first_name: p.first_name, last_name: p.last_name, patient_status: p.status, diabetes_type: s.profiles[p.id]?.diabetes_type, approver_name: plan.approver?.full_name ?? null, medication_count: plan.medications.length, monitoring_count: plan.monitoring.filter(m => m.enabled).length } }) })
  }
  m = match(/^\/care-plans\/(\d+)(?:\/(approve|versions))?$/)
  if (m) {
    const plan = s.plans.find(p => p.id === Number(m![1])) ?? fail(404, 'Reja topilmadi.'); access(s, user, plan.patient_id, 'view_care_plan')
    if (m[2] === 'approve' && method === 'POST') return finish(approve(s, plan, user))
    if (m[2] === 'versions') return finish({ versions: s.plans.filter(p => p.patient_id === plan.patient_id).map(p => ({ id: p.id, version: p.version, approved_at: p.approved_at, approver: p.approver?.full_name ?? null, change_reason: p.notes })) })
    if (method === 'GET') return finish(plan)
  }
  if (route.startsWith('/me/notifications')) {
    const items = s.notifications.filter(n => n.user_id === user.id)
    if (method === 'GET') return finish({ notifications: items.slice(0, 50), unread: items.filter(n => !n.read_at).length })
    if (method === 'POST') { const itemId = Number(route.split('/')[3]); items.filter(n => route.endsWith('/read-all') || n.id === itemId).forEach(n => { n.read_at = now() }); return finish({ ok: true }) }
  }
  if (route === '/me/today' || route === '/me/plan' || route === '/me/medications' || route === '/me/profile') {
    const p = selfPatient(s, user), plan = activePlan(s, p.id)
    if (route === '/me/today' || route === '/me/plan') return finish({ patient: p, plan: dailyPlan(s, p.id, url.searchParams.get('date') || today()), adherence_7d: adherence(s, p.id), has_active_plan: Boolean(plan) })
    if (route === '/me/medications') {
      const range = medicationHistoryRange(url.searchParams)
      const stored = s.doses.filter(d => d.patient_id === p.id && d.kind === 'medication').sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at) || b.id - a.id)
      const matching = range ? stored.filter(d => d.scheduled_at.slice(0, 10) >= range.from && d.scheduled_at.slice(0, 10) <= range.to) : stored
      const limit = range ? 5000 : 40
      return finish({ plan: plan ? { id: plan.id, version: plan.version, approved_at: plan.approved_at, start_date: plan.start_date, end_date: plan.end_date } : null,
        medications: plan?.medications ?? [], history: matching.slice(0, limit), range,
        coverage: { from: stored.at(-1)?.scheduled_at.slice(0, 10) ?? null, to: stored[0]?.scheduled_at.slice(0, 10) ?? null }, truncated: matching.length > limit })
    }
    return finish({ patient: p, profile: s.profiles[p.id], hospital: HOSPITAL, care_plan: plan, caregivers: s.caregivers.filter(c => c.patient_id === p.id) })
  }
  m = match(/^\/doses\/(\d+)\/(take|snooze|missed)$/)
  if (m && method === 'POST') {
    const p = selfPatient(s, user), dose = s.doses.find(d => d.id === Number(m![1]) && d.kind === 'medication') ?? fail(404, 'Dori vaqti topilmadi.')
    if (dose.patient_id !== p.id) fail(403, 'Faqat o‘zingizning vazifangizni tasdiqlang.')
    if (m[2] === 'take') { dose.status = 'taken'; dose.taken_at = now(); dose.snoozed_until = null }
    if (m[2] === 'missed') { dose.status = 'missed'; dose.taken_at = null }
    const minutes = activePlan(s, p.id)?.snooze_minutes ?? 15
    if (m[2] === 'snooze') { if (dose.status === 'taken') fail(400, 'Tasdiqlangan vazifani kechiktirib bo‘lmaydi.'); dose.status = 'snoozed'; dose.snoozed_until = new Date(Date.now() + minutes * 60_000).toISOString() }
    return finish({ ...dose, minutes })
  }
  if (route === '/measurements' || route.startsWith('/measurements/')) {
    const patientId = user.role === 'patient' ? selfPatient(s, user).id : Number(body.patient_id || url.searchParams.get('patient_id'))
    access(s, user, patientId, 'view_measurements')
    const ms = s.measurements[patientId]
    if (method === 'GET') return finish({ glucose: ms.glucose.slice(0, limit), blood_pressure: ms.blood_pressure.slice(0, limit), symptoms: ms.symptoms.slice(0, limit) })
    if (user.role === 'caregiver') fail(403, 'Yaqin kishi o‘lchov kiritmaydi.')
    const recordId = id(s), timestamp = fieldString(body.measured_at || now()), day = timestamp.slice(0, 10)
    let kind: PlanItem['kind'], alertId: number | null = null
    if (route.endsWith('/glucose')) {
      const value = Number(body.value); if (!Number.isFinite(value) || value <= 0 || value > 1000) fail(400, 'Glyukoza qiymatini tekshiring.')
      ms.glucose.unshift({ id: recordId, value, unit: 'mg/dL', context: body.context || 'any', measured_at: timestamp, note: body.note || null }); kind = 'glucose'
      const rules = activePlan(s, patientId)?.rules ?? []
      const criticalLow = rules.find(r => r.code === 'glucose_critical_low')?.value_1, criticalHigh = rules.find(r => r.code === 'glucose_critical_high')?.value_1
      const low = rules.find(r => r.code === 'glucose_low')?.value_1, high = rules.find(r => r.code === 'glucose_high')?.value_1
      if ((criticalLow != null && value < criticalLow) || (criticalHigh != null && value > criticalHigh)) alertId = raiseAlert(s, patientId, 'urgent', 'Namuna glyukoza ko‘rigi', `${value} mg/dL · ${DEMO_NOTE}`)
      else if ((low != null && value < low) || (high != null && value > high)) alertId = raiseAlert(s, patientId, 'warning', 'Namuna glyukoza ko‘rigi', `${value} mg/dL · ${DEMO_NOTE}`)
    } else if (route.endsWith('/blood-pressure')) {
      const systolic = Number(body.systolic), diastolic = Number(body.diastolic)
      if (!Number.isFinite(systolic) || !Number.isFinite(diastolic) || systolic <= 0 || diastolic <= 0 || systolic > 350 || diastolic > 250) fail(400, 'Qon bosimi qiymatlarini tekshiring.')
      ms.blood_pressure.unshift({ id: recordId, systolic, diastolic, pulse: body.pulse ? Number(body.pulse) : null, measured_at: timestamp, note: body.note || null }); kind = 'blood_pressure'
    } else if (route.endsWith('/symptom-check')) {
      if (!['good', 'not_good', 'bad'].includes(body.feeling)) fail(400, 'Holatingizni tanlang.')
      ms.symptoms.unshift({ id: recordId, feeling: body.feeling, symptoms: body.symptoms ?? [], note: body.note || null, reported_at: timestamp }); kind = 'symptom'
      if (body.feeling === 'bad') alertId = raiseAlert(s, patientId, 'warning', 'Namuna holat so‘rovi', DEMO_NOTE)
    } else return fail(404, 'Namuna o‘lchov yo‘li topilmadi.')
    dailyPlan(s, patientId, day)
    const pending = s.doses.filter(d => d.patient_id === patientId && d.kind === kind && d.scheduled_at.startsWith(day) && !['done', 'taken'].includes(d.status)).sort((a, b) => Math.abs(new Date(a.scheduled_at).getTime() - new Date(timestamp).getTime()) - Math.abs(new Date(b.scheduled_at).getTime() - new Date(timestamp).getTime()))
    const target = kind === 'glucose' ? pending.find(d => d.context === body.context) ?? pending[0] : pending[0]
    if (target) { target.status = 'done'; target.taken_at = timestamp }
    return finish({ id: recordId, alert_id: alertId })
  }
  if (route === '/alerts' || /^\/alerts\/\d+(?:\/notes)?$/.test(route)) {
    onlyStaff(user); const alertId = Number(route.split('/')[2])
    if (route === '/alerts') {
      const status = url.searchParams.get('status'), severity = url.searchParams.get('severity')
      return finish({ alerts: s.alerts.filter(a => (!status || (status === 'open' ? a.status !== 'closed' : a.status === status)) && (!severity || a.severity === severity)).sort((a, b) => ['urgent', 'warning', 'info'].indexOf(a.severity) - ['urgent', 'warning', 'info'].indexOf(b.severity) || b.created_at.localeCompare(a.created_at)).slice(0, limit).map(a => decorateAlert(s, a)) })
    }
    const alert = s.alerts.find(a => a.id === alertId) ?? fail(404, 'Ogohlantirish topilmadi.')
    if (method === 'GET') return finish(decorateAlert(s, alert))
    if (method === 'PATCH') {
      if (body.status) { if (!['new', 'in_review', 'contacted', 'closed'].includes(body.status)) fail(400, 'Holat noto‘g‘ri.'); alert.status = body.status }
      if (body.assigned_user_id) { alert.assigned_user_id = Number(body.assigned_user_id); alert.assigned_name = STAFF.find(u => u.id === alert.assigned_user_id)?.full_name ?? null }
      refreshStatus(s, alert.patient_id); return finish(decorateAlert(s, alert))
    }
    if (method === 'POST' && route.endsWith('/notes')) { const note = { id: id(s), note: requireText(body.note, 'Izohni'), full_name: user.full_name, created_at: now() }; (alert.notes ??= []).push(note); return finish(note) }
  }
  if (route === '/questions' || /^\/questions\/\d+(?:\/notes)?$/.test(route)) {
    onlyStaff(user)
    if (route === '/questions') {
      const counts = { unanswered: 0, assigned: 0, answered: 0, closed: 0 }; s.questions.forEach(q => counts[q.status]++)
      return finish({ counts, questions: s.questions.filter(q => !url.searchParams.get('status') || q.status === url.searchParams.get('status')).slice(0, limit).map(q => decorateQuestion(s, q)) })
    }
    const q = s.questions.find(q => q.id === Number(route.split('/')[2])) ?? fail(404, 'Savol topilmadi.')
    if (method === 'GET') { const plan = activePlan(s, q.patient_id), stats = glucoseStats(s, q.patient_id); return finish({ ...decorateQuestion(s, q), patient_context: { glucose_trend: { all: stats, fasting: stats }, medications: (plan?.medications ?? []).map(m => ({ ...m, reminders_enabled: 1 })), active_plan: plan, lab_results: [], recent_alerts: s.alerts.filter(a => a.patient_id === q.patient_id) } }) }
    if (method === 'PATCH') {
      if (body.status && !['unanswered', 'assigned', 'answered', 'closed'].includes(body.status)) fail(400, 'Savol holati noto‘g‘ri.')
      if (body.status === 'answered') { q.answer = requireText(body.answer, 'Javobni'); q.answered_by = user.id; q.answered_by_name = user.full_name; q.answered_at = now(); q.answer_source = 'hospital_staff_answer'; addNotification(s, patientById(s, q.patient_id).user_id!, 'Namuna savolingizga javob keldi', q.answer, q.id, 'question_answer') }
      if (body.status) q.status = body.status
      if (body.priority && ['normal', 'high', 'urgent'].includes(body.priority)) q.priority = body.priority
      if (body.assigned_to) { q.assigned_to = Number(body.assigned_to); q.assigned_name = STAFF.find(u => u.id === q.assigned_to)?.full_name ?? null }
      return finish(decorateQuestion(s, q))
    }
    if (method === 'POST' && route.endsWith('/notes')) { const note = { id: id(s), question_id: q.id, note: requireText(body.note, 'Izohni'), created_by: user.id, author: user.full_name, created_at: now() }; q.notes.push(note); return finish(note) }
  }
  if (route === '/assistant/questions' || route === '/assistant/ask') {
    const p = selfPatient(s, user)
    if (method === 'GET') return finish({ questions: s.questions.filter(q => q.patient_id === p.id).map(q => { const { notes: _notes, references: _refs, ...safe } = q; return safe }) })
    const question = requireText(body.question, 'Savolni'), q: QuestionDetail = { id: id(s), patient_id: p.id, question, language: 'uz', status: 'unanswered', priority: 'normal', ai_attempted: 0, ai_answer: null, refused: 0, refusal_reason: null, answer: null, answer_source: null, assigned_to: null, answered_by: null, alert_id: null, created_at: now(), answered_at: null, references: [], notes: [] }
    s.questions.unshift(q); addNotification(s, 102, 'Namuna bemordan savol', question, q.id)
    return finish({ question_id: q.id, answer: 'Namuna savolingiz kuzatuv jamoasiga yuborildi. Javob “Savollarim” bo‘limida ko‘rinadi.', can_answer: false, refused: true, queued: true, priority: 'normal', status: 'unanswered', disclaimer: DEMO_NOTE })
  }
  if (route.startsWith('/caregiver/')) {
    if (user.role !== 'caregiver') fail(403, 'Bu bo‘lim yaqin kishi uchun.')
    if (route === '/caregiver/patients') return finish({ patients: s.caregivers.filter(c => c.user_id === user.id && c.status === 'active').map(c => { const p = patientById(s, c.patient_id), daily = dailyPlan(s, p.id); return { ...p, relation: c.relation, permissions: c.permissions, today: c.permissions.view_today_plan ? daily.summary : null, adherence: c.permissions.view_adherence ? adherence(s, p.id).rate : null, open_alerts: c.permissions.view_alerts ? s.alerts.filter(a => a.patient_id === p.id && a.status !== 'closed').length : null } }) })
    m = match(/^\/caregiver\/patients\/(\d+)(?:\/(contact-nurse))?$/)
    if (m) {
      const p = access(s, user, Number(m[1])), c = s.caregivers.find(c => c.user_id === user.id && c.patient_id === p.id)!
      if (method === 'POST' && m[2]) { const alertId = raiseAlert(s, p.id, 'warning', 'Yaqin kishidan namuna murojaat', `${user.full_name}: ${requireText(body.message, 'Xabarni')}`, 'caregiver_request'); addNotification(s, user.id, 'Namuna murojaatingiz yuborildi', 'Kuzatuv jamoasi murojaatni ko‘rib chiqadi.'); return finish({ alert_id: alertId }) }
      return finish({ patient: { id: p.id, first_name: p.first_name, last_name: p.last_name, status: p.status, phone: p.phone }, relation: c.relation, permissions: c.permissions,
        today: c.permissions.view_today_plan ? dailyPlan(s, p.id) : null, adherence: c.permissions.view_adherence ? { d7: adherence(s, p.id), last_activity: lastActivity(s, p.id) } : null,
        alerts: c.permissions.view_alerts ? s.alerts.filter(a => a.patient_id === p.id).map(a => decorateAlert(s, a)) : null,
        measurements: c.permissions.view_measurements ? s.measurements[p.id] : null, care_plan: c.permissions.view_care_plan ? activePlan(s, p.id) : null, hospital: HOSPITAL })
    }
  }
  if (route === '/ai/care-plan-suggestion') {
    onlyClinician(user)
    return finish({ provider: 'demo_manual_review', summary: 'Namuna ko‘rinishi: kiritilgan jadval tibbiyot xodimi tomonidan tekshiriladi.', disclaimer: DEMO_NOTE,
      reasons: ['Bu namuna hech qanday individual doza yoki davolash tavsiyasini yaratmaydi.'], monitoring: [], reminders: {},
      medications: (body.medications ?? []).map((m: Payload) => ({ name: m.name, schedule_type: m.schedule_type, schedule_label: PRESETS[m.schedule_type]?.label ?? 'Belgilangan vaqt', times: m.times ?? [], priority: m.priority ?? 'normal', note: DEMO_NOTE })) })
  }
  m = match(/^\/ai\/patients\/(\d+)\/summary$/)
  if (m) { onlyStaff(user); const p = access(s, user, Number(m[1])), r = report(s, p.id, 7); return finish({ provider: 'demo_descriptive_summary', disclaimer: DEMO_NOTE, insights: [{ kind: 'adherence_summary', tone: 'neutral', text: `Namuna: oxirgi 7 kunda dori tasdig‘i ${r.adherence.rate ?? 0}%.` }, { kind: 'glucose_trend', tone: 'neutral', text: `Namuna: ${r.glucose.count} ta o‘lchov, o‘rtacha ${r.glucose.average ?? '—'} mg/dL. Klinik tavsiya emas.` }] }) }
  result = fail(404, `Namuna rejimida bu amal qo‘llab-quvvatlanmaydi: ${method} ${route}`)
  return finish(result)
}
