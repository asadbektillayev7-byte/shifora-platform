import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { uz } from '../../lib/uz'
import { useLanguage } from '../../lib/i18n'
import { useApi } from '../../lib/hooks'
import { Button, Card, Empty, ErrorState, Input, Loading, Meter, StatusBadge } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { PatientListItem, PatientStatus } from '../../lib/types'
import { initials, timeAgo } from '../../lib/format'

export function PatientListPage() {
  useLanguage()
  const FILTERS: { key: PatientStatus | 'all'; label: string }[] = [
    { key: 'all', label: uz.app.all },
    { key: 'urgent', label: uz.status.urgentShort },
    { key: 'attention', label: uz.status.attention },
    { key: 'stable', label: uz.status.stable },
  ]
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<PatientStatus | 'all'>('all')

  const { data, loading, error, reload } = useApi<{ patients: PatientListItem[] }>(
    `/patients?status=${status}&query=${encodeURIComponent(query)}`,
    [status, query],
  )

  return (
    <div className="stack">
      <div className="row--between">
        <div className="row" style={{ flex: 1, minWidth: 240 }}>
          <Input
            aria-label={uz.patients.searchPlaceholder}
            placeholder={uz.patients.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 380 }}
          />
        </div>
        <div className="chip-group">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              className={`chip ${status === filter.key ? 'chip--on' : ''}`}
              aria-pressed={status === filter.key}
              onClick={() => setStatus(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <Card
        title={uz.patients.title}
        subtitle={data ? uz.patients.count(data.patients.length) : undefined}
        action={
          <Button variant="primary" size="sm" onClick={() => navigate('/shifoxona/royxat')}>
            <Icon name="plus" size={18} />{uz.nav.hospital.register}
          </Button>
        }
        flush
      >
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} retry={() => void reload()} />
        ) : !data || data.patients.length === 0 ? (
          <Empty icon="search" title={uz.patients.empty} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{uz.patients.columns.patient}</th>
                  <th>{uz.patients.columns.diabetesType}</th>
                  <th>{uz.patients.columns.status}</th>
                  <th>{uz.patients.columns.adherence}</th>
                  <th>{uz.patients.columns.glucose}</th>
                  <th>{uz.patients.columns.lastActivity}</th>
                  <th>{uz.patients.columns.alert}</th>
                </tr>
              </thead>
              <tbody>
                {data.patients.map((patient) => (
                  <tr
                    key={patient.id}
                    onClick={() => navigate(`/shifoxona/bemorlar/${patient.id}`)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/shifoxona/bemorlar/${patient.id}`)
                    }}
                  >
                    <td>
                      <div className="person">
                        <span className="avatar" aria-hidden>
                          {initials(patient.first_name, patient.last_name)}
                        </span>
                        <span>
                          <span className="person__name" style={{ display: 'block' }}>
                            {patient.last_name} {patient.first_name}
                          </span>
                          <span className="person__meta">{patient.phone}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      {patient.diabetes_type
                        ? uz.diabetesType[patient.diabetes_type]
                        : uz.app.notSpecified}
                    </td>
                    <td><StatusBadge status={patient.status} /></td>
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <Meter value={patient.adherence} />
                        <span className="strong" style={{ minWidth: 42 }}>
                          {patient.adherence === null ? '—' : `${patient.adherence}%`}
                        </span>
                      </div>
                    </td>
                    <td>
                      {patient.last_glucose ? (
                        <span>
                          <span className="strong">{patient.last_glucose.value}</span>
                          <span className="muted small"> mg/dL</span>
                        </span>
                      ) : (
                        <span className="muted">{uz.patients.noData}</span>
                      )}
                    </td>
                    <td className="small muted">{timeAgo(patient.last_activity)}</td>
                    <td>
                      {patient.open_alerts > 0 ? (
                        <span className={`badge badge--${patient.has_urgent_alert ? 'urgent' : 'attention'}`}>
                          {patient.open_alerts}
                        </span>
                      ) : (
                        <span className="muted small">—</span>
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
  )
}
