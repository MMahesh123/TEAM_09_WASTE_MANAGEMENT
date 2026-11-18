
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  Truck,
  Users,
  X,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

type Role = 'Admin' | 'Supervisor' | 'Worker'

interface StoredUser {
  id?: number
  user_id?: number
  username?: string
  role?: Role
}

interface Assignment {
  id: number
  complaint_id?: number | null
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

interface Vehicle {
  id: number
  registration_number: string
  capacity_tons: number | null
  status: string
}

interface Worker {
  user_id: number
  username: string
  email: string
}

interface Ward {
  id: number
  ward_number: string | number
  ward_name: string
  zone?: string
}

interface Complaint {
  id: number
  ward: string
  type: string
  description: string
  status: string
  created_at?: string
}

interface ListResponse<T> {
  success?: boolean
  count?: number
  data: T[]
}

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-[#101b2a] px-3 py-2.5 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60'

const selectClass = inputClass

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

function getCurrentUser(): StoredUser {
  try {
    const value = localStorage.getItem('wms_user')
    return value ? (JSON.parse(value) as StoredUser) : {}
  } catch {
    return {}
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Scheduled: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
    'In-Progress': 'border-orange-400/20 bg-orange-400/10 text-orange-300',
    Completed: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    Cancelled: 'border-red-400/20 bg-red-400/10 text-red-300',
  }

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-medium ${
        styles[status] ?? 'border-slate-600 bg-slate-700/30 text-slate-300'
      }`}
    >
      {status === 'In-Progress' ? 'In Progress' : status}
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

export default function AssignmentsPage() {
  const user = useMemo(() => getCurrentUser(), [])
  const role = user.role
  const isStaff = role === 'Admin' || role === 'Supervisor'
  const canCreate = isStaff

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [complaints, setComplaints] = useState<Complaint[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [dateFilter, setDateFilter] = useState('')

  const [form, setForm] = useState({
    complaint_id: '',
    vehicle_id: '',
    worker_id: '',
    ward_id: '',
    shift_date: getToday(),
    shift: 'Morning',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    const requests = await Promise.allSettled([
      apiClient.get<ListResponse<Assignment>>('/assignments'),
      apiClient.get<Vehicle[]>('/vehicles'),
      isStaff
        ? apiClient.get<Worker[]>('/workers')
        : Promise.resolve({ data: [] as Worker[] }),
      apiClient.get<Ward[]>('/wards'),
      isStaff
        ? apiClient.get<ListResponse<Complaint>>('/complaints')
        : Promise.resolve({
            data: { data: [] as Complaint[] },
          }),
    ])

    const errors: string[] = []

    const [
      assignmentResult,
      vehicleResult,
      workerResult,
      wardResult,
      complaintResult,
    ] = requests

    if (assignmentResult.status === 'fulfilled') {
      const response = assignmentResult.value.data

      if (Array.isArray(response.data)) {
        setAssignments(response.data)
      } else {
        errors.push('Invalid assignments response.')
      }
    } else {
      errors.push(getApiErrorMessage(assignmentResult.reason))
    }

    if (vehicleResult.status === 'fulfilled') {
      if (Array.isArray(vehicleResult.value.data)) {
        setVehicles(vehicleResult.value.data)
      } else {
        errors.push('Invalid vehicles response.')
      }
    } else {
      errors.push(getApiErrorMessage(vehicleResult.reason))
    }

    if (workerResult.status === 'fulfilled') {
      if (Array.isArray(workerResult.value.data)) {
        setWorkers(workerResult.value.data)
      } else {
        errors.push('Invalid workers response.')
      }
    } else {
      errors.push(getApiErrorMessage(workerResult.reason))
    }

    if (wardResult.status === 'fulfilled') {
      if (Array.isArray(wardResult.value.data)) {
        setWards(wardResult.value.data)
      } else {
        errors.push('Invalid wards response.')
      }
    } else {
      errors.push(getApiErrorMessage(wardResult.reason))
    }

    if (complaintResult.status === 'fulfilled') {
      const response = complaintResult.value.data

      if (Array.isArray(response.data)) {
        setComplaints(response.data)
      } else {
        errors.push('Invalid complaints response.')
      }
    } else {
      errors.push(
        `Could not load complaints: ${getApiErrorMessage(complaintResult.reason)}`,
      )
    }

    setError(errors.join(' '))
    setLoading(false)
  }, [isStaff])

  useEffect(() => {
    void loadData()
  }, [loadData, refreshKey])

  const availableVehicles = vehicles.filter(
    (vehicle) => vehicle.status === 'Available',
  )

  const availableComplaints = complaints.filter(
    (complaint) => complaint.status !== 'Resolved',
  )

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      const matchesStatus =
        statusFilter === 'All' || assignment.status === statusFilter

      const matchesDate =
        !dateFilter ||
        String(assignment.shift_date).slice(0, 10) === dateFilter

      const query = search.trim().toLowerCase()

      const matchesSearch =
        !query ||
        String(assignment.id).includes(query) ||
        String(assignment.complaint_id ?? '').includes(query) ||
        (assignment.worker_name || '').toLowerCase().includes(query) ||
        (assignment.ward_name || '').toLowerCase().includes(query) ||
        (assignment.registration_number || '').toLowerCase().includes(query)

      return matchesStatus && matchesDate && matchesSearch
    })
  }, [assignments, statusFilter, dateFilter, search])

  const scheduledCount = assignments.filter(
    (item) => item.status === 'Scheduled',
  ).length

  const activeCount = assignments.filter(
    (item) => item.status === 'In-Progress',
  ).length

  const completedCount = assignments.filter(
    (item) => item.status === 'Completed',
  ).length

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (
      !form.vehicle_id ||
      !form.worker_id ||
      !form.ward_id ||
      !form.shift_date
    ) {
      setError('Please complete all assignment fields.')
      return
    }

    setSaving(true)

    try {
      const response = await apiClient.post('/assignments', {
        complaint_id: form.complaint_id
          ? Number(form.complaint_id)
          : null,
        vehicle_id: Number(form.vehicle_id),
        worker_id: Number(form.worker_id),
        ward_id: Number(form.ward_id),
        shift_date: form.shift_date,
        shift: form.shift,
      })

      setSuccess(
        response.data?.message || 'Assignment created successfully.',
      )

      setShowForm(false)

      setForm({
        complaint_id: '',
        vehicle_id: '',
        worker_id: '',
        ward_id: '',
        shift_date: getToday(),
        shift: 'Morning',
      })

      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  const handleStatusUpdate = async (
    assignment: Assignment,
    nextStatus: string,
  ) => {
    setError('')
    setSuccess('')

    try {
      const response = await apiClient.patch(
        `/assignments/${assignment.id}/status`,
        { status: nextStatus },
      )

      setSuccess(
        response.data?.message || `Assignment #${assignment.id} updated.`,
      )

      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    }
  }

  function getStatusActions(assignment: Assignment) {
    if (assignment.status === 'Scheduled') {
      return (
        <>
          <button
            type="button"
            onClick={() => void handleStatusUpdate(assignment, 'In-Progress')}
            className="rounded-md border border-orange-400/20 px-2.5 py-1.5 text-[10px] text-orange-300 hover:bg-orange-400/10"
          >
            Start
          </button>

          {isStaff && (
            <button
              type="button"
              onClick={() => void handleStatusUpdate(assignment, 'Cancelled')}
              className="rounded-md border border-red-400/20 px-2.5 py-1.5 text-[10px] text-red-300 hover:bg-red-400/10"
            >
              Cancel
            </button>
          )}
        </>
      )
    }

    if (assignment.status === 'In-Progress') {
      return (
        <>
          <button
            type="button"
            onClick={() => void handleStatusUpdate(assignment, 'Completed')}
            className="rounded-md border border-emerald-400/20 px-2.5 py-1.5 text-[10px] text-emerald-300 hover:bg-emerald-400/10"
          >
            Complete
          </button>

          {isStaff && (
            <button
              type="button"
              onClick={() => void handleStatusUpdate(assignment, 'Cancelled')}
              className="rounded-md border border-red-400/20 px-2.5 py-1.5 text-[10px] text-red-300 hover:bg-red-400/10"
            >
              Cancel
            </button>
          )}
        </>
      )
    }

    return <span className="text-[10px] text-slate-500">No actions</span>
  }

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
            Assignments
          </h1>

          <p className="mt-1 text-xs text-slate-400">
            Schedule workers, allocate vehicles and monitor collection shifts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1521] px-3 py-2.5 text-[11px] text-slate-300 transition hover:border-emerald-400/40 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setError('')
                setSuccess('')
                setShowForm(true)
              }}
              className="flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2.5 text-[11px] font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              <Plus size={15} />
              New Assignment
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-4 py-3"
        >
          <AlertCircle size={16} className="mt-0.5 text-red-300" />

          <p className="flex-1 text-xs text-red-200">{error}</p>

          <button
            type="button"
            onClick={() => setError('')}
            className="text-red-300 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-xs text-emerald-200"
        >
          {success}
        </div>
      )}

      <p className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2 text-[10px] text-emerald-200/80">
        {loading
          ? 'Loading assignments and operational resources...'
          : 'Assignment information is retrieved from the connected backend APIs.'}
      </p>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: 'Total Assignments',
            value: assignments.length,
            icon: ClipboardList,
            color: 'text-white',
          },
          {
            title: 'Scheduled',
            value: scheduledCount,
            icon: CalendarDays,
            color: 'text-sky-300',
          },
          {
            title: 'In Progress',
            value: activeCount,
            icon: Truck,
            color: 'text-orange-300',
          },
          {
            title: 'Completed',
            value: completedCount,
            icon: Users,
            color: 'text-emerald-300',
          },
        ].map((metric) => (
          <Panel
            key={metric.title}
            className="p-4 transition duration-200 hover:-translate-y-0.5 hover:border-slate-600"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{metric.title}</p>
              <metric.icon size={17} className={metric.color} />
            </div>

            <p className={`mt-3 text-3xl font-semibold ${metric.color}`}>
              {loading ? '—' : metric.value}
            </p>
          </Panel>
        ))}
      </section>

      {showForm && canCreate && (
        <Panel className="p-4 sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Create New Assignment
              </h2>

              <p className="mt-1 text-[11px] text-slate-500">
                Link a citizen complaint and select the worker, vehicle, ward and shift.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <X size={17} />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {/* Citizen Complaint */}
              <label className="space-y-2 sm:col-span-2 xl:col-span-3">
                <span className="text-[11px] text-slate-400">
                  Citizen Complaint
                </span>

                <select
                  value={form.complaint_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      complaint_id: event.target.value,
                    })
                  }
                  className={selectClass}
                >
                  <option value="">
                    No complaint linked (manual assignment)
                  </option>

                  {availableComplaints.map((complaint) => (
                    <option key={complaint.id} value={complaint.id}>
                      #{complaint.id} | {complaint.ward} | {complaint.type} |{' '}
                      {complaint.description?.slice(0, 65)}
                    </option>
                  ))}
                </select>

                <span className="block text-[10px] text-slate-500">
                  Select the citizen complaint this assignment will address.
                </span>

                {availableComplaints.length === 0 && (
                  <span className="block text-[10px] text-orange-300">
                    No unresolved complaints are currently available.
                  </span>
                )}
              </label>

              {/* Worker */}
              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">Worker</span>

                <select
                  required
                  value={form.worker_id}
                  onChange={(event) =>
                    setForm({ ...form, worker_id: event.target.value })
                  }
                  className={selectClass}
                >
                  <option value="">Select worker</option>

                  {workers.map((worker) => (
                    <option key={worker.user_id} value={worker.user_id}>
                      {worker.username} (#{worker.user_id})
                    </option>
                  ))}
                </select>
              </label>

              {/* Vehicle */}
              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">
                  Available Vehicle
                </span>

                <select
                  required
                  value={form.vehicle_id}
                  onChange={(event) =>
                    setForm({ ...form, vehicle_id: event.target.value })
                  }
                  className={selectClass}
                >
                  <option value="">Select vehicle</option>

                  {availableVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registration_number} (#{vehicle.id})
                    </option>
                  ))}
                </select>

                {availableVehicles.length === 0 && (
                  <span className="block text-[10px] text-orange-300">
                    No vehicles currently have Available status.
                  </span>
                )}
              </label>

              {/* Ward */}
              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">Ward</span>

                <select
                  required
                  value={form.ward_id}
                  onChange={(event) =>
                    setForm({ ...form, ward_id: event.target.value })
                  }
                  className={selectClass}
                >
                  <option value="">Select ward</option>

                  {wards.map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      Ward {ward.ward_number} - {ward.ward_name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Shift Date */}
              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">Shift Date</span>

                <input
                  required
                  type="date"
                  min={getToday()}
                  value={form.shift_date}
                  onChange={(event) =>
                    setForm({ ...form, shift_date: event.target.value })
                  }
                  className={inputClass}
                />
              </label>

              {/* Shift */}
              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">Shift</span>

                <select
                  value={form.shift}
                  onChange={(event) =>
                    setForm({ ...form, shift: event.target.value })
                  }
                  className={selectClass}
                >
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="Night">Night</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-700 px-4 py-2.5 text-[11px] text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  saving ||
                  availableVehicles.length === 0 ||
                  workers.length === 0 ||
                  wards.length === 0
                }
                className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Assignment'}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Assignment Records
            </h2>

            <p className="mt-1 text-[11px] text-slate-500">
              Search, filter and manage operational assignments.
            </p>
          </div>

          <span className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400">
            {filteredAssignments.length} record(s)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 border-y border-white/[0.06] bg-white/[0.015] p-4 md:grid-cols-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search worker, ward, vehicle, complaint or ID..."
              className={`${inputClass} pl-9`}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={selectClass}
          >
            <option value="All">All statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="In-Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className={inputClass}
            aria-label="Filter by assignment date"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">ID</th>
                <th className="px-5 py-3 font-medium">Complaint</th>
                <th className="px-5 py-3 font-medium">Worker</th>
                <th className="px-5 py-3 font-medium">Ward</th>
                <th className="px-5 py-3 font-medium">Vehicle</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Shift</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-10 text-center text-xs text-slate-400"
                  >
                    Loading assignments...
                  </td>
                </tr>
              ) : filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <ClipboardList
                      size={24}
                      className="mx-auto text-slate-600"
                    />

                    <p className="mt-3 text-xs font-medium text-slate-300">
                      No assignments found
                    </p>

                    <p className="mt-1 text-[10px] text-slate-500">
                      Try changing your filters or create a new assignment.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((assignment) => (
                  <tr
                    key={assignment.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4 text-[11px] font-medium text-slate-300">
                      #{assignment.id}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-emerald-300">
                      {assignment.complaint_id
                        ? `#${assignment.complaint_id}`
                        : 'Manual'}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {assignment.worker_name ||
                        `Worker #${assignment.worker_id}`}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      {assignment.ward_name || `Ward #${assignment.ward_id}`}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {assignment.registration_number ||
                        `Vehicle #${assignment.vehicle_id}`}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      {formatDate(assignment.shift_date)}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      {assignment.shift}
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={assignment.status} />
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusActions(assignment)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
