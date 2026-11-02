import { useLanguage } from '../../lib/i18n'
import { MedicationCalendar } from '../../components/MedicationCalendar'
export function PatientMedicationsPage() {
  const { t } = useLanguage()
  return <div className="content stack"><div><div className="eyebrow">{t('DORI QABULI','ПРИЁМ ЛЕКАРСТВ')}</div><h1 style={{marginTop:8}}>{t('Dorilarim kalendari','Мой календарь лекарств')}</h1><p className="muted" style={{marginTop:10,fontSize:16}}>{t('Qabul vaqtlarini va qaydlarni bir qarashda ko‘ring.','Время приёма и отметки — всё перед глазами.')}</p></div><MedicationCalendar /></div>
}
