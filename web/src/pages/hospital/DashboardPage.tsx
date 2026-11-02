import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { uz } from '../../lib/uz'
import { useAuth } from '../../lib/auth'
import { useLanguage } from '../../lib/i18n'
import { useApi } from '../../lib/hooks'
import { isDemoMode } from '../../lib/demo'
import { Button, ErrorState, Loading, Modal, SeverityBadge } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { AlertItem, PatientListItem, QuestionRecord, User } from '../../lib/types'
import { initials, timeAgo, todayLabel } from '../../lib/format'

interface Stats { total: number; stable: number; attention: number; urgent: number; open_alerts: number }
interface Team { nurse: User; doctor: User; capacity: number; active_patients: number }
interface WorkItem { id: string; patient_id: number; name: string; kind: 'alert' | 'question'; title: string; detail: string; time: string; owner: string | null; severity: 'info' | 'warning' | 'urgent'; rawId: number }

export function DashboardPage() {
  const { session } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [capacityOpen, setCapacityOpen] = useState(false)
  const { data: stats, loading, error, reload } = useApi<Stats>('/patients/stats')
  const { data: alerts } = useApi<{ alerts: AlertItem[] }>('/alerts?status=open&limit=12')
  const { data: questions } = useApi<{ questions: QuestionRecord[] }>('/questions?status=unanswered&limit=8')
  const { data: patients } = useApi<{ patients: PatientListItem[] }>('/patients')
  const { data: team } = useApi<Team>(isDemoMode() ? '/team' : null)
  if (error) return <ErrorState message={error} retry={() => void reload()} />
  if (loading || !stats) return <Loading />
  const work: WorkItem[] = [
    ...(alerts?.alerts ?? []).map(a => ({ id: `a${a.id}`, rawId: a.id, patient_id: a.patient_id, name: `${a.first_name} ${a.last_name}`, kind: 'alert' as const, title: a.title, detail: a.detail, time: a.created_at, owner: a.assigned_name, severity: a.severity })),
    ...(questions?.questions ?? []).map(q => ({ id: `q${q.id}`, rawId: q.id, patient_id: q.patient_id, name: `${q.first_name} ${q.last_name}`, kind: 'question' as const, title: t('Bemor xabari', 'Сообщение пациента'), detail: q.question, time: q.created_at, owner: q.assigned_name ?? null, severity: q.priority === 'urgent' ? 'urgent' as const : 'info' as const })),
  ].sort((a, b) => ['urgent', 'warning', 'info'].indexOf(a.severity) - ['urgent', 'warning', 'info'].indexOf(b.severity) || a.time.localeCompare(b.time))
  const visible = work.filter(item => filter === 'all' || item.kind === filter)
  const active = visible.find(item => item.id === selected) ?? visible[0]
  const person = patients?.patients.find(patient => patient.id === active?.patient_id)
  const date = todayLabel()
  const open = (item: WorkItem) => navigate(item.kind === 'alert' ? `/shifoxona/ogohlantirishlar?alert=${item.rawId}` : `/shifoxona/savollar?question=${item.rawId}`)
  return <div className="dashboard stack">
    <div className="page-heading"><div><div className="eyebrow">{date}</div><h1>{t('Bugungi kuzatuv', 'Наблюдение сегодня')}</h1><p>{t('Salom', 'Здравствуйте')}, {session?.user.full_name.split(' · ')[0]}. {t('Avval e’tibor talab qilayotgan bemorlar.', 'Сначала — пациенты, которым нужно внимание.')}</p></div><Link className="btn btn--primary" to="/shifoxona/royxat"><Icon name="plus" />{t('Bemor qo‘shish', 'Добавить пациента')}</Link></div>
    <div className="overview-strip">
      <Link to="/shifoxona/bemorlar" className="overview-stat"><span className="overview-stat__icon"><Icon name="users" size={23} /></span><div><span>{t('Kuzatuvdagi bemorlar', 'Пациенты под наблюдением')}</span><strong>{stats.total}<small>{t('bemor', 'пациентов')}</small></strong></div><Icon name="external" size={18} /></Link>
      <Link to="/shifoxona/ogohlantirishlar" className="overview-stat"><span className="overview-stat__icon overview-stat__icon--yellow"><Icon name="warning" size={23} /></span><div><span>{t('Ko‘rib chiqish kerak', 'Требуют внимания')}</span><strong>{stats.open_alerts}<small>{t('ochiq holat', 'открытых случаев')}</small></strong></div><Icon name="external" size={18} /></Link>
      <Link to="/shifoxona/savollar" className="overview-stat"><span className="overview-stat__icon"><Icon name="message" size={23} /></span><div><span>{t('Javob kutilmoqda', 'Ожидают ответа')}</span><strong>{questions?.questions.length ?? 0}<small>{t('murojaat', 'сообщений')}</small></strong></div><Icon name="external" size={18} /></Link>
    </div>
    <div className="dashboard-grid">
      <section className="worklist" aria-label={t('Bemorlar bo‘yicha ish navbati', 'Очередь работы с пациентами')}>
        <div className="worklist__head"><div><h2>{t('E’tibor markazida', 'В центре внимания')}</h2><p>{t('Holat, oxirgi qayd va keyingi qadam bir joyda.', 'Состояние, последняя запись и следующий шаг.')}</p></div><Link to="/shifoxona/bemorlar">{t('Barcha bemorlar', 'Все пациенты')}<Icon name="arrow" size={16} /></Link></div>
        <div className="worklist__filters" role="group" aria-label={t('Navbatni saralash', 'Фильтр очереди')}>
          {['all', 'alert', 'question'].map(value => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => { setFilter(value); setSelected(null) }}>{value === 'all' ? t('Hammasi', 'Все') : value === 'alert' ? t('Ogohlantirishlar', 'Уведомления') : t('Murojaatlar', 'Сообщения')}{value === 'all' ? <span>{work.length}</span> : null}</button>)}
        </div>
        <div className="worklist__columns"><span>{t('Bemor / oxirgi qayd', 'Пациент / последняя запись')}</span><span>{t('E’tibor sababi', 'Причина обращения')}</span><span>{uz.status.label}</span></div>
        {visible.length ? visible.slice(0, 8).map(item => {
          const patient = patients?.patients.find(p => p.id === item.patient_id)
          return <button type="button" key={item.id} className={`work-row ${active?.id === item.id ? 'is-selected' : ''}`} onClick={() => setSelected(item.id)} aria-pressed={active?.id === item.id}>
            <span className="work-row__person"><span className={`avatar ${item.severity === 'warning' ? 'avatar--yellow' : ''}`}>{initials(item.name.split(' ')[0], item.name.split(' ')[1])}</span><span><strong>{item.name}</strong><small>{patient?.last_glucose ? `${patient.last_glucose.value} mg/dL · ${timeAgo(patient.last_glucose.measured_at)}` : t('Yangi o‘lchov yo‘q', 'Нет нового измерения')}</small></span></span>
            <span className="work-row__reason"><strong>{item.title}</strong><small>{timeAgo(item.time)}</small></span><SeverityBadge severity={item.severity} />
          </button>
        }) : <div className="worklist__empty"><Icon name="checks" size={30} /><h3>{t('Ochiq vazifalar yo‘q', 'Открытых задач нет')}</h3><p>{t('Barcha murojaatlar ko‘rib chiqilgan.', 'Все обращения рассмотрены.')}</p></div>}
        <div className="worklist__foot"><span><span className="status-dot" />{t('Muhim holatlar navbat boshida', 'Приоритетные случаи — в начале очереди')}</span><Link to="/shifoxona/ogohlantirishlar">{t('Navbatni ochish', 'Открыть очередь')}<Icon name="arrow" size={16} /></Link></div>
      </section>
      <aside className="dashboard-aside">
        {active ? <section className="patient-preview" aria-label={t('Tanlangan bemor', 'Выбранный пациент')}><div className="patient-preview__top"><span className="avatar avatar--large">{initials(active.name.split(' ')[0], active.name.split(' ')[1])}</span><div><h2>{active.name}</h2><span>{t('Uyda kuzatuv', 'Наблюдение на дому')}</span></div></div><div className="eyebrow">{t('KEYINGI QADAM', 'СЛЕДУЮЩИЙ ШАГ')}</div><h3>{active.title}</h3><p className="patient-preview__detail">{active.detail}</p><dl><div><dt>{t('Oxirgi glyukoza', 'Последняя глюкоза')}</dt><dd>{person?.last_glucose ? `${person.last_glucose.value} mg/dL` : '—'}</dd></div><div><dt>{t('Mas’ul', 'Ответственный')}</dt><dd>{active.owner ?? t('Biriktirilmagan', 'Не назначен')}</dd></div><div><dt>{t('Kelgan vaqt', 'Поступило')}</dt><dd>{timeAgo(active.time)}</dd></div></dl><Button variant="primary" block onClick={() => open(active)}>{active.kind === 'question' ? t('Javob berish', 'Ответить') : t('Ko‘rib chiqish', 'Рассмотреть')}<Icon name="arrow" size={18} /></Button><Link className="patient-preview__link" to={`/shifoxona/bemorlar/${active.patient_id}`}>{t('Bemor kartasi va dori jadvali', 'Карта пациента и приём лекарств')}<Icon name="chevron" size={16} /></Link></section> : null}
        {team ? <section className="capacity-card"><div className="capacity-card__top"><Icon name="users" /><span>{t('Kuzatuv jamoasi', 'Команда наблюдения')}</span><button type="button" onClick={() => setCapacityOpen(true)} aria-label={t('Pilot yuklamasi haqida', 'О пилотной нагрузке')}><Icon name="info" size={18} /></button></div><div className="capacity-card__value"><strong>{team.active_patients}</strong><span>/ {team.capacity}</span><small>{t('pilot paneli', 'пилотная группа')}</small></div><div className="capacity-track"><span style={{ width: `${Math.min(team.active_patients / team.capacity * 100, 100)}%` }} /></div><p>{t('Bir hamshira va bir shifokor — shu bemorlar uchun.', 'Одна медсестра и один врач — для этой группы.')}</p><div className="capacity-person"><Icon name="user" size={18} /><span>{team.nurse.full_name.split(' · ')[0]}<small>{uz.roles.nurse}</small></span></div><div className="capacity-person"><Icon name="doctor" size={18} /><span>{team.doctor.full_name.split(' · ')[0]}<small>{uz.roles.doctor}</small></span></div><div className="capacity-hours"><Icon name="clock" size={16} />{t('Namuna ish vaqti: Du–Ju, 09:00–18:00', 'Пример графика: Пн–Пт, 09:00–18:00')}</div></section> : <Link to="/shifoxona/dorilar" className="capacity-card"><Icon name="pill" /><h3>{t('Dori kutubxonasi', 'Библиотека лекарств')}</h3><p>{t('Retsept tuzish uchun dori qo‘shing.', 'Добавляйте лекарства для назначения.')}</p></Link>}
      </aside>
    </div>
    {capacityOpen ? <Modal title={t('Pilot kuzatuv yuklamasi', 'Нагрузка пилотной команды')} onClose={() => setCapacityOpen(false)} footer={<Button variant="primary" onClick={() => setCapacityOpen(false)}>{t('Tushunarli', 'Понятно')}</Button>}><div className="stack"><h3>{t('40 bemor — bitta umumiy panel', '40 пациентов — одна общая группа')}</h3><p>{t('Bu Shifora piloti uchun boshlang‘ich ish yuklamasi. Global klinik me’yor emas. Hamshira kundalik kuzatuvni olib boradi; shifokor ayni bemorlarning klinik qarorlarini ko‘rib chiqadi.', 'Это начальная рабочая нагрузка пилота Shifora, а не универсальная клиническая норма. Медсестра ведёт ежедневное наблюдение, врач принимает клинические решения по тем же пациентам.')}</p><p>{t('Hisob: ish kunida 300 daqiqa ajratilgan vaqt. 80 daqiqa qaydlar, 80 daqiqa bog‘lanish, 20 daqiqa yetishmayotgan qaydlar, 30 daqiqa yangi bemor, 30 daqiqa hujjat va 60 daqiqa zaxira.', 'Расчёт: 300 выделенных минут в рабочий день. 80 на записи, 80 на связь, 20 на пропущенные записи, 30 на нового пациента, 30 на документацию и 60 в резерве.')}</p><p>{t('Vaqtlar taxminiy. Murakkab holatlar, ko‘p ogohlantirish yoki xodim yo‘qligida panel kamaytiriladi. Shifokor va o‘rinbosar uchun alohida vaqt kerak.', 'Время предположительное. При сложных случаях, большом числе уведомлений или отсутствии сотрудника группа уменьшается. Врачу и замещающему сотруднику нужно отдельное время.')}</p><a href="https://www.who.int/tools/wisn" target="_blank" rel="noreferrer">{t('WHO WISN: ish yuklamasi bo‘yicha xodimlar hisob-kitobi', 'ВОЗ WISN: расчёт персонала по рабочей нагрузке')}<Icon name="external" size={16} /></a></div></Modal> : null}
  </div>
}
