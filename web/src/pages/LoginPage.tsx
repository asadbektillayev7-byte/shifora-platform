import { useState } from 'react'
import { useAuth } from '../lib/auth'
import type { RoleGroup } from '../lib/auth'
import { ApiError } from '../lib/api'
import { Button, Field, Input, Notice } from '../components/ui'
import { Brand, Icon } from '../components/Icon'
import { LanguageSwitch, useLanguage } from '../lib/i18n'
import { uz } from '../lib/uz'

export function LoginPage() {
  const { login, demo } = useAuth()
  const { t } = useLanguage()
  const [group, setGroup] = useState<RoleGroup>('hospital')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const roles: { key: RoleGroup; label: string; icon: string }[] = [
    { key: 'hospital', label: t('Tibbiy jamoa', 'Медицинская команда'), icon: 'doctor' },
    { key: 'patient', label: uz.roles.patient, icon: 'user' },
    { key: 'caregiver', label: t('Yaqin kishi', 'Близкий'), icon: 'users' },
  ]
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try { await login(phone.trim(), password, group) }
    catch (err) { setError(err instanceof ApiError ? err.message : uz.app.errorGeneric) }
    finally { setBusy(false) }
  }
  return <div className="login-page">
    <header className="login-page__header"><Brand /><LanguageSwitch /></header>
    <div className="login-page__main">
      <section className="login-story"><div className="eyebrow">SHIFORA CARE</div><h1>{t('Parvarish uyingizda ham davom etadi.', 'Забота продолжается и дома.')}</h1><p>{t('Siz, yaqinlaringiz va tibbiy jamoangiz. Bitta aniq reja atrofida.', 'Вы, ваши близкие и медицинская команда. Вместе, с понятным планом.')}</p><div className="login-story__illustration"><span className="login-cross" aria-hidden="true" /><div className="login-story__schedule"><span className="login-story__schedule-time">08:00</span><span><Icon name="checks" size={18} />{t('Ertalabki qayd saqlandi', 'Утренняя запись сохранена')}</span></div><div className="login-story__people"><span className="avatar">DR</span><div><strong>{t('Tibbiy jamoa yoningizda', 'Медицинская команда рядом')}</strong><span>{t('Kundalik kuzatuv va qo‘llab-quvvatlash', 'Ежедневное наблюдение и поддержка')}</span></div></div></div><span className="login-story__bottom"><Icon name="shield" size={18} />{t('Sodda qadamlar. Birgalikdagi parvarish.', 'Простые шаги. Совместная забота.')}</span></section>
      <section className="login-form"><div className="eyebrow">{t('XUSH KELIBSIZ', 'ДОБРО ПОЖАЛОВАТЬ')}</div><h2>{t('Kuningizni birga boshlaymiz.', 'Начнём день вместе.')}</h2><p>{t('O‘z bo‘limingizni tanlang va tizimga kiring.', 'Выберите свою роль и войдите в систему.')}</p><div className="login-roles" role="group" aria-label={uz.login.chooseRole}>{roles.map(role => <button type="button" key={role.key} className={group === role.key ? 'is-selected' : ''} aria-pressed={group === role.key} onClick={() => { setGroup(role.key); setError(null) }}><Icon name={role.icon} /><span>{role.label}</span></button>)}</div>
        <form className="stack" onSubmit={submit}>{error ? <Notice tone="danger">{error}</Notice> : null}<Field label={uz.login.phone} required><div className="phone-input"><span>+998</span><Input aria-label={uz.login.phone} type="tel" autoComplete="username" inputMode="tel" required value={phone} onChange={event => setPhone(event.target.value)} placeholder="90 123 45 67" /></div></Field><Field label={uz.login.password} required><Input type="password" autoComplete="current-password" required minLength={1} value={password} onChange={event => setPassword(event.target.value)} placeholder={uz.login.passwordPlaceholder} /></Field><Button variant="primary" size="lg" block type="submit" disabled={busy}>{busy ? uz.login.submitting : uz.login.submit}<Icon name="arrow" size={20} /></Button></form>
        <div className="login-demo"><div><strong>{t('Avval sinab ko‘ring', 'Сначала попробуйте')}</strong><p>{t('40 uydirma bemor bilan to‘liq namuna klinika.', 'Демо-клиника с 40 вымышленными пациентами.')}</p></div><Button variant="secondary" block onClick={() => demo(group, 'nurse')}>{t('Namuna tizimni ochish', 'Открыть демо')}<Icon name="arrow" size={18} /></Button></div><p className="login-form__note">{t('Namunadagi retseptlar haqiqiy davolash uchun emas.', 'Назначения в демо не предназначены для лечения.')}</p>
      </section>
    </div>
    <footer className="login-page__footer"><span>© {new Date().getFullYear()} Shifora</span><span>{t('Bemor · Yaqin kishi · Tibbiy jamoa', 'Пациент · Близкий · Медицинская команда')}</span></footer>
  </div>
}
