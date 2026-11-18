
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  RefreshCw,
  FileText,
  Clock,
  CheckCircle2,
  Truck,
  AlertCircle,
  TrendingUp,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'
import OperationsReports from './OperationsReports'

type Summary = {
  totalComplaints: number
  pendingComplaints: number
  inProgressComplaints: number
  resolvedComplaints: number
  activeVehicles: number
}

type ChartItem = {
  [key: string]: unknown
}

type ChartData = {
  complaintsTrend?: ChartItem[]
  vehicleStatus?: ChartItem[]
  [key: string]: unknown
}

const emptySummary: Summary = {
  totalComplaints: 0,
  pendingComplaints: 0,
  inProgressComplaints: 0,
  resolvedComplaints: 0,
  activeVehicles: 0,
}

function readNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readArray(value: unknown): ChartItem[] {
  return Array.isArray(value) ? value as ChartItem[] : []
}

function readLabel(item: ChartItem, index: number): string {
  const value =
    item.date ??
    item.day ??
    item.label ??
    item.period ??
    item.status ??
    item.month ??
    item.name

  if (value === undefined || value === null) {
    return `Item ${index + 1}`
  }

  return String(value)
}

function readValue(item: ChartItem): number {
  const candidates = [
    item.count,
    item.total,
    item.value,
    item.complaints,
    item.vehicle_count,
    item.total_count,
  ]

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return readNumber(candidate)
    }
  }

  return 0
}

function formatNumber(value: number) {
  return value.toLocaleString('en-IN')
}

function MetricCard({
  title,
  value,
  description,
  icon,
  accent,
}: {
  title: string
  value: number
  description: string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{title}</p>
        <div className={`rounded-xl p-2.5 ${accent}`}>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-bold">{formatNumber(value)}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </div>
  )
}

function BarList({
  title,
  items,
  emptyMessage,
}: {
  title: string
  items: ChartItem[]
  emptyMessage: string
}) {
  const maxValue = Math.max(...items.map(readValue), 1)

  return (
    <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
      <h2 className="mb-5 font-semibold">{title}</h2>

      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-5">
          {items.map((item, index) => {
            const value = readValue(item)
            const percentage = (value / maxValue) * 100

            return (
              <div key={`${readLabel(item, index)}-${index}`}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-gray-300">
                    {readLabel(item, index)}
                  </span>
                  <span className="font-semibold text-white">
                    {formatNumber(value)}
                  </span>
                </div>

                <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<Summary>(emptySummary)
  const [charts, setCharts] = useState<ChartData>({})
  const [range, setRange] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [summaryResponse, chartsResponse] = await Promise.all([
        apiClient.get('/dashboard/summary'),
        apiClient.get('/dashboard/charts', {
          params: { period: range },
        }),
      ])

      const summaryPayload =
        summaryResponse.data?.data ?? summaryResponse.data ?? {}

      const chartPayload =
        chartsResponse.data?.data ?? chartsResponse.data ?? {}

      setSummary({
        totalComplaints: readNumber(summaryPayload.totalComplaints),
        pendingComplaints: readNumber(summaryPayload.pendingComplaints),
        inProgressComplaints: readNumber(summaryPayload.inProgressComplaints),
        resolvedComplaints: readNumber(summaryPayload.resolvedComplaints),
        activeVehicles: readNumber(summaryPayload.activeVehicles),
      })

      setCharts(
        chartPayload && typeof chartPayload === 'object'
          ? chartPayload as ChartData
          : {},
      )

      setLastUpdated(new Date())
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void fetchReports()
  }, [fetchReports])

  const complaintTrend = useMemo(
    () => readArray(charts.complaintsTrend),
    [charts],
  )

  const vehicleStatus = useMemo(
    () => readArray(charts.vehicleStatus),
    [charts],
  )

  const resolutionRate =
    summary.totalComplaints > 0
      ? (summary.resolvedComplaints / summary.totalComplaints) * 100
      : 0

  const statusTotal =
    summary.pendingComplaints +
    summary.inProgressComplaints +
    summary.resolvedComplaints

  return (
    <div className="min-h-screen space-y-6 bg-[#09090f] p-4 text-white sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400">
            <BarChart3 size={24} />
          </div>

          <div>
            <h1 className="text-2xl font-bold">Reports & Analytics</h1>
            <p className="mt-1 text-sm text-gray-400">
              Monitor city waste management performance
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="rounded-xl border border-white/10 bg-[#12121b] px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="6m">Last 6 months</option>
          </select>

          <button
            onClick={() => void fetchReports()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Reporting period: {range === '7d' ? '7 days' : range === '30d' ? '30 days' : '6 months'}
        </span>
        <span>
          {lastUpdated
            ? `Last updated: ${lastUpdated.toLocaleTimeString('en-IN')}`
            : 'Not yet updated'}
        </span>
      </div>

      {loading && !lastUpdated ? (
        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-12 text-center text-gray-400">
          Loading reports...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Complaints"
              value={summary.totalComplaints}
              description="All registered complaints"
              icon={<FileText size={20} />}
              accent="bg-blue-500/10 text-blue-400"
            />

            <MetricCard
              title="Pending"
              value={summary.pendingComplaints}
              description="Awaiting action"
              icon={<Clock size={20} />}
              accent="bg-yellow-500/10 text-yellow-400"
            />

            <MetricCard
              title="In Progress"
              value={summary.inProgressComplaints}
              description="Currently being handled"
              icon={<TrendingUp size={20} />}
              accent="bg-purple-500/10 text-purple-400"
            />

            <MetricCard
              title="Resolved"
              value={summary.resolvedComplaints}
              description="Successfully resolved"
              icon={<CheckCircle2 size={20} />}
              accent="bg-emerald-500/10 text-emerald-400"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Complaint Resolution</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Current complaint status distribution
                  </p>
                </div>
                <CheckCircle2 className="text-emerald-400" size={22} />
              </div>

              <div className="mt-6">
                <div className="mb-2 flex items-end justify-between">
                  <span className="text-3xl font-bold">
                    {resolutionRate.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500">
                    Resolution rate
                  </span>
                </div>

                <div className="flex h-4 overflow-hidden rounded-full bg-white/10">
                  {statusTotal > 0 && (
                    <>
                      <div
                        className="bg-yellow-400"
                        style={{
                          width: `${(summary.pendingComplaints / statusTotal) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-purple-400"
                        style={{
                          width: `${(summary.inProgressComplaints / statusTotal) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-emerald-400"
                        style={{
                          width: `${(summary.resolvedComplaints / statusTotal) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
                    <span className="h-2 w-2 rounded-full bg-yellow-400" />
                    Pending
                  </div>
                  <p className="text-xl font-bold">
                    {summary.pendingComplaints}
                  </p>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
                    <span className="h-2 w-2 rounded-full bg-purple-400" />
                    In Progress
                  </div>
                  <p className="text-xl font-bold">
                    {summary.inProgressComplaints}
                  </p>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Resolved
                  </div>
                  <p className="text-xl font-bold">
                    {summary.resolvedComplaints}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-500/10 p-3 text-blue-400">
                  <Truck size={22} />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Active Vehicles</p>
                  <p className="text-3xl font-bold">
                    {summary.activeVehicles}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl bg-white/[0.03] p-4">
                <p className="text-xs text-gray-500">
                  Fleet availability
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  This figure reflects the active vehicle count returned by the dashboard summary API.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BarList
              title="Complaint Trend"
              items={complaintTrend}
              emptyMessage="No complaint trend data returned for this period."
            />

            <BarList
              title="Vehicle Status Breakdown"
              items={vehicleStatus}
              emptyMessage="No vehicle status data returned."
            />
          </div>

          <OperationsReports period={range} />

          <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 text-blue-400" size={19} />
              <div>
                <h2 className="font-semibold">Report information</h2>
                <p className="mt-1 text-sm leading-6 text-gray-400">
                  These reports use the existing dashboard summary and charts APIs,
                  along with the operational reports API. Complaint status totals
                  are based on the summary response; trend and vehicle breakdown
                  charts use the selected reporting period. Operational collection,
                  assignment, disposal and payment summaries use their respective
                  database records.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
