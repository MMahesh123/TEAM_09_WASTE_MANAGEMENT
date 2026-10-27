
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  MoreHorizontal,
  Truck,
} from 'lucide-react'
import {
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  apiClient,
  getApiErrorMessage,
} from '../../services/api/client'

interface DashboardSummary {
  totalComplaints: number
  pendingComplaints: number
  inProgressComplaints: number
  resolvedComplaints: number
  activeVehicles: number
}

interface Complaint {
  id: number | string
  ward: string
  type: string
  description?: string
  status: string
  created_at?: string
}

interface ComplaintsResponse {
  success: boolean
  count: number
  data: Complaint[]
}

interface TrendPoint {
  date: string
  received: number
  currentlyResolved: number
}

interface VehicleStatus {
  name: string
  value: number
}

interface ChartsResponse {
  success: boolean
  data: {
    period: string
    complaintsTrend: TrendPoint[]
    vehicleStatus: VehicleStatus[]
  }
}

const initialSummary: DashboardSummary = {
  totalComplaints: 0,
  pendingComplaints: 0,
  inProgressComplaints: 0,
  resolvedComplaints: 0,
  activeVehicles: 0,
}

const periodOptions = [
  { label: 'Last 6 months', value: '6m' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 7 days', value: '7d' },
]

const vehicleColors: Record<string, string> = {
  Active: '#22d3bb',
  Available: '#38bdf8',
  Assigned: '#a78bfa',
  Maintenance: '#fb923c',
  Inactive: '#fb7185',
}

const statusStyles: Record<string, string> = {
  Pending: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
  'In Progress': 'border-sky-400/20 bg-sky-400/10 text-sky-300',
  Resolved: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
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

function PanelHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function formatStatus(status: string) {
  return status === 'In-Progress' ? 'In Progress' : status
}

function formatComplaintDate(date?: string) {
  if (!date) return '—'

  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '—'

  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatChartDate(date: string, period: string) {
  // Treat SQL DATE strings as calendar dates rather than UTC timestamps.
  const parts = date.slice(0, 10).split('-').map(Number)
  const parsed = new Date(parts[0], parts[1] - 1, parts[2])

  if (Number.isNaN(parsed.getTime())) return date

  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: period === '6m' ? 'short' : '2-digit',
    ...(period === '6m' ? { year: '2-digit' } : {}),
  })
}

function StatusBadge({ status }: { status: string }) {
  const formatted = formatStatus(status)

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-medium ${
        statusStyles[formatted] ??
        'border-slate-600 bg-slate-700/30 text-slate-300'
      }`}
    >
      {formatted}
    </span>
  )
}

export default function DashboardPage() {
  const [period, setPeriod] = useState('6m')
  const [showPeriodOptions, setShowPeriodOptions] = useState(false)

  const [summary, setSummary] =
    useState<DashboardSummary>(initialSummary)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [complaintsTrend, setComplaintsTrend] = useState<TrendPoint[]>([])
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus[]>([])
  const [chartsLoading, setChartsLoading] = useState(true)
  const [chartsError, setChartsError] = useState('')

  const [recentComplaints, setRecentComplaints] = useState<Complaint[]>([])
  const [complaintsLoading, setComplaintsLoading] = useState(true)
  const [complaintsError, setComplaintsError] = useState('')

  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    async function fetchSummary() {
      setLoading(true)
      setError('')

      try {
        const response = await apiClient.get<{
          success: boolean
          data: DashboardSummary
        }>('/dashboard/summary')

        if (!response.data.success || !response.data.data) {
          throw new Error('The server returned an invalid dashboard response.')
        }

        if (active) setSummary(response.data.data)
      } catch (err) {
        if (active) setError(getApiErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    void fetchSummary()

    return () => {
      active = false
    }
  }, [refreshKey])

  useEffect(() => {
    let active = true

    async function fetchCharts() {
      setChartsLoading(true)
      setChartsError('')

      try {
        const response = await apiClient.get<ChartsResponse>(
          '/dashboard/charts',
          { params: { period } },
        )

        if (
          !response.data.success ||
          !response.data.data ||
          !Array.isArray(response.data.data.complaintsTrend) ||
          !Array.isArray(response.data.data.vehicleStatus)
        ) {
          throw new Error('The server returned invalid chart data.')
        }

        if (active) {
          setComplaintsTrend(response.data.data.complaintsTrend)
          setVehicleStatus(response.data.data.vehicleStatus)
        }
      } catch (err) {
        if (active) {
          setComplaintsTrend([])
          setVehicleStatus([])
          setChartsError(getApiErrorMessage(err))
        }
      } finally {
        if (active) setChartsLoading(false)
      }
    }

    void fetchCharts()

    return () => {
      active = false
    }
  }, [period, refreshKey])

  useEffect(() => {
    let active = true

    async function fetchRecentComplaints() {
      setComplaintsLoading(true)
      setComplaintsError('')

      try {
        const response =
          await apiClient.get<ComplaintsResponse>('/complaints')

        if (
          !response.data.success ||
          !Array.isArray(response.data.data)
        ) {
          throw new Error('Invalid complaints response from server.')
        }

        if (active) {
          const sorted = [...response.data.data].sort((a, b) => {
            const dateA = a.created_at
              ? new Date(a.created_at).getTime()
              : 0
            const dateB = b.created_at
              ? new Date(b.created_at).getTime()
              : 0
            return dateB - dateA
          })

          setRecentComplaints(sorted.slice(0, 5))
        }
      } catch (err) {
        if (active) setComplaintsError(getApiErrorMessage(err))
      } finally {
        if (active) setComplaintsLoading(false)
      }
    }

    void fetchRecentComplaints()

    return () => {
      active = false
    }
  }, [refreshKey])

  const selectedPeriod =
    periodOptions.find((option) => option.value === period)?.label ??
    'Last 6 months'

  const metrics = [
    {
      title: 'Total Complaints',
      value: summary.totalComplaints,
      icon: CircleAlert,
      color: '#35d9bb',
      background: 'bg-emerald-400/10',
    },
    {
      title: 'Pending',
      value: summary.pendingComplaints,
      icon: Clock3,
      color: '#fb923c',
      background: 'bg-orange-400/10',
    },
    {
      title: 'In Progress',
      value: summary.inProgressComplaints,
      icon: Activity,
      color: '#38bdf8',
      background: 'bg-sky-400/10',
    },
    {
      title: 'Resolved',
      value: summary.resolvedComplaints,
      icon: CheckCircle2,
      color: '#c084fc',
      background: 'bg-purple-400/10',
    },
  ]

  const totalVehicles = vehicleStatus.reduce(
    (total, item) => total + item.value,
    0,
  )

  const chartUnavailable = chartsError || error

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              WMS / Operations
            </p>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Dashboard
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Overview of city waste management operations.
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
            aria-label="Notifications"
            title="Notifications are not connected yet"
            className="rounded-lg border border-slate-700 bg-[#0d1521] p-2.5 text-slate-300 hover:border-emerald-400/40"
          >
            <Bell size={16} />
          </button>
        </div>
      </div>

      {(error || chartsError) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-4 py-3"
        >
          <div>
            <p className="text-xs font-medium text-red-300">
              Some dashboard data could not be loaded
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {[error, chartsError].filter(Boolean).join(' ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-200 hover:bg-red-400/10"
          >
            Retry
          </button>
        </div>
      )}

      <p className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2 text-[10px] text-emerald-200/80">
        {loading || chartsLoading
          ? 'Loading live dashboard data…'
          : chartUnavailable
            ? 'Some live dashboard data is unavailable. Use Retry to try again.'
            : 'Dashboard metrics and chart data are loaded from the database.'}
      </p>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon

          return (
            <Panel
              key={metric.title}
              className="p-4 transition duration-200 hover:-translate-y-0.5 hover:border-slate-600"
            >
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${metric.background}`}
                  style={{ color: metric.color }}
                >
                  <Icon size={18} />
                </div>
                <MoreHorizontal size={17} className="text-slate-600" />
              </div>

              <p className="mt-4 text-xs text-slate-400">{metric.title}</p>
              <div className="mt-1.5">
                <span className="text-3xl font-semibold tracking-tight text-white">
                  {loading || error ? '—' : metric.value}
                </span>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">
                {loading
                  ? 'Loading…'
                  : error
                    ? 'Unavailable'
                    : 'Live database value'}
              </p>
            </Panel>
          )
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel className="p-4 sm:p-5">
          <PanelHeading
            title="Complaints Trend"
            subtitle="Complaints received, grouped by creation date"
            action={
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPeriodOptions((value) => !value)}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-[10px] text-slate-300 hover:border-emerald-400/30"
                  aria-expanded={showPeriodOptions}
                >
                  {selectedPeriod}
                  <ChevronDown size={13} />
                </button>

                {showPeriodOptions && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-36 overflow-hidden rounded-lg border border-slate-700 bg-[#111b29] p-1 shadow-xl">
                    {periodOptions.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => {
                          setPeriod(option.value)
                          setShowPeriodOptions(false)
                        }}
                        className={`block w-full rounded-md px-3 py-2 text-left text-[11px] hover:bg-emerald-400/10 hover:text-emerald-300 ${
                          period === option.value
                            ? 'text-emerald-300'
                            : 'text-slate-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            }
          />

          <div className="mb-4 flex flex-wrap gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Received
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Currently resolved
            </span>
          </div>

          {chartsLoading ? (
            <div className="flex h-[245px] items-center justify-center text-xs text-slate-400">
              Loading complaints trend…
            </div>
          ) : chartsError ? (
            <div className="flex h-[245px] flex-col items-center justify-center gap-2 text-center">
              <p className="text-xs text-red-300">
                Could not load complaints trend.
              </p>
              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                className="text-xs text-emerald-300 hover:text-emerald-200"
              >
                Try again
              </button>
            </div>
          ) : complaintsTrend.length === 0 ? (
            <div className="flex h-[245px] items-center justify-center text-xs text-slate-400">
              No complaints recorded in this period.
            </div>
          ) : (
            <div className="h-[245px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={complaintsTrend}
                  margin={{ top: 8, right: 5, left: -22, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="rgba(148,163,184,0.10)"
                    strokeDasharray="3 5"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) =>
                      formatChartDate(value, period)
                    }
                    tick={{ fill: '#718399', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#718399', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    labelFormatter={(value) =>
                      formatChartDate(String(value), period)
                    }
                    contentStyle={{
                      background: '#101925',
                      border: '1px solid #334155',
                      borderRadius: 10,
                      fontSize: 11,
                    }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="received"
                    name="Received"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentlyResolved"
                    name="Currently resolved"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-2 text-[10px] text-slate-500">
            Currently resolved complaints are grouped by their creation date;
            this is not a historical resolution timeline.
          </p>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <PanelHeading
            title="Vehicle Status"
            subtitle="Live fleet breakdown by recorded status"
            action={<MoreHorizontal size={15} className="text-slate-400" />}
          />

          {chartsLoading ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-slate-400">
              Loading vehicle statuses…
            </div>
          ) : chartsError ? (
            <div className="flex h-[220px] items-center justify-center text-center text-xs text-red-300">
              Could not load vehicle statuses.
            </div>
          ) : vehicleStatus.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-slate-400">
              No vehicles found.
            </div>
          ) : (
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_1fr]">
              <div className="relative mx-auto h-[190px] w-full max-w-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={vehicleStatus}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="62%"
                      outerRadius="88%"
                      paddingAngle={3}
                      stroke="none"
                    >
                      {vehicleStatus.map((item) => (
                        <Cell
                          key={item.name}
                          fill={vehicleColors[item.name] ?? '#94a3b8'}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#101925',
                        border: '1px solid #334155',
                        borderRadius: 10,
                        fontSize: 11,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <Truck size={17} className="mb-1 text-emerald-300" />
                  <span className="text-2xl font-semibold text-white">
                    {totalVehicles}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Total vehicles
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {vehicleStatus.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            vehicleColors[item.name] ?? '#94a3b8',
                        }}
                      />
                      <span className="text-[11px] text-slate-400">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-200">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </section>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Recent Complaints
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Latest complaints retrieved from the backend
            </p>
          </div>
          <Link
            to="/complaints"
            className="text-[11px] font-medium text-emerald-300 transition hover:text-emerald-200"
          >
            View All →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-y border-white/[0.06] bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">ID</th>
                <th className="px-5 py-3 font-medium">Ward</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {complaintsLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-xs text-slate-400"
                  >
                    Loading recent complaints…
                  </td>
                </tr>
              ) : complaintsError ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-xs text-red-300"
                  >
                    {complaintsError}
                  </td>
                </tr>
              ) : recentComplaints.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-xs text-slate-400"
                  >
                    No complaints found.
                  </td>
                </tr>
              ) : (
                recentComplaints.map((complaint) => (
                  <tr
                    key={complaint.id}
                    className="border-b border-white/[0.04] last:border-0 transition hover:bg-white/[0.02]"
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-[11px] font-medium text-slate-300">
                      #{complaint.id}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[11px] text-slate-400">
                      Ward {complaint.ward}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[11px] text-slate-300">
                      {complaint.type}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={complaint.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[10px] text-slate-500">
                      {formatComplaintDate(complaint.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-white/[0.05] px-5 py-3">
          <p className="text-[10px] text-slate-500">
            {complaintsLoading
              ? 'Loading complaints from the database.'
              : complaintsError
                ? 'Could not retrieve complaints from the database.'
                : `Showing ${recentComplaints.length} complaint(s) returned by the API.`}
          </p>
        </div>
      </Panel>
    </div>
  )
}
