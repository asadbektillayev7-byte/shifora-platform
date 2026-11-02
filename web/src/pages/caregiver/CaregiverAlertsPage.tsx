import { useEffect, useState } from 'react'
import { uz } from '../../lib/uz'
import { useLanguage } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useApi } from '../../lib/hooks'
import { Button, Card, Empty, ErrorState, Loading, SeverityBadge } from '../../components/ui'
import type { NotificationItem, Severity } from '../../lib/types'
import { formatDateTime, timeAgo } from '../../lib/format'
import { PatientSwitcher, useCaregiverPatient } from './CaregiverApp'

interface Detail {
  permissions: Record<string, boolean>
  alerts: {
    id: number; severity: Severity; title: string; detail: string
    status: 'new' | 'in_review' | 'contacted' | 'closed'; created_at: string
  }[] | null
}

export function CaregiverAlertsPage() {
  const { locale } = useLanguage()
  const { patient } = useCaregiverPatient()
  const { data, loading, error, reload } = useApi<Detail>(`/caregiver/patients/${patient.id}`, [patient.id, locale])
  const { data: notificationData, loading: notificationsLoading, error: notificationError, reload: reloadNotifications } = useApi<{ notifications: NotificationItem[]; unread: number }>('/me/notifications', [locale])
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => void reloadNotifications(), 20_000)
    return () => clearInterval(timer)
  }, [reloadNotifications])
  async function markAllRead() {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try { await api.post('/me/notifications/read-all'); await reloadNotifications() }
    catch (err) { setActionError(err instanceof Error ? err.message : uz.app.errorGeneric) }
    finally { setBusy(false) }
  }
  const items = notificationData?.notifications ?? []
  const unread = notificationData?.unread ?? 0

  if (loading) return <div className="content"><Loading /></div>
  if (error || !data) return <div className="content"><ErrorState message={error ?? uz.app.errorGeneric} retry={() => void reload()} /></div>

  return (
    <div className="content stack">
      <PatientSwitcher />
      <div className="row--between">
        <h1>{uz.alerts.title}</h1>
        {unread > 0 ? (
          <Button size="sm" disabled={busy} onClick={() => void markAllRead()}>{uz.notifications.markAllRead}</Button>
        ) : null}
      </div>
      {actionError ? <ErrorState message={actionError} /> : null}

      {!data.permissions.view_alerts || !data.alerts ? (
        <Card><Empty icon="shield" title={uz.caregiver.noAccess} /></Card>
      ) : data.alerts.length === 0 ? (
        <Card><Empty icon="check" title={uz.alerts.empty} /></Card>
      ) : (
        <Card flush>
          {data.alerts.map((alert) => (
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
          ))}
        </Card>
      )}

      <Card title={uz.notifications.title} flush>
        {notificationError ? <ErrorState message={notificationError} retry={() => void reloadNotifications()} /> : notificationsLoading && !notificationData ? <Loading /> : items.length === 0 ? (
          <Empty icon="bell" title={uz.notifications.empty} />
        ) : (
          items.slice(0, 15).map((item) => (
            <div className="alert-row" key={item.id}>
              <span className="alert-row__bar alert-row__bar--info" aria-hidden />
              <div className="alert-row__body">
                <div className="alert-row__title">{item.title}</div>
                <div className="alert-row__detail">{item.body}</div>
                <div className="alert-row__meta"><span>{timeAgo(item.created_at)}</span></div>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
