
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Truck,
  X,
  Pencil,
  Trash2,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

interface Vehicle {
  id: number
  registration_number: string
  capacity_tons: number | null
  status: string
}

type VehicleForm = {
  registration_number: string
  capacity_tons: string
  status: string
}

const emptyForm: VehicleForm = {
  registration_number: '',
  capacity_tons: '',
  status: 'Available',
}

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-[#101b2a] px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60'

function getRole() {
  try {
    const user = JSON.parse(localStorage.getItem('wms_user') || '{}')
    return user.role || ''
  } catch {
    return ''
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Available: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
    Assigned: 'border-purple-400/20 bg-purple-400/10 text-purple-300',
    Active: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    Maintenance: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
    Inactive: 'border-slate-500/20 bg-slate-500/10 text-slate-400',
  }

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-medium ${
        styles[status] || 'border-slate-600 bg-slate-700/30 text-slate-300'
      }`}
    >
      {status}
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

export default function VehiclesPage() {
  const role = getRole()
  const canManage = role === 'Admin' || role === 'Supervisor'
  const isAdmin = role === 'Admin'

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const [showForm, setShowForm] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [form, setForm] = useState<VehicleForm>(emptyForm)

  const loadVehicles = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await apiClient.get<Vehicle[]>('/vehicles')

      if (!Array.isArray(response.data)) {
        throw new Error('Invalid vehicle response from server.')
      }

      setVehicles(response.data)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadVehicles()
  }, [loadVehicles, refreshKey])

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const matchesStatus =
        statusFilter === 'All' || vehicle.status === statusFilter

      const query = search.trim().toLowerCase()
      const matchesSearch =
        !query ||
        vehicle.registration_number.toLowerCase().includes(query) ||
        String(vehicle.id).includes(query)

      return matchesStatus && matchesSearch
    })
  }, [vehicles, statusFilter, search])

  const counts = {
    total: vehicles.length,
    available: vehicles.filter((v) => v.status === 'Available').length,
    assigned: vehicles.filter((v) => v.status === 'Assigned').length,
    active: vehicles.filter((v) => v.status === 'Active').length,
    maintenance: vehicles.filter((v) => v.status === 'Maintenance').length,
  }

  function openCreateForm() {
    setEditingVehicle(null)
    setForm(emptyForm)
    setError('')
    setSuccess('')
    setShowForm(true)
  }

  function openEditForm(vehicle: Vehicle) {
    setEditingVehicle(vehicle)
    setForm({
      registration_number: vehicle.registration_number,
      capacity_tons:
        vehicle.capacity_tons === null
          ? ''
          : String(vehicle.capacity_tons),
      status: vehicle.status,
    })
    setError('')
    setSuccess('')
    setShowForm(true)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const capacity = Number(form.capacity_tons)

    if (!form.registration_number.trim()) {
      setError('Enter the vehicle registration number.')
      return
    }

    if (!form.capacity_tons || !Number.isFinite(capacity) || capacity <= 0) {
      setError('Enter a valid positive vehicle capacity.')
      return
    }

    setSaving(true)

    const payload = {
      registration_number: form.registration_number.trim().toUpperCase(),
      capacity_tons: capacity,
      status: form.status,
    }

    try {
      if (editingVehicle) {
        await apiClient.put(`/vehicles/${editingVehicle.id}`, payload)
        setSuccess('Vehicle updated successfully.')
      } else {
        await apiClient.post('/vehicles', payload)
        setSuccess('Vehicle added successfully.')
      }

      setShowForm(false)
      setEditingVehicle(null)
      setForm(emptyForm)
      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(vehicle: Vehicle, status: string) {
    setError('')
    setSuccess('')

    try {
      await apiClient.put(`/vehicles/${vehicle.id}/status`, { status })
      setSuccess(`${vehicle.registration_number} status updated.`)
      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    }
  }

  async function handleDelete(vehicle: Vehicle) {
    const confirmed = window.confirm(
      `Delete vehicle ${vehicle.registration_number}? This action cannot be undone.`,
    )

    if (!confirmed) return

    setError('')
    setSuccess('')

    try {
      await apiClient.delete(`/vehicles/${vehicle.id}`)
      setSuccess('Vehicle deleted successfully.')
      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              WMS / Fleet Operations
            </p>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Vehicle Management
          </h1>

          <p className="mt-1 text-xs text-slate-400">
            Monitor fleet inventory, availability and vehicle status.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((v) => v + 1)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1521] px-3 py-2.5 text-[11px] text-slate-300 hover:border-emerald-400/40 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {canManage && (
            <button
              type="button"
              onClick={openCreateForm}
              className="flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300"
            >
              <Plus size={15} />
              Add Vehicle
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
        Fleet information is loaded from the connected vehicle API.
      </p>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Total Vehicles', value: counts.total, color: 'text-white' },
          { label: 'Available', value: counts.available, color: 'text-sky-300' },
          { label: 'Assigned', value: counts.assigned, color: 'text-purple-300' },
          { label: 'Active', value: counts.active, color: 'text-emerald-300' },
          {
            label: 'Maintenance',
            value: counts.maintenance,
            color: 'text-orange-300',
          },
        ].map((item) => (
          <Panel key={item.label} className="p-4">
            <p className="text-[11px] text-slate-400">{item.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${item.color}`}>
              {loading ? '—' : item.value}
            </p>
          </Panel>
        ))}
      </section>

      {showForm && canManage && (
        <Panel className="p-4 sm:p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Enter vehicle registration and capacity details.
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">
                  Registration Number
                </span>
                <input
                  required
                  value={form.registration_number}
                  onChange={(e) =>
                    setForm({ ...form, registration_number: e.target.value })
                  }
                  placeholder="KA-01-AB-1234"
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">
                  Capacity (tons)
                </span>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.capacity_tons}
                  onChange={(e) =>
                    setForm({ ...form, capacity_tons: e.target.value })
                  }
                  placeholder="5.00"
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">Status</span>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="Available">Available</option>
                  <option value="Active">Active</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-700 px-4 py-2.5 text-[11px] text-slate-300"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-400 px-4 py-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : editingVehicle
                    ? 'Save Changes'
                    : 'Add Vehicle'}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Fleet Inventory</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Vehicle records and operational status.
            </p>
          </div>
          <Truck size={18} className="text-emerald-300" />
        </div>

        <div className="grid grid-cols-1 gap-3 border-y border-white/[0.06] bg-white/[0.015] p-4 md:grid-cols-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search registration number or ID..."
              className={`${inputClass} pl-9`}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputClass}
          >
            <option value="All">All statuses</option>
            <option value="Available">Available</option>
            <option value="Assigned">Assigned</option>
            <option value="Active">Active</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">ID</th>
                <th className="px-5 py-3 font-medium">Registration</th>
                <th className="px-5 py-3 font-medium">Capacity</th>
                <th className="px-5 py-3 font-medium">Status</th>
                {canManage && (
                  <th className="px-5 py-3 font-medium">Update Status</th>
                )}
                {canManage && (
                  <th className="px-5 py-3 font-medium">Actions</th>
                )}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={canManage ? 6 : 4}
                    className="px-5 py-10 text-center text-xs text-slate-400"
                  >
                    Loading fleet inventory...
                  </td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 6 : 4}
                    className="px-5 py-12 text-center text-xs text-slate-400"
                  >
                    No vehicles found.
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((vehicle) => (
                  <tr
                    key={vehicle.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      #{vehicle.id}
                    </td>

                    <td className="px-5 py-4 text-[11px] font-medium text-white">
                      {vehicle.registration_number}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {vehicle.capacity_tons === null
                        ? 'Not recorded'
                        : `${Number(vehicle.capacity_tons).toFixed(2)} tons`}
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={vehicle.status} />
                    </td>

                    {canManage && (
                      <td className="px-5 py-4">
                        <select
                          aria-label={`Change status for ${vehicle.registration_number}`}
                          value={vehicle.status}
                          onChange={(e) =>
                            void handleStatusChange(vehicle, e.target.value)
                          }
                          className="max-w-[150px] rounded-md border border-slate-700 bg-[#101b2a] px-2 py-2 text-[10px] text-slate-200"
                        >
                          <option value="Available">Available</option>
                          <option value="Assigned">Assigned</option>
                          <option value="Active">Active</option>
                          <option value="Maintenance">Maintenance</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </td>
                    )}

                    {canManage && (
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(vehicle)}
                            title="Edit vehicle"
                            className="rounded-md border border-slate-700 p-2 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-300"
                          >
                            <Pencil size={13} />
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => void handleDelete(vehicle)}
                              title="Delete vehicle"
                              className="rounded-md border border-red-400/20 p-2 text-red-300 hover:bg-red-400/10"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
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
