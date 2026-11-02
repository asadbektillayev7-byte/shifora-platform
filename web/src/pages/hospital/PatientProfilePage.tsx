import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { uz } from '../../lib/uz'
import { api } from '../../lib/api'
import { useApi } from '../../lib/hooks'
import { useAuth } from '../../lib/auth'
import { useLanguage } from '../../lib/i18n'
import { isDemoMode } from '../../lib/demo'
import { Icon } from '../../components/Icon'
import { MedicationEditor, emptyMedication, medicationFreeNotes, medicationMealText } from './MedicationEditor'
import type { MedicationDraft } from './MedicationEditor'
import type { CatalogueMedication } from './MedicationsPage'
import {
  Badge, Button, Card, Empty, Field, Input, Loading, Meter, Notice, Select, SeverityBadge, StatusBadge, Textarea,
} from '../../components/ui'
import type {
  AlertItem, BloodPressureReading, CarePlan, DailyPlan, GlucoseReading,
  PatientRecord, SymptomCheck, Medication,
} from '../../lib/types'
import { formatDate, formatDateTime, timeAgo, todayKey } from '../../lib/format'
import './medications.css'

interface ProfileResponse {
  patient: PatientRecord
  profile: {
    diabetes_type: 'type1' | 'type2' | 'other'
    diagnosis_date: string | null
    hba1c: number | null
    recent_hospitalization: number
    prior_hypoglycemia: number
    clinical_notes: string | null
    cgm_enabled: number
  } | null
  care_plan: CarePlan | null
  adherence: { d7: { rate: number | null }; d30: { rate: number | null } }
  last_activity: string | null
  today: DailyPlan
  glucose: GlucoseReading[]
  blood_pressure: BloodPressureReading[]
  symptoms: SymptomCheck[]
  alerts: AlertItem[]
  caregivers: {
    id: number; relation: string; status: string; full_name: string; phone: string
    permissions: Record<string, boolean>
  }[]
  plan_history: {
    id: number; version: number; status: string; approved_at: string | null; approver: string | null
  }[]
}

interface AiSummary {
  disclaimer: string
  insights: { kind: string; tone: string; text: string }[]
}

export function PatientProfilePage() {
  const { id } = useParams()
  const { t } = useLanguage()
  const { data, error, reload } = useApi<ProfileResponse>(`/patients/${id}`, [id])
  const [tab, setTab] = useState('overview')
  const [summary, setSummary] = useState<AiSummary | null>(null)
  const [summaryBusy, setSummaryBusy] = useState(false)

  const TABS = [
    { key: 'overview', label: t('Umumiy', 'Обзор') },
    { key: 'plan', label: t('Davolash rejasi', 'План лечения') },
    { key: 'measurements', label: t('O‘lchovlar', 'Измерения') },
    { key: 'alerts', label: t('Ogohlantirishlar', 'Уведомления') },
    { key: 'people', label: t('Yaqin insonlar', 'Близкие') },
  ]
  if (!data) return error ? <Notice tone="danger">{error}<Button type="button" onClick={() => void reload()}>{t('Qayta urinish', 'Повторить')}</Button></Notice> : <Loading />

  const { patient, profile, care_plan: plan } = data

  async function loadSummary() {
    setSummaryBusy(true)
    try {
      setSummary(await api.post<AiSummary>(`/ai/patients/${id}/summary`))
    } finally {
      setSummaryBusy(false)
    }
  }

  return (
    <div className="stack">
      <Card>
        <div className="row--between">
          <div className="row">
            <div>
              <h1>{patient.last_name} {patient.first_name}</h1>
              <div className="muted small">
                {patient.phone} · {formatDate(patient.birth_date)} ·{' '}
                {patient.gender === 'male' ? uz.gender.male : uz.gender.female}
              </div>
            </div>
          </div>
          <div className="row">
            <StatusBadge status={patient.status} size="lg" />
            <Link className="btn btn--secondary" to={`/shifoxona/hisobotlar?patient=${patient.id}`}><Icon name="chart" size={18} />{uz.patientProfile.openReport}</Link>
          </div>
        </div>

        <div className="divider" style={{ margin: '16px 0' }} />

        <div className="grid3">
          <div>
            <div className="small muted">{uz.patientProfile.adherence7}</div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Meter value={data.adherence.d7.rate} />
              <span className="strong">{data.adherence.d7.rate ?? '—'}%</span>
            </div>
          </div>
          <div>
            <div className="small muted">{uz.patientProfile.adherence30}</div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Meter value={data.adherence.d30.rate} />
              <span className="strong">{data.adherence.d30.rate ?? '—'}%</span>
            </div>
          </div>
          <div>
            <div className="small muted">{uz.patientProfile.lastActivity}</div>
            <div className="strong">{timeAgo(data.last_activity)}</div>
          </div>
        </div>
      </Card>

      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item.key}
            className={`tab ${tab === item.key ? 'tab--on' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="stack">
          <Card title={uz.ai.summaryTitle} action={
            <Button size="sm" onClick={() => void loadSummary()} disabled={summaryBusy}>
              {summaryBusy ? uz.ai.generating : uz.ai.summaryGenerate}
            </Button>
          }>
            {!summary ? (
              <p className="muted">{uz.ai.noSummary}</p>
            ) : (
              <div className="stack--sm">
                {summary.insights.map((insight, index) => (
                  <Notice
                    key={index}
                    tone={insight.tone === 'warning' ? 'warning' : insight.tone === 'positive' ? 'success' : 'info'}
                  >
                    <span className="badge badge--teal" style={{ marginInlineEnd: 8 }}>{uz.ai.label}</span>
                    {insight.text}
                  </Notice>
                ))}
                <p className="small muted">{summary.disclaimer}</p>
              </div>
            )}
          </Card>

          <div className="grid2">
            <Card title={uz.patientProfile.personal}>
              <dl className="kv">
                <dt>{uz.profile.fullName}</dt>
                <dd>{patient.last_name} {patient.first_name}</dd>
                <dt>{uz.profile.birthDate}</dt>
                <dd>{formatDate(patient.birth_date)}</dd>
                <dt>{uz.profile.phone}</dt>
                <dd>{patient.phone}</dd>
                <dt>{uz.profile.address}</dt>
                <dd>{patient.address ?? '—'}</dd>
                <dt>{uz.profile.emergencyContact}</dt>
                <dd>{patient.emergency_contact_name ?? '—'} · {patient.emergency_contact_phone ?? '—'}</dd>
                <dt>{t('Chiqarilgan sana', 'Дата выписки')}</dt>
                <dd>{formatDate(patient.discharge_date)}</dd>
              </dl>
            </Card>

            <Card title={uz.patientProfile.diabetes}>
              {profile ? (
                <dl className="kv">
                  <dt>{uz.register.diabetesTypeLabel}</dt>
                  <dd>{uz.diabetesType[profile.diabetes_type]}</dd>
                  <dt>{uz.profile.diagnosisDate}</dt>
                  <dd>{formatDate(profile.diagnosis_date)}</dd>
                  <dt>{uz.patientProfile.hba1c}</dt>
                  <dd>{profile.hba1c ? `${profile.hba1c}%` : '—'}</dd>
                  <dt>{uz.register.recentHospitalization}</dt>
                  <dd>{profile.recent_hospitalization ? uz.app.yes : uz.app.no}</dd>
                  <dt>{uz.register.priorHypoglycemia}</dt>
                  <dd>{profile.prior_hypoglycemia ? uz.app.yes : uz.app.no}</dd>
                  <dt>{uz.register.cgm}</dt>
                  <dd>{profile.cgm_enabled ? uz.register.cgmOn : uz.register.cgmOff}</dd>
                  <dt>{uz.patientProfile.clinicalNotes}</dt>
                  <dd>{profile.clinical_notes ?? '—'}</dd>
                </dl>
              ) : (
                <p className="muted">{uz.app.notSpecified}</p>
              )}
            </Card>
          </div>

          <Card title={uz.patientProfile.todayPlan} flush>
            {data.today.items.length === 0 ? (
              <Empty icon="calendar" title={uz.patientHome.nothingToday} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {data.today.items.map((item) => (
                      <tr key={`${item.kind}-${item.id}`} style={{ cursor: 'default' }}>
                        <td style={{ width: 80 }} className="strong">{item.time}</td>
                        <td>
                          {item.kind === 'medication'
                            ? item.title
                            : item.kind === 'glucose'
                              ? `${uz.measurements.glucose} (${uz.measurements.context[item.context ?? 'any']})`
                              : item.kind === 'blood_pressure'
                                ? uz.measurements.bloodPressure
                                : uz.measurements.symptoms}
                        </td>
                        <td style={{ width: 160 }}>
                          {item.status === 'taken' || item.status === 'done' ? (
                            <Badge tone="stable">{uz.patientHome.done}</Badge>
                          ) : item.status === 'missed' ? (
                            <Badge tone="urgent">{uz.patientHome.missed}</Badge>
                          ) : (
                            <Badge tone="neutral">{uz.patientHome.waiting}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'plan' ? <CarePlanWorkspace key={patient.id} patientId={patient.id} initialPlan={plan} onChanged={reload} /> : null}

      {tab === 'measurements' ? (
        <div className="stack">
          <Card title={uz.measurements.glucose} flush>
            {data.glucose.length === 0 ? <Empty icon="droplet" title={uz.measurements.noReadings} /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>{uz.app.date}</th><th>{t('Qiymat', 'Значение')}</th><th>{uz.measurements.contextLabel}</th><th>{uz.app.note}</th></tr>
                  </thead>
                  <tbody>
                    {data.glucose.map((reading) => (
                      <tr key={reading.id} style={{ cursor: 'default' }}>
                        <td>{formatDateTime(reading.measured_at)}</td>
                        <td className="strong">{reading.value} mg/dL</td>
                        <td>{uz.measurements.context[reading.context]}</td>
                        <td className="small muted">{reading.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={uz.measurements.bloodPressure} flush>
            {data.blood_pressure.length === 0 ? <Empty icon="heart" title={uz.measurements.noReadings} /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>{uz.app.date}</th><th>{t('Qiymat', 'Значение')}</th><th>{uz.measurements.pulse}</th></tr>
                  </thead>
                  <tbody>
                    {data.blood_pressure.map((reading) => (
                      <tr key={reading.id} style={{ cursor: 'default' }}>
                        <td>{formatDateTime(reading.measured_at)}</td>
                        <td className="strong">{reading.systolic} / {reading.diastolic} mmHg</td>
                        <td>{reading.pulse ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={uz.measurements.symptoms} flush>
            {data.symptoms.length === 0 ? <Empty icon="message" title={uz.measurements.noReadings} /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{uz.app.date}</th><th>{t('Holat', 'Самочувствие')}</th><th>{t('Belgilar', 'Симптомы')}</th></tr></thead>
                  <tbody>
                    {data.symptoms.map((check) => {
                      const symptoms: string[] = Array.isArray(check.symptoms)
                        ? check.symptoms
                        : JSON.parse(check.symptoms || '[]')
                      return (
                        <tr key={check.id} style={{ cursor: 'default' }}>
                          <td>{formatDateTime(check.reported_at)}</td>
                          <td>
                            <Badge tone={check.feeling === 'good' ? 'stable' : check.feeling === 'bad' ? 'urgent' : 'attention'}>
                              {uz.symptoms[check.feeling]}
                            </Badge>
                          </td>
                          <td className="small">
                            {symptoms.length
                              ? symptoms.map((key) => uz.symptoms.list[key as keyof typeof uz.symptoms.list] ?? key).join(', ')
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'alerts' ? (
        <Card title={uz.patientProfile.alerts} flush>
          {data.alerts.length === 0 ? (
            <Empty icon="check" title={uz.patientProfile.noAlerts} />
          ) : (
            data.alerts.map((alert) => (
              <div className="alert-row" key={alert.id}>
                <span className={`alert-row__bar alert-row__bar--${alert.severity}`} aria-hidden />
                <div className="alert-row__body">
                  <div className="row--between">
                    <div className="alert-row__title">{alert.title}</div>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                  <div className="alert-row__detail">{alert.detail}</div>
                  <div className="alert-row__meta">
                    <span>{formatDateTime(alert.created_at)}</span>
                    <span>{uz.alerts.state[alert.status]}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>
      ) : null}

      {tab === 'people' ? (
        <Card title={uz.patientProfile.caregivers} subtitle={uz.caregiver.accessNote} flush>
          {data.caregivers.length === 0 ? (
            <Empty icon="users" title={uz.profile.noCaregivers} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{uz.profile.fullName}</th>
                    <th>{uz.register.caregiverRelation}</th>
                    <th>{uz.profile.phone}</th>
                    <th>{uz.patientProfile.permissions}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.caregivers.map((caregiver) => (
                    <tr key={caregiver.id} style={{ cursor: 'default' }}>
                      <td className="strong">{caregiver.full_name}</td>
                      <td>{caregiver.relation ?? '—'}</td>
                      <td>{caregiver.phone}</td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          {Object.entries(caregiver.permissions)
                            .filter(([, allowed]) => allowed)
                            .map(([key]) => (
                              <Badge key={key} tone="teal">
                                {uz.permissions[key as keyof typeof uz.permissions]}
                              </Badge>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  )
}

function medicationDraft(medication: Medication): MedicationDraft {
  return {
    name: medication.name, dose: medication.dose, unit: medication.unit,
    schedule_type: medication.schedule_type,
    times: medication.schedules.map(slot => slot.time_of_day), priority: medication.priority,
    start_date: medication.start_date ?? '', end_date: medication.end_date ?? '',
    notes: medication.notes ?? '',
    schedule_label: medication.schedules[0]?.label ?? undefined,
    reminders_enabled: (medication as Medication & { reminders_enabled?: number }).reminders_enabled !== 0,
  }
}

function MedicationSequence({ medications }: { medications: Medication[] }) {
  const { locale, t } = useLanguage()
  const entries = medications.flatMap(medication => medication.schedules.length
    ? medication.schedules.map(slot => ({ medication, time: slot.time_of_day, label: slot.label }))
    : [{ medication, time: 'as_needed', label: null }])
    .sort((a, b) => a.time.localeCompare(b.time) || a.medication.id - b.medication.id)
  const groups = [...new Set(entries.map(entry => entry.time))]
  function dayPart(time: string) {
    const hour = Number(time.slice(0, 2))
    return time === 'as_needed' ? t('Alohida tartib', 'Отдельный режим')
      : hour < 12 ? t('Ertalab', 'Утром') : hour < 17 ? t('Tushda', 'Днём')
        : hour < 21 ? t('Kechqurun', 'Вечером') : t('Uxlashdan oldin', 'Перед сном')
  }
  function date(value: string | null) {
    if (!value) return t('Belgilanmagan', 'Не указано')
    return formatDate(value)
  }
  if (!entries.length) return <p className="med-empty-inline">{t('Bu rejaga hali dori kiritilmagan.', 'В этот план ещё не добавлены препараты.')}</p>
  return <div className="med-schedule">
    {groups.map(time => <section className="med-schedule-group" key={time} aria-label={time === 'as_needed' ? t('Zarurat bo‘yicha', 'По необходимости') : time}>
      <div className="med-schedule-time">{time === 'as_needed' ? t('Zaruratda', 'При необходимости') : time}<small>{dayPart(time)}</small></div>
      <ol className="med-schedule-items">
        {entries.filter(entry => entry.time === time).map(entry => <li className="med-schedule-item" key={`${entry.medication.id}-${time}`}>
          <span className="med-order-number" aria-label={t('Ketma-ketlik', 'Порядок')}>{entries.indexOf(entry) + 1}</span>
          <div><h3>{entry.medication.name}</h3><div className="med-schedule-dose">{entry.medication.dose} {entry.medication.unit}</div>
            {medicationMealText(entry.medication.notes, locale) || entry.label ? <p className="med-schedule-instructions">{medicationMealText(entry.medication.notes, locale) || entry.label}</p> : null}
            {medicationFreeNotes(entry.medication.notes) ? <p className="med-schedule-instructions">{medicationFreeNotes(entry.medication.notes)}</p> : null}
            <p className="med-schedule-dates">{t('Davr', 'Период')}: {date(entry.medication.start_date)} — {entry.medication.end_date ? date(entry.medication.end_date) : t('tugash sanasi belgilanmagan', 'без даты окончания')}</p>
          </div>
        </li>)}
      </ol>
    </section>)}
  </div>
}

function CarePlanWorkspace({ patientId, initialPlan, onChanged }: {
  patientId: number
  initialPlan: CarePlan | null
  onChanged: () => Promise<void>
}) {
  const { t } = useLanguage()
  const { session } = useAuth()
  const { data: planData, error: plansError, reload: reloadPlans } = useApi<{ plans: CarePlan[] }>(`/patients/${patientId}/care-plans`)
  const { data: catalogue } = useApi<{ medications: CatalogueMedication[] }>('/medications')
  const [selectedId, setSelectedId] = useState<number | null>(initialPlan?.id ?? null)
  const [savedPlan, setSavedPlan] = useState<CarePlan | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'review'>('view')
  const [sourcePlan, setSourcePlan] = useState<CarePlan | null>(null)
  const [medications, setMedications] = useState<MedicationDraft[]>([])
  const [planStart, setPlanStart] = useState(todayKey())
  const [planNotes, setPlanNotes] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const plans = planData?.plans ?? (initialPlan ? [initialPlan] : [])
  const selected = (savedPlan?.id === selectedId ? savedPlan : plans.find(plan => plan.id === selectedId)) ?? initialPlan ?? plans[0] ?? null
  const canEdit = session?.user.role === 'doctor' || session?.user.role === 'nurse'
  const planStatus = (status: CarePlan['status']) => status === 'active' ? t('Amaldagi', 'Действующий') : status === 'draft' ? t('Qoralama', 'Черновик') : t('Arxiv', 'Архив')

  function beginEdit(base: CarePlan | null) {
    setSourcePlan(base)
    setMedications(base?.medications.map(medicationDraft) ?? [emptyMedication(todayKey())])
    setPlanStart(todayKey())
    setPlanNotes(base?.notes ?? '')
    setReason('')
    setConfirmed(false)
    setErrors({})
    setError('')
    setMessage('')
    setMode('edit')
  }

  async function saveDraft() {
    const next: Record<string, string> = {}
    if (!planStart) next.plan = t('Rejaning boshlanish sanasini kiriting.', 'Укажите дату начала плана.')
    if (!medications.length && !sourcePlan?.monitoring.length) next.plan = t('Kamida bitta dori yoki kuzatuv bandi kerak.', 'Добавьте хотя бы один препарат или пункт наблюдения.')
    medications.forEach((medication, index) => {
      if (!medication.name.trim()) next[`med_${index}_name`] = t('Dori nomini kiriting.', 'Укажите название препарата.')
      if (!medication.dose.trim()) next[`med_${index}_dose`] = t('Retseptdagi dozani kiriting.', 'Укажите дозу из назначения.')
      if (medication.schedule_type !== 'as_needed' && (!medication.times.length || medication.times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || new Set(medication.times).size !== medication.times.length)) next[`med_${index}_times`] = t('To‘g‘ri va takrorlanmaydigan vaqtlarni kiriting.', 'Укажите корректное время без повторов.')
      if (medication.start_date && medication.end_date && medication.end_date < medication.start_date) next.plan = t('Dori tugash sanasi boshlanishidan oldin bo‘lishi mumkin emas.', 'Дата окончания приёма не может быть раньше даты начала.')
    })
    setErrors(next)
    if (Object.keys(next).length || busy) return
    setBusy(true)
    setError('')
    const base = sourcePlan
    try {
      const draft = await api.post<CarePlan>(`/patients/${patientId}/care-plans`, {
        source: 'manual', start_date: planStart, end_date: base?.end_date ?? null, notes: planNotes || null,
        reminder_repeat_minutes: base?.reminder_repeat_minutes ?? 30,
        reminder_max_count: base?.reminder_max_count ?? 2,
        snooze_minutes: base?.snooze_minutes ?? 15,
        escalate_normal_minutes: base?.escalate_normal_minutes ?? 240,
        escalate_important_minutes: base?.escalate_important_minutes ?? 120,
        escalate_critical_minutes: base?.escalate_critical_minutes ?? 60,
        medications: medications.map(medication => ({ ...medication, name: medication.name.trim(), dose: medication.dose.trim(), times: [...new Set(medication.times)].sort(), start_date: medication.start_date || planStart, end_date: medication.end_date || null, notes: medication.notes || null })),
        monitoring: base?.monitoring.map(config => ({ type: config.type, enabled: Boolean(config.enabled), frequency_per_day: config.frequency_per_day, notes: config.notes, times: config.times.map(slot => ({ time_of_day: slot.time_of_day, context: slot.context })) })) ?? [],
        rules: base?.rules.map(rule => ({ code: rule.code, enabled: Boolean(rule.enabled), comparator: rule.comparator, value_1: rule.value_1, value_2: rule.value_2, severity: rule.severity, message_uz: rule.message_uz })) ?? [],
      })
      setSavedPlan(draft)
      setSelectedId(draft.id)
      setMode('review')
      setConfirmed(false)
      setMessage(t('Qoralama saqlandi. Tasdiqlashdan oldin qabul ketma-ketligini tekshiring.', 'Черновик сохранён. Перед утверждением проверьте порядок приёма.'))
      await reloadPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Qoralamani saqlab bo‘lmadi.', 'Не удалось сохранить черновик.'))
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    if (!selected || selected.status !== 'draft' || !confirmed || !reason.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const active = await api.post<CarePlan>(`/care-plans/${selected.id}/approve`, { change_reason: reason.trim() })
      setSavedPlan(active)
      setSelectedId(active.id)
      setMode('view')
      setMessage(t('Yangi reja tasdiqlandi va amaldagi rejaga aylandi.', 'Новый план утверждён и стал действующим.'))
      await Promise.all([reloadPlans(), onChanged()])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Rejani tasdiqlab bo‘lmadi.', 'Не удалось утвердить план.'))
    } finally {
      setBusy(false)
    }
  }

  const step = mode === 'edit' ? 1 : mode === 'review' ? 3 : selected?.status === 'active' ? 4 : 2

  return <div className="stack">
    <div className="med-plan-toolbar"><div><h2>{t('Davolash rejasi', 'План лечения')}</h2><p className="small muted">{t('Dori qabul qilishning kunlik ketma-ketligi', 'Ежедневная последовательность приёма препаратов')}</p></div><div className="med-plan-controls">
      {plans.length > 1 && mode === 'view' ? <Select className="med-plan-version-select" aria-label={t('Reja versiyasi', 'Версия плана')} value={selected?.id ?? ''} onChange={event => { setSelectedId(Number(event.target.value)); setMessage(''); setConfirmed(false) }}>{plans.map(plan => <option key={plan.id} value={plan.id}>v{plan.version} · {planStatus(plan.status)}</option>)}</Select> : null}
      {canEdit && mode === 'view' ? <Button type="button" variant="primary" onClick={() => beginEdit(selected)}><Icon name="plus" size={18} />{selected ? t('Rejani tahrirlash', 'Изменить план') : t('Reja tuzish', 'Создать план')}</Button> : null}
    </div></div>
    <ol className="med-plan-stage" aria-label={t('Reja bosqichlari', 'Этапы плана')}>{[[1, t('Tahrirlash', 'Редактирование')], [2, t('Qoralama', 'Черновик')], [3, t('Tekshirish va tasdiq', 'Проверка и утверждение')], [4, t('Amaldagi', 'Действующий')]].map(([number, label]) => <li key={number} className={step === number ? 'is-current' : ''} aria-current={step === number ? 'step' : undefined}><span>{number}</span>{label}</li>)}</ol>
    {isDemoMode() ? <div className="med-demo-note"><Icon name="info" size={18} />{t('Bemor va retseptlar namuna uchun. Bu shaxsiy tibbiy tavsiya emas.', 'Пациент и назначения демонстрационные. Это не персональная медицинская рекомендация.')}</div> : null}
    {message ? <div className="med-plan-message" role="status">{message}</div> : null}
    {error || plansError ? <p className="med-error" role="alert">{error || plansError}</p> : null}

    {mode === 'edit' ? <form className="stack" onSubmit={event => { event.preventDefault(); void saveDraft() }}>
      <div className="med-change-notice">{t('Amaldagi reja tasdiqlanganicha davom etadi. O‘zgartirishlar avval qoralama sifatida saqlanadi.', 'Действующий план продолжает работать. Изменения сначала сохраняются как черновик.')}</div>
      <Card><div className="grid2"><Field label={t('Yangi rejaning boshlanishi', 'Начало нового плана')} required><Input type="date" aria-label={t('Rejaning boshlanish sanasi', 'Дата начала плана')} required value={planStart} onChange={event => setPlanStart(event.target.value)} /></Field><Field label={t('Reja bo‘yicha izoh', 'Комментарий к плану')}><Textarea aria-label={t('Reja bo‘yicha izoh', 'Комментарий к плану')} rows={2} value={planNotes} onChange={event => setPlanNotes(event.target.value)} /></Field></div></Card>
      {medications.map((medication, index) => <MedicationEditor key={index} value={medication} index={index} errors={errors} catalogue={catalogue?.medications} onChange={next => setMedications(current => current.map((item, i) => i === index ? next : item))} onRemove={() => setMedications(current => current.filter((_, i) => i !== index))} />)}
      <div><Button type="button" onClick={() => setMedications(current => [...current, emptyMedication(planStart)])}><Icon name="plus" size={18} />{t('Yana dori qo‘shish', 'Добавить ещё препарат')}</Button></div>
      {errors.plan ? <p className="med-error" role="alert">{errors.plan}</p> : null}
      <div className="med-form-actions"><Button type="button" disabled={busy} onClick={() => { setMode('view'); setErrors({}); setError('') }}>{t('Bekor qilish', 'Отмена')}</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? t('Saqlanmoqda…', 'Сохранение…') : t('Qoralamani saqlash va tekshirish', 'Сохранить черновик и проверить')}</Button></div>
    </form> : selected ? <>
      <Card title={`${t('Reja', 'План')} v${selected.version}`} action={<Badge tone={selected.status === 'active' ? 'stable' : selected.status === 'draft' ? 'attention' : 'neutral'}>{planStatus(selected.status)}</Badge>}>
        <div className="med-plan-meta"><span>{t('Boshlanish', 'Начало')}: <strong>{formatDate(selected.start_date)}</strong></span><span>{t('Tasdiqlagan', 'Утвердил')}: <strong>{selected.approver?.full_name ?? t('Hali tasdiqlanmagan', 'Ещё не утверждён')}</strong></span>{selected.approved_at ? <span>{formatDateTime(selected.approved_at)}</span> : null}</div>
        {selected.notes ? <p className="med-plan-note" style={{ marginTop: 16 }}>{selected.notes}</p> : null}
      </Card>
      <Card title={t('Dori qabul qilish tartibi', 'Порядок приёма препаратов')} subtitle={t('Vaqtlar bo‘yicha tartiblangan. Har bir raqam — navbatdagi qabul.', 'В хронологическом порядке. Каждый номер — следующий приём.')}><MedicationSequence medications={selected.medications} /></Card>
      {selected.status === 'draft' && canEdit ? <Card title={t('Tekshirish va tasdiqlash', 'Проверка и утверждение')}>
        {mode !== 'review' ? <div className="stack--sm"><p className="med-plan-note">{t('Qoralama hali bemor rejasiga qo‘llanmagan.', 'Черновик ещё не применён к плану пациента.')}</p><div><Button type="button" variant="primary" onClick={() => { setMode('review'); setConfirmed(false); setReason('') }}>{t('Qoralamani tekshirish', 'Проверить черновик')}</Button></div></div> : <div className="stack med-review">
          <p className="med-plan-note">{t('Nom, doza, ovqat bilan bog‘liqlik va vaqtlarni tekshiring. Tasdiqdan keyin ushbu reja bemorga ko‘rinadi, oldingi versiya arxivlanadi.', 'Проверьте название, дозу, связь с едой и время. После утверждения пациент увидит этот план, предыдущая версия останется в архиве.')}</p>
          <Field label={t('Tasdiqlash / o‘zgartirish sababi', 'Причина утверждения / изменения')} required><Textarea aria-label={t('O‘zgartirish sababi', 'Причина изменения')} rows={2} value={reason} onChange={event => setReason(event.target.value)} placeholder={t('Masalan, nazorat qabulida reja qayta ko‘rib chiqildi', 'Например, план пересмотрен на контрольном приёме')} /></Field>
          <label className="med-review-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>{t('Retsept va kunlik ketma-ketlikni tekshirdim. Ushbu versiyani tasdiqlayman.', 'Я проверил(а) назначение и ежедневную последовательность. Подтверждаю эту версию.')}</span></label>
          <div className="med-plan-controls"><Button type="button" onClick={() => beginEdit(selected)} disabled={busy}>{t('Tahrirlashga qaytish', 'Вернуться к редактированию')}</Button><Button type="button" variant="primary" disabled={!confirmed || !reason.trim() || busy} onClick={() => void approve()}><Icon name="checks" size={18} />{busy ? t('Tasdiqlanmoqda…', 'Утверждение…') : t('Tasdiqlash va faollashtirish', 'Утвердить и активировать')}</Button></div>
        </div>}
      </Card> : null}
      <Card title={t('Kuzatuv va eslatmalar', 'Наблюдение и напоминания')}><details className="med-details"><summary>{t('Amaldagi sozlamalarni ko‘rish', 'Посмотреть настройки')}</summary><div className="med-details-content stack--sm">{selected.monitoring.map(config => <div className="row--between" key={config.id}><span>{config.type === 'glucose' ? t('Glyukoza', 'Глюкоза') : config.type === 'blood_pressure' ? t('Qon bosimi', 'Давление') : t('Holat so‘rovi', 'Самочувствие')}</span><span className="small muted">{config.enabled ? config.times.map(slot => slot.time_of_day).join(' · ') : t('O‘chirilgan', 'Отключено')}</span></div>)}<p className="small muted">{t('Eslatma takrori', 'Повтор напоминания')}: {selected.reminder_repeat_minutes} {t('daq.', 'мин.')} · {t('Takrorlar', 'Повторов')}: {selected.reminder_max_count}</p></div></details></Card>
    </> : <Card><div className="med-empty"><Icon name="clipboard" size={30} /><h2>{t('Davolash rejasi hali yo‘q', 'Плана лечения пока нет')}</h2><p>{t('Dori va vaqtlarni qo‘shib, birinchi qoralamani tayyorlang.', 'Добавьте препараты и время, чтобы подготовить первый черновик.')}</p>{canEdit ? <Button type="button" variant="primary" onClick={() => beginEdit(null)}>{t('Reja tuzish', 'Создать план')}</Button> : null}</div></Card>}

    {mode !== 'edit' && plans.length > 0 ? <Card title={t('Rejalar tarixi', 'История планов')} subtitle={t('Oldingi versiyalar saqlanadi.', 'Предыдущие версии сохраняются.')}><div>{plans.map(plan => <div className="med-history-row" key={plan.id}><div><strong>v{plan.version} · {planStatus(plan.status)}</strong><small>{plan.approver?.full_name ?? t('Tasdiq kutilmoqda', 'Ожидает утверждения')}{plan.approved_at ? ` · ${formatDateTime(plan.approved_at)}` : ''}</small></div><Button type="button" disabled={selected?.id === plan.id} onClick={() => { setSelectedId(plan.id); setMode('view'); setMessage(''); setConfirmed(false) }}>{selected?.id === plan.id ? t('Ochilgan', 'Открыт') : t('Ko‘rish', 'Посмотреть')}</Button></div>)}</div></Card> : null}
  </div>
}
