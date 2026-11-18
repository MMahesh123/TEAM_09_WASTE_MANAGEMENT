
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Filter,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

type ComplaintStatus = 'Pending' | 'In-Progress' | 'Resolved'

interface Complaint {
  id: number
  user_id: number | null
  citizen_name: string | null
  citizen_email: string | null
  ward: string
  type: string
  description: string
  status: ComplaintStatus
  created_at: string
}

interface ComplaintsResponse {
  success: boolean
  count: number
  data: Complaint[]
}

const statuses: ComplaintStatus[] = [
  'Pending',
  'In-Progress',
  'Resolved',
]

function formatDate(value: string) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: ComplaintStatus }) {
  const styles: Record<ComplaintStatus, string> = {
    Pending: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
    'In-Progress': 'border-sky-400/20 bg-sky-400/10 text-sky-300',
    Resolved: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  }

  const label =
    status === 'In-Progress' ? 'In Progress' : status

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-medium ${styles[status]}`}
    >
      {label}
    </span>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: typeof AlertCircle
  color: string
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-[#0d1521] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">{label}</p>
        <Icon size={17} className={color} />
      </div>

      <p className="mt-3 text-2xl font-semibold text-white">
        {value}
      </p>
    </div>
  )
}

export default function ComplaintsManagementPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  const [refreshKey, setRefreshKey] = useState(0)

  // Load complaints from backend.
  const loadComplaints = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response =
        await apiClient.get<ComplaintsResponse>('/complaints')

      if (
        !response.data.success ||
        !Array.isArray(response.data.data)
      ) {
        throw new Error(
          'The complaints API returned an unexpected response.',
        )
      }

      setComplaints(response.data.data)

    } catch (err) {
      setError(getApiErrorMessage(err))

    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadComplaints()
  }, [loadComplaints, refreshKey])

  // Get unique complaint types for filtering.
  const complaintTypes = useMemo(
    () =>
      [
        ...new Set(
          complaints
            .map((item) => item.type)
            .filter(Boolean),
        ),
      ].sort(),
    [complaints],
  )

  // Search and filter complaints.
  const filteredComplaints = useMemo(() => {
    const query = search.trim().toLowerCase()

    return complaints.filter((complaint) => {
      const matchesStatus =
        statusFilter === 'All' ||
        complaint.status === statusFilter

      const matchesType =
        typeFilter === 'All' ||
        complaint.type === typeFilter

      const searchableText = [
        complaint.id,
        complaint.user_id ?? '',
        complaint.citizen_name ?? '',
        complaint.citizen_email ?? '',
        complaint.ward,
        complaint.type,
        complaint.description,
      ]
        .join(' ')
        .toLowerCase()

      return (
        matchesStatus &&
        matchesType &&
        searchableText.includes(query)
      )
    })
  }, [complaints, search, statusFilter, typeFilter])

  // Calculate complaint statistics.
  const counts = useMemo(
    () => ({
      total: complaints.length,

      pending: complaints.filter(
        (item) => item.status === 'Pending',
      ).length,

      inProgress: complaints.filter(
        (item) => item.status === 'In-Progress',
      ).length,

      resolved: complaints.filter(
        (item) => item.status === 'Resolved',
      ).length,
    }),
    [complaints],
  )

  // Update complaint status.
  async function updateStatus(
    id: number,
    status: ComplaintStatus,
  ) {
    setUpdatingId(id)
    setError('')
    setSuccess('')

    try {
      const response = await apiClient.patch(
        `/complaints/${id}/status`,
        { status },
      )

      if (!response.data?.success) {
        throw new Error(
          response.data?.message ||
            'Could not update complaint status.',
        )
      }

      setComplaints((current) =>
        current.map((complaint) =>
          complaint.id === id
            ? { ...complaint, status }
            : complaint,
        ),
      )

      setSuccess(
        `Complaint #${id} updated to ${status}.`,
      )

    } catch (err) {
      setError(getApiErrorMessage(err))

    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />

            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              WMS / Complaint Operations
            </p>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Complaints Management
          </h1>

          <p className="mt-1 text-xs text-slate-400">
            Review citizen complaints and track resolution progress.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSuccess('')
            setRefreshKey((value) => value + 1)
          }}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1521] px-3 py-2.5 text-[11px] text-slate-300 transition hover:border-emerald-400/40 disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-4 py-3"
        >
          <AlertCircle
            size={16}
            className="mt-0.5 shrink-0 text-red-300"
          />

          <p className="text-xs text-red-200">
            {error}
          </p>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3"
        >
          <CheckCircle2
            size={16}
            className="mt-0.5 shrink-0 text-emerald-300"
          />

          <p className="text-xs text-emerald-200">
            {success}
          </p>
        </div>
      )}

      {/* Statistics */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Complaints"
          value={counts.total}
          icon={ShieldCheck}
          color="text-slate-300"
        />

        <MetricCard
          label="Pending"
          value={counts.pending}
          icon={Clock3}
          color="text-orange-300"
        />

        <MetricCard
          label="In Progress"
          value={counts.inProgress}
          icon={AlertCircle}
          color="text-sky-300"
        />

        <MetricCard
          label="Resolved"
          value={counts.resolved}
          icon={CheckCircle2}
          color="text-emerald-300"
        />
      </section>

      {/* Filters */}
      <section className="rounded-2xl border border-slate-700/60 bg-[#0d1521] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Filter
            size={15}
            className="text-emerald-300"
          />

          <h2 className="text-sm font-semibold text-white">
            Filter Complaints
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">

          {/* Search */}
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search ID, citizen, ward, type or description..."
              className="w-full rounded-lg border border-slate-700 bg-[#080f19] py-2.5 pl-9 pr-3 text-xs text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
            className="rounded-lg border border-slate-700 bg-[#080f19] px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-emerald-400/50"
          >
            <option value="All">All statuses</option>

            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === 'In-Progress'
                  ? 'In Progress'
                  : status}
              </option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value)
            }
            className="rounded-lg border border-slate-700 bg-[#080f19] px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-emerald-400/50"
          >
            <option value="All">
              All complaint types
            </option>

            {complaintTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-3 text-[10px] text-slate-500">
          Showing {filteredComplaints.length} of{' '}
          {complaints.length} complaints
        </p>
      </section>

      {/* Complaints table */}
      <section className="overflow-hidden rounded-2xl border border-slate-700/60 bg-[#0d1521]">

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">
              All Complaints
            </h2>

            <p className="mt-1 text-[11px] text-slate-500">
              Update the status as each complaint is handled.
            </p>
          </div>

          <span className="rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] text-slate-400">
            {complaints.length} records
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-xs text-slate-400">
            <LoaderCircle
              size={16}
              className="animate-spin"
            />
            Loading complaints...
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <ShieldCheck
              size={25}
              className="mx-auto text-slate-600"
            />

            <p className="mt-3 text-sm font-medium text-slate-300">
              No complaints found
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Try changing the filters or refresh the records.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left">

              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-medium">
                    Complaint
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Citizen
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Ward
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Complaint Details
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Submitted On
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Status
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Update Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredComplaints.map((complaint) => (
                  <tr
                    key={complaint.id}
                    className="border-b border-white/[0.04] align-top last:border-0 hover:bg-white/[0.02]"
                  >
                    {/* Complaint ID */}
                    <td className="px-5 py-4 text-xs font-semibold text-white">
                      #{complaint.id}
                    </td>

                    {/* Citizen information */}
                    <td className="px-5 py-4">
                      <p className="text-xs font-medium text-slate-200">
                        {complaint.citizen_name ||
                          'Unknown Citizen'}
                      </p>

                      <p className="mt-1 text-[10px] text-slate-500">
                        ID:{' '}
                        {complaint.user_id ?? 'Not linked'}
                      </p>

                      {complaint.citizen_email && (
                        <p className="mt-1 text-[10px] text-slate-500">
                          {complaint.citizen_email}
                        </p>
                      )}
                    </td>

                    {/* Ward */}
                    <td className="px-5 py-4 text-xs text-slate-300">
                      {complaint.ward || '—'}
                    </td>

                    {/* Complaint details */}
                    <td className="max-w-[300px] px-5 py-4">
                      <p className="text-xs font-medium text-slate-200">
                        {complaint.type}
                      </p>

                      <p className="mt-1 whitespace-normal break-words text-[11px] leading-5 text-slate-500">
                        {complaint.description ||
                          'No description provided.'}
                      </p>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      {formatDate(complaint.created_at)}
                    </td>

                    {/* Current status */}
                    <td className="px-5 py-4">
                      <StatusBadge
                        status={complaint.status}
                      />
                    </td>

                    {/* Update status */}
                    <td className="px-5 py-4">
                      <select
                        value={complaint.status}
                        disabled={
                          updatingId === complaint.id
                        }
                        onChange={(event) =>
                          void updateStatus(
                            complaint.id,
                            event.target.value as ComplaintStatus,
                          )
                        }
                        className="min-w-[140px] rounded-lg border border-slate-700 bg-[#080f19] px-2.5 py-2 text-[11px] text-slate-200 outline-none focus:border-emerald-400/50 disabled:opacity-50"
                      >
                        {statuses.map((status) => (
                          <option
                            key={status}
                            value={status}
                          >
                            {status === 'In-Progress'
                              ? 'In Progress'
                              : status}
                          </option>
                        ))}
                      </select>

                      {updatingId === complaint.id && (
                        <LoaderCircle
                          size={13}
                          className="ml-2 inline animate-spin text-emerald-300"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[10px] leading-5 text-slate-500">
        Complaint records and status changes are loaded from
        the backend. Status updates are saved to the database.
      </p>
    </div>
  )
}
