
import { lazy, Suspense, useEffect } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import AdminLayout from './layouts/AdminLayout'
import RequireAuth from './app/RequireAuth'
import FeatureErrorBoundary from './components/feedback/FeatureErrorBoundary'
import LandingPage from './features/landing/LandingPage'

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'))
const LoginPage = lazy(() => import('./features/auth/LoginPage'))
const RegisterPage = lazy(() => import('./features/auth/RegisterPage'))

const pageDetails: Record<string, { title: string; description: string }> = {
  complaints: {
    title: 'Complaints',
    description: 'Review reports and track service request status.',
  },
  vehicles: {
    title: 'Vehicle management',
    description: 'Fleet inventory and vehicle status management.',
  },
  wards: {
    title: 'Ward management',
    description: 'Manage city wards and service areas.',
  },
  assignments: {
    title: 'Assignments',
    description: 'Coordinate vehicle and staff assignments.',
  },
  collection: {
    title: 'Waste collection',
    description: 'Record and validate collection activity.',
  },
  disposal: {
    title: 'Disposal management',
    description: 'Track disposal locations and recorded quantities.',
  },
  payments: {
    title: 'Payments',
    description: 'Review waste service payment records and calculations.',
  },
  reports: {
    title: 'Reports & analytics',
    description: 'Explore service, collection, fleet, and payment reports.',
  },
  profile: {
    title: 'My profile',
    description: 'Profile and account settings will be added here.',
  },
}

function LoadingPage() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-300/20 border-t-emerald-300" />
        Loading workspace…
      </div>
    </div>
  )
}

function PlaceholderPage({ pageKey }: { pageKey: string }) {
  const page = pageDetails[pageKey]

  return (
    <section className="glass-card rounded-2xl p-6 sm:p-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
        Feature workspace
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-white">{page.title}</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
        {page.description}
      </p>
      <div className="mt-7 rounded-xl border border-dashed border-slate-700 bg-black/10 p-5">
        <p className="text-sm font-medium text-slate-200">
          This feature is not implemented yet
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          The route and shared layout are ready. This module will be built
          independently after its backend contract is verified.
        </p>
      </div>
    </section>
  )
}

function RouteAnnouncer() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteAnnouncer />

      <Suspense fallback={<LoadingPage />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AdminLayout />}>
              <Route
                path="dashboard"
                element={
                  <FeatureErrorBoundary featureName="Dashboard">
                    <DashboardPage />
                  </FeatureErrorBoundary>
                }
              />

              {Object.keys(pageDetails)
                .filter((key) => key !== 'profile')
                .map((key) => (
                  <Route
                    key={key}
                    path={key}
                    element={
                      <FeatureErrorBoundary
                        featureName={pageDetails[key].title}
                      >
                        <PlaceholderPage pageKey={key} />
                      </FeatureErrorBoundary>
                    }
                  />
                ))}

              <Route
                path="profile"
                element={
                  <FeatureErrorBoundary featureName="Profile">
                    <PlaceholderPage pageKey="profile" />
                  </FeatureErrorBoundary>
                }
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
