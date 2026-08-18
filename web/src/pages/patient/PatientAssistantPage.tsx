import { useState } from 'react'
import { uz } from '../../lib/uz'
import { api } from '../../lib/api'
import { useApi } from '../../lib/hooks'
import { Badge, Button, Card, Empty, Loading, Notice, Textarea } from '../../components/ui'
import type { AssistantAnswer, QuestionRecord } from '../../lib/types'
import { formatDateTime } from '../../lib/format'

const SUGGESTIONS = [uz.assistant.chips[0], uz.assistant.chips[1], uz.assistant.chips[2]]

function StatsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row--between">
      <span className="small muted">{label}</span>
      <span className="strong">{value}</span>
    </div>
  )
}

export function PatientAssistantPage() {
  const { data, loading, reload } = useApi<{ questions: QuestionRecord[] }>('/assistant/questions')
  const [text, setText] = useState('')
  const [result, setResult] = useState<AssistantAnswer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask(questionOverride?: string) {
    const question = (questionOverride ?? text).trim()
    if (!question || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await api.post<AssistantAnswer>('/assistant/ask', { question })
      setResult(response)
      setText('')
      void reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : uz.app.errorGeneric)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="content stack">
      <Card>
        <div className="stack--sm">
          <h1>{uz.assistant.title}</h1>
          <p className="muted small">{uz.assistant.subtitle}</p>

          <div className="stack--sm">
            {result ? (
              result.can_answer && result.answer ? (
                <div className="assistant-bubble assistant-bubble--answer">
                  <div className="small muted">{uz.assistant.answerTitle}</div>
                  <div className="strong">{result.answer}</div>

                  {result.stats ? (
                    <div className="assistant-stats">
                      <div className="small muted">{uz.assistant.statsTitle}:</div>
                      <StatsRow label={uz.assistant.count(result.stats.count)} value={`${result.stats.avg} ${result.stats.unit}`} />
                      <StatsRow label={uz.assistant.avg} value={`${result.stats.avg} ${result.stats.unit}`} />
                      <StatsRow label={uz.assistant.min} value={`${result.stats.min} ${result.stats.unit}`} />
                      <StatsRow label={uz.assistant.max} value={`${result.stats.max} ${result.stats.unit}`} />
                      {result.stats.change !== null && (
                        <StatsRow label={uz.assistant.change} value={`${result.stats.change} ${result.stats.unit}`} />
                      )}
                      {result.stats.in_range_pct !== null && (
                        <StatsRow label={uz.assistant.inRange} value={`${result.stats.in_range_pct}%`} />
                      )}
                    </div>
                  ) : null}

                  {result.ranges ? (
                    <div className="small muted">
                      {uz.assistant.range}: {result.ranges.low ?? '—'} – {result.ranges.high ?? '—'} {result.ranges.unit}
                    </div>
                  ) : null}

                  {result.sources && result.sources.length > 0 ? (
                    <div className="stack--sm">
                      <div className="small muted">{uz.assistant.sourcesTitle}:</div>
                      <div className="assistant-sources">
                        {result.sources.map((source) => (
                          <span className="badge" key={source.source_key}>{source.source_title}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="assistant-bubble assistant-bubble--refused">
                  <div className="strong">{uz.assistant.refusalTitle}</div>
                  <div>{result.answer}</div>
                  {result.priority === 'urgent' ? (
                    <Notice tone="warning">{uz.assistant.emergencyBody}</Notice>
                  ) : null}
                  <div className="small muted">{uz.assistant.answeredSoon}</div>
                </div>
              )
            ) : null}
          </div>

          <Textarea
            value={text}
            rows={3}
            placeholder={uz.assistant.placeholder}
            onChange={(e) => setText(e.target.value)}
          />

          {error ? <Notice tone="danger">{error}</Notice> : null}

          <div className="row--between">
            <div className="assistant-sources">
              <span className="small muted">{uz.assistant.askingHint}</span>
              {SUGGESTIONS.map((chip) => (
                <span
                  key={chip}
                  className="assistant-chip"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setText(chip)
                    void ask(chip)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setText(chip)
                      void ask(chip)
                    }
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
            <Button
              variant="primary"
              size="lg"
              disabled={busy || !text.trim()}
              onClick={() => void ask()}
            >
              {busy ? uz.assistant.sending : uz.assistant.send}
            </Button>
          </div>
        </div>
      </Card>

      <Card title={uz.assistant.historyTitle} flush>
        {loading ? (
          <Loading />
        ) : !data || data.questions.length === 0 ? (
          <Empty icon="💬" title={uz.assistant.emptyHistory} />
        ) : (
          <div className="stack--sm" style={{ gap: 12 }}>
            {data.questions.slice(0, 20).map((q) => {
              const answered = q.status === 'answered' || q.status === 'closed'
              return (
                <div key={q.id} className="question-bubble">
                  <div className="row--between">
                    <div className="strong">{q.question}</div>
                    <Badge tone={answered ? 'stable' : 'attention'}>
                      {answered ? uz.assistant.answeredAt : uz.assistant.awaiting}
                    </Badge>
                  </div>
                  {answered && q.answer ? (
                    <div className="small" style={{ marginTop: 6 }}>{q.answer}</div>
                  ) : null}
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {uz.assistant.askedAt}: {formatDateTime(q.created_at)}
                    {q.answered_at ? ` · ${uz.assistant.answeredAt}: ${formatDateTime(q.answered_at)}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}