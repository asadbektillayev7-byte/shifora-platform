import { useSyncExternalStore } from 'react'
import { getLocale, setLocale, subscribeLanguage } from './language'

export function useLanguage() {
  const locale = useSyncExternalStore(subscribeLanguage, getLocale, () => 'uz' as const)
  return { locale, setLocale, t: (uz: string, ru: string) => locale === 'ru' ? ru : uz }
}

export function LanguageSwitch() {
  const { locale, setLocale } = useLanguage()
  return <div className="language-switch" role="group" aria-label={locale === 'ru' ? 'Язык интерфейса' : 'Interfeys tili'}>
    <button type="button" lang="uz" aria-pressed={locale === 'uz'} onClick={() => setLocale('uz')}>O‘zbek</button>
    <button type="button" lang="ru" aria-pressed={locale === 'ru'} onClick={() => setLocale('ru')}>Русский</button>
  </div>
}
