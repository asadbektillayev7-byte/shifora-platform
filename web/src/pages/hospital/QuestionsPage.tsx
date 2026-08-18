import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import { uz } from '../../lib/uz'
import { api } from '../../lib/api'
import { useApi } from '../../lib/hooks'
import { Badge, Button, Card, Empty, Loading, Modal, Notice, Textarea } from '../../components/ui'
import type { QuestionDetail, QuestionPriority, QuestionRecord, QuestionStatus } from '../../lib/types'
import { formatDateTime, timeAgo } from '../../lib/format'

type TabKey = Exclude<QuestionStatus, 'unanswered'> | 'unanswered'

const TABS: TabKey[] = ['unanswered', 'assigned', 'answered', 'closed']

interface QueueResponse {
  questions: QuestionRecord[]
  counts: Record<TabKey, number> & { total: number }
}

const PRIORITY_TONE: Record<QuestionPriority, 'urgent' | 'attention' | 'neutral'> = {
  urgent: 'urgent',
  high: 'attention',
  normal: 'neutral',
}

function QuestionDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { session } = useAuth()
  const { data, loading, reload } = useApi<QuestionDetail>(`/questions/${id}`)
  const [answer, setAnswer] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function update(changes: Record<string, unknown>) {
    setBusy(true)
    try {
      await api.patch(`/questions/${id}`, changes)
      await reload()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function addNote() {
    if (!note.trim()) return
    setBusy(true)
    try {
      await api.post(`/questions/${id}/notes`, { note })
      setNote('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={uz.questions.title}
      onClose={onClose}
      footer={
        data ? (
          <>
            {!data.assigned_to ? (
              <Button size="sm" disabled={busy} onClick={() => void update({ assigned_to: session?.user.id })}>
                {uz.questions.assignToMe}
              </Button>
            ) : null}
            {data.status !== 'answered' && data.status !== 'closed' ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !answer.trim()}
                onClick={() => {
                  setSaved(true)
                  void update({ status: 'answered', answer })
                }}
              >
                {uz.questions.sendAnswer}
              </Button>
            ) : null}
            {data.status !== 'closed' ? (
              <Button size="sm" disabled={busy} onClick={() => void update({ status: 'closed' })}>
                {uz.questions.closeQuestion}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="stack">
          {data.priority === 'urgent' ? <Notice tone="warning">{uz.questions.urgentHint}</Notice> : null}

          <div className="row--between">
            <div>
              <h3>{data.last_name} {data.first_name}</h3>
              <div className="small muted">{data.patient_phone}</div>
            </div>
            <Badge tone={PRIORITY_TONE[data.priority]}>{uz.questions.priorityLabel[data.priority]}</Badge>
          </div>

          <div className="assistant-bubble assistant-bubble--refused">
            <div className="strong">{data.question}</div>
            <div className="small muted">{uz.questions.created}: {formatDateTime(data.created_at)}</div>
            {data.assigned_name ? (
              <div className="small muted">👤 {data.assigned_name}</div>
            ) : null}
          </div>

          {data.refused && data.refusal_reason ? (
            <Notice tone="info">
              {uz.questions.refusalReason}: {data.refusal_reason}
            </Notice>
          ) : null}

          {data.status === 'answered' && data.answer ? (
            <Notice tone="success">
              <div className="strong">{uz.assistant.answerTitle}</div>
              <div>{data.answer}</div>
              <div className="small muted">
                {data.answered_by_name ? `👤 ${data.answered_by_name} · ` : ''}{formatDateTime(data.answered_at)}
              </div>
            </Notice>
          ) : null}

          {data.status !== 'answered' && data.status !== 'closed' ? (
            <div className="stack--sm">
              <Textarea
                rows={4}
                placeholder={uz.questions.answerPlaceholder}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              {saved ? <p className="small muted">{uz.app.saved}</p> : null}
            </div>
          ) : null}

          {data.references && data.references.length > 0 ? (
            <div className="stack--sm">
              <div className="strong">{uz.questions.refsTitle}</div>
              {data.references.map((ref) => (
                <div key={ref.source_key} className="small">
                  📚 {ref.source_title}
                  {ref.note ? <span className="muted"> — {ref.note}</span> : null}
                </div>
              ))}
            </div>
          ) : null}

          {data.patient_context ? (
            <div className="stack--sm">
              <div className="strong">{uz.questions.patientContextTitle}</div>
              <dl className="kv">
                <dt>{uz.questions.trendAll} (14 kun)</dt>
                <dd>
                  {data.patient_context.glucose_trend.all.count > 0
                    ? `${data.patient_context.glucose_trend.all.count} ta · o‘rt. ${data.patient_context.glucose_trend.all.avg} ${data.patient_context.glucose_trend.all.unit}`
                    : uz.patients.noData}
                </dd>
                <dt>Dorilar</dt>
                <dd>
                  {data.patient_context.medications.length > 0
                    ? data.patient_context.medications
                        .map((m) => `${m.name} ${m.dose} ${m.unit}`)
                        .join(', ')
                    : uz.patients.noData}
                </dd>
                <dt>So‘nggi ogohlantirishlar</dt>
                <dd>
                  {data.patient_context.recent_alerts.length > 0
                    ? data.patient_context.recent_alerts
                        .map((a) => `${a.title} (${uz.severity[a.severity]})`)
                        .join(' · ')
                    : uz.patientProfile.noAlerts}
                </dd>
              </dl>
            </div>
          ) : null}

          <div className="divider" />

          <div className="stack--sm">
            <div className="strong">{uz.questions.internalNotes}</div>
            {data.notes && data.notes.length > 0 ? (
              data.notes.map((item) => (
                <div key={item.id} className="notice" style={{ background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink)' }}>
                  <span className="notice__icon" aria-hidden>📝</span>
                  <div>
                    <div className="small">{item.note}</div>
                    <div className="small muted">{item.author ?? ''} · {timeAgo(item.created_at)}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted small">{uz.alerts.noNotes}</p>
            )}
            <Textarea
              placeholder={uz.questions.notePlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div>
              <Button size="sm" onClick={() => void addNote()} disabled={busy || !note.trim()}>
                {uz.questions.addNote}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function QuestionsPage() {
  const [tab, setTab] = useState<TabKey>('unanswered')
  const [selected, setSelected] = useState<number | null>(null)
  const { data, loading, reload } = useApi<QueueResponse>('/questions?limit=200')

  const visible = (data?.questions ?? []).filter((q) => q.status === tab)

  return (
    <div className="stack">
      <div className="chip-group">
        {TABS.map((key) => (
          <button
            key={key}
            className={`chip ${tab === key ? 'chip--on' : ''}`}
            onClick={() => setTab(key)}
          >
            {uz.questions.tabs[key]} {data ? `(${data.counts[key]})` : ''}
          </button>
        ))}
      </div>

      <Card title={uz.questions.title} subtitle={data ? `${visible.length} ta` : undefined} flush>
        {loading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Empty icon="💬" title={uz.questions.empty} />
        ) : (
          visible.map((q) => (
            <div className="alert-row" key={q.id}>
              <span className={`alert-row__bar alert-row__bar--${PRIORITY_TONE[q.priority] === 'urgent' ? 'urgent' : 'warning'}`} aria-hidden />
              <div className="alert-row__body">
                <div className="row--between">
                  <div>
                    <div className="alert-row__title">{q.last_name} {q.first_name}</div>
                    <div className="alert-row__detail">{q.question}</div>
                  </div>
                  <Badge tone={PRIORITY_TONE[q.priority]}>{uz.questions.priorityLabel[q.priority]}</Badge>
                </div>
                <div className="alert-row__meta">
                  <span>🕒 {timeAgo(q.created_at)}</span>
                  <span>📌 {uz.questions.statusLabel[q.status]}</span>
                  <span>👤 {q.assigned_name ?? uz.app.notSpecified}</span>
                </div>
              </div>
              <Button size="sm" variant="primary" onClick={() => setSelected(q.id)}>
                {q.status === 'answered' || q.status === 'closed' ? uz.alerts.review : uz.questions.sendAnswer}
              </Button>
            </div>
          ))
        )}
      </Card>

      {selected ? (
        <QuestionDetail id={selected} onClose={() => setSelected(null)} onChanged={() => void reload()} />
      ) : null}
    </div>
  )
}