import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../lib/hooks'
import { useLanguage } from '../lib/i18n'
import { formatDate, formatTime, todayKey } from '../lib/format'
import { uz } from '../lib/uz'
import type { Medication } from '../lib/types'
import { Button, ErrorState, Loading } from './ui'
import { Icon } from './Icon'
import './medication-calendar.css'

type View = 'day' | 'week' | 'month' | 'year'
type DoseState = 'taken' | 'unconfirmed' | 'waiting'
interface Dose { id: number | string; medication_id?: number; name: string; dose: string; unit: string; scheduled_at: string; status: string; taken_at?: string | null; snoozed_until?: string | null; projected?: boolean }
interface Response { plan: { id: number; version: number; start_date?: string | null; end_date?: string | null } | null; medications: Medication[]; history: Dose[]; coverage?: { from: string | null; to: string | null }; truncated?: boolean }
const date = (key: string) => new Date(`${key}T12:00:00Z`)
const key = (value: Date) => value.toISOString().slice(0, 10)
function shift(day: string, amount: number) { const value = date(day); value.setUTCDate(value.getUTCDate() + amount); return key(value) }
function days(from: string, to: string) { const result: string[] = []; for (let current = from; current <= to; current = shift(current, 1)) result.push(current); return result }
function windowFor(anchor: string, view: View) {
  const value = date(anchor), year = value.getUTCFullYear(), month = value.getUTCMonth()
  if (view === 'day') return { from: anchor, to: anchor }
  if (view === 'week') { const from = shift(anchor, -((value.getUTCDay() + 6) % 7)); return { from, to: shift(from, 6) } }
  if (view === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` }
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`, from = shift(first, -((date(first).getUTCDay() + 6) % 7))
  return { from, to: shift(from, 41) }
}
function move(anchor: string, view: View, direction: number) {
  const value = date(anchor)
  if (view === 'day' || view === 'week') return shift(anchor, direction * (view === 'week' ? 7 : 1))
  value.setUTCDate(1)
  if (view === 'month') value.setUTCMonth(value.getUTCMonth() + direction)
  else value.setUTCFullYear(value.getUTCFullYear() + direction)
  return key(value)
}
function doseState(dose: Dose): DoseState {
  if (dose.status === 'taken' || dose.status === 'done') return 'taken'
  if (dose.status === 'missed') return 'unconfirmed'
  if (dose.projected) return 'waiting'
  const timestamp = (dose.snoozed_until ?? dose.scheduled_at).replace(' ', 'T')
  const due = Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(timestamp) ? timestamp : `${timestamp}+05:00`)
  return due <= Date.now() ? 'unconfirmed' : 'waiting'
}
const months = { uz: ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'], ru: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'] }
const weekdays = { uz: ['Du','Se','Ch','Pa','Ju','Sh','Ya'], ru: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] }

export function MedicationCalendar() {
  const { t, locale } = useLanguage()
  const today = todayKey()
  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today)
  const [medicationId, setMedicationId] = useState('all')
  const range = windowFor(anchor, view)
  const { data, loading, error, reload } = useApi<Response>(`/me/medications?from=${range.from}&to=${range.to}`, [locale])
  const labels: Record<DoseState, string> = { taken: t('Qabul qilindi','Приём отмечен'), unconfirmed: t('Tasdiqlanmadi','Не подтверждено'), waiting: t('Kutilmoqda','Ожидается') }
  const byDay = useMemo(() => {
    const map = new Map<string, Dose[]>()
    const actual = data?.history ?? []
    const existing = new Set(actual.map(dose => `${dose.medication_id ?? dose.name}|${dose.scheduled_at.slice(0, 10)}|${formatTime(dose.scheduled_at)}`))
    const all = [...actual]
    if (data?.plan) for (const day of days(range.from > today ? range.from : today, range.to)) {
      if (data.plan.start_date && day < data.plan.start_date || data.plan.end_date && day > data.plan.end_date) continue
      for (const med of data.medications) {
        if (med.start_date && day < med.start_date || med.end_date && day > med.end_date || med.schedule_type === 'as_needed') continue
        for (const slot of med.schedules) {
          const scheduled = `${day}T${slot.time_of_day.slice(0, 5)}:00+05:00`, identity = `${med.id}|${day}|${slot.time_of_day.slice(0, 5)}`
          if (Date.parse(scheduled) <= Date.now() || existing.has(identity)) continue
          all.push({ id: `planned-${identity}`, medication_id: med.id, name: med.name, dose: med.dose, unit: med.unit, scheduled_at: scheduled, status: 'pending', projected: true })
        }
      }
    }
    for (const dose of all) {
      if (medicationId !== 'all' && String(dose.medication_id) !== medicationId) continue
      const day = dose.scheduled_at.slice(0, 10), items = map.get(day) ?? []
      items.push(dose); map.set(day, items)
    }
    for (const items of map.values()) items.sort((a,b) => a.scheduled_at.localeCompare(b.scheduled_at))
    return map
  }, [data, range.from, range.to, today, medicationId])
  const year = date(anchor).getUTCFullYear(), month = date(anchor).getUTCMonth()
  const selected = view === 'day' ? anchor : selectedDay >= range.from && selectedDay <= range.to ? selectedDay : anchor
  const entries = byDay.get(selected) ?? []
  const count = (state: DoseState) => [...byDay.values()].flat().filter(dose => doseState(dose) === state).length
  const heading = view === 'year' ? String(year) : view === 'day' ? formatDate(anchor) : view === 'week' ? `${formatDate(range.from)} — ${formatDate(range.to)}` : `${months[locale][month]} ${year}`
  function navigate(direction: number) { const next = move(anchor, view, direction); setAnchor(next); setSelectedDay(next) }
  function chooseDay(day: string) { setSelectedDay(day); if (view === 'day') setAnchor(day) }
  const marker = (state: DoseState, className = '') => <span className={`dose-circle dose-circle--${state} ${className}`} aria-hidden="true" />
  function dayCell(day: string, weekly = false) {
    const doses = byDay.get(day) ?? [], selected = day === selectedDay
    return <button type="button" key={day} className={`mc-day ${day === today ? 'is-today' : ''} ${selected ? 'is-selected' : ''} ${day.slice(0,7) !== anchor.slice(0,7) && !weekly ? 'is-outside' : ''}`} aria-label={`${formatDate(day)}: ${doses.length ? doses.map(dose => `${formatTime(dose.scheduled_at)} ${dose.name}, ${labels[doseState(dose)]}`).join('; ') : t('Qayd yo‘q','Нет записей')}`} aria-pressed={selected} onClick={() => chooseDay(day)}>
      <span className="mc-day__date">{weekly ? <span>{weekdays[locale][(date(day).getUTCDay()+6)%7]}</span> : null}{Number(day.slice(-2))}</span>
      <span className="mc-day__doses">{doses.slice(0,4).map(dose => <span className="mc-day__dose" key={dose.id}>{marker(doseState(dose))}<span>{formatTime(dose.scheduled_at)}</span></span>)}{doses.length > 4 ? <small>+{doses.length-4}</small> : null}</span>
    </button>
  }
  return <section className="medication-calendar" aria-label={t('Dori qabuli kalendari','Календарь приёма лекарств')}>
    <div className="mc-toolbar"><div className="mc-views" role="group" aria-label={t('Kalendar ko‘rinishi','Вид календаря')}>{(['day','week','month','year'] as View[]).map(mode => <button type="button" key={mode} aria-pressed={view === mode} onClick={() => { setView(mode); setAnchor(selectedDay) }}>{({day:t('Kun','День'),week:t('Hafta','Неделя'),month:t('Oy','Месяц'),year:t('Yil','Год')})[mode]}</button>)}</div><Button size="sm" onClick={() => { setAnchor(today); setSelectedDay(today) }}>{t('Bugun','Сегодня')}</Button></div>
    <div className="mc-navigation"><Button variant="ghost" className="icon-button" aria-label={t('Oldingi davr','Предыдущий период')} onClick={() => navigate(-1)}><Icon name="back" /></Button><h2 aria-live="polite">{heading}</h2><Button variant="ghost" className="icon-button" aria-label={t('Keyingi davr','Следующий период')} onClick={() => navigate(1)}><Icon name="arrow" /></Button></div>
    <div className="mc-legend">{(['taken','unconfirmed','waiting'] as DoseState[]).map(state => <span key={state}>{marker(state)}<span>{labels[state]}</span></span>)}</div>
    {data?.medications.length && data.medications.length > 1 ? <label className="mc-filter">{t('Dori','Лекарство')}<select value={medicationId} onChange={event => setMedicationId(event.target.value)}><option value="all">{t('Barcha dorilar','Все лекарства')}</option>{data.medications.map(med => <option key={med.id} value={med.id}>{med.name}</option>)}</select></label> : null}
    {loading ? <Loading /> : error ? <ErrorState message={error} retry={() => void reload()} /> : <>
      {view === 'month' ? <><div className="mc-weekdays">{weekdays[locale].map(day => <span key={day}>{day}</span>)}</div><div className="mc-month-grid">{days(range.from, range.to).map(day => dayCell(day))}</div></> : null}
      {view === 'week' ? <div className="mc-week-grid">{days(range.from, range.to).map(day => dayCell(day,true))}</div> : null}
      {view === 'year' ? <><p className="mc-year-note">{t('Oyga bosing. Har bir kichik doira — bir kunlik holat.','Нажмите на месяц. Маленький круг — итог за день.')}</p><div className="mc-year-grid">{months[locale].map((name,index) => {
        const first = `${year}-${String(index+1).padStart(2,'0')}-01`, last = key(new Date(Date.UTC(year,index+1,0,12))), leading = (date(first).getUTCDay()+6)%7
        return <button type="button" className="mc-mini-month" key={name} onClick={() => { setAnchor(first);setSelectedDay(first);setView('month') }} aria-label={`${name} ${year}`}><strong>{name}</strong><span className="mc-mini-weekdays">{weekdays[locale].map(day => <span key={day}>{day.slice(0,1)}</span>)}</span><span className="mc-mini-days">{Array.from({length:leading},(_,i)=><span key={`empty${i}`} />)}{days(first,last).map(day => { const doses=byDay.get(day)??[], states=doses.map(doseState); const state: DoseState|undefined = states.includes('unconfirmed') ? 'unconfirmed' : states.includes('waiting') ? 'waiting' : states.length ? 'taken' : undefined; return <span key={day} className={day===today?'is-today':''} aria-label={`${formatDate(day)}: ${state?labels[state]:t('Qayd yo‘q','Нет записей')}`}>{state?marker(state):null}<span>{Number(day.slice(-2))}</span></span>})}</span></button>
      })}</div></> : null}
      {view !== 'year' ? <section className="mc-agenda" aria-label={t('Tanlangan kun dorilari','Лекарства выбранного дня')}><div className="mc-agenda__heading"><div><span className="eyebrow">{selected===today?t('BUGUNGI QABULLAR','ПРИЁМЫ СЕГОДНЯ'):t('TANLANGAN KUN','ВЫБРАННЫЙ ДЕНЬ')}</span><h3>{formatDate(selected)}</h3></div><span>{t(`${entries.length} ta qabul`,`${entries.length} приёмов`)}</span></div>{entries.length ? <div className="mc-agenda__list">{entries.map(dose => <article className="mc-dose" key={dose.id}>{marker(doseState(dose),'dose-circle--large')}<span className="mc-dose__time">{formatTime(dose.scheduled_at)}</span><div><h4>{dose.name}</h4><p>{dose.dose} {uz.units[dose.unit as keyof typeof uz.units]??dose.unit}</p><span className={`mc-dose__status mc-dose__status--${doseState(dose)}`}>{labels[doseState(dose)]}{dose.taken_at?` · ${formatTime(dose.taken_at)}`:''}</span></div></article>)}</div> : <div className="mc-empty"><Icon name="calendar" size={28} /><p>{selected>today?t('Bu kun uchun dori belgilanmagan.','На этот день лекарства не назначены.'):t('Bu kunda qabul qaydi yo‘q.','За этот день записей о приёме нет.')}</p></div>}{selected===today ? <Link className="btn btn--primary" to="/bemor">{t('Bugungi rejadan qabulni qayd qilish','Отметить приём в плане на сегодня')}<Icon name="arrow" size={18}/></Link> : null}</section> : <div className="mc-totals">{(['taken','unconfirmed','waiting'] as DoseState[]).map(state=><span key={state}>{marker(state)}<strong>{count(state)}</strong>{labels[state]}</span>)}</div>}
      {data?.truncated ? <p className="mc-data-note">{t('Qaydlar juda ko‘p. To‘liq ko‘rish uchun hafta yoki oyga o‘ting.','Записей слишком много. Выберите неделю или месяц для полного просмотра.')}</p> : null}
      <p className="mc-data-note">{t('Qizil doira — qabul tasdiqlanmagan. Bu dori ichilmaganini anglatmaydi. Kelajakdagi oq doiralar amaldagi rejadan olingan.','Красный круг означает отсутствие подтверждения, а не доказанный пропуск. Будущие белые круги взяты из действующего плана.')}</p>
    </>}
    {data?.medications.length ? <details className="mc-prescriptions"><summary>{t('Amaldagi dorilar va ko‘rsatmalar','Действующие лекарства и указания')}<span>{data.medications.length}</span></summary><div>{data.medications.map(med=><article key={med.id}><h3>{med.name}</h3><p>{med.dose} {uz.units[med.unit as keyof typeof uz.units]??med.unit} · {med.schedules.map(slot=>slot.time_of_day.slice(0,5)).join(' · ')||t('Zaruratga ko‘ra','По необходимости')}</p>{med.notes?<p>{med.notes}</p>:null}</article>)}</div></details> : null}
  </section>
}
