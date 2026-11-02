import { useLanguage } from '../../lib/i18n'
import { useApi } from '../../lib/hooks'
import type { Priority } from '../../lib/types'
import { Button, Field, Input, Select, Textarea } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { CatalogueMedication } from './MedicationsPage'
import './medications.css'

export interface MedicationDraft {
  name: string
  dose: string
  unit: string
  schedule_type: string
  times: string[]
  priority: Priority
  start_date: string
  end_date: string
  notes: string
  reminders_enabled?: boolean
  schedule_label?: string
}

/** Presets are editable clock-time conveniences, not prescribing advice. */
export const SCHEDULE_DEFAULTS: Record<string, string[]> = {
  morning: ['08:00'], morning_noon: ['08:00', '13:00'],
  morning_evening: ['08:00', '20:00'], noon: ['13:00'],
  noon_evening: ['13:00', '20:00'], evening: ['20:00'], bedtime: ['22:00'],
  every_8h: ['06:00', '14:00', '22:00'], every_12h: ['08:00', '20:00'],
  as_needed: [], custom: [],
}

const PRESETS: Record<string, [string, string]> = {
  morning: ['Ertalab', 'Утром'], morning_noon: ['Ertalab va tushda', 'Утром и днём'],
  morning_evening: ['Ertalab va kechqurun', 'Утром и вечером'], noon: ['Tushda', 'Днём'],
  noon_evening: ['Tushda va kechqurun', 'Днём и вечером'], evening: ['Kechqurun', 'Вечером'],
  bedtime: ['Uxlashdan oldin', 'Перед сном'], every_8h: ['Har 8 soatda', 'Каждые 8 часов'],
  every_12h: ['Har 12 soatda', 'Каждые 12 часов'], as_needed: ['Zarurat bo‘lganda', 'По необходимости'],
  custom: ['Vaqtlarni o‘zim belgilayman', 'Указать время вручную'],
}

export const UNITS = ['mg', 'ml', 'birlik', 'tabletka', 'tomchi']
const MEALS = {
  before: ['Ovqatdan oldin.', 'Ovqatdan oldin', 'До еды'],
  with: ['Ovqat bilan.', 'Ovqat bilan', 'Во время еды'],
  after: ['Ovqatdan keyin.', 'Ovqatdan keyin', 'После еды'],
  independent: ['Ovqatga bog‘liq emas.', 'Ovqatga bog‘liq emas', 'Независимо от еды'],
} as const
type MealKey = keyof typeof MEALS

export function medicationMeal(notes: string | null | undefined): MealKey | '' {
  const text = notes?.trim() ?? ''
  return (Object.keys(MEALS) as MealKey[]).find(key => text.startsWith(MEALS[key][0])) ?? ''
}

export function medicationFreeNotes(notes: string | null | undefined): string {
  const meal = medicationMeal(notes)
  return meal ? (notes ?? '').trim().slice(MEALS[meal][0].length).trim() : notes?.trim() ?? ''
}

export function medicationMealText(notes: string | null | undefined, locale: 'uz' | 'ru'): string {
  const key = medicationMeal(notes)
  return key ? MEALS[key][locale === 'ru' ? 2 : 1] : ''
}

function withMeal(notes: string, meal: MealKey | ''): string {
  return [meal ? MEALS[meal][0] : '', medicationFreeNotes(notes)].filter(Boolean).join(' ')
}

export function emptyMedication(startDate: string): MedicationDraft {
  return { name: '', dose: '', unit: 'mg', schedule_type: 'morning', times: [...SCHEDULE_DEFAULTS.morning], priority: 'normal', start_date: startDate, end_date: '', notes: '', reminders_enabled: true }
}

interface Props {
  value: MedicationDraft
  index: number
  errors: Record<string, string>
  onChange: (next: MedicationDraft) => void
  onRemove: () => void
  catalogue?: CatalogueMedication[]
}

export function MedicationEditor({ value, index, errors, onChange, onRemove, catalogue }: Props) {
  const { t } = useLanguage()
  const { data } = useApi<{ medications: CatalogueMedication[] }>(catalogue ? null : '/medications')
  const drugs = catalogue ?? data?.medications ?? []
  const patch = (changes: Partial<MedicationDraft>) => onChange({ ...value, ...changes })
  const choosePreset = (key: string) => patch({ schedule_type: key, times: [...(SCHEDULE_DEFAULTS[key] ?? [])] })
  const setTime = (position: number, time: string) => patch({ times: value.times.map((existing, i) => i === position ? time : existing) })
  const unitLabel = (unit: string) => ({ birlik: t('birlik', 'ед.'), tabletka: t('tabletka', 'табл.'), tomchi: t('tomchi', 'капли') }[unit] ?? unit)

  return <section className="card med-editor">
    <div className="card__head"><div className="med-editor-heading"><span className="med-order-number">{index + 1}</span><h3>{value.name || t('Yangi dori', 'Новый препарат')}</h3></div><Button type="button" variant="ghost" onClick={onRemove}>{t('Olib tashlash', 'Удалить')}</Button></div>
    <div className="card__body med-editor-section">
      {drugs.length > 0 ? <div className="med-catalogue-picker"><Field label={t('Kutubxonadan tanlash', 'Выбрать из справочника')}><Select aria-label={t('Kutubxonadagi dori', 'Препарат из справочника')} value="" onChange={event => {
        const drug = drugs.find(item => item.id === Number(event.target.value))
        if (drug) patch({ name: drug.name, unit: drug.unit || value.unit })
      }}><option value="">{t('Dori nomini tanlang yoki pastda kiriting', 'Выберите препарат или введите название ниже')}</option>{drugs.filter(drug => drug.is_active !== false && drug.is_active !== 0).map(drug => <option value={drug.id} key={drug.id}>{[drug.name, drug.strength, drug.form].filter(Boolean).join(' · ')}</option>)}</Select></Field><p>{t('Kutubxona dori nomi va birligini to‘ldiradi. Bemor dozasi va qabul vaqtini o‘zingiz belgilang.', 'Справочник заполняет название и единицу. Дозу и время приёма пациенту укажите отдельно.')}</p></div> : null}
      <div className="grid2">
        <Field label={t('Dori nomi', 'Название препарата')} required error={errors[`med_${index}_name`]}><Input aria-label={t('Dori nomi', 'Название препарата')} value={value.name} error={Boolean(errors[`med_${index}_name`])} placeholder={t('Shifokor belgilagan dori', 'Назначенный препарат')} onChange={event => patch({ name: event.target.value })} /></Field>
        <div className="med-form-grid"><Field label={t('Bemor uchun bir martalik doza', 'Разовая доза пациенту')} required error={errors[`med_${index}_dose`]}><Input aria-label={t('Bir martalik doza', 'Разовая доза')} value={value.dose} inputMode="decimal" error={Boolean(errors[`med_${index}_dose`])} onChange={event => patch({ dose: event.target.value })} /></Field><Field label={t('Birlik', 'Единица')}><Select aria-label={t('Doza birligi', 'Единица дозы')} value={value.unit} onChange={event => patch({ unit: event.target.value })}>{!UNITS.includes(value.unit) ? <option value={value.unit}>{value.unit}</option> : null}{UNITS.map(unit => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</Select></Field></div>
      </div>
      <Field label={t('Qabul tartibi', 'Режим приёма')} hint={t('Shablon vaqtlarini o‘zgartirishingiz mumkin.', 'Время из шаблона можно изменить.')}><Select aria-label={t('Qabul tartibi', 'Режим приёма')} value={value.schedule_type} onChange={event => choosePreset(event.target.value)}>{!PRESETS[value.schedule_type] ? <option value={value.schedule_type}>{t('Joriy jadval', 'Текущее расписание')}</option> : null}{Object.entries(PRESETS).map(([key, labels]) => <option key={key} value={key}>{t(...labels)}</option>)}</Select></Field>
      {value.schedule_type !== 'as_needed' ? <Field label={t('Aniq qabul vaqtlari', 'Точное время приёма')} required error={errors[`med_${index}_times`]}><div className="med-time-slots">{value.times.map((time, position) => <div className="med-time-slot" key={position}><Input type="time" aria-label={`${t('Qabul vaqti', 'Время приёма')} ${position + 1}`} value={time} onChange={event => setTime(position, event.target.value)} /><Button type="button" variant="ghost" onClick={() => patch({ times: value.times.filter((_, i) => i !== position) })} aria-label={`${t('Vaqtni olib tashlash', 'Удалить время')} ${time}`}><Icon name="close" size={18} /></Button></div>)}<Button type="button" onClick={() => patch({ times: [...value.times, '12:00'] })}><Icon name="plus" size={18} />{t('Vaqt qo‘shish', 'Добавить время')}</Button></div></Field> : <p className="small muted">{t('Bu tartib uchun avtomatik vaqtli eslatma yaratilmaydi.', 'Для этого режима напоминания по времени не создаются.')}</p>}
      <div className="grid3"><Field label={t('Ovqat bilan bog‘liqligi', 'Связь с приёмом пищи')}><Select aria-label={t('Ovqat bilan bog‘liqligi', 'Связь с приёмом пищи')} value={medicationMeal(value.notes)} onChange={event => patch({ notes: withMeal(value.notes, event.target.value as MealKey | '') })}><option value="">{t('Belgilanmagan', 'Не указано')}</option>{(Object.keys(MEALS) as MealKey[]).map(key => <option key={key} value={key}>{t(MEALS[key][1], MEALS[key][2])}</option>)}</Select></Field><Field label={t('Boshlanish sanasi', 'Дата начала')}><Input type="date" aria-label={t('Boshlanish sanasi', 'Дата начала')} value={value.start_date} onChange={event => patch({ start_date: event.target.value })} /></Field><Field label={t('Tugash sanasi (ixtiyoriy)', 'Дата окончания (необязательно)')}><Input type="date" min={value.start_date || undefined} aria-label={t('Tugash sanasi', 'Дата окончания')} value={value.end_date} onChange={event => patch({ end_date: event.target.value })} /></Field></div>
      <Field label={t('Bemor uchun tushunarli ko‘rsatma', 'Понятная пациенту инструкция')} hint={t('Retseptdagi ko‘rsatmani yozing.', 'Перенесите указания из назначения.')}><Textarea aria-label={t('Dori bo‘yicha ko‘rsatma', 'Инструкция по приёму')} rows={2} value={medicationFreeNotes(value.notes)} onChange={event => patch({ notes: [medicationMeal(value.notes) ? MEALS[medicationMeal(value.notes) as MealKey][0] : '', event.target.value].filter(Boolean).join(' ') })} /></Field>
      <details className="med-details"><summary>{t('Eslatma ustuvorligi', 'Приоритет напоминания')}</summary><div className="med-details-content"><Field label={t('Ustuvorlik', 'Приоритет')}><Select aria-label={t('Eslatma ustuvorligi', 'Приоритет напоминания')} value={value.priority} onChange={event => patch({ priority: event.target.value as Priority })}><option value="normal">{t('Odatiy', 'Обычный')}</option><option value="important">{t('Muhim', 'Важный')}</option><option value="critical">{t('Yuqori', 'Высокий')}</option></Select></Field></div></details>
    </div>
  </section>
}
