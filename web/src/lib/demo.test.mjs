import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { demoRequest, isDemoToken, resetDemoData, startDemoSession } from './demo.ts'

const values = new Map()
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
}
const as = role => startDemoSession(role).token
const get = (path, token) => demoRequest(path, {}, token)
const post = (path, body, token) => demoRequest(path, { method: 'POST', body: JSON.stringify(body) }, token)
const patch = (path, body, token) => demoRequest(path, { method: 'PATCH', body: JSON.stringify(body) }, token)

beforeEach(() => { values.clear(); resetDemoData() })

test('fictional clinic has forty coherent patient records and fits browser storage', async () => {
  const doctor = as('hospital')
  assert.equal(isDemoToken(doctor), true)
  assert.equal(isDemoToken('real-token'), false)
  const stats = await get('/patients/stats', doctor)
  assert.equal(stats.total, 40)
  assert.equal(stats.stable + stats.attention + stats.urgent, 40)
  assert.ok(stats.urgent > 0 && stats.attention > 0 && stats.stable > 0)
  const { patients } = await get('/patients', doctor)
  assert.equal(patients.length, 40)
  assert.ok(patients.every(p => p.last_glucose && p.last_activity && p.adherence !== null))
  const profile = await get('/patients/40', doctor)
  assert.ok(profile.glucose.length >= 28)
  assert.ok(profile.care_plan.medications.length && profile.today.items.length)
  assert.ok(values.get('shifora.demo.v1').length < 2_000_000, 'Demo state should fit comfortably below the usual browser quota')
})

test('role isolation rejects staff data and other-patient access', async () => {
  const patient = as('patient'), caregiver = as('caregiver')
  assert.equal((await get('/auth/me', patient)).context.patient.id, 1)
  await assert.rejects(get('/patients/stats', patient), error => error.status === 403)
  await assert.rejects(get('/patients/2', patient), error => error.status === 403)
  await assert.rejects(get('/caregiver/patients/2', caregiver), error => error.status === 403)
  await assert.rejects(post('/patients/1/care-plans', { medications: [{ name: 'Forbidden', times: ['10:00'] }] }, caregiver), error => error.status === 403)
  await assert.rejects(post('/measurements/glucose', { value: 120, patient_id: 1 }, caregiver), error => error.status === 403)
  assert.equal((await get('/caregiver/patients', caregiver)).patients[0].id, 1)
})

test('catalogue additions and edits persist without changing any patient plan', async () => {
  const doctor = as('hospital'), patient = as('patient')
  const before = await get('/me/medications', patient)
  const { medication } = await post('/medications', { name: 'Test sample medicine', generic_name: 'Sample', strength: 'Demo', form: 'Tabletka', unit: 'namuna', notes: 'Catalogue-only instruction' }, doctor)
  assert.ok(medication.id)
  await patch(`/medications/${medication.id}`, { notes: 'Updated catalogue note' }, doctor)
  assert.equal((await get('/medications', doctor)).medications.find(m => m.id === medication.id).notes, 'Updated catalogue note')
  assert.deepEqual((await get('/me/medications', patient)).medications, before.medications)
  const persisted = JSON.parse(values.get('shifora.demo.v1'))
  assert.ok(persisted.drugs.some(d => d.id === medication.id))
})

test('draft is inert, approval replaces active version, and schedules are sorted and shared', async () => {
  const doctor = as('hospital'), patient = as('patient'), caregiver = as('caregiver')
  const before = await get('/patients/1', doctor)
  const draft = await post('/patients/1/care-plans', { ...before.care_plan, start_date: before.today.date,
    medications: [{ name: 'Approval test (namuna)', dose: '1', unit: 'namuna', schedule_type: 'custom', times: ['21:30', '12:10', '18:00', '12:10'], priority: 'normal', notes: 'Test only', reminders_enabled: false, schedule_label: 'Test schedule label' }],
    monitoring: before.care_plan.monitoring }, doctor)
  assert.equal(draft.status, 'draft')
  assert.equal((await get('/me/medications', patient)).plan.id, before.care_plan.id)
  await assert.rejects(post(`/care-plans/${draft.id}/approve`, {}, patient), error => error.status === 403)
  const approved = await post(`/care-plans/${draft.id}/approve`, { change_reason: 'Demo workflow test' }, doctor)
  assert.equal(approved.status, 'active')
  assert.equal(approved.approver.role, 'doctor')
  assert.deepEqual(approved.medications[0].schedules.map(s => s.time_of_day), ['12:10', '18:00', '21:30'])
  assert.equal(approved.medications[0].reminders_enabled, 0)
  assert.ok(approved.medications[0].schedules.every(slot => slot.label === 'Test schedule label'))
  const plans = (await get('/patients/1/care-plans', doctor)).plans
  assert.equal(plans.filter(p => p.status === 'active').length, 1)
  assert.equal(plans.find(p => p.id === before.care_plan.id).status, 'archived')
  assert.equal((await get('/me/medications', patient)).plan.id, draft.id)
  const today = (await get('/me/today', patient)).plan
  const newDoses = today.items.filter(item => item.care_plan_id === approved.id && item.kind === 'medication')
  assert.deepEqual(newDoses.map(item => item.time), ['12:10', '18:00', '21:30'])
  assert.deepEqual(today.items.map(item => item.time), today.items.map(item => item.time).sort())
  await post(`/doses/${newDoses[0].id}/take`, {}, patient)
  const clinic = await get('/patients/1', doctor)
  assert.equal(clinic.today.items.find(item => item.id === newDoses[0].id).status, 'taken')
  const family = await get('/caregiver/patients/1', caregiver)
  assert.equal(family.today.items.find(item => item.id === newDoses[0].id).status, 'taken')
  assert.equal(family.care_plan.id, approved.id)
})

test('patient measurement updates staff, report and authorized caregiver views', async () => {
  const doctor = as('hospital'), patient = as('patient'), caregiver = as('caregiver')
  const result = await post('/measurements/glucose', { value: 325, context: 'after_meal', note: 'A fictional test reading' }, patient)
  assert.ok(result.alert_id)
  const profile = await get('/patients/1', doctor)
  assert.equal(profile.glucose[0].value, 325)
  assert.ok(profile.alerts.some(a => a.id === result.alert_id))
  assert.ok((await get('/patients/1/report?days=7', doctor)).glucose.readings.some(r => r.id === result.id))
  assert.equal((await get('/caregiver/patients/1', caregiver)).measurements.glucose[0].value, 325)
})

test('question handoff returns staff answer while keeping internal notes private', async () => {
  const doctor = as('hospital'), patient = as('patient')
  const response = await post('/assistant/ask', { question: 'Demo handoff test?' }, patient)
  await post(`/questions/${response.question_id}/notes`, { note: 'Private staff note' }, doctor)
  await patch(`/questions/${response.question_id}`, { status: 'answered', answer: 'Demonstration response only' }, doctor)
  const question = (await get('/assistant/questions', patient)).questions.find(q => q.id === response.question_id)
  assert.equal(question.answer, 'Demonstration response only')
  assert.equal(question.notes, undefined)
  assert.ok((await get('/me/notifications', patient)).notifications.some(n => n.type === 'question_answer'))
})

test('Russian demo output translates generated labels and preserves user notes', async () => {
  const doctor = as('hospital'), patient = as('patient')
  values.set('shifora.language', 'ru')
  assert.equal((await get('/auth/me', doctor)).context.hospital.name, 'Демонстрационная клиника Shifora')
  const result = await post('/measurements/glucose', { value: 120, context: 'fasting', note: 'My untouched note / Моя заметка' }, patient)
  const record = (await get('/measurements', patient)).glucose.find(r => r.id === result.id)
  assert.equal(record.note, 'My untouched note / Моя заметка')
})

test('calendar range returns stored history without converting unconfirmed doses to taken', async () => {
  const patient = as('patient')
  const recent = await get('/me/medications', patient)
  assert.equal(recent.history.length, 40)
  const before = JSON.parse(values.get('shifora.demo.v1')).doses
  const range = await get(`/me/medications?from=${recent.coverage.from}&to=${recent.coverage.to}`, patient)
  assert.ok(range.history.length > 40)
  assert.equal(range.truncated, false)
  assert.ok(range.history.every(d => d.scheduled_at.slice(0, 10) >= recent.coverage.from && d.scheduled_at.slice(0, 10) <= recent.coverage.to))
  const unconfirmed = range.history.filter(d => d.status === 'missed' || d.status === 'pending')
  assert.ok(unconfirmed.length > 0)
  assert.ok(unconfirmed.every(d => d.taken_at === null))
  assert.deepEqual(JSON.parse(values.get('shifora.demo.v1')).doses, before, 'Reading calendar history never fabricates dose confirmations or new historical tasks')
  const oneDay = await get(`/me/medications?from=${recent.coverage.from}&to=${recent.coverage.from}`, patient)
  assert.ok(oneDay.history.length > 0)
  assert.ok(oneDay.history.every(d => d.scheduled_at.startsWith(recent.coverage.from)))
})

test('calendar distinguishes an empty interval and a patient without any plan or history', async () => {
  const patient = as('patient'), doctor = as('hospital')
  const before = JSON.parse(values.get('shifora.demo.v1')).doses.length
  const empty = await get('/me/medications?from=1990-01-01&to=1990-12-31', patient)
  assert.deepEqual(empty.history, [])
  assert.ok(empty.coverage.from, 'Coverage describes existing records, not the requested empty interval')
  assert.equal(JSON.parse(values.get('shifora.demo.v1')).doses.length, before)
  const created = await post('/patients', { patient: { first_name: 'Calendar', last_name: 'Empty sample' }, profile: { diabetes_type: 'type2' }, care_plan: {}, approve: false }, doctor)
  const noPlan = await get('/me/medications?from=1990-01-01&to=1990-12-31', `shifora-demo:patient:${1000 + created.patient_id}`)
  assert.equal(noPlan.plan, null)
  assert.deepEqual(noPlan.medications, [])
  assert.deepEqual(noPlan.history, [])
  assert.deepEqual(noPlan.coverage, { from: null, to: null })
  assert.equal(noPlan.truncated, false)
})

test('calendar range validates real dates and the inclusive 366-day limit', async () => {
  const patient = as('patient')
  assert.deepEqual((await get('/me/medications?from=2024-01-01&to=2024-12-31', patient)).history, [])
  for (const query of ['from=2023-02-29&to=2023-03-01', 'from=2026-04-31&to=2026-05-02', 'from=2026-11-02', 'from=2026-11-03&to=2026-11-02', 'from=2024-01-01&to=2025-01-01', 'from=2026-11-01&from=2026-11-02&to=2026-11-03']) {
    await assert.rejects(get(`/me/medications?${query}`, patient), error => error.status === 400)
  }
})
