import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { HOSPITAL_ROLES, useAuth } from './lib/auth'
import { Loading } from './components/ui'
import { LoginPage } from './pages/LoginPage'
import { useLanguage } from './lib/i18n'

const HospitalApp = lazy(() => import('./pages/hospital/HospitalApp').then(module => ({ default: module.HospitalApp })))
const PatientApp = lazy(() => import('./pages/patient/PatientApp').then(module => ({ default: module.PatientApp })))
const CaregiverApp = lazy(() => import('./pages/caregiver/CaregiverApp').then(module => ({ default: module.CaregiverApp })))

/** Where each role belongs after authentication. */
export function homePathFor(role: string): string {
  if (HOSPITAL_ROLES.includes(role)) return '/shifoxona'
  if (role === 'patient') return '/bemor'
  return '/yaqin'
}

export function App() {
  useLanguage()
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const { session, loading } = useAuth()

  if (loading) return <Loading />

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  const home = homePathFor(session.user.role)

  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      {HOSPITAL_ROLES.includes(session.user.role) ? (
        <Route path="/shifoxona/*" element={<HospitalApp />} />
      ) : null}
      {session.user.role === 'patient' ? <Route path="/bemor/*" element={<PatientApp />} /> : null}
      {session.user.role === 'caregiver' ? <Route path="/yaqin/*" element={<CaregiverApp />} /> : null}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
    </Suspense>
  )
}
