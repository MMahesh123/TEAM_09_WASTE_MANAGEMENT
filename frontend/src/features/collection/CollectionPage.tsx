
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  Weight,
  X,
  ShieldCheck,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

interface Collection {
  log_id: number
  assignment_id: number
  worker_id: number
  worker_name: string
  vehicle_id: number
  ward_id: number
  ward_name: string
  waste_type: string
  waste_tons: number
  collected_at: string
  notes?: string
  verification_status: 'Pending' | 'Approved' | 'Rejected'
  accepted_tons?: number | null
  rejected_tons?: number | null
  verified_by?: number | null
  verified_at?: string | null
  verification_reason?: string | null
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

interface CollectionResponse {
  success?: boolean
  count?: number
  totalTons?: number
  data: Collection[]
}

interface AssignmentResponse {
  success?: boolean
  count?: number
  data: Assignment[]
}

const wasteTypes = ['Wet', 'Dry', 'Mixed', 'Hazardous', 'E-waste']

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-[#101b2a] px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60'

const buttonClass =
  'rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-emerald-400/50 disabled:opacity-50'

function getRole() {
  try {
    return JSON.parse(localStorage.getItem('wms_user') || '{}').role || ''
  } catch {
    return ''
  }
}

function formatDate(value?: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

function WasteBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    Wet: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    Dry: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
    Mixed: 'border-purple-400/20 bg-purple-400/10 text-purple-300',
    Hazardous: 'border-red-400/20 bg-red-400/10 text-red-300',
    'E-waste': 'border-orange-400/20 bg-orange-400/10 text-orange-300',
  }

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-medium ${
        styles[type] || 'border-slate-600 bg-slate-700/30 text-slate-300'
      }`}
    >
      {type}
    </span>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    Pending: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    Approved: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    Rejected: 'border-red-400/20 bg-red-400/10 text-red-300',
  }

  const value = status || 'Pending'

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-medium ${
        styles[value] || 'border-slate-600 bg-slate-700/30 text-slate-300'
      }`}
    >
      {value}
    </span>
  )
}

export default function CollectionPage() {
  const role = getRole()
  const canCreate = role === 'Worker' || role === 'Admin'
  const canVerify = role === 'Supervisor' || role === 'Admin'

  const [collections, setCollections] = useState<Collection[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [wasteFilter, setWasteFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [form, setForm] = useState({
    assignment_id: '',
    waste_type: 'Wet',
    waste_tons: '',
    notes: '',
  })

  const [verificationTarget, setVerificationTarget] =
    useState<Collection | null>(null)

  const [verificationForm, setVerificationForm] = useState({
    acceptedTons: '',
    reason: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    const requests = await Promise.allSettled([
      apiClient.get<CollectionResponse>('/collections'),
      canCreate
        ? apiClient.get<AssignmentResponse>('/assignments')
        : Promise.resolve({
            data: { data: [] as Assignment[] },
          }),
    ])

    const [collectionResult, assignmentResult] = requests
    const errors: string[] = []

    if (collectionResult.status === 'fulfilled') {
      const response = collectionResult.value.data

      if (Array.isArray(response.data)) {
        setCollections(response.data)
      } else {
        errors.push('Invalid collection response.')
      }
    } else {
      errors.push(getApiErrorMessage(collectionResult.reason))
    }

    if (assignmentResult.status === 'fulfilled') {
      const response = assignmentResult.value.data

      if (Array.isArray(response.data)) {
        setAssignments(response.data)
      } else {
        errors.push('Invalid assignment response.')
      }
    } else {
      errors.push(getApiErrorMessage(assignmentResult.reason))
    }

    setError(errors.join(' '))
    setLoading(false)
  }, [canCreate])

  useEffect(() => {
    void loadData()
  }, [loadData, refreshKey])

  const availableAssignments = assignments.filter(
    (assignment) =>
      assignment.status === 'Scheduled' ||
      assignment.status === 'In-Progress',
  )

  const filteredCollections = useMemo(() => {
    return collections.filter((item) => {
      const query = search.trim().toLowerCase()

      const matchesSearch =
        !query ||
        String(item.log_id).includes(query) ||
        String(item.assignment_id).includes(query) ||
        (item.worker_name || '').toLowerCase().includes(query) ||
        (item.ward_name || '').toLowerCase().includes(query)

      const matchesWaste =
        wasteFilter === 'All' || item.waste_type === wasteFilter

      const matchesStatus =
        statusFilter === 'All' ||
        (item.verification_status || 'Pending') === statusFilter

      const date = item.collected_at
        ? String(item.collected_at).slice(0, 10)
        : ''

      const matchesFrom = !fromDate || date >= fromDate
      const matchesTo = !toDate || date <= toDate

      return (
        matchesSearch &&
        matchesWaste &&
        matchesStatus &&
        matchesFrom &&
        matchesTo
      )
    })
  }, [collections, search, wasteFilter, statusFilter, fromDate, toDate])

  const totalWaste = collections.reduce(
    (total, item) => total + Number(item.waste_tons || 0),
    0,
  )

  const totalFilteredWaste = filteredCollections.reduce(
    (total, item) => total + Number(item.waste_tons || 0),
    0,
  )

  const pendingCount = collections.filter(
    (item) => (item.verification_status || 'Pending') === 'Pending',
  ).length

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const quantity = Number(form.waste_tons)

    if (!form.assignment_id) {
      setError('Select an assignment.')
      return
    }

    if (
      !form.waste_tons ||
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      !/^\d+(\.\d{1,2})?$/.test(form.waste_tons)
    ) {
      setError(
        'Enter a valid non-negative quantity with at most two decimals.',
      )
      return
    }

    setSaving(true)

    try {
      const response = await apiClient.post('/collections', {
        assignment_id: Number(form.assignment_id),
        waste_type: form.waste_type,
        waste_tons: quantity,
        notes: form.notes.trim() || undefined,
      })

      setSuccess(
        response.data?.message || 'Collection recorded successfully.',
      )

      setForm({
        assignment_id: '',
        waste_type: 'Wet',
        waste_tons: '',
        notes: '',
      })

      setShowForm(false)
      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  function openVerification(item: Collection) {
    setError('')
    setSuccess('')
    setVerificationTarget(item)

    setVerificationForm({
      acceptedTons: Number(item.waste_tons).toFixed(2),
      reason: '',
    })
  }

  async function handleVerification(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!verificationTarget) return

    setError('')
    setSuccess('')

    const acceptedTons = Number(verificationForm.acceptedTons)
    const recordedTons = Number(verificationTarget.waste_tons)

    if (
      !Number.isFinite(acceptedTons) ||
      acceptedTons < 0 ||
      acceptedTons > recordedTons ||
      Math.round(acceptedTons * 100) / 100 !== acceptedTons
    ) {
      setError(
        `Accepted quantity must be between 0 and ${recordedTons.toFixed(2)} tonnes, with at most two decimals.`,
      )
      return
    }

    const reason = verificationForm.reason.trim()

    if (acceptedTons < recordedTons && !reason) {
      setError(
        'A reason is required for partial acceptance or rejection.',
      )
      return
    }

    setVerifying(true)

    try {
      const response = await apiClient.patch(
        `/collections/${verificationTarget.log_id}/verify`,
        {
          acceptedTons,
          reason: reason || undefined,
        },
      )

      setSuccess(
        response.data?.message ||
          `Collection #${verificationTarget.log_id} verified successfully.`,
      )

      setVerificationTarget(null)
      setVerificationForm({
        acceptedTons: '',
        reason: '',
      })

      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              WMS / Field Operations
            </p>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Waste Collection
          </h1>

          <p className="mt-1 text-xs text-slate-400">
            Monitor and record waste collection activity across wards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1521] px-3 py-2.5 text-[11px] text-slate-300 hover:border-emerald-400/40 disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={loading ? 'animate-spin' : ''}
            />
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
              className="flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300"
            >
              <Plus size={15} />
              Record Collection
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
          <button type="button" onClick={() => setError('')}>
            <X size={15} className="text-red-300" />
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
        Collection entries are linked to assignments and retrieved from the backend.
      </p>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Collection Records',
            value: collections.length,
            icon: ClipboardList,
            color: 'text-white',
          },
          {
            label: 'Total Waste Collected',
            value: `${totalWaste.toFixed(2)} T`,
            icon: Weight,
            color: 'text-emerald-300',
          },
          {
            label: 'Pending Verification',
            value: pendingCount,
            icon: ShieldCheck,
            color: 'text-amber-300',
          },
          {
            label: 'Filtered Waste',
            value: `${totalFilteredWaste.toFixed(2)} T`,
            icon: CheckCircle2,
            color: 'text-sky-300',
          },
        ].map((item) => (
          <Panel key={item.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400">{item.label}</p>
              <item.icon size={17} className={item.color} />
            </div>

            <p className={`mt-3 text-2xl font-semibold ${item.color}`}>
              {loading ? '—' : item.value}
            </p>
          </Panel>
        ))}
      </section>

      {showForm && canCreate && (
        <Panel className="p-4 sm:p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Record Waste Collection
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Choose an active assignment and enter its collection details.
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <span className="text-[11px] text-slate-400">
                  Assignment
                </span>

                <select
                  required
                  value={form.assignment_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      assignment_id: event.target.value,
                    })
                  }
                  className={inputClass}
                >
                  <option value="">Select assignment</option>

                  {availableAssignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      #{assignment.id} - {assignment.worker_name} -{' '}
                      {assignment.ward_name} - {assignment.registration_number} -{' '}
                      {assignment.shift}
                    </option>
                  ))}
                </select>

                {availableAssignments.length === 0 && (
                  <span className="block text-[10px] text-orange-300">
                    No Scheduled or In-Progress assignments are available.
                  </span>
                )}
              </label>

              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">
                  Waste Type
                </span>

                <select
                  value={form.waste_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      waste_type: event.target.value,
                    })
                  }
                  className={inputClass}
                >
                  {wasteTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">
                  Waste Quantity (tons)
                </span>

                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.waste_tons}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      waste_tons: event.target.value,
                    })
                  }
                  placeholder="e.g. 1.25"
                  className={inputClass}
                />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-[11px] text-slate-400">
                  Notes (optional)
                </span>

                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      notes: event.target.value,
                    })
                  }
                  placeholder="Add collection observations..."
                  className={inputClass}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={buttonClass}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving || availableAssignments.length === 0}
                className="rounded-lg bg-emerald-400 px-4 py-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Collection'}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {verificationTarget && canVerify && (
        <Panel className="border-emerald-400/30 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Verify Collection #{verificationTarget.log_id}
              </h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Recorded quantity: {Number(verificationTarget.waste_tons).toFixed(2)} tonnes
              </p>
            </div>

            <button
              type="button"
              onClick={() => setVerificationTarget(null)}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/5"
            >
              <X size={17} />
            </button>
          </div>

          <form onSubmit={handleVerification} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-[11px] text-slate-400">
                Accepted quantity (tonnes)
              </span>
              <input
                type="number"
                required
                min="0"
                max={verificationTarget.waste_tons}
                step="0.01"
                value={verificationForm.acceptedTons}
                onChange={(event) =>
                  setVerificationForm({
                    ...verificationForm,
                    acceptedTons: event.target.value,
                  })
                }
                className={inputClass}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[11px] text-slate-400">
                Verification reason
              </span>
              <textarea
                rows={3}
                value={verificationForm.reason}
                onChange={(event) =>
                  setVerificationForm({
                    ...verificationForm,
                    reason: event.target.value,
                  })
                }
                placeholder="Required when accepting less than the recorded quantity."
                className={inputClass}
              />
            </label>

            <p className="text-[10px] text-slate-500">
              Enter the full recorded quantity to approve completely.
              Enter a smaller quantity for partial approval. Enter 0 to reject.
              A reason is required for partial approval or rejection.
            </p>

            <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4">
              <button
                type="button"
                onClick={() => {
                  setVerificationTarget(null)
                  setVerificationForm({
                    acceptedTons: '',
                    reason: '',
                  })
                }}
                className={buttonClass}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={verifying}
                className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                {verifying ? 'Verifying...' : 'Submit Verification'}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Collection Records
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Collection history submitted through field assignments.
            </p>
          </div>

          <span className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400">
            {filteredCollections.length} record(s)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 border-y border-white/[0.06] bg-white/[0.015] p-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search worker, ward or ID..."
              className={`${inputClass} pl-9`}
            />
          </div>

          <select
            value={wasteFilter}
            onChange={(event) => setWasteFilter(event.target.value)}
            className={inputClass}
          >
            <option value="All">All waste types</option>
            {wasteTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={inputClass}
          >
            <option value="All">All verification statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            aria-label="From date"
            className={inputClass}
          />

          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            aria-label="To date"
            className={inputClass}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">Log ID</th>
                <th className="px-5 py-3 font-medium">Assignment</th>
                <th className="px-5 py-3 font-medium">Worker</th>
                <th className="px-5 py-3 font-medium">Ward</th>
                <th className="px-5 py-3 font-medium">Waste Type</th>
                <th className="px-5 py-3 font-medium">Recorded</th>
                <th className="px-5 py-3 font-medium">Accepted</th>
                <th className="px-5 py-3 font-medium">Collected At</th>
                <th className="px-5 py-3 font-medium">Verification</th>
                {canVerify && (
                  <th className="px-5 py-3 font-medium">Action</th>
                )}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={canVerify ? 10 : 9}
                    className="px-5 py-10 text-center text-xs text-slate-400"
                  >
                    Loading collection records...
                  </td>
                </tr>
              ) : filteredCollections.length === 0 ? (
                <tr>
                  <td
                    colSpan={canVerify ? 10 : 9}
                    className="px-5 py-12 text-center text-xs text-slate-400"
                  >
                    No collection records found.
                  </td>
                </tr>
              ) : (
                filteredCollections.map((item) => (
                  <tr
                    key={item.log_id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      #{item.log_id}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      #{item.assignment_id}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {item.worker_name || `Worker #${item.worker_id}`}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      {item.ward_name || `Ward #${item.ward_id}`}
                    </td>

                    <td className="px-5 py-4">
                      <WasteBadge type={item.waste_type} />
                    </td>

                    <td className="px-5 py-4 text-[11px] font-medium text-emerald-300">
                      {Number(item.waste_tons).toFixed(2)} T
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {item.accepted_tons == null
                        ? '—'
                        : `${Number(item.accepted_tons).toFixed(2)} T`}
                    </td>

                    <td className="px-5 py-4 text-[10px] text-slate-500">
                      {formatDate(item.collected_at)}
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        <StatusBadge
                          status={item.verification_status}
                        />
                        {item.verification_reason && (
                          <p
                            className="max-w-[180px] truncate text-[10px] text-slate-500"
                            title={item.verification_reason}
                          >
                            {item.verification_reason}
                          </p>
                        )}
                      </div>
                    </td>

                    {canVerify && (
                      <td className="px-5 py-4">
                        {(item.verification_status || 'Pending') ===
                        'Pending' ? (
                          <button
                            type="button"
                            onClick={() => openVerification(item)}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-2 text-[10px] font-semibold text-slate-950 hover:bg-emerald-300"
                          >
                            <ShieldCheck size={13} />
                            Verify
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500">
                            Verified
                          </span>
                        )}
                      </td>
                    )}
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
