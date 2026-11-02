import { uz } from './uz'
import { getLocale } from './language'

function parse(value?: string | null): Date | null {
  if (!value) return null
  let normalized = value.trim().replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized += 'T12:00:00+05:00'
  else if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) normalized += '+05:00'
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}
const language = () => getLocale() === 'ru' ? 'ru-RU' : 'uz-UZ'
const months = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
}
const weekdays = { uz: ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'], ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'] }
const tashkent = (date: Date) => new Date(date.getTime() + 5 * 60 * 60 * 1000)
export function formatDate(value?: string | null): string {
  const date = parse(value)
  if (!date) return '—'
  const local = tashkent(date)
  return `${local.getUTCDate()} ${months[getLocale()][local.getUTCMonth()]} ${local.getUTCFullYear()}`
}
export function formatTime(value?: string | null): string {
  const date = parse(value)
  return date ? new Intl.DateTimeFormat(language(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Tashkent' }).format(date) : '—'
}
export function formatDateTime(value?: string | null): string { return parse(value) ? `${formatDate(value)}, ${formatTime(value)}` : '—' }
export function timeAgo(value?: string | null): string {
  const date = parse(value)
  if (!date) return uz.patients.noData
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  const ru = getLocale() === 'ru'
  if (minutes < 1) return ru ? 'сейчас' : 'hozir'
  if (minutes < 60) return ru ? `${minutes} мин. назад` : `${minutes} daqiqa oldin`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return ru ? `${hours} ч. назад` : `${hours} soat oldin`
  const days = Math.floor(hours / 24)
  if (days === 1) return ru ? 'вчера' : 'kecha'
  return days < 30 ? (ru ? `${days} дн. назад` : `${days} kun oldin`) : formatDate(value)
}
export function todayLabel(): string {
  const date = tashkent(new Date()), locale = getLocale()
  return `${date.getUTCDate()} ${months[locale][date.getUTCMonth()]}, ${weekdays[locale][date.getUTCDay()]}`
}
export function initials(firstName: string, lastName: string): string { return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() }
export function fullName(person: { first_name: string; last_name: string }): string { return `${person.last_name} ${person.first_name}` }
export function todayKey(): string { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tashkent' }).format(new Date()) }
export function nowInputValue(): string { return `${todayKey()}T${formatTime(new Date().toISOString())}` }
export function adherenceTone(rate: number | null): 'good' | 'mid' | 'low' { return rate === null ? 'mid' : rate >= 85 ? 'good' : rate >= 60 ? 'mid' : 'low' }
