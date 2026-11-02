import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, Bell, BookOpen, Building2, CalendarDays, Check, CheckCheck, ChevronRight, Circle, CircleHelp, ClipboardList, Clock, Download, Droplet, FileText, HeartPulse, Home, Info, LogOut, Menu, MessageCircle, MoreHorizontal, Phone, Pill, Plus, Search, Settings, ShieldCheck, Stethoscope, Sun, TriangleAlert, UserRound, UsersRound, Utensils, X, ChartNoAxesCombined } from 'lucide-react'

const icons = {
  home: Home, users: UsersRound, user: UserRound, clipboard: ClipboardList,
  pill: Pill, chart: ChartNoAxesCombined, calendar: CalendarDays, bell: Bell,
  message: MessageCircle, plus: Plus, chevron: ChevronRight, back: ArrowLeft,
  arrow: ArrowRight, external: ArrowUpRight, check: Check, checks: CheckCheck,
  clock: Clock, heart: HeartPulse, droplet: Droplet, logout: LogOut, menu: Menu,
  close: X, search: Search, settings: Settings, info: Info, warning: TriangleAlert,
  circle: Circle, help: CircleHelp, shield: ShieldCheck, phone: Phone,
  download: Download, file: FileText, activity: Activity, sun: Sun, meal: Utensils,
  doctor: Stethoscope, clinic: Building2, more: MoreHorizontal, book: BookOpen,
}
const legacy: Record<string, keyof typeof icons> = {
  '🏠':'home','👥':'users','👤':'user','🧑':'user','👨‍👩‍👦':'users','📋':'clipboard',
  '💊':'pill','📊':'chart','📈':'chart','📅':'calendar','🔔':'bell','❓':'help',
  '💬':'message','🤖':'message','➕':'plus','🕒':'clock','🫀':'heart','🩸':'droplet',
  '🩺':'doctor','🏥':'clinic','✅':'check','⚠️':'warning','⛔':'warning','ℹ️':'info',
  '🟢':'check','🟡':'clock','🔴':'warning','📌':'clipboard',
}
export function Icon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) {
  const Component = icons[(legacy[name] ?? name) as keyof typeof icons] ?? Circle
  return <Component size={size} strokeWidth={1.7} className={`icon ${className}`} aria-hidden="true" />
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand ${compact ? 'brand--compact' : ''}`}><span className="brand__mark" aria-hidden="true" /><span>shifora<span className="brand__dot">.</span></span></span>
}
