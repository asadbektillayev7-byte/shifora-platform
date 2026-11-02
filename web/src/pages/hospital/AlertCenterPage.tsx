import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { uz } from '../../lib/uz'
import { useLanguage } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useApi } from '../../lib/hooks'
import { useAuth } from '../../lib/auth'
import { Button, Card, Empty, ErrorState, Loading, Modal, Notice, SeverityBadge, Textarea } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { AlertItem } from '../../lib/types'
import { formatDateTime, timeAgo } from '../../lib/format'

function AlertDetail({ alertId, onClose, onChanged }: {
  alertId: number
  onClose: () => void
  onChanged: () => void
}) {
  const { t, locale } = useLanguage()
  const { session } = useAuth()
  const { data, loading, error, reload } = useApi<AlertItem>(`/alerts/${alertId}`, [locale])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function update(changes: Record<string, unknown>) {
    setBusy(true)
    setActionError(null)
    try {
      await api.patch(`/alerts/${alertId}`, changes)
      await reload()
      onChanged()
      return true
    } catch (err) {
      setActionError(err instanceof Error ? err.message : uz.app.errorGeneric)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addNote() {
    if (!note.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      await api.post(`/alerts/${alertId}/notes`, { note })
      setNote('')
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : uz.app.errorGeneric)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={uz.alerts.detailsTitle}
      onClose={onClose}
      footer={
        data ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => void update({ status: 'in_review', assigned_user_id: session?.user.id })}>
              {uz.alerts.take}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void update({ status: 'contacted' })}>
              {uz.alerts.markContacted}
            </Button>
            <Button size="sm" variant="primary" disabled={busy || data.status === 'closed'}
              onClick={() => setConfirmClose(true)}>
              {uz.alerts.close}
            </Button>
          </>
        ) : null
      }
    >
      {error ? (
        <ErrorState message={error} retry={() => void reload()} />
      ) : loading || !data ? (
        <Loading />
      ) : (
        <div className="stack">
          {actionError ? <ErrorState message={actionError} /> : null}
          <div className="row--between">
            <div>
              <h3>{data.last_name} {data.first_name}</h3>
              <div className="small muted">{data.title}</div>
            </div>
            <SeverityBadge severity={data.severity} />
          </div>

          <Notice tone={data.severity === 'urgent' ? 'danger' : 'warning'}>{data.detail}</Notice>

          <dl className="kv">
            <dt>{uz.alerts.columns.created}</dt>
            <dd>{formatDateTime(data.created_at)}</dd>
            <dt>{uz.alerts.elapsed}</dt>
            <dd>{data.elapsed}</dd>
            <dt>{uz.alerts.columns.status}</dt>
            <dd>{uz.alerts.state[data.status]}</dd>
            <dt>{uz.alerts.columns.assigned}</dt>
            <dd>{data.assigned_name ?? uz.app.notSpecified}</dd>
            <dt>{uz.alerts.contact}</dt>
            <dd>{data.phone}</dd>
            <dt>{uz.alerts.emergencyContact}</dt>
            <dd>{data.emergency_contact_name} · {data.emergency_contact_phone}</dd>
            {data.context?.medication ? (
              <>
                <dt>{uz.carePlan.medications}</dt>
                <dd>{String(data.context.medication)} — {String(data.context.dose ?? '')}</dd>
                <dt>{t('Belgilangan vaqt', 'Назначенное время')}</dt>
                <dd>{String(data.context.scheduled_at ?? '')}</dd>
                <dt>{t('So‘nggi eslatma', 'Последнее напоминание')}</dt>
                <dd>{String(data.context.last_reminder_at ?? '—')}</dd>
                <dt>{t('Bemor javobi', 'Ответ пациента')}</dt>
                <dd>{t('Tasdiqlanmadi', 'Не подтверждён')}</dd>
                <dt>{uz.register.priority}</dt>
                <dd>{uz.priority[String(data.context.priority) as keyof typeof uz.priority] ?? String(data.context.priority ?? '')}</dd>
              </>
            ) : null}
          </dl>

          <Notice tone="info">{uz.alerts.safetyNote}</Notice>

          <Link className="btn btn--secondary btn--block" to={`/shifoxona/bemorlar/${data.patient_id}`}>
            {uz.patients.openProfile}<Icon name="arrow" size={18} />
          </Link>

          <div className="divider" />

          <div className="stack--sm">
            <div className="strong">{uz.alerts.notes}</div>
            {data.notes && data.notes.length > 0 ? (
              data.notes.map((item) => (
                <div key={item.id} className="notice" style={{ background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink)' }}>
                  <span className="notice__icon" aria-hidden><Icon name="file" size={18} /></span>
                  <div>
                    <div className="small">{item.note}</div>
                    <div className="small muted">{item.full_name} · {timeAgo(item.created_at)}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted small">{uz.alerts.noNotes}</p>
            )}
            <Textarea
              aria-label={uz.alerts.notes}
              placeholder={uz.alerts.notePlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div>
              <Button size="sm" onClick={() => void addNote()} disabled={busy || !note.trim()}>
                {uz.alerts.addNote}
              </Button>
            </div>
          </div>

          {confirmClose ? (
            <Modal
              title={uz.alerts.closeConfirmTitle}
              onClose={() => setConfirmClose(false)}
              footer={
                <>
                  <Button onClick={() => setConfirmClose(false)}>{uz.app.cancel}</Button>
                  <Button
                    variant="primary"
                    onClick={async () => {
                      setConfirmClose(false)
                      if (await update({ status: 'closed' })) onClose()
                    }}
                  >
                    {uz.app.confirm}
                  </Button>
                </>
              }
            >
              <p>{uz.alerts.closeConfirmBody}</p>
            </Modal>
          ) : null}
        </div>
      )}
    </Modal>
  )
}

export function AlertCenterPage() {
  const { t, locale } = useLanguage()
  const FILTERS = [
    { key: 'open', label: uz.alerts.filters.all, query: 'status=open' },
    { key: 'urgent', label: uz.alerts.filters.urgent, query: 'status=open&severity=urgent' },
    { key: 'warning', label: uz.alerts.filters.warning, query: 'status=open&severity=warning' },
    { key: 'closed', label: uz.alerts.filters.closed, query: 'status=closed' },
  ]
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState('open')
  const [selected, setSelected] = useState<number | null>(null)
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]
  const { data, loading, error, reload } = useApi<{ alerts: AlertItem[] }>(`/alerts?${active.query}`, [filter, locale])

  useEffect(() => {
    const fromUrl = params.get('alert')
    const id = Number(fromUrl)
    if (fromUrl && Number.isInteger(id) && id > 0) setSelected(id)
  }, [params])

  function close() {
    setSelected(null)
    if (params.get('alert')) {
      params.delete('alert')
      setParams(params, { replace: true })
    }
  }

  return (
    <div className="stack">
      <div className="chip-group">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            className={`chip ${filter === item.key ? 'chip--on' : ''}`}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card title={uz.alerts.centerTitle} subtitle={data ? t(`${data.alerts.length} ta`, `Оповещений: ${data.alerts.length}`) : undefined} flush>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} retry={() => void reload()} />
        ) : !data || data.alerts.length === 0 ? (
          <Empty icon="check" title={uz.alerts.empty} />
        ) : (
          data.alerts.map((alert) => (
            <div className="alert-row" key={alert.id}>
              <span className={`alert-row__bar alert-row__bar--${alert.severity}`} aria-hidden />
              <div className="alert-row__body">
                <div className="row--between">
                  <div>
                    <div className="alert-row__title">{alert.last_name} {alert.first_name}</div>
                    <div className="alert-row__detail">{alert.title} — {alert.detail}</div>
                  </div>
                  <SeverityBadge severity={alert.severity} />
                </div>
                <div className="alert-row__meta">
                  <span>{timeAgo(alert.created_at)}</span>
                  <span>{uz.alerts.state[alert.status]}</span>
                  <span>{alert.assigned_name ?? uz.app.notSpecified}</span>
                </div>
              </div>
              <Button size="sm" variant="primary" onClick={() => setSelected(alert.id)}>
                {uz.alerts.review}
              </Button>
            </div>
          ))
        )}
      </Card>

      {selected ? (
        <AlertDetail alertId={selected} onClose={close} onChanged={() => void reload()} />
      ) : null}
    </div>
  )
}
