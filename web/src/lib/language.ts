export type Locale = 'uz' | 'ru'

const KEY = 'shifora.language'
let locale: Locale = typeof window !== 'undefined' && localStorage.getItem(KEY) === 'ru' ? 'ru' : 'uz'
const listeners = new Set<() => void>()

export const getLocale = () => locale
export function setLocale(next: Locale) {
  if (next === locale) return
  locale = next
  localStorage.setItem(KEY, next)
  document.documentElement.lang = next
  listeners.forEach(listener => listener())
}
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

document.documentElement.lang = locale
