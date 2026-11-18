
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
import RequireRole from './app/RequireRole'
import FeatureErrorBoundary from './components/feedback/FeatureErrorBoundary'
import LandingPage from './features/landing/LandingPage'

import { getStoredUser } from './features/auth/authService'
import { getDashboardPath } from './features/auth/roleAccess'
import type { UserRole } from './features/auth/types'

// Dashboards
const DashboardPage = lazy(
  () => import('./features/dashboard/DashboardPage'),
)

const SupervisorDashboardPage = lazy(
  () => import('./features/dashboard/SupervisorDashboardPage'),
)

const WorkerDashboardPage = lazy(
  () => import('./features/dashboard/WorkerDashboardPage'),
)

const CitizenDashboardPage = lazy(
  () => import('./features/dashboard/CitizenDashboardPage'),
)

// Authentication
const LoginPage = lazy(
  () => import('./features/auth/LoginPage'),
)

const RegisterPage = lazy(
  () => import('./features/auth/RegisterPage'),
)

// Feature modules
const ComplaintsPage = lazy(
  () => import('./features/complaints/ComplaintsPage'),
)

const ComplaintsManagementPage = lazy(
  () => import('./features/complaints/ComplaintsManagementPage'),
)

const AssignmentsPage = lazy(
  () => import('./features/assignments/AssignmentsPage'),
)

const VehiclesPage = lazy(
  () => import('./features/vehicles/VehiclesPage'),
)

const WardsPage = lazy(
  () => import('./features/wards/WardsPage'),
)

const CollectionPage = lazy(
  () => import('./features/collection/CollectionPage'),
)

const DisposalPage = lazy(
  () => import('./features/disposal/DisposalPage'),
)

const PaymentsPage = lazy(
  () => import('./features/payments/PaymentsPage'),
)

const ReportsPage = lazy(
  () => import('./features/reports/ReportsPage'),
)

// Profile
const ProfilePage = lazy(
  () => import('./features/profile/ProfilePage'),
)

// Page information
const pageDetails: Record<
  string,
  { title: string; description: string }
> = {
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
    description: 'Profile and account settings.',
  },
}

// Role permissions
const pageRoles: Record<string, UserRole[]> = {
  complaints: ['Admin', 'Supervisor', 'Worker', 'Citizen'],
  vehicles: ['Admin', 'Supervisor', 'Worker'],
  wards: ['Admin', 'Supervisor', 'Worker'],
  assignments: ['Admin', 'Supervisor', 'Worker'],
  collection: ['Admin', 'Supervisor', 'Worker'],
  disposal: ['Admin', 'Supervisor'],
  payments: ['Admin', 'Supervisor', 'Worker'],
  reports: ['Admin', 'Supervisor'],
  profile: ['Admin', 'Supervisor', 'Worker', 'Citizen'],
}

// Select the correct complaints page based on logged-in role.
function ComplaintsRoute() {
  const user = getStoredUser()

  if (user?.role === 'Citizen') {
    return <ComplaintsPage />
  }

  return <ComplaintsManagementPage />
}

// Actual module components
const featureComponents: Record<string, React.ComponentType> = {
  complaints: ComplaintsRoute,
  vehicles: VehiclesPage,
  wards: WardsPage,
  assignments: AssignmentsPage,
  collection: CollectionPage,
  disposal: DisposalPage,
  payments: PaymentsPage,
  reports: ReportsPage,
  profile: ProfilePage,
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
        Loading workspace...
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

      <h1 className="mt-3 text-2xl font-semibold text-white">
        {page.title}
      </h1>

      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
        {page.description}
      </p>

      <div className="mt-7 rounded-xl border border-dashed border-slate-700 bg-black/10 p-5">
        <p className="text-sm font-medium text-slate-200">
          This feature is being prepared
        </p>
      </div>
    </section>
  )
}

function DashboardRedirect() {
  const user = getStoredUser()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={getDashboardPath(user.role)} replace />
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
          {/* Public pages */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected application */}
          <Route element={<RequireAuth />}>
            <Route element={<AdminLayout />}>
              <Route
                path="dashboard"
                element={<DashboardRedirect />}
              />

              {/* Admin dashboard */}
              <Route element={<RequireRole allowedRoles={['Admin']} />}>
                <Route
                  path="admin/dashboard"
                  element={
                    <FeatureErrorBoundary featureName="Admin Dashboard">
                      <DashboardPage />
                    </FeatureErrorBoundary>
                  }
                />
              </Route>

              {/* Supervisor dashboard */}
              <Route element={<RequireRole allowedRoles={['Supervisor']} />}>
                <Route
                  path="supervisor/dashboard"
                  element={
                    <FeatureErrorBoundary featureName="Supervisor Dashboard">
                      <SupervisorDashboardPage />
                    </FeatureErrorBoundary>
                  }
                />
              </Route>

              {/* Worker dashboard */}
              <Route element={<RequireRole allowedRoles={['Worker']} />}>
                <Route
                  path="worker/dashboard"
                  element={
                    <FeatureErrorBoundary featureName="Worker Dashboard">
                      <WorkerDashboardPage />
                    </FeatureErrorBoundary>
                  }
                />
              </Route>

              {/* Citizen dashboard */}
              <Route element={<RequireRole allowedRoles={['Citizen']} />}>
                <Route
                  path="citizen/dashboard"
                  element={
                    <FeatureErrorBoundary featureName="Citizen Dashboard">
                      <CitizenDashboardPage />
                    </FeatureErrorBoundary>
                  }
                />
              </Route>

              {/* Role-protected feature modules */}
              {Object.entries(pageRoles).map(([key, roles]) => {
                const FeatureComponent = featureComponents[key]

                return (
                  <Route
                    key={key}
                    element={<RequireRole allowedRoles={roles} />}
                  >
                    <Route
                      path={key}
                      element={
                        <FeatureErrorBoundary
                          featureName={pageDetails[key].title}
                        >
                          {FeatureComponent ? (
                            <FeatureComponent />
                          ) : (
                            <PlaceholderPage pageKey={key} />
                          )}
                        </FeatureErrorBoundary>
                      }
                    />
                  </Route>
                )
              })}
            </Route>
          </Route>

          {/* Unknown route */}
          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
