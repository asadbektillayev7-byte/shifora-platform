import { uz } from '../../lib/uz'
import { useLanguage } from '../../lib/i18n'
import { useApi } from '../../lib/hooks'
import { Badge, Card, Empty, ErrorState, Loading, Notice } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { DailyPlan } from '../../lib/types'
import { PatientSwitcher, useCaregiverPatient } from './CaregiverApp'

interface Detail {
  permissions: Record<string, boolean>
  today: DailyPlan | null
}

const ICONS: Record<string, string> = {
  medication: 'pill',
  glucose: 'droplet',
  blood_pressure: 'heart',
  symptom: 'message',
}

export function CaregiverCarePage() {
  const { t, locale } = useLanguage()
  const { patient } = useCaregiverPatient()
  const { data, loading, error, reload } = useApi<Detail>(`/caregiver/patients/${patient.id}`, [patient.id, locale])

  if (loading) return <div className="content"><Loading /></div>
  if (error || !data) return <div className="content"><ErrorState message={error ?? uz.app.errorGeneric} retry={() => void reload()} /></div>

  return (
    <div className="content stack">
      <PatientSwitcher />
      <h1>{uz.caregiver.care}</h1>
      <p className="muted">{uz.caregiver.careHint}</p>

      {!data.permissions.view_today_plan ? (
        <Card><Empty icon="shield" title={uz.caregiver.noAccess} /></Card>
      ) : !data.today ? (
        <Card><Empty icon="clipboard" title={uz.patientHome.noPlanTitle}>{uz.patientHome.noPlanBody}</Empty></Card>
      ) : data.today.items.length === 0 ? (
        <Card><Empty icon="calendar" title={uz.patientHome.nothingToday} /></Card>
      ) : (
        <div className="stack--sm" style={{ gap: 12 }}>
          {data.today.items.map((item) => {
            const done = item.status === 'taken' || item.status === 'done'
            return (
              <div
                key={`${item.kind}-${item.id}`}
                className={`task ${done ? 'task--done' : ''} ${item.status === 'missed' ? 'task--missed' : ''}`}
              >
                <div className="task__time">{item.time}</div>
                <div className="task__icon"><Icon name={ICONS[item.kind]} /></div>
                <div className="task__body">
                  <div className="task__title">
                    {item.kind === 'medication'
                      ? item.title
                      : item.kind === 'glucose'
                        ? uz.patientHome.measureGlucose
                        : item.kind === 'blood_pressure'
                          ? uz.patientHome.measureBp
                          : uz.patientHome.symptomCheck}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {done ? (
                      <Badge tone="stable">{uz.patientHome.done}</Badge>
                    ) : item.status === 'missed' ? (
                      <Badge tone="urgent">{uz.patientHome.missed}</Badge>
                    ) : (
                      <Badge tone="neutral">{item.status === 'snoozed' ? uz.medications.doseSnoozed : uz.patientHome.waiting}</Badge>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Notice tone="info">
        {t('Dori qabul qilinganini faqat bemorning o‘zi tasdiqlaydi. Siz rejani kuzatib borasiz.', 'Приём лекарства подтверждает сам пациент. Вы можете следить за выполнением плана.')}
      </Notice>
    </div>
  )
}
