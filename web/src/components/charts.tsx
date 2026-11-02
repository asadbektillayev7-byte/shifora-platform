import { useEffect, useRef, useState } from 'react'
import { uz } from '../lib/uz'
import { useLanguage } from '../lib/i18n'
import { formatDate, formatTime } from '../lib/format'

function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(entries => setWidth(Math.max(280, Math.floor(entries[0].contentRect.width))))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}
const LABEL = '#607068', GRID = '#e4e8df', GREEN = '#527b58', YELLOW = '#e7c35f'

export function AdherenceBarChart({ data }: { data: { date: string; rate: number | null; taken: number; total: number }[] }) {
  const { ref, width } = useChartWidth()
  const { t } = useLanguage()
  const height = 215, left = 45, right = width - 12, top = 15, bottom = 165
  const plotWidth = right - left, step = plotWidth / Math.max(data.length, 1), barWidth = Math.max(3, Math.min(24, step * .65))
  const labelEvery = Math.max(1, Math.ceil(data.length / (width < 450 ? 3 : 6)))
  return <div className="chart" ref={ref}>
    {!data.length ? <p className="muted small">{uz.reports.noData}</p> : <svg width={width} height={height} role="img" aria-label={uz.reports.adherenceByDay}>
      <title>{t('Rejadagi dori qabuli qaydlari, kunlar bo‘yicha', 'Записи о приёме лекарств по дням')}</title>
      {[0, 50, 100].map(tick => <g key={tick}><line x1={left} x2={right} y1={bottom - tick / 100 * (bottom - top)} y2={bottom - tick / 100 * (bottom - top)} stroke={GRID} /><text x={left - 9} y={bottom - tick / 100 * (bottom - top) + 4} fontSize={12} textAnchor="end" fill={LABEL}>{tick}%</text></g>)}
      {data.map((day, index) => {
        const x = left + step * index + (step - barWidth) / 2, rate = Math.min(100, Math.max(0, day.rate ?? 0)), barHeight = rate / 100 * (bottom - top)
        return <g key={day.date}><rect tabIndex={0} x={x} y={bottom - Math.max(barHeight, 3)} width={barWidth} height={Math.max(barHeight, 3)} rx={3} fill={day.rate === null ? '#dfe4d9' : rate === 100 ? GREEN : YELLOW} aria-label={`${formatDate(day.date)}: ${day.taken}/${day.total}`}><title>{`${formatDate(day.date)}: ${day.rate === null ? uz.reports.noData : `${rate}% · ${day.taken}/${day.total}`}`}</title></rect>{index % labelEvery === 0 ? <text x={x + barWidth / 2} y={188} fontSize={12} fill={LABEL} textAnchor="middle">{day.date.slice(8)}.{day.date.slice(5, 7)}</text> : null}</g>
      })}
    </svg>}
    <div className="chart__legend"><span className="chart__key"><span className="chart__swatch" style={{ background: GREEN }} />{t('Barchasi qayd etilgan', 'Все приёмы отмечены')}</span><span className="chart__key"><span className="chart__swatch" style={{ background: YELLOW }} />{t('Qisman qayd etilgan', 'Отмечена часть приёмов')}</span><span className="chart__key"><span className="chart__swatch" style={{ background: '#dfe4d9' }} />{t('Qayd yo‘q', 'Нет записи')}</span></div>
  </div>
}

export function GlucoseLineChart({ readings, low, high, unit }: { readings: { value: number; measured_at: string; unit?: string }[]; low?: number; high?: number; unit?: string }) {
  const { ref, width } = useChartWidth()
  const { t } = useLanguage()
  const displayUnit = unit ?? (readings[0]?.unit?.toLowerCase().includes('mmol') ? 'mmol/L' : 'mg/dL')
  const mmol = displayUnit.toLowerCase().includes('mmol')
  const points = readings.map(reading => {
    const dateString = reading.measured_at.replace(' ', 'T')
    const time = Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(dateString) ? dateString : `${dateString}+05:00`)
    const sourceMmol = reading.unit ? reading.unit.toLowerCase().includes('mmol') : mmol
    return { ...reading, time, value: sourceMmol === mmol ? Number(reading.value) : sourceMmol ? Number(reading.value) * 18.0182 : Number(reading.value) / 18.0182 }
  }).filter(point => Number.isFinite(point.time) && Number.isFinite(point.value)).sort((a, b) => a.time - b.time)
  const band = Number.isFinite(low) && Number.isFinite(high) && high! > low!
  const values = points.map(point => point.value)
  if (band) values.push(low!, high!)
  const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 1
  const pad = Math.max((max - min) * .16, mmol ? .6 : 10), lower = Math.max(0, min - pad), upper = max + pad
  const height = 240, left = 48, right = width - 14, top = 32, bottom = 187
  const start = points[0]?.time ?? 0, end = points.at(-1)?.time ?? 1, span = Math.max(end - start, 1)
  const toX = (time: number) => points.length === 1 ? (left + right) / 2 : left + (time - start) / span * (right - left)
  const toY = (value: number) => bottom - (value - lower) / Math.max(upper - lower, 1) * (bottom - top)
  const ticks = [lower, (lower + upper) / 2, upper]
  const times = points.length > 1 ? (width < 450 ? [start, end] : [start, start + span / 2, end]) : points.length ? [start] : []
  return <div className="chart" ref={ref}>
    {!points.length ? <p className="muted small">{uz.reports.noData}</p> : <svg width={width} height={height} role="img" aria-label={`${uz.measurements.glucose}, ${points.length} ${t('qayd', 'записей')}, ${displayUnit}`}>
      <title>{t('Qayd etilgan glyukoza qiymatlari va ularning vaqti', 'Зарегистрированные значения глюкозы и время измерения')}</title>
      <text x={left} y={15} fill={LABEL} fontSize={12}>{displayUnit}</text>
      {band ? <rect x={left} y={toY(high!)} width={right - left} height={toY(low!) - toY(high!)} fill="#f0f5ed" /> : null}
      {ticks.map((tick, index) => <g key={index}><line x1={left} x2={right} y1={toY(tick)} y2={toY(tick)} stroke={GRID} /><text x={left - 9} y={toY(tick) + 4} textAnchor="end" fontSize={12} fill={LABEL}>{mmol ? tick.toFixed(1) : Math.round(tick)}</text></g>)}
      {points.length > 1 ? <path d={points.map((point, index) => `${index ? 'L' : 'M'}${toX(point.time).toFixed(1)},${toY(point.value).toFixed(1)}`).join(' ')} fill="none" stroke="#8da088" strokeWidth={1.5} strokeDasharray="4 5" /> : null}
      {points.map((point, index) => <circle key={`${point.measured_at}-${index}`} tabIndex={0} cx={toX(point.time)} cy={toY(point.value)} r={4} fill={band && (point.value < low! || point.value > high!) ? '#ae7334' : GREEN} aria-label={`${formatDate(point.measured_at)} ${formatTime(point.measured_at)}, ${mmol ? point.value.toFixed(1) : Math.round(point.value)} ${displayUnit}`}><title>{`${formatDate(point.measured_at)}, ${formatTime(point.measured_at)}: ${mmol ? point.value.toFixed(1) : Math.round(point.value)} ${displayUnit}`}</title></circle>)}
      {times.map((time, index) => <g key={index}><text x={toX(time)} y={209} textAnchor={index === 0 ? 'start' : index === times.length - 1 ? 'end' : 'middle'} fontSize={12} fill={LABEL}>{formatDate(new Date(time).toISOString()).split(' ').slice(0, 2).join(' ')}</text><text x={toX(time)} y={227} textAnchor={index === 0 ? 'start' : index === times.length - 1 ? 'end' : 'middle'} fontSize={12} fill={LABEL}>{formatTime(new Date(time).toISOString())}</text></g>)}
    </svg>}
    {points.length ? <div className="chart__legend"><span className="chart__key"><span className="chart__swatch" style={{ background: GREEN }} />{t('O‘lchov qaydi', 'Запись измерения')}</span>{band ? <span>{t('Belgilangan oraliq', 'Заданный диапазон')}: {low}–{high} {displayUnit}</span> : <span>{t('Har bir nuqta — alohida o‘lchov', 'Каждая точка — отдельное измерение')}</span>}</div> : null}
  </div>
}
