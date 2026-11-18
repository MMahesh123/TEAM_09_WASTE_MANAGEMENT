
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Plus,
  RefreshCw,
  MessageSquare,
  ClipboardList,
  ArrowUpRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

type Complaint = {
  id?: number
  complaint_id?: number
  ward?: string
  type?: string
  description?: string
  status?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function getRows(payload: unknown): Complaint[] {
  if (Array.isArray(payload)) return payload as Complaint[]

  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: Complaint[] }).data
  }

  return []
}

function getComplaintId(complaint: Complaint) {
  return complaint.complaint_id ?? complaint.id ?? '—'
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

function normalizeStatus(status?: string) {
  return String(status || 'Pending').toLowerCase().replace(/\s+/g, '-')
}

function statusClass(status?: string) {
  switch (normalizeStatus(status)) {
    case 'resolved':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    case 'in-progress':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-300'
    case 'rejected':
    case 'cancelled':
      return 'border-red-500/20 bg-red-500/10 text-red-300'
    default:
      return 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300'
  }
}

function Metric({
  title,
  value,
  description,
  icon,
  color,
}: {
  title: string
  value: number
  description: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-[#0d1521] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{title}</p>
        <div className={`rounded-xl p-2.5 ${color}`}>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  )
}

export default function CitizenDashboardPage() {
  const navigate = useNavigate()

  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('wms_user') || '{}')
    } catch {
      return {}
    }
  }, [])

  const fetchComplaints = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await apiClient.get('/complaints')
      setComplaints(getRows(response.data))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchComplaints()
  }, [fetchComplaints])

  const pendingCount = complaints.filter(
    (item) => normalizeStatus(item.status) === 'pending',
  ).length

  const inProgressCount = complaints.filter(
    (item) => normalizeStatus(item.status) === 'in-progress',
  ).length

  const resolvedCount = complaints.filter(
    (item) => normalizeStatus(item.status) === 'resolved',
  ).length

  const filteredComplaints = complaints.filter((complaint) => {
    const query = search.toLowerCase()

    const matchesSearch =
      String(getComplaintId(complaint)).includes(query) ||
      String(complaint.type || '').toLowerCase().includes(query) ||
      String(complaint.ward || '').toLowerCase().includes(query) ||
      String(complaint.description || '').toLowerCase().includes(query)

    const matchesFilter =
      filter === 'All' ||
      normalizeStatus(complaint.status) === normalizeStatus(filter)

    return matchesSearch && matchesFilter
  })

  const sortedComplaints = [...filteredComplaints].sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime(),
  )

  return (
    <div className="space-y-6 text-slate-100">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            WMS / Citizen Workspace
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            Welcome, {user.username || 'Citizen'}
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Submit complaints and follow the progress of your reports
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void fetchComplaints()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1521] px-3 py-2.5 text-[11px] text-slate-300 transition hover:border-emerald-400/40 hover:text-white disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </button>

          <button
            onClick={() => navigate('/complaints')}
            className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-[11px] font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            <Plus size={16} />
            Submit Complaint
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Information panel */}
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1521] p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-400/10 p-3 text-emerald-300">
            <MessageSquare size={22} />
          </div>

          <div className="flex-1">
            <h2 className="font-semibold text-white">
              Help keep your city clean
            </h2>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              Report overflowing bins, missed waste collection and other
              sanitation issues. You can track the progress of your complaints
              from this dashboard.
            </p>

            <button
              onClick={() => navigate('/complaints')}
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
            >
              Report an issue
              <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Complaint metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Total Complaints"
          value={complaints.length}
          description="Reports submitted by you"
          icon={<FileText size={21} />}
          color="bg-blue-500/10 text-blue-400"
        />

        <Metric
          title="Pending"
          value={pendingCount}
          description="Waiting for action"
          icon={<Clock size={21} />}
          color="bg-yellow-500/10 text-yellow-400"
        />

        <Metric
          title="In Progress"
          value={inProgressCount}
          description="Currently being addressed"
          icon={<AlertCircle size={21} />}
          color="bg-blue-500/10 text-blue-400"
        />

        <Metric
          title="Resolved"
          value={resolvedCount}
          description="Issues marked as resolved"
          icon={<CheckCircle2 size={21} />}
          color="bg-emerald-500/10 text-emerald-400"
        />
      </div>

      {/* Complaints list */}
      <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-[#0d1521]">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-700/60 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-400/10 p-2.5 text-emerald-300">
              <ClipboardList size={21} />
            </div>

            <div>
              <h2 className="font-semibold text-white">My Complaints</h2>
              <p className="mt-1 text-xs text-slate-500">
                Track your submitted sanitation reports
              </p>
            </div>
          </div>

          <span className="text-xs text-slate-500">
            {filteredComplaints.length} records
          </span>
        </div>

        {/* Search and filters */}
        <div className="flex flex-col gap-3 border-b border-slate-700/60 p-5 sm:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search complaint ID, ward or type..."
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#101b2a] px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
          />

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-lg border border-slate-700 bg-[#101b2a] px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-400/60"
          >
            <option value="All">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="In-Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>

        {/* Loading, empty state and complaint records */}
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">
            Loading your complaints...
          </div>
        ) : sortedComplaints.length === 0 ? (
          <div className="p-12 text-center">
            <FileText
              className="mx-auto mb-3 text-slate-500"
              size={34}
            />

            <p className="font-semibold text-white">No complaints found</p>

            <p className="mt-1 text-sm text-slate-500">
              {complaints.length === 0
                ? 'You have not submitted any complaints yet.'
                : 'Try changing your search or status filter.'}
            </p>

            {complaints.length === 0 && (
              <button
                onClick={() => navigate('/complaints')}
                className="mt-4 rounded-lg bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                Submit Your First Complaint
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-700/40">
            {sortedComplaints.map((complaint, index) => {
              const status = complaint.status || 'Pending'
              const complaintId = getComplaintId(complaint)

              return (
                <div
                  key={complaintId === '—' ? index : complaintId}
                  className="p-5 transition hover:bg-white/[0.02]"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">
                          {complaint.type || 'Waste complaint'}
                        </h3>

                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(status)}`}
                        >
                          {status}
                        </span>
                      </div>

                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        {complaint.description ||
                          'No description available.'}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <MapPin size={13} />
                          {complaint.ward || 'Ward not specified'}
                        </span>

                        <span className="flex items-center gap-1.5">
                          <Clock size={13} />
                          Submitted: {formatDate(complaint.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-xs text-slate-500">
                      Complaint #{complaintId}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Complaint tracking guide */}
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1521] p-5">
        <h2 className="font-semibold text-white">
          How complaint tracking works
        </h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <div className="flex gap-3">
            <div className="rounded-lg bg-yellow-500/10 p-2 text-yellow-400">
              <Clock size={18} />
            </div>

            <div>
              <p className="text-sm font-medium text-white">Pending</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Your complaint has been submitted and is awaiting action.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <AlertCircle size={18} />
            </div>

            <div>
              <p className="text-sm font-medium text-white">In Progress</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                The waste management team is working on the issue.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <CheckCircle2 size={18} />
            </div>

            <div>
              <p className="text-sm font-medium text-white">Resolved</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                The complaint has been marked as resolved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
