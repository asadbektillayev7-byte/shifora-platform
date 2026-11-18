import { uz } from './uz'
import { ru } from './ru'
import { en } from './en'

export type Locale = 'uz' | 'ru' | 'en'
export type Dict = typeof uz
export type PageKey = 'home' | 'platform' | 'safety' | 'pilot'

export const locales: Locale[] = ['uz', 'ru', 'en']
export const dicts: Record<Locale, Dict> = { uz, ru, en }

/** Localised path for a page. The default locale (uz) has no prefix. */
export function pathFor(locale: Locale, page: PageKey): string {
  const slug = dicts[locale].routes[page]
  const prefix = locale === 'uz' ? '' : `/${locale}`
  const path = `${prefix}${slug}`
  return path === '' ? '/' : path.replace(/\/{2,}/g, '/')
}

/** Turns the light markup used in copy into HTML: *emphasis* and [n] footnote refs. */
export function rich(text: string): string {
  return text
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[(\d+)\]/g, '<a class="fn" href="#src-$1">$1</a>')
}
