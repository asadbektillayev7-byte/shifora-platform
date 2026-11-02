import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { uz } from '../../lib/uz'
import { useLanguage } from '../../lib/i18n'
import { api, ApiError } from '../../lib/api'
import { Button, Card, Modal, Notice, StatusBadge, Textarea } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { PatientSwitcher, useCaregiverPatient } from './CaregiverApp'
import '../patient/patient-redesign.css'

export function CaregiverHomePage() {
  const { t } = useLanguage()
  const { patient } = useCaregiverPatient()
  const [contactOpen, setContactOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setContactOpen(false); setMessage(''); setSent(false); setError(null) }, [patient.id])

  async function sendToNurse() {
    if (!message.trim() || busy) return
    setBusy(true); setError(null)
    try {
      await api.post(`/caregiver/patients/${patient.id}/contact-nurse`, { message: message.trim() })
      setContactOpen(false); setMessage(''); setSent(true)
    } catch (err) { setError(err instanceof ApiError ? err.message : uz.app.errorGeneric) }
    finally { setBusy(false) }
  }

  const today = patient.permissions.view_today_plan ? patient.today : null
  const missed = today?.missed ?? 0
  const urgent = patient.status === 'urgent'
  const allowed = Object.entries(patient.permissions).filter(([, value]) => value).map(([key]) => uz.permissions[key as keyof typeof uz.permissions]).filter(Boolean)

  return <div className="ph-page cg-page stack">
    <header className="ph-heading"><div><p className="ph-eyebrow">{t('Yaqin insoningizga yordam', 'Поддержка близкого')}</p><h1>{patient.first_name} {patient.last_name}</h1><p>{patient.relation ?? uz.roles.caregiverRole}</p></div><span className="ph-team-mark"><Icon name="users" size={27} /></span></header>
    <PatientSwitcher />
    {sent ? <div role="status"><Notice tone="success">{uz.caregiver.sent}</Notice></div> : null}
    <section className={`cg-next ${urgent || missed ? 'cg-next--attention' : ''}`}><div className="ph-next-label"><Icon name={urgent || missed ? 'clock' : 'check'} />{t('Hozir nima muhim', 'Что важно сейчас')}</div><div className="cg-status-row"><h2>{urgent ? t('Tibbiy jamoaga murojaat qiling', 'Свяжитесь с медицинской командой') : missed ? t('Tasdiqlanmagan qabulni tekshiring', 'Уточните неподтверждённый приём') : today?.complete ? t('Bugungi reja bajarilgan', 'План на сегодня выполнен') : t('Yaqiningiz bilan bog‘lanib turing', 'Оставайтесь на связи с близким')}</h2><StatusBadge status={patient.status} /></div><p>{urgent ? t('Holat kuzatuv jamoasi e’tiborini talab qiladi. Keskin yomonlashuvda 103 ga qo‘ng‘iroq qiling.', 'Состояние требует внимания команды. При резком ухудшении звоните 103.') : missed ? t('Qabul qilingani tizimda tasdiqlanmagan. Avval bemordan aniqlashtiring.', 'Приём не подтверждён в системе. Сначала уточните у пациента.') : t('Siz uning kundalik rejasiga rioya qilishiga yordam bera olasiz.', 'Вы можете помочь соблюдать ежедневный план.')}</p><div className="ph-task__actions"><a className="btn btn--primary btn--lg" href={`tel:${patient.phone}`}><Icon name="phone" />{t('Bemor bilan bog‘lanish', 'Позвонить пациенту')}</a><Button size="lg" onClick={() => setContactOpen(true)}><Icon name="message" />{uz.caregiver.contactNurse}</Button></div></section>
    <div className="cg-overview">
      {today ? <Card title={uz.caregiver.todayPlan}><div className="cg-plan-count"><strong>{today.medications_done}<span> / {today.medications_total}</span></strong><span>{t('dori qabuli tasdiqlangan', 'приёмов подтверждено')}</span></div><p className="ph-secondary">{today.complete ? uz.caregiver.planDone : uz.caregiver.planInProgress}{missed ? ` · ${missed} ${t('tasdiqlanmagan', 'не подтверждено')}` : ''}</p><Link to="/yaqin/parvarish" className="ph-text-link">{t('Bugungi rejani ko‘rish', 'Посмотреть план')}<Icon name="arrow" /></Link></Card> : <Card title={uz.caregiver.todayPlan}><p className="ph-secondary">{uz.caregiver.noAccess}</p></Card>}
      {patient.permissions.view_adherence && patient.adherence !== null ? <Card title={uz.caregiver.adherence7d}><div className="cg-plan-count"><strong>{patient.adherence}<span>%</span></strong><span>{t('jadval bo‘yicha tasdiqlangan', 'подтверждено по расписанию')}</span></div></Card> : null}
    </div>
    {patient.permissions.view_alerts && patient.open_alerts !== null && patient.open_alerts > 0 ? <Link to="/yaqin/ogohlantirishlar" className="cg-alert-link"><span><Icon name="bell" />{t('Ochiq ogohlantirishlar', 'Открытые оповещения')}<strong>{patient.open_alerts}</strong></span><Icon name="chevron" /></Link> : null}
    <details className="ph-disclosure"><summary><span><Icon name="shield" />{t('Sizga ochiq ma’lumotlar', 'Доступные вам данные')}</span><Icon name="chevron" /></summary><div className="ph-disclosure__body"><p>{uz.caregiver.accessNote}</p>{allowed.length ? <ul className="cg-permissions">{allowed.map(permission => <li key={permission}><Icon name="check" size={18} />{permission}</li>)}</ul> : <p>{uz.caregiver.noAccess}</p>}</div></details>
    <p className="ph-secondary">{uz.status.note}</p>
    {contactOpen ? <Modal title={uz.caregiver.contactNurseTitle} onClose={() => setContactOpen(false)} footer={<><Button onClick={() => setContactOpen(false)}>{uz.app.cancel}</Button><Button variant="primary" onClick={() => void sendToNurse()} disabled={busy || !message.trim()}>{busy ? uz.assistant.sending : uz.caregiver.send}</Button></>}><div className="stack">{error ? <Notice tone="danger">{error}</Notice> : null}<p>{t('Xabaringiz kuzatuv jamoasiga yuboriladi. Bu tez yordam kanali emas.', 'Сообщение поступит команде наблюдения. Это не канал экстренной помощи.')}</p><label className="field" htmlFor="caregiver-message"><span className="field__label">{uz.caregiver.messageLabel}</span><Textarea id="caregiver-message" rows={4} maxLength={2000} placeholder={uz.caregiver.messagePlaceholder} value={message} onChange={event => setMessage(event.target.value)} /></label></div></Modal> : null}
  </div>
}
