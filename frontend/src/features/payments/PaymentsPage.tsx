
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Wallet, RefreshCw, Search, Calculator, FlaskConical,
  CheckCircle2, Clock, X, Receipt,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

type Worker = {
  user_id: number
  username: string
  email: string
}

type Payment = {
  payment_id?: number
  id?: number
  worker_id?: number
  worker_name?: string
  username?: string
  period_start?: string
  period_end?: string
  total_tons?: number
  amount?: number
  total_amount?: number
  rate_per_ton?: number
  status?: string
  payment_status?: string
  created_at?: string
  paid_at?: string
  [key: string]: unknown
}

type CalculationForm = {
  worker_id: string
  period_start: string
  period_end: string
}

type CalculationResult = {
  worker_id: number
  period_start: string
  period_end: string
  log_count: number
  already_paid_log_count: number
  total_tons: number
  rate_per_ton: number
  amount: number
}

const initialForm: CalculationForm = {
  worker_id: '',
  period_start: '',
  period_end: '',
}

function getRows(payload: unknown): Payment[] {
  if (Array.isArray(payload)) return payload as Payment[]

  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: Payment[] }).data
  }

  return []
}

function getPaymentId(payment: Payment) {
  return payment.payment_id ?? payment.id
}

function getAmount(payment: Payment) {
  return Number(payment.amount ?? payment.total_amount ?? 0)
}

function getStatus(payment: Payment) {
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

function statusStyle(status: string) {
  const value = status.toLowerCase()

  if (value === 'paid') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  }

  if (value === 'simulated') {
    return 'border-purple-500/20 bg-purple-500/10 text-purple-300'
  }

  if (value === 'failed' || value === 'cancelled') {
    return 'border-red-500/20 bg-red-500/10 text-red-300'
  }

  return 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300'
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const [showModal, setShowModal] = useState(false)
  const [mode, setMode] = useState<'calculate' | 'simulate'>('calculate')
  const [form, setForm] = useState<CalculationForm>(initialForm)

  // Holds the result returned by /payments/calculate.
  const [calculation, setCalculation] = useState<CalculationResult | null>(null)

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('wms_user') || '{}')
    } catch {
      return {}
    }
  }, [])

  const role = String(user.role || '')
  const isAdmin = role === 'Admin'
  const canCalculate = isAdmin || role === 'Supervisor'
  const canMarkPaid = isAdmin || role === 'Supervisor'

  async function fetchPayments() {
    setLoading(true)
    setError('')

    try {
      const response = await apiClient.get('/payments')
      setPayments(getRows(response.data))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function fetchWorkers() {
    if (!canCalculate) return

    try {
      const response = await apiClient.get('/workers')
      const rows = Array.isArray(response.data)
        ? response.data
        : response.data?.data

      setWorkers(Array.isArray(rows) ? rows : [])
    } catch {
      // Payment history remains available if the worker list cannot load.
    }
  }

  useEffect(() => {
    void fetchPayments()
    void fetchWorkers()
  }, [])

  function openCalculationModal(nextMode: 'calculate' | 'simulate') {
    setMode(nextMode)
    setForm(initialForm)
    setCalculation(null)
    setError('')
    setSuccess('')
    setShowModal(true)
  }

  async function handleCalculation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!form.worker_id || !form.period_start || !form.period_end) {
      setError('Please select a worker and both period dates.')
      return
    }

    if (form.period_end < form.period_start) {
      setError('Period end cannot be earlier than period start.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    setCalculation(null)

    // IMPORTANT:
    // Backend parseRequest expects workerId, not worker_id.
    const body = {
      worker_id: Number(form.worker_id),
      period_start: form.period_start,
      period_end: form.period_end,
    }

    try {
      const endpoint =
        mode === 'calculate'
          ? '/payments/calculate'
          : '/payments/simulate'

      const response = await apiClient.post(endpoint, body)

      if (mode === 'calculate') {
        const result = response.data?.data

        if (!result) {
          throw new Error('The server did not return payment calculation data.')
        }

        setCalculation({
          worker_id: Number(result.worker_id),
          period_start: result.period_start,
          period_end: result.period_end,
          log_count: Number(result.log_count || 0),
          already_paid_log_count: Number(result.already_paid_log_count || 0),
          total_tons: Number(result.total_tons || 0),
          rate_per_ton: Number(result.rate_per_ton || 0),
          amount: Number(result.amount || 0),
        })

        setSuccess('Payment calculation completed successfully.')

        // Keep the modal open to display the calculation.
        // Calculate endpoint does not create a payment record.
      } else {
        const message =
          response.data?.message || 'Payment simulation completed.'

        setSuccess(message)
        setShowModal(false)
        setCalculation(null)

        await fetchPayments()
      }
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function markAsPaid(payment: Payment) {
    const id = getPaymentId(payment)

    if (!id) {
      setError('Payment ID is missing. Cannot update this record.')
      return
    }

    const confirmed = window.confirm(
      `Mark payment #${id} as Paid?`,
    )

    if (!confirmed) return

    setError('')
    setSuccess('')

    try {
      await apiClient.patch(`/payments/${id}/status`, {
        status: 'Paid',
      })

      setSuccess(`Payment #${id} marked as Paid.`)
      await fetchPayments()
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  const filteredPayments = payments.filter((payment) => {
    const query = search.toLowerCase()

    const name = String(
      payment.worker_name ?? payment.username ?? '',
    ).toLowerCase()

    const id = String(getPaymentId(payment) ?? '')
    const status = getStatus(payment)

    const matchesSearch =
      name.includes(query) || id.includes(query)

    const matchesStatus =
      statusFilter === 'All' ||
      status.toLowerCase() === statusFilter.toLowerCase()

    return matchesSearch && matchesStatus
  })

  const totalAmount = payments.reduce(
    (sum, payment) => sum + getAmount(payment),
    0,
  )

  const paidAmount = payments
    .filter((payment) => getStatus(payment).toLowerCase() === 'paid')
    .reduce((sum, payment) => sum + getAmount(payment), 0)

  const pendingCount = payments.filter(
    (payment) => getStatus(payment).toLowerCase() !== 'paid',
  ).length

  return (
    <div className="min-h-screen space-y-6 bg-[#09090f] p-4 text-white sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400">
            <Wallet size={24} />
          </div>

          <div>
            <h1 className="text-2xl font-bold">Payments Management</h1>
            <p className="mt-1 text-sm text-gray-400">
              Calculate worker payments and track payment history
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void fetchPayments()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {canCalculate && (
            <>
              <button
                onClick={() => openCalculationModal('simulate')}
                className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 text-sm text-purple-300 hover:bg-purple-500/20"
              >
                <FlaskConical size={16} />
                Simulate
              </button>

              <button
                onClick={() => openCalculationModal('calculate')}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400"
              >
                <Calculator size={16} />
                Calculate Payment
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && !showModal && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <p className="text-sm text-gray-400">Payment Records</p>
          <p className="mt-2 text-3xl font-bold">{payments.length}</p>
          <p className="mt-1 text-xs text-gray-500">Total records available</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <p className="text-sm text-gray-400">Total Amount</p>
          <p className="mt-2 text-3xl font-bold">
            ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-gray-500">Based on returned records</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <p className="text-sm text-gray-400">Paid Amount</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">
            ₹{paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-gray-500">Payments marked as paid</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <p className="text-sm text-gray-400">Unpaid Records</p>
          <p className="mt-2 text-3xl font-bold text-yellow-300">
            {pendingCount}
          </p>
          <p className="mt-1 text-xs text-gray-500">Records not marked Paid</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search worker name or payment ID..."
            className="w-full rounded-xl border border-white/10 bg-[#12121b] py-3 pl-10 pr-4 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-xl border border-white/10 bg-[#12121b] px-4 py-3 text-sm outline-none focus:border-emerald-500"
        >
          <option value="All">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
          <option value="Simulated">Simulated</option>
          <option value="Failed">Failed</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#12121b]">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
          <Receipt size={18} className="text-emerald-400" />
          <h2 className="font-semibold">Payment History</h2>
          <span className="ml-auto text-xs text-gray-500">
            {filteredPayments.length} records
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">
            Loading payment records...
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet size={32} className="mx-auto mb-3 text-gray-500" />
            <p className="font-semibold">No payment records found</p>
            <p className="mt-1 text-sm text-gray-500">
              Payment records will appear here after calculation or simulation.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-4">Payment ID</th>
                  <th className="px-5 py-4">Worker</th>
                  <th className="px-5 py-4">Period</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Created</th>
                  {canMarkPaid && <th className="px-5 py-4">Action</th>}
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {filteredPayments.map((payment, index) => {
                  const id = getPaymentId(payment)
                  const status = getStatus(payment)

                  return (
                    <tr key={id ?? index} className="hover:bg-white/[0.025]">
                      <td className="px-5 py-4 font-medium">
                        #{id ?? '—'}
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium">
                          {payment.worker_name ?? payment.username ?? `Worker ${payment.worker_id ?? ''}`}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          ID: {payment.worker_id ?? '—'}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-gray-400">
                        <p>{formatDate(payment.period_start)}</p>
                        <p className="mt-1 text-xs">
                          to {formatDate(payment.period_end)}
                        </p>
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        ₹{getAmount(payment).toLocaleString('en-IN', {
                          maximumFractionDigits: 2,
                        })}
                      </td>

                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${statusStyle(status)}`}>
                          {status.toLowerCase() === 'paid' ? (
                            <CheckCircle2 size={13} />
                          ) : (
                            <Clock size={13} />
                          )}
                          {status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-gray-400">
                        {formatDate(payment.created_at)}
                      </td>

                      {canMarkPaid && (
                        <td className="px-5 py-4">
                          {status.toLowerCase() !== 'paid' && id ? (
                            <button
                              onClick={() => void markAsPaid(payment)}
                              className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                            >
                              Mark Paid
                            </button>
                          ) : (
                            <span className="text-xs text-gray-500">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <form
            onSubmit={handleCalculation}
            className="my-auto w-full max-w-lg space-y-5 rounded-2xl border border-white/10 bg-[#151520] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  {mode === 'calculate' ? 'Calculate Worker Payment' : 'Simulate Worker Payment'}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  {mode === 'calculate'
                    ? 'Calculate payment using supervisor-approved collection quantities.'
                    : 'Run a payment simulation without making a real payment.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowModal(false)
                  setCalculation(null)
                }}
                className="rounded-lg p-2 text-gray-400 hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {success && showModal && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {success}
              </div>
            )}

            <label className="block space-y-2">
              <span className="text-sm text-gray-300">Select worker</span>
              <select
                required
                value={form.worker_id}
                onChange={(event) => {
                  setForm({ ...form, worker_id: event.target.value })
                  setCalculation(null)
                }}
                className="w-full rounded-xl border border-white/10 bg-[#09090f] px-4 py-3 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Choose a worker</option>
                {workers.map((worker) => (
                  <option key={worker.user_id} value={worker.user_id}>
                    {worker.username} ({worker.email})
                  </option>
                ))}
              </select>

              {workers.length === 0 && (
                <span className="block text-xs text-yellow-400">
                  No workers loaded. Check the workers API and your login role.
                </span>
              )}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm text-gray-300">Period start</span>
                <input
                  required
                  type="date"
                  value={form.period_start}
                  onChange={(event) => {
                    setForm({ ...form, period_start: event.target.value })
                    setCalculation(null)
                  }}
                  className="w-full rounded-xl border border-white/10 bg-[#09090f] px-3 py-3 text-sm text-white outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-300">Period end</span>
                <input
                  required
                  type="date"
                  min={form.period_start || undefined}
                  value={form.period_end}
                  onChange={(event) => {
                    setForm({ ...form, period_end: event.target.value })
                    setCalculation(null)
                  }}
                  className="w-full rounded-xl border border-white/10 bg-[#09090f] px-3 py-3 text-sm text-white outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            {mode === 'simulate' && (
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 p-3 text-sm text-purple-300">
                Simulation only: this does not transfer money or mark a payment as Paid.
              </div>
            )}

            {calculation && (
              <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-emerald-300">
                    Payment Calculation Result
                  </h3>
                  <CheckCircle2 size={19} className="text-emerald-400" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-black/20 p-3">
                    <p className="text-xs text-gray-400">Worker ID</p>
                    <p className="mt-1 text-lg font-semibold">
                      {calculation.worker_id}
                    </p>
                  </div>

                  <div className="rounded-lg bg-black/20 p-3">
                    <p className="text-xs text-gray-400">Eligible records</p>
                    <p className="mt-1 text-lg font-semibold">
                      {calculation.log_count}
                    </p>
                  </div>

                  <div className="rounded-lg bg-black/20 p-3">
                    <p className="text-xs text-gray-400">Accepted quantity</p>
                    <p className="mt-1 text-lg font-semibold">
                      {calculation.total_tons.toFixed(2)} tons
                    </p>
                  </div>

                  <div className="rounded-lg bg-black/20 p-3">
                    <p className="text-xs text-gray-400">Rate per ton</p>
                    <p className="mt-1 text-lg font-semibold">
                      ₹{calculation.rate_per_ton.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3">
                  <p className="text-sm text-gray-400">Calculated payment amount</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-300">
                    ₹{calculation.amount.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>

                <p className="text-xs text-gray-500">
                  Period: {formatDate(calculation.period_start)} – {formatDate(calculation.period_end)}
                </p>

                <p className="text-xs text-gray-400">
                  Already-paid approved records excluded: {calculation.already_paid_log_count}
                </p>

                <p className="text-xs text-yellow-300">
                  This is a calculation preview. No payment has been created or marked Paid.
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false)
                  setCalculation(null)
                }}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5"
              >
                Close
              </button>

              <button
                disabled={saving || workers.length === 0}
                type="submit"
                className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                {saving
                  ? 'Processing...'
                  : mode === 'calculate'
                    ? 'Calculate'
                    : 'Run Simulation'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
