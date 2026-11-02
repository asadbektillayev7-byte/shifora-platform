import { useState } from 'react'
import { Link } from 'react-router-dom'
import { uz } from '../../lib/uz'
import { useLanguage } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useApi, requestNotificationPermission } from '../../lib/hooks'
import { Button, Card, Empty, ErrorState, Loading, Notice } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { BloodPressureForm, GlucoseForm, SymptomForm } from '../../components/MeasurementForms'
import type { DailyPlan, GlucoseReading, PlanItem } from '../../lib/types'
import { formatDate, formatDateTime, formatTime } from '../../lib/format'
import './patient-redesign.css'

interface TodayResponse {
  patient: { id: number; first_name: string; last_name: string }
  plan: DailyPlan
  adherence_7d: { rate: number | null }
  has_active_plan: boolean
}

const TASK_ICONS: Record<PlanItem['kind'], string> = {
  medication: 'pill', glucose: 'droplet', blood_pressure: 'heart', symptom: 'message',
}
const itemKey = (item: PlanItem) => `${item.kind}-${item.id}`
const isComplete = (item: PlanItem) => item.status === 'taken' || item.status === 'done'

export function PatientHomePage() {
  const { t, locale } = useLanguage()
  const { data, loading, error, reload } = useApi<TodayResponse>('/me/today', [locale])
  const measurements = useApi<{ glucose: GlucoseReading[] }>('/measurements?limit=1')
  const [openForm, setOpenForm] = useState<null | 'glucose' | 'blood_pressure' | 'symptom'>(null)
  const [formContext, setFormContext] = useState<PlanItem['context']>('any')
  const [toast, setToast] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notificationsOn, setNotificationsOn] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  )

  async function act(item: PlanItem, action: 'take' | 'snooze' | 'missed') {
    if (busyId) return
    setBusyId(itemKey(item))
    setActionError(null)
    try {
      const result = await api.post<{ snoozed_until?: string }>(`/doses/${item.id}/${action}`)
      await reload()
      setToast(action === 'take'
        ? { tone: 'success', text: uz.patientHome.taken }
        : action === 'snooze'
          ? { tone: 'warning', text: uz.patientHome.snoozed(formatTime(result.snoozed_until)) }
          : { tone: 'warning', text: t('Qabul qilinmagani qayd etildi.', 'Пропуск приёма сохранён.') })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : uz.app.errorGeneric)
    } finally { setBusyId(null) }
  }

  if (loading && !data) return <div className="ph-page"><Loading /></div>
  if (!data) return <div className="ph-page"><ErrorState message={error ?? uz.app.errorGeneric} retry={() => void reload()} /></div>

  const { plan, patient } = data
  const ordered = [...plan.items].sort((a, b) =>
    (a.snoozed_until ?? a.scheduled_at).localeCompare(b.snoozed_until ?? b.scheduled_at))
  const next = ordered.find(item => item.status === 'pending' || item.status === 'snoozed')
  const later = ordered.filter(item => !isComplete(item) && item !== next && item.status !== 'missed')
  const completed = ordered.filter(isComplete)
  const missed = ordered.filter(item => item.status === 'missed')
  const lastGlucose = measurements.data?.glucose[0]
  const progress = plan.summary.total ? Math.min(100, plan.summary.done / plan.summary.total * 100) : 0
  const date = formatDate(plan.date)

  function title(item: PlanItem) {
    return item.kind === 'medication' ? item.title
      : item.kind === 'glucose' ? uz.patientHome.measureGlucose
        : item.kind === 'blood_pressure' ? uz.patientHome.measureBp : uz.patientHome.symptomCheck
  }

  function task(item: PlanItem, prominent = false) {
    const done = isComplete(item)
    return <article className={`ph-task ${prominent ? 'ph-task--next' : ''} ${done ? 'ph-task--done' : ''}`} key={itemKey(item)}>
      {prominent ? <div className="ph-next-label"><Icon name="sun" size={19} />{t('Keyingi vazifa', 'Следующее действие')}</div> : null}
      <div className="ph-task__heading">
        <span className="ph-task__symbol"><Icon name={TASK_ICONS[item.kind]} size={25} /></span>
        <div className="ph-task__identity"><span className="ph-task__time">{item.time}</span><h2>{title(item)}</h2></div>
        {done ? <span className="ph-task__check"><Icon name="check" size={23} /></span> : null}
      </div>
      {item.context && item.context !== 'any' ? <p className="ph-task__detail">{uz.measurements.context[item.context]}</p> : null}
      {item.note ? <p className="ph-task__detail">{item.note}</p> : null}
      {item.status === 'snoozed' ? <p className="ph-task__status"><Icon name="clock" size={17} />{uz.patientHome.snoozed(formatTime(item.snoozed_until))}</p> : null}
      {done ? <p className="ph-task__status">{item.kind === 'medication' ? uz.patientHome.taken : uz.patientHome.done}{item.taken_at ? ` · ${formatTime(item.taken_at)}` : ''}</p> : null}
      {item.status === 'missed' ? <p className="ph-task__status">{t('Qabul qilingani tasdiqlanmagan', 'Приём не подтверждён')}</p> : null}
      {!done ? <div className="ph-task__actions">
        {item.kind === 'medication' ? <>
          <Button variant="primary" size="lg" disabled={busyId !== null} onClick={() => void act(item, 'take')}><Icon name="check" />{busyId === itemKey(item) ? uz.app.loading : uz.patientHome.take}</Button>
          {item.status !== 'missed' ? <Button size="lg" disabled={busyId !== null} onClick={() => void act(item, 'snooze')}><Icon name="clock" />{uz.patientHome.later}</Button> : null}
          {item.status !== 'missed' ? <Button variant="ghost" disabled={busyId !== null} onClick={() => void act(item, 'missed')}>{t('Qabul qilmadim', 'Приём пропущен')}</Button> : null}
        </> : <Button variant="primary" size="lg" onClick={() => {
          setFormContext(item.context ?? 'any')
          setOpenForm(item.kind as 'glucose' | 'blood_pressure' | 'symptom')
        }}>{item.kind === 'symptom' ? uz.measurements.addSymptom : uz.patientHome.enterMeasurement}<Icon name="arrow" /></Button>}
      </div> : null}
    </article>
  }

  function saved(kind: 'glucose' | 'blood_pressure' | 'symptom', raised: boolean) {
    setOpenForm(null)
    setToast({ tone: raised ? 'warning' : 'success', text: raised ? uz.measurements.alertRaised
      : kind === 'glucose' ? uz.measurements.savedGlucose : kind === 'blood_pressure' ? uz.measurements.savedBp : uz.measurements.savedSymptom })
    void Promise.all([reload(), measurements.reload()])
  }

  return <div className="ph-page stack">
    <header className="ph-heading">
      <div><p className="ph-eyebrow">{uz.patientHome.greeting}, {patient.first_name}</p><h1>{t('Bugun', 'Сегодня')}</h1><p className="ph-date">{date}</p></div>
      <Link to="/bemor/ogohlantirishlar" className="ph-icon-link" aria-label={uz.notifications.title}><Icon name="bell" size={24} /></Link>
    </header>
    {toast ? <div role="status"><Notice tone={toast.tone}>{toast.text}</Notice></div> : null}
    {actionError ? <ErrorState message={actionError} /> : null}
    {error ? <ErrorState message={error} retry={() => void reload()} /> : null}
    {!data.has_active_plan ? <Card><Empty icon="clipboard" title={uz.patientHome.noPlanTitle}>{uz.patientHome.noPlanBody}</Empty><Link to="/bemor/yordamchi" className="ph-text-link">{t('Tibbiy jamoaga yozish', 'Написать медицинской команде')}<Icon name="arrow" /></Link></Card>
      : plan.items.length === 0 ? <Card><Empty icon="calendar" title={uz.patientHome.nothingToday} /></Card>
        : <>
          {next ? task(next, true) : <section className="ph-day-complete"><Icon name={missed.length ? 'clock' : 'check'} size={30} /><h2>{missed.length ? t('Bugungi rejani tekshiring', 'Проверьте план на сегодня') : t('Bugungi reja bajarildi', 'План на сегодня выполнен')}</h2><p>{missed.length ? t('Tasdiqlanmagan qabulni quyida ko‘rishingiz mumkin.', 'Неподтверждённые приёмы можно посмотреть ниже.') : t('Keyingi vazifalaringiz shu yerda ko‘rinadi.', 'Следующие задачи появятся здесь.')}</p></section>}
          <div className="ph-summary-grid">
            <section className="ph-summary"><span>{t('Bugungi reja', 'План на сегодня')}</span><strong>{plan.summary.done}<span> / {plan.summary.total}</span></strong><span>{t('vazifa bajarildi', 'задач выполнено')}</span><div className="ph-progress" role="progressbar" aria-label={uz.patientHome.progress(plan.summary.done, plan.summary.total)} aria-valuenow={plan.summary.done} aria-valuemin={0} aria-valuemax={Math.max(plan.summary.total, 1)}><span style={{ width: `${progress}%` }} /></div></section>
            <section className="ph-summary"><span>{t('Oxirgi glyukoza', 'Последняя глюкоза')}</span>{lastGlucose ? <><strong>{lastGlucose.value}<span> {lastGlucose.unit}</span></strong><span>{formatDateTime(lastGlucose.measured_at)}</span><span className="ph-source">{t('Qo‘lda kiritilgan', 'Введено вручную')}</span></> : measurements.error ? <><p>{t('O‘lchovlar yuklanmadi.', 'Измерения не загрузились.')}</p><Button size="sm" onClick={() => void measurements.reload()}>{uz.app.retry}</Button></> : <><strong>—</strong><span>{t('Hali o‘lchov yo‘q', 'Измерений пока нет')}</span></>}</section>
          </div>
          {later.length ? <details className="ph-disclosure"><summary><span><Icon name="calendar" />{t('Keyinroq', 'Позже')}<span className="ph-count">{later.length}</span></span><Icon name="chevron" /></summary><div className="ph-timeline">{later.map(item => task(item))}</div></details> : null}
          {missed.length ? <details className="ph-disclosure"><summary><span><Icon name="clock" />{t('Tasdiqlanmagan', 'Не подтверждено')}<span className="ph-count">{missed.length}</span></span><Icon name="chevron" /></summary><div className="ph-timeline">{missed.map(item => task(item))}</div></details> : null}
          {completed.length ? <details className="ph-disclosure"><summary><span><Icon name="check" />{t('Bajarilgan', 'Выполнено')}<span className="ph-count">{completed.length}</span></span><Icon name="chevron" /></summary><div className="ph-timeline">{completed.map(item => task(item))}</div></details> : null}
        </>}
    <section className="ph-care-card"><span className="ph-care-card__icon"><Icon name="doctor" size={28} /></span><div><h2>{t('Savolingiz bormi?', 'Есть вопрос?')}</h2><p>{t('Tibbiy jamoaga yozing. Javobingiz shu yerda saqlanadi.', 'Напишите медицинской команде. Ответ сохранится здесь.')}</p><Link to="/bemor/yordamchi" className="ph-text-link">{t('Tibbiy jamoaga yozish', 'Написать команде')}<Icon name="arrow" /></Link></div></section>
    <details className="ph-disclosure ph-reminders"><summary><span><Icon name="bell" />{t('Eslatma sozlamalari', 'Настройки напоминаний')}</span><Icon name="chevron" /></summary><div className="ph-disclosure__body"><p>{notificationsOn ? uz.patientHome.notificationsOn : t('Dori va o‘lchovlar uchun brauzer eslatmalarini yoqishingiz mumkin.', 'Можно включить уведомления браузера о лекарствах и измерениях.')}</p>{!notificationsOn ? <Button onClick={async () => {
      try {
        const enabled = await requestNotificationPermission()
        setNotificationsOn(enabled)
        if (!enabled) setActionError(t('Eslatmalar yoqilmadi. Brauzer sozlamalarini tekshiring.', 'Уведомления не включены. Проверьте настройки браузера.'))
      } catch { setActionError(uz.app.errorGeneric) }
    }}>{uz.patientHome.enableNotifications}</Button> : null}</div></details>
    {openForm === 'glucose' ? <GlucoseForm defaultContext={formContext} onClose={() => setOpenForm(null)} onSaved={raised => saved('glucose', raised)} /> : null}
    {openForm === 'blood_pressure' ? <BloodPressureForm onClose={() => setOpenForm(null)} onSaved={raised => saved('blood_pressure', raised)} /> : null}
    {openForm === 'symptom' ? <SymptomForm onClose={() => setOpenForm(null)} onSaved={raised => saved('symptom', raised)} /> : null}
  </div>
}
