
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  Truck,
  Recycle,
  Wallet,
  RefreshCw,
  MapPin,
  CalendarDays,
  CheckCircle2,
  Clock,
  PlayCircle,
  AlertCircle,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

type Assignment = {
  assignment_id: number
  id?: number
  ward_name?: string
  ward?: string
  ward_id?: number
  vehicle_id?: number
  registration_number?: string
  vehicle_number?: string
  shift_date?: string
  shift?: string
  status?: string
  [key: string]: unknown
}

type Collection = {
  log_id?: number
  assignment_id?: number
  waste_type?: string
  waste_tons?: number
  ward_name?: string
  collected_at?: string
  notes?: string
}

type Payment = {
  payment_id?: number
  id?: number
  amount?: number
  total_amount?: number
  status?: string
  payment_status?: string
  period_start?: string
  period_end?: string
  created_at?: string
  [key: string]: unknown
}

function getRows<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]

  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: T[] }).data
  }

  return []
}

function getAssignmentId(assignment: Assignment) {
  return assignment.assignment_id ?? assignment.id ?? 0
}

function getPaymentAmount(payment: Payment) {
  return Number(payment.amount ?? payment.total_amount ?? 0)
}

function getPaymentStatus(payment: Payment) {
  return String(payment.status ?? payment.payment_status ?? 'Pending')
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

function statusClass(status: string) {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'resolved':
    case 'paid':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    case 'in-progress':
    case 'in progress':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-300'
    case 'cancelled':
    case 'failed':
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
  value: string | number
  description: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{title}</p>
        <div className={`rounded-xl p-2.5 ${color}`}>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </div>
  )
}

export default function WorkerDashboardPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('wms_user') || '{}')
    } catch {
      return {}
    }
  }, [])

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [assignmentResponse, collectionResponse, paymentResponse] =
        await Promise.all([
          apiClient.get('/assignments'),
          apiClient.get('/collections'),
          apiClient.get('/payments'),
        ])

      setAssignments(getRows<Assignment>(assignmentResponse.data))
      setCollections(getRows<Collection>(collectionResponse.data))
      setPayments(getRows<Payment>(paymentResponse.data))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchDashboard()
  }, [fetchDashboard])

  async function updateAssignment(
    assignment: Assignment,
    nextStatus: 'In-Progress' | 'Completed',
  ) {
    const id = getAssignmentId(assignment)

    if (!id) {
      setError('Assignment ID is missing.')
      return
    }

    const confirmed = window.confirm(
      `Change assignment #${id} to ${nextStatus}?`,
    )

    if (!confirmed) return

    setUpdatingId(id)
    setError('')
    setSuccess('')

    try {
      await apiClient.patch(`/assignments/${id}/status`, {
        status: nextStatus,
      })

      setSuccess(`Assignment #${id} updated to ${nextStatus}.`)
      await fetchDashboard()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setUpdatingId(null)
    }
  }

  const completedAssignments = assignments.filter(
    (item) => item.status?.toLowerCase() === 'completed',
  ).length

  const activeAssignments = assignments.filter(
    (item) => item.status?.toLowerCase() === 'in-progress',
  ).length

  const totalTons = collections.reduce(
    (sum, item) => sum + Number(item.waste_tons || 0),
    0,
  )

  const paidAmount = payments
    .filter((item) => getPaymentStatus(item).toLowerCase() === 'paid')
    .reduce((sum, item) => sum + getPaymentAmount(item), 0)

  const recentCollections = [...collections]
    .sort(
      (a, b) =>
        new Date(b.collected_at || 0).getTime() -
        new Date(a.collected_at || 0).getTime(),
    )
    .slice(0, 5)

  const recentPayments = [...payments]
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime(),
    )
    .slice(0, 5)

  return (
    <div className="min-h-screen space-y-6 bg-[#09090f] p-4 text-white sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-emerald-400">Worker Portal</p>
          <h1 className="mt-1 text-2xl font-bold">
            Welcome, {user.username || 'Worker'}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Your assignments, collections and payment activity
          </p>
        </div>

        <button
          onClick={() => void fetchDashboard()}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh Dashboard
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="My Assignments"
          value={assignments.length}
          description="Total assigned tasks"
          icon={<ClipboardList size={21} />}
          color="bg-blue-500/10 text-blue-400"
        />

        <Metric
          title="In Progress"
          value={activeAssignments}
          description="Tasks currently underway"
          icon={<Clock size={21} />}
          color="bg-purple-500/10 text-purple-400"
        />

        <Metric
          title="Completed"
          value={completedAssignments}
          description="Successfully completed tasks"
          icon={<CheckCircle2 size={21} />}
          color="bg-emerald-500/10 text-emerald-400"
        />

        <Metric
          title="Waste Collected"
          value={`${totalTons.toFixed(2)} t`}
          description="Total recorded collection"
          icon={<Recycle size={21} />}
          color="bg-orange-500/10 text-orange-400"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">My Assignments</h2>
              <p className="mt-1 text-xs text-gray-500">
                View and update your assigned work
              </p>
            </div>
            <ClipboardList size={20} className="text-blue-400" />
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400">
              Loading assignments...
            </p>
          ) : assignments.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardList className="mx-auto mb-3 text-gray-500" size={30} />
              <p className="font-medium">No assignments yet</p>
              <p className="mt-1 text-xs text-gray-500">
                New assignments from your supervisor will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => {
                const id = getAssignmentId(assignment)
                const status = assignment.status || 'Scheduled'
                const normalized = status.toLowerCase()
                const isUpdating = updatingId === id

                return (
                  <div
                    key={id}
                    className="rounded-xl border border-white/10 bg-white/[0.025] p-4"
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">
                            Assignment #{id}
                          </h3>
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(status)}`}>
                            {status}
                          </span>
                        </div>

                        <p className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                          <MapPin size={14} />
                          {assignment.ward_name || assignment.ward || `Ward ${assignment.ward_id ?? '—'}`}
                        </p>

                        <p className="mt-1 flex items-center gap-2 text-sm text-gray-400">
                          <Truck size={14} />
                          {assignment.registration_number ||
                            assignment.vehicle_number ||
                            `Vehicle #${assignment.vehicle_id ?? '—'}`}
                        </p>

                        <p className="mt-1 flex items-center gap-2 text-sm text-gray-400">
                          <CalendarDays size={14} />
                          {formatDate(assignment.shift_date)} · {assignment.shift || 'Shift not specified'}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {normalized === 'scheduled' && (
                          <button
                            disabled={isUpdating}
                            onClick={() =>
                              void updateAssignment(assignment, 'In-Progress')
                            }
                            className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/20 disabled:opacity-50"
                          >
                            <PlayCircle size={14} />
                            {isUpdating ? 'Updating...' : 'Start'}
                          </button>
                        )}

                        {normalized === 'in-progress' && (
                          <button
                            disabled={isUpdating}
                            onClick={() =>
                              void updateAssignment(assignment, 'Completed')
                            }
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                            {isUpdating ? 'Updating...' : 'Complete'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Payment Summary</h2>
            <Wallet size={20} className="text-emerald-400" />
          </div>

          <p className="mt-6 text-sm text-gray-400">Total paid amount</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">
            ₹{paidAmount.toLocaleString('en-IN', {
              maximumFractionDigits: 2,
            })}
          </p>

          <div className="mt-6 border-t border-white/10 pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Payment records</span>
              <strong>{payments.length}</strong>
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-gray-400">Paid records</span>
              <strong>
                {payments.filter(
                  (item) => getPaymentStatus(item).toLowerCase() === 'paid',
                ).length}
              </strong>
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-gray-400">Pending records</span>
              <strong>
                {payments.filter(
                  (item) => getPaymentStatus(item).toLowerCase() !== 'paid',
                ).length}
              </strong>
            </div>
          </div>

          <p className="mt-5 text-xs leading-5 text-gray-500">
            Payment records are read-only for Workers. Contact your Admin for payment queries.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-semibold">Recent Collections</h2>
            <Recycle size={19} className="text-orange-400" />
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
          ) : recentCollections.length === 0 ? (
            <div className="py-7 text-center text-sm text-gray-500">
              No collection records available.
            </div>
          ) : (
            <div className="space-y-3">
              {recentCollections.map((item, index) => (
                <div
                  key={item.log_id ?? index}
                  className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 last:border-0"
                >
                  <div>
                    <p className="font-medium">{item.waste_type || 'Waste collection'}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.ward_name || `Assignment #${item.assignment_id ?? '—'}`}
                      {' · '}
                      {formatDate(item.collected_at)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-semibold text-emerald-300">
                    {Number(item.waste_tons || 0).toFixed(2)} t
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-semibold">Recent Payments</h2>
            <Wallet size={19} className="text-emerald-400" />
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
          ) : recentPayments.length === 0 ? (
            <div className="py-7 text-center text-sm text-gray-500">
              No payment records available.
            </div>
          ) : (
            <div className="space-y-3">
              {recentPayments.map((payment, index) => {
                const status = getPaymentStatus(payment)

                return (
                  <div
                    key={payment.payment_id ?? payment.id ?? index}
                    className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 last:border-0"
                  >
                    <div>
                      <p className="font-medium">
                        Payment #{payment.payment_id ?? payment.id ?? '—'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatDate(payment.period_start)} – {formatDate(payment.period_end)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold">
                        ₹{getPaymentAmount(payment).toLocaleString('en-IN', {
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ${statusClass(status)}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 text-blue-400" size={19} />
          <div>
            <p className="font-medium text-blue-200">Worker dashboard information</p>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              Your assignments, collections and payments are loaded from the
              authenticated APIs. The backend controls which records you can
              access, so this dashboard does not rely on client-side filtering
              for privacy.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
