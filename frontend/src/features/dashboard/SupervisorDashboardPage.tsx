import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Truck,
  Weight,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

interface DashboardSummary {
  totalComplaints: number
  pendingComplaints: number
  inProgressComplaints: number
  resolvedComplaints: number
  activeVehicles: number
}

interface Assignment {
  id: number
  vehicle_id: number
  registration_number: string
  worker_id: number
  worker_name: string
  ward_id: number
  ward_name: string
  shift_date: string
  shift: string
  status: string
}

interface Collection {
  log_id: number
  assignment_id: number
  worker_name: string
  vehicle_id: number
  ward_name: string
  waste_type: string
  waste_tons: number
  collected_at: string
  notes?: string
}

interface Vehicle {
  id: number
  registration_number: string
  capacity_tons: number
  status: string
}

interface ApiListResponse<T> {
  success?: boolean
  count?: number
  totalTons?: number
  data: T[]
}

interface SummaryResponse {
  success: boolean
  data: DashboardSummary
}

const initialSummary: DashboardSummary = {
  totalComplaints: 0,
  pendingComplaints: 0,
  inProgressComplaints: 0,
  resolvedComplaints: 0,
  activeVehicles: 0,
}

function getToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value?: string) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatStatus(status: string) {
  return status === 'In-Progress' ? 'In Progress' : status
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Scheduled: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
    'In-Progress': 'border-orange-400/20 bg-orange-400/10 text-orange-300',
    Completed: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    Cancelled: 'border-red-400/20 bg-red-400/10 text-red-300',
    Active: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    Available: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
    Assigned: 'border-purple-400/20 bg-purple-400/10 text-purple-300',
    Maintenance: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
    Inactive: 'border-slate-500/20 bg-slate-500/10 text-slate-400',
  }

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-medium ${
        styles[status] ?? 'border-slate-600 bg-slate-700/30 text-slate-300'
      }`}
    >
      {formatStatus(status)}
    </span>
  )
}

function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-slate-700/60 bg-[#0d1521] ${className}`}
    >
      {children}
    </section>
  )
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  color,
  background,
  loading,
}: {
  title: string
  value: string | number
  description: string
  icon: React.ElementType
  color: string
  background: string
  loading: boolean
}) {
  return (
    <Panel className="p-4 transition duration-200 hover:-translate-y-0.5 hover:border-slate-600">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${background}`}
          style={{ color }}
        >
          <Icon size={18} />
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400">{title}</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight text-white">
        {loading ? '—' : value}
      </p>
      <p className="mt-1.5 text-[10px] text-slate-500">{description}</p>
    </Panel>
  )
}

export default function SupervisorDashboardPage() {
  const [summary, setSummary] = useState(initialSummary)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')

    const results = await Promise.allSettled([
      apiClient.get<SummaryResponse>('/dashboard/summary'),
      apiClient.get<ApiListResponse<Assignment>>('/assignments'),
      apiClient.get<ApiListResponse<Collection>>('/collections'),
      apiClient.get<Vehicle[]>('/vehicles'),
    ])

    const errors: string[] = []

    const [summaryResult, assignmentsResult, collectionsResult, vehiclesResult] =
      results

    if (summaryResult.status === 'fulfilled') {
      const response = summaryResult.value.data
      if (response.success && response.data) {
        setSummary(response.data)
      } else {
        errors.push('Dashboard summary returned invalid data.')
      }
    } else {
      errors.push(getApiErrorMessage(summaryResult.reason))
    }

    if (assignmentsResult.status === 'fulfilled') {
      const response = assignmentsResult.value.data
      if (Array.isArray(response.data)) {
        setAssignments(response.data)
      } else {
        errors.push('Assignments returned invalid data.')
      }
    } else {
      errors.push(getApiErrorMessage(assignmentsResult.reason))
    }

    if (collectionsResult.status === 'fulfilled') {
      const response = collectionsResult.value.data
      if (Array.isArray(response.data)) {
        setCollections(response.data)
      } else {
        errors.push('Collection records returned invalid data.')
      }
    } else {
      errors.push(getApiErrorMessage(collectionsResult.reason))
    }

    if (vehiclesResult.status === 'fulfilled') {
      if (Array.isArray(vehiclesResult.value.data)) {
        setVehicles(vehiclesResult.value.data)
      } else {
        errors.push('Vehicle records returned invalid data.')
      }
    } else {
      errors.push(getApiErrorMessage(vehiclesResult.reason))
    }

    if (errors.length > 0) {
      setError(errors.join(' '))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard, refreshKey])

  const today = getToday()

  const todaysAssignments = assignments
    .filter((item) => String(item.shift_date).slice(0, 10) === today)
    .sort((a, b) => a.id - b.id)

  const activeAssignments = assignments.filter(
    (item) => item.status === 'In-Progress',
  )

  const completedAssignments = assignments.filter(
    (item) => item.status === 'Completed',
  )

  const scheduledAssignments = assignments.filter(
    (item) => item.status === 'Scheduled',
  )

  const totalWaste = collections.reduce(
    (total, item) => total + Number(item.waste_tons || 0),
    0,
  )

  const recentCollections = [...collections]
    .sort(
      (a, b) =>
        new Date(b.collected_at).getTime() -
        new Date(a.collected_at).getTime(),
    )
    .slice(0, 5)

  const availableVehicles = vehicles.filter(
    (vehicle) => vehicle.status === 'Available',
  ).length

  const metrics = [
    {
      title: "Today's Assignments",
      value: todaysAssignments.length,
      description: 'Assignments scheduled for today',
      icon: CalendarDays,
      color: '#35d9bb',
      background: 'bg-emerald-400/10',
    },
    {
      title: 'In Progress',
      value: activeAssignments.length,
      description: 'Currently active assignments',
      icon: Activity,
      color: '#38bdf8',
      background: 'bg-sky-400/10',
    },
    {
      title: 'Collections Recorded',
      value: collections.length,
      description: 'Total collection records',
      icon: CheckCircle2,
      color: '#c084fc',
      background: 'bg-purple-400/10',
    },
    {
      title: 'Waste Collected',
      value: `${totalWaste.toFixed(2)} T`,
      description: 'Total recorded waste quantity',
      icon: Weight,
      color: '#fb923c',
      background: 'bg-orange-400/10',
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              WMS / Supervisor Operations
            </p>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Supervisor Dashboard
          </h1>

          <p className="mt-1 text-xs text-slate-400">
            Monitor assignments, collection activity and operational status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1521] px-3 py-2 text-[11px] text-slate-400 sm:flex">
            <CalendarDays size={14} />
            {new Date().toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>

          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1521] px-3 py-2.5 text-[11px] text-slate-300 transition hover:border-emerald-400/40 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-4 py-3"
        >
          <AlertCircle size={16} className="mt-0.5 text-red-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-red-300">
              Some operational data could not be loaded
            </p>
            <p className="mt-1 text-xs text-slate-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="text-xs text-red-200 hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      <p className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2 text-[10px] text-emerald-200/80">
        {loading
          ? 'Loading operational data from the database...'
          : 'Dashboard data is retrieved from the connected backend APIs.'}
      </p>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.title}
            {...metric}
            loading={loading}
          />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Assignment Overview
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Current assignment status across all workers
              </p>
            </div>
            <Link
              to="/assignments"
              className="text-[11px] font-medium text-emerald-300 hover:text-emerald-200"
            >
              Manage Assignments →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: 'Scheduled',
                value: scheduledAssignments.length,
                color: 'text-sky-300',
              },
              {
                label: 'In Progress',
                value: activeAssignments.length,
                color: 'text-orange-300',
              },
              {
                label: 'Completed',
                value: completedAssignments.length,
                color: 'text-emerald-300',
              },
              {
                label: 'Total Assignments',
                value: assignments.length,
                color: 'text-white',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-700/60 bg-white/[0.02] p-4"
              >
                <p className="text-[11px] text-slate-400">{item.label}</p>
                <p className={`mt-2 text-2xl font-semibold ${item.color}`}>
                  {loading ? '—' : item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
            <div>
              <p className="text-[11px] text-slate-400">Today's workload</p>
              <p className="mt-1 text-xs text-white">
                {loading ? 'Loading...' : `${todaysAssignments.length} assignment(s)`}
              </p>
            </div>
            <Link
              to="/assignments"
              className="rounded-lg border border-emerald-400/20 px-3 py-2 text-[10px] text-emerald-300 hover:bg-emerald-400/10"
            >
              View assignments
            </Link>
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Operations Snapshot
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Complaint and fleet indicators
              </p>
            </div>
            <Truck size={17} className="text-emerald-300" />
          </div>

          <div className="space-y-4">
            {[
              {
                label: 'Total Complaints',
                value: summary.totalComplaints,
                color: 'bg-slate-400',
              },
              {
                label: 'Pending Complaints',
                value: summary.pendingComplaints,
                color: 'bg-orange-400',
              },
              {
                label: 'In-progress Complaints',
                value: summary.inProgressComplaints,
                color: 'bg-sky-400',
              },
              {
                label: 'Resolved Complaints',
                value: summary.resolvedComplaints,
                color: 'bg-emerald-400',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  <span className="text-[11px] text-slate-400">
                    {item.label}
                  </span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {loading ? '—' : item.value}
                </span>
              </div>
            ))}

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
              <div>
                <p className="text-[11px] text-slate-400">
                  Active vehicles
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {loading ? '—' : summary.activeVehicles}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400">
                  Available vehicles
                </p>
                <p className="mt-1 text-lg font-semibold text-emerald-300">
                  {loading ? '—' : availableVehicles}
                </p>
              </div>
            </div>
          </div>
        </Panel>
      </section>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Today's Assignments
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Workers, vehicles and shifts scheduled for today
            </p>
          </div>
          <Link
            to="/assignments"
            className="text-[11px] font-medium text-emerald-300 hover:text-emerald-200"
          >
            View All →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-y border-white/[0.06] bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">Assignment</th>
                <th className="px-5 py-3 font-medium">Worker</th>
                <th className="px-5 py-3 font-medium">Ward</th>
                <th className="px-5 py-3 font-medium">Vehicle</th>
                <th className="px-5 py-3 font-medium">Shift</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-xs text-slate-400"
                  >
                    Loading today's assignments...
                  </td>
                </tr>
              ) : todaysAssignments.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-xs text-slate-400"
                  >
                    No assignments scheduled for today.
                  </td>
                </tr>
              ) : (
                todaysAssignments.slice(0, 8).map((assignment) => (
                  <tr
                    key={assignment.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      #{assignment.id}
                    </td>
                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {assignment.worker_name || `Worker #${assignment.worker_id}`}
                    </td>
                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      {assignment.ward_name || `Ward #${assignment.ward_id}`}
                    </td>
                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {assignment.registration_number || `Vehicle #${assignment.vehicle_id}`}
                    </td>
                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      {assignment.shift}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={assignment.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Recent Collection Activity
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Latest collection records submitted by workers
            </p>
          </div>
          <Link
            to="/collection"
            className="text-[11px] font-medium text-emerald-300 hover:text-emerald-200"
          >
            View All →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left">
            <thead>
              <tr className="border-y border-white/[0.06] bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">Worker</th>
                <th className="px-5 py-3 font-medium">Ward</th>
                <th className="px-5 py-3 font-medium">Waste Type</th>
                <th className="px-5 py-3 font-medium">Quantity</th>
                <th className="px-5 py-3 font-medium">Collected On</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-xs text-slate-400"
                  >
                    Loading collection records...
                  </td>
                </tr>
              ) : recentCollections.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-xs text-slate-400"
                  >
                    No collection records found.
                  </td>
                </tr>
              ) : (
                recentCollections.map((collection) => (
                  <tr
                    key={collection.log_id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {collection.worker_name || '—'}
                    </td>
                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      {collection.ward_name || '—'}
                    </td>
                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {collection.waste_type}
                    </td>
                    <td className="px-5 py-4 text-[11px] font-medium text-emerald-300">
                      {Number(collection.waste_tons).toFixed(2)} T
                    </td>
                    <td className="px-5 py-4 text-[10px] text-slate-500">
                      {formatDate(collection.collected_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-[#0d1521] px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock3 size={15} className="text-slate-400" />
          <p className="text-[10px] text-slate-400">
            Assignment updates and collection records reflect the latest API data.
          </p>
        </div>
        <Link
          to="/complaints"
          className="text-[10px] font-medium text-emerald-300 hover:text-emerald-200"
        >
          Review Complaints →
        </Link>
      </div>
    </div>
  )
}