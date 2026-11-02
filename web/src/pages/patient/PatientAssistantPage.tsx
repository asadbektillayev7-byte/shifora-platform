import { useState } from 'react'
import { uz } from '../../lib/uz'
import { useLanguage } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useApi } from '../../lib/hooks'
import { Badge, Button, Card, Empty, ErrorState, Loading, Notice, Textarea } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { AssistantAnswer, QuestionRecord } from '../../lib/types'
import { formatDateTime } from '../../lib/format'
import './patient-redesign.css'

export function PatientAssistantPage() {
  const { t, locale } = useLanguage()
  const { data, loading, error: historyError, reload } = useApi<{ questions: QuestionRecord[] }>('/assistant/questions')
  const [text, setText] = useState('')
  const [result, setResult] = useState<AssistantAnswer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const examples = [t('Dori jadvali haqida savolim bor.', 'У меня вопрос о расписании лекарств.'), t('O‘lchov kiritishda yordam kerak.', 'Нужна помощь с записью измерения.')]

  async function ask() {
    const question = text.trim()
    if (!question || busy) return
    setBusy(true); setError(null); setResult(null)
    try {
      const response = await api.post<AssistantAnswer>('/assistant/ask', { question, staff_only: true, language: locale })
      setResult(response); setText(''); void reload()
    } catch (err) { setError(err instanceof Error ? err.message : uz.app.errorGeneric) }
    finally { setBusy(false) }
  }

  const questions = [...(data?.questions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return <div className="ph-page ph-team-page stack">
    <header className="ph-heading"><div><p className="ph-eyebrow">{t('Yolg‘iz emassiz', 'Вы не одни')}</p><h1>{t('Tibbiy jamoa', 'Медицинская команда')}</h1><p>{t('Savol bering va javoblarni shu yerda kuzating.', 'Задавайте вопросы и следите за ответами здесь.')}</p></div><span className="ph-team-mark"><Icon name="doctor" size={28} /></span></header>
    <Card>
      <form className="stack" onSubmit={event => { event.preventDefault(); void ask() }}>
        <div><h2>{t('Savolingizni yozing', 'Напишите свой вопрос')}</h2><p className="ph-secondary">{t('Xabaringiz tibbiy jamoa navbatiga tushadi. Bu tez yordam kanali emas.', 'Сообщение поступит в очередь медицинской команды. Это не канал экстренной помощи.')}</p></div>
        {result ? <div role="status">{result.queued ? <Notice tone="success"><strong>{t('Savolingiz yuborildi', 'Вопрос отправлен')}</strong><p>{t('Javob kelganda quyidagi suhbatda ko‘rinadi.', 'Ответ появится в истории ниже.')}</p></Notice> : <Notice tone="info"><strong>{t('Tizimdagi yozuvlar xulosasi', 'Сводка записей системы')}</strong><p>{result.answer}</p></Notice>}{result.priority === 'urgent' ? <Notice tone="danger">{uz.assistant.emergencyBody}</Notice> : null}</div> : null}
        <label className="field" htmlFor="patient-care-question"><span className="field__label">{t('Sizning savolingiz', 'Ваш вопрос')}</span><Textarea id="patient-care-question" value={text} rows={4} maxLength={2000} placeholder={t('Nima haqida so‘ramoqchisiz?', 'О чём вы хотите спросить?')} onChange={event => setText(event.target.value)} /></label>
        <div className="ph-question-examples">{examples.map(example => <button type="button" key={example} onClick={() => setText(example)}>{example}</button>)}</div>
        {error ? <ErrorState message={error} /> : null}
        <Button type="submit" variant="primary" size="lg" disabled={busy || !text.trim()}>{busy ? uz.assistant.sending : t('Jamoaga yuborish', 'Отправить команде')}<Icon name="arrow" /></Button>
      </form>
    </Card>
    <section className="ph-question-history" aria-labelledby="question-history-title"><div className="ph-section-head"><h2 id="question-history-title">{t('Savollar va javoblar', 'Вопросы и ответы')}</h2><Button variant="ghost" size="sm" onClick={() => void reload()} disabled={loading}>{t('Yangilash', 'Обновить')}</Button></div>
      {loading && !data ? <Loading /> : historyError ? <ErrorState message={historyError} retry={() => void reload()} /> : questions.length === 0 ? <Card><Empty icon="message" title={t('Hali savollar yo‘q', 'Вопросов пока нет')}>{t('Birinchi savolingizni yuqorida yozing.', 'Напишите первый вопрос выше.')}</Empty></Card> : <div className="stack">{questions.slice(0, 20).map(question => {
        const answered = Boolean(question.answer)
        const human = Boolean(question.answered_by) || question.answer_source === 'hospital_staff_answer'
        return <article key={question.id} className="ph-conversation"><div className="ph-conversation__meta"><span>{formatDateTime(question.created_at)}</span><Badge tone={answered ? 'stable' : question.status === 'closed' ? 'neutral' : 'attention'}>{uz.questions.statusLabel[question.status]}</Badge></div><div className="ph-conversation__question"><span className="ph-message-author">{t('Siz', 'Вы')}</span><p>{question.question}</p></div>{answered ? <div className="ph-conversation__answer"><span className="ph-message-author"><Icon name={human ? 'doctor' : 'file'} size={19} />{human ? question.answered_by_name ?? t('Tibbiy jamoa', 'Медицинская команда') : t('Tizimdagi yozuvlar xulosasi', 'Сводка записей системы')}</span><p>{question.answer}</p>{question.answered_at ? <time>{formatDateTime(question.answered_at)}</time> : null}</div> : <p className="ph-awaiting"><Icon name="clock" size={18} />{question.status === 'closed' ? t('Savol yopilgan', 'Вопрос закрыт') : question.assigned_name ? t(`${question.assigned_name} ko‘rib chiqmoqda`, `На рассмотрении: ${question.assigned_name}`) : t('Tibbiy jamoa javobi kutilmoqda', 'Ожидает ответа медицинской команды')}</p>}</article>
      })}</div>}
    </section>
    <aside className="ph-emergency"><Icon name="phone" size={22} /><p>{t('Keskin yomonlashuvda javob kutmang.', 'При резком ухудшении не ждите ответа.')} <a href="tel:103">{t('103 — tez yordam', '103 — скорая помощь')}</a></p></aside>
  </div>
}
