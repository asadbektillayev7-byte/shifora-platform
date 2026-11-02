import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../../lib/api'
import { useApi } from '../../lib/hooks'
import { useLanguage } from '../../lib/i18n'
import { isDemoMode } from '../../lib/demo'
import { Button, Loading, Modal } from '../../components/ui'
import { Icon } from '../../components/Icon'
import './medications.css'

export interface CatalogueMedication {
  id: number
  name: string
  generic_name: string
  form: string
  strength: string
  unit: string
  notes: string
  is_active?: number | boolean
  created_at?: string
}

type CatalogueDraft = Omit<CatalogueMedication, 'id' | 'created_at'>
const emptyDrug = (): CatalogueDraft => ({
  name: '', generic_name: '', form: '', strength: '', unit: 'mg', notes: '', is_active: true,
})

export function MedicationsPage() {
  const { t } = useLanguage()
  const { data, loading, error, reload, setData } = useApi<{ medications: CatalogueMedication[] }>('/medications')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<CatalogueMedication | 'new' | null>(null)
  const [draft, setDraft] = useState<CatalogueDraft>(emptyDrug)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [message, setMessage] = useState('')
  const search = query.trim().toLocaleLowerCase()
  const medications = (data?.medications ?? []).filter(drug =>
    `${drug.name} ${drug.generic_name} ${drug.strength} ${drug.form}`.toLocaleLowerCase().includes(search),
  )

  function openEditor(drug?: CatalogueMedication) {
    setDraft(drug ? { name: drug.name, generic_name: drug.generic_name ?? '', form: drug.form ?? '', strength: drug.strength ?? '', unit: drug.unit ?? 'mg', notes: drug.notes ?? '', is_active: drug.is_active ?? true } : emptyDrug())
    setEditing(drug ?? 'new')
    setSaveError('')
    setMessage('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.name.trim() || busy) return
    setBusy(true)
    setSaveError('')
    const body = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]))
    try {
      const result = editing === 'new'
        ? await api.post<{ medication: CatalogueMedication }>('/medications', body)
        : await api.patch<{ medication: CatalogueMedication }>(`/medications/${editing?.id}`, body)
      setData(current => ({ medications: editing === 'new'
        ? [...(current?.medications ?? []), result.medication]
        : (current?.medications ?? []).map(item => item.id === result.medication.id ? result.medication : item),
      }))
      setEditing(null)
      setMessage(t('Dori kutubxonaga saqlandi.', 'Препарат сохранён в справочнике.'))
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t('Saqlab bo‘lmadi. Qayta urinib ko‘ring.', 'Не удалось сохранить. Повторите попытку.'))
    } finally {
      setBusy(false)
    }
  }

  return <div className="med-page">
    <div className="med-page-heading">
      <div><div className="med-eyebrow">{t('Klinika kutubxonasi', 'Справочник клиники')}</div><h1>{t('Dorilar', 'Препараты')}</h1><p>{t('Dorini bir marta qo‘shing. Bemorning rejasi uchun nomini shu yerdan tanlang.', 'Добавьте препарат один раз, затем выбирайте его при составлении плана пациента.')}</p></div>
      <Button type="button" variant="primary" onClick={() => openEditor()}><Icon name="plus" />{t('Dori qo‘shish', 'Добавить препарат')}</Button>
    </div>

    {isDemoMode() ? <div className="med-demo-note"><Icon name="info" size={18} /><span>{t('Namuna kutubxonasi. Ko‘rsatilgan dorilar va ma’lumotlar retsept hisoblanmaydi.', 'Демонстрационный справочник. Препараты и сведения не являются назначением.')}</span></div> : null}
    <div className="med-library">
      <div className="med-library-toolbar"><label className="med-search"><Icon name="search" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Dori nomi yoki faol modda', 'Название или действующее вещество')} aria-label={t('Dorilarni qidirish', 'Поиск препаратов')} /></label><span className="med-count">{medications.length} {t('ta dori', 'препаратов')}</span></div>
      {message ? <p className="med-success" role="status">{message}</p> : null}
      {loading ? <Loading /> : error ? <div className="med-empty"><p role="alert">{error}</p><Button type="button" onClick={() => void reload()}>{t('Qayta yuklash', 'Повторить')}</Button></div> : medications.length === 0 ? <div className="med-empty"><Icon name="pill" size={30} /><h2>{query ? t('Dori topilmadi', 'Препарат не найден') : t('Birinchi dorini qo‘shing', 'Добавьте первый препарат')}</h2><p>{query ? t('Boshqa nom bilan qidiring yoki yangi dori qo‘shing.', 'Попробуйте другое название или добавьте препарат.') : t('Nom, shakl va kuchini kiriting. Bemor dozasi uning rejasida belgilanadi.', 'Укажите название, форму и дозировку выпуска. Доза пациенту задаётся в его плане.')}</p><Button type="button" onClick={() => openEditor()}>{t('Dori qo‘shish', 'Добавить препарат')}</Button></div> : <div className="med-catalogue-list">
        {medications.map(drug => <article className="med-catalogue-row" key={drug.id}>
          <div className="med-drug-mark"><Icon name="pill" size={22} /></div>
          <div className="med-catalogue-main"><h2>{drug.name}</h2><p>{[drug.generic_name, drug.strength, drug.form].filter(Boolean).join(' · ') || t('Tafsilotlar kiritilmagan', 'Подробности не указаны')}</p>{drug.notes ? <div className="med-catalogue-notes">{drug.notes}</div> : null}</div>
          <Button type="button" onClick={() => openEditor(drug)} aria-label={`${t('Tahrirlash', 'Изменить')}: ${drug.name}`}>{t('Tahrirlash', 'Изменить')}<Icon name="chevron" size={18} /></Button>
        </article>)}
      </div>}
    </div>

    {editing ? <Modal title={editing === 'new' ? t('Yangi dori', 'Новый препарат') : t('Dorini tahrirlash', 'Изменить препарат')} onClose={() => { if (!busy) setEditing(null) }}>
      <form className="med-form" onSubmit={event => void save(event)}>
        <label className="med-field"><span>{t('Dori nomi', 'Название препарата')} <span aria-hidden="true">*</span></span><input autoFocus required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder={t('Savdo nomi yoki preparat nomi', 'Торговое название или название препарата')} /></label>
        <label className="med-field"><span>{t('Faol modda', 'Действующее вещество')}</span><input maxLength={160} value={draft.generic_name} onChange={event => setDraft({ ...draft, generic_name: event.target.value })} /></label>
        <div className="med-form-grid"><label className="med-field"><span>{t('Chiqarilish shakli', 'Форма выпуска')}</span><input value={draft.form} onChange={event => setDraft({ ...draft, form: event.target.value })} placeholder={t('Tabletka, kapsula, eritma…', 'Таблетка, капсула, раствор…')} maxLength={80} /></label><label className="med-field"><span>{t('Dori kuchi / konsentratsiyasi', 'Дозировка выпуска / концентрация')}</span><input value={draft.strength} onChange={event => setDraft({ ...draft, strength: event.target.value })} placeholder={t('Qadoqda ko‘rsatilgan qiymat', 'Значение с упаковки')} maxLength={80} /></label></div>
        <label className="med-field"><span>{t('O‘lchov birligi', 'Единица измерения')}</span><input value={draft.unit} onChange={event => setDraft({ ...draft, unit: event.target.value })} maxLength={30} /></label>
        <label className="med-field"><span>{t('Qo‘shimcha ma’lumot', 'Дополнительная информация')}</span><textarea rows={3} maxLength={2000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder={t('Dori haqida ma’lumot. Bemor dozasi alohida belgilanadi.', 'Информация о препарате. Доза пациенту задаётся отдельно.')} /></label>
        {saveError ? <p className="med-error" role="alert">{saveError}</p> : null}
        <div className="med-form-actions"><Button type="button" onClick={() => setEditing(null)} disabled={busy}>{t('Bekor qilish', 'Отмена')}</Button><Button type="submit" variant="primary" disabled={busy || !draft.name.trim()}>{busy ? t('Saqlanmoqda…', 'Сохранение…') : t('Dorini saqlash', 'Сохранить препарат')}</Button></div>
      </form>
    </Modal> : null}
  </div>
}
