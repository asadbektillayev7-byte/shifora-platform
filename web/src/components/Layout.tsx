import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { uz } from '../lib/uz'
import { useAuth } from '../lib/auth'
import { useNotifications } from '../lib/hooks'
import { Button, Modal } from './ui'
import { timeAgo } from '../lib/format'
import { Icon, Brand } from './Icon'
import { LanguageSwitch, useLanguage } from '../lib/i18n'
import { tokenStore } from '../lib/api'
import { isDemoToken } from '../lib/demo'

interface NavItem { to: string; label: string; icon: string; badge?: number }

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { items, unread, markAllRead } = useNotifications(true)
  return <>
    <Button variant="ghost" className="notification-bell" onClick={() => setOpen(true)} aria-label={uz.notifications.title}>
      <Icon name="bell" />{unread > 0 ? <span className="notification-count">{unread}</span> : null}
    </Button>
    {open ? <Modal title={uz.notifications.title} onClose={() => setOpen(false)} footer={<><Button onClick={() => void markAllRead()} disabled={!unread}>{uz.notifications.markAllRead}</Button><Button variant="primary" onClick={() => setOpen(false)}>{uz.app.close}</Button></>}>
      {items.length ? <div className="notification-list">{items.slice(0, 20).map(item => <article className={`notification-item ${item.read_at ? 'is-read' : ''}`} key={item.id}>
        <span className="notification-item__icon"><Icon name={item.type.includes('alert') ? 'warning' : 'pill'} /></span>
        <div><strong>{item.title}</strong><p>{item.body}</p><span className="small muted">{timeAgo(item.created_at)}</span></div>
      </article>)}</div> : <p>{uz.notifications.empty}</p>}
    </Modal> : null}
  </>
}

export function DemoBar() {
  const { session, demo } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  if (!isDemoToken(tokenStore.get())) return null
  return <div className="demo-bar">
    <span><span className="demo-dot" /><strong>{t('Namuna klinika', 'Демо-клиника')}</strong><span className="demo-bar__explanation"> · {t('Barcha bemorlar va retseptlar uydirma', 'Все пациенты и назначения вымышлены')}</span></span>
    <label className="demo-role">{t('Ko‘rinish', 'Роль')}
      <select value={session?.user.role} onChange={event => {
        const role = event.target.value
        demo(role === 'patient' ? 'patient' : role === 'caregiver' ? 'caregiver' : 'hospital', role === 'doctor' ? 'doctor' : 'nurse')
        navigate(role === 'patient' ? '/bemor' : role === 'caregiver' ? '/yaqin' : '/shifoxona')
      }} aria-label={t('Namuna rolini tanlash', 'Выбрать демо-роль')}>
        <option value="nurse">{uz.roles.nurse}</option><option value="doctor">{uz.roles.doctor}</option>
        <option value="patient">{uz.roles.patient}</option><option value="caregiver">{t('Yaqin kishi', 'Близкий')}</option>
      </select>
    </label>
  </div>
}

export function SidebarLayout({ items, title, subtitle, actions, children }: {
  items: NavItem[]; title: string; subtitle?: string; actions?: ReactNode; children: ReactNode
}) {
  const { session, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [menuOpen])
  const roleLabel = session ? uz.roles[session.user.role as keyof typeof uz.roles] : ''
  return <div className="shell">
    {menuOpen ? <button className="sidebar-scrim" aria-label={uz.app.close} onClick={() => setMenuOpen(false)} /> : null}
    <aside id="primary-navigation" className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
      <Link className="sidebar__brand" to="/shifoxona" aria-label="Shifora"><Brand /><span className="sidebar__tagline">{t('Birgalikda, yaxshiroq parvarish.', 'Вместе — забота лучше.')}</span></Link>
      <div className="sidebar__section-label">{t('ISH JOYI', 'РАБОЧЕЕ ПРОСТРАНСТВО')}</div>
      <nav className="sidebar__nav" aria-label={t('Asosiy bo‘limlar', 'Главные разделы')}>
        {items.map(item => <NavLink key={item.to} to={item.to} end={item.to.split('/').length <= 2} className={({ isActive }) => `navlink ${isActive ? 'navlink--active' : ''}`}>
          <Icon name={item.icon} /><span>{item.label}</span>{item.badge ? <span className="navlink__badge">{item.badge}</span> : null}
        </NavLink>)}
      </nav>
      <div className="sidebar__help"><Icon name="shield" size={20} /><div><strong>{t('Parvarish davom etadi', 'Забота продолжается')}</strong><span>{t('Bemor, yaqin kishi va tibbiy jamoa.', 'Пациент, близкие и медицинская команда.')}</span></div></div>
      <div className="sidebar__user"><span className="avatar">{session?.user.full_name.split(' ').slice(0, 2).map(word => word[0]).join('')}</span><div><strong>{session?.user.full_name}</strong><span>{roleLabel}</span></div><Button variant="ghost" className="icon-button" onClick={async () => { await logout(); navigate('/') }} aria-label={uz.app.logout}><Icon name="logout" size={19} /></Button></div>
    </aside>
    <div className="main">
      <header className="topbar">
        <div className="topbar__identity"><Button className="mobile-menu icon-button" variant="ghost" aria-label={t('Menyuni ochish', 'Открыть меню')} aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} /></Button><div><div className="topbar__title">{title}</div>{subtitle ? <div className="topbar__sub">{subtitle}</div> : null}</div></div>
        <div className="topbar__actions"><LanguageSwitch />{actions}<NotificationBell /></div>
      </header>
      <DemoBar />
      <main id="main-content" className="content">{children}</main>
    </div>
  </div>
}

export function PatientLayout({ items, children }: { items: NavItem[]; children: ReactNode }) {
  const { session, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const patient = session?.user.role === 'patient'
  return <div className="patient-app">
    <header className="patient-topbar"><Link to={patient ? '/bemor' : '/yaqin'} aria-label="Shifora"><Brand compact /></Link><div className="row"><LanguageSwitch />{patient ? <Link className="profile-link" to="/bemor/profil" aria-label={uz.nav.patient.profile}><Icon name="user" /></Link> : <Button variant="ghost" className="icon-button" onClick={async () => { await logout(); navigate('/') }} aria-label={uz.app.logout}><Icon name="logout" /></Button>}</div></header>
    <DemoBar />
    <main className="patient-main">{children}</main>
    <nav className="tabbar" aria-label={t('Asosiy bo‘limlar', 'Главные разделы')}>
      {items.map(item => <NavLink key={item.to} to={item.to} end={item.to.split('/').length <= 2} className={({ isActive }) => `tabbar__item ${isActive ? 'tabbar__item--active' : ''}`}><Icon name={item.icon} size={23} /><span>{item.label}</span>{item.badge ? <span className="tabbar__dot">{item.badge}</span> : null}</NavLink>)}
    </nav>
  </div>
}
