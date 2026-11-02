import { useEffect, useState } from 'react'
import { uz } from '../../lib/uz'
import { useLanguage } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useApi } from '../../lib/hooks'
import { Button, Card, Empty, ErrorState, Loading } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { NotificationItem } from '../../lib/types'
import { timeAgo } from '../../lib/format'

const ICONS: Record<string, string> = {
  medication_reminder: 'pill',
  monitoring_reminder: 'droplet',
  alert: 'bell',
  alert_urgent: 'warning',
  info: 'info',
}

export function PatientAlertsPage() {
  const { locale } = useLanguage()
  const { data, loading, error, reload } = useApi<{ notifications: NotificationItem[]; unread: number }>('/me/notifications', [locale])
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => void reload(), 20_000)
    return () => clearInterval(timer)
  }, [reload])
  async function markRead(id?: number) {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      await api.post(id === undefined ? '/me/notifications/read-all' : `/me/notifications/${id}/read`)
      await reload()
    } catch (err) { setActionError(err instanceof Error ? err.message : uz.app.errorGeneric) }
    finally { setBusy(false) }
  }
  const items = data?.notifications ?? []
  const unread = data?.unread ?? 0
  if (loading && !data) return <div className="content"><Loading /></div>

  return (
    <div className="content stack">
      <div className="row--between">
        <h1>{uz.notifications.title}</h1>
        {unread > 0 ? (
          <Button size="sm" disabled={busy} onClick={() => void markRead()}>{uz.notifications.markAllRead}</Button>
        ) : null}
      </div>

      {error ? <ErrorState message={error} retry={() => void reload()} /> : null}
      {actionError ? <ErrorState message={actionError} /> : null}

      {items.length === 0 && !error ? (
        <Card><Empty icon="bell" title={uz.notifications.empty} /></Card>
      ) : (
        <div className="stack--sm" style={{ gap: 12 }}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              className="task"
              style={{
                background: item.read_at ? 'var(--surface)' : 'var(--teal-50)',
                textAlign: 'start',
                cursor: item.read_at ? 'default' : 'pointer',
                font: 'inherit',
                width: '100%',
              }}
              onClick={() => { if (!item.read_at) void markRead(item.id) }}
            >
              <span className="task__icon"><Icon name={ICONS[item.type] ?? 'bell'} /></span>
              <div className="task__body">
                <div className="task__title">{item.title}</div>
                <div className="task__meta">{item.body}</div>
                <div className="task__meta muted">{timeAgo(item.created_at)}</div>
              </div>
              {!item.read_at ? <span className="badge badge--teal">{uz.notifications.unread}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
