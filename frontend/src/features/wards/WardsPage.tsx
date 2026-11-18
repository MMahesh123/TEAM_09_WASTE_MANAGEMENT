
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Building2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

interface Ward {
  id: number
  ward_number: string | number
  ward_name: string
  zone: string
}

interface WardForm {
  ward_number: string
  ward_name: string
  zone: string
}

const emptyForm: WardForm = {
  ward_number: '',
  ward_name: '',
  zone: '',
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

export default function WardsPage() {
  const role = getRole()
  const canCreate = role === 'Admin' || role === 'Supervisor'

  const [wards, setWards] = useState<Ward[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState('All')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<WardForm>(emptyForm)

  const loadWards = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await apiClient.get<Ward[]>('/wards')

      if (!Array.isArray(response.data)) {
        throw new Error('Invalid ward response from server.')
      }

      setWards(response.data)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWards()
  }, [loadWards, refreshKey])

  const zones = useMemo(
    () =>
      Array.from(
        new Set(
          wards
            .map((ward) => ward.zone)
            .filter((zone): zone is string => Boolean(zone)),
        ),
      ).sort(),
    [wards],
  )

  const filteredWards = useMemo(() => {
    return wards.filter((ward) => {
      const query = search.trim().toLowerCase()

      const matchesSearch =
        !query ||
        String(ward.ward_number).toLowerCase().includes(query) ||
        ward.ward_name.toLowerCase().includes(query) ||
        String(ward.zone || '').toLowerCase().includes(query)

      const matchesZone =
        zoneFilter === 'All' || ward.zone === zoneFilter

      return matchesSearch && matchesZone
    })
  }, [wards, search, zoneFilter])

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (
      !form.ward_number.trim() ||
      !form.ward_name.trim() ||
      !form.zone.trim()
    ) {
      setError('Please complete all ward details.')
      return
    }

    setSaving(true)

    try {
      const response = await apiClient.post('/wards', {
        ward_number: form.ward_number.trim(),
        ward_name: form.ward_name.trim(),
        zone: form.zone.trim(),
      })

      setSuccess(response.data?.message || 'Ward created successfully.')
      setForm(emptyForm)
      setShowForm(false)
      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              WMS / City Administration
            </p>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Ward Management
          </h1>

          <p className="mt-1 text-xs text-slate-400">
            View city wards and organize waste collection service areas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1521] px-3 py-2.5 text-[11px] text-slate-300 hover:border-emerald-400/40 disabled:opacity-50"
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
                setForm(emptyForm)
                setShowForm(true)
              }}
              className="flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300"
            >
              <Plus size={15} />
              Add Ward
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
        Ward records are retrieved from the connected backend API.
      </p>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Total Wards',
            value: wards.length,
            color: 'text-white',
            icon: Building2,
          },
          {
            label: 'Zones Covered',
            value: zones.length,
            color: 'text-emerald-300',
            icon: MapPin,
          },
          {
            label: 'Filtered Results',
            value: filteredWards.length,
            color: 'text-sky-300',
            icon: Search,
          },
        ].map((item) => (
          <Panel key={item.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400">{item.label}</p>
              <item.icon size={17} className={item.color} />
            </div>

            <p className={`mt-3 text-3xl font-semibold ${item.color}`}>
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
                Register New Ward
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Add a ward to the city service-area database.
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">
                  Ward Number
                </span>
                <input
                  required
                  value={form.ward_number}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      ward_number: event.target.value,
                    })
                  }
                  placeholder="e.g. 15"
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">
                  Ward Name
                </span>
                <input
                  required
                  value={form.ward_name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      ward_name: event.target.value,
                    })
                  }
                  placeholder="e.g. Rajajinagar"
                  className={inputClass}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] text-slate-400">Zone</span>
                <select
                  required
                  value={form.zone}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      zone: event.target.value,
                    })
                  }
                  className={inputClass}
                >
                  <option value="">Select zone</option>
                  <option value="East">East</option>
                  <option value="West">West</option>
                  <option value="North">North</option>
                  <option value="South">South</option>
                  <option value="Central">Central</option>
                  <option value="South-East">South-East</option>
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
                {saving ? 'Saving...' : 'Create Ward'}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Registered Wards
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              City service-area records.
            </p>
          </div>

          <span className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400">
            {filteredWards.length} record(s)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 border-y border-white/[0.06] bg-white/[0.015] p-4 md:grid-cols-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ward number, name or zone..."
              className={`${inputClass} pl-9`}
            />
          </div>

          <select
            value={zoneFilter}
            onChange={(event) => setZoneFilter(event.target.value)}
            className={inputClass}
          >
            <option value="All">All zones</option>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">ID</th>
                <th className="px-5 py-3 font-medium">Ward Number</th>
                <th className="px-5 py-3 font-medium">Ward Name</th>
                <th className="px-5 py-3 font-medium">Zone</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-xs text-slate-400"
                  >
                    Loading ward records...
                  </td>
                </tr>
              ) : filteredWards.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-12 text-center text-xs text-slate-400"
                  >
                    No wards found.
                  </td>
                </tr>
              ) : (
                filteredWards.map((ward) => (
                  <tr
                    key={ward.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      #{ward.id}
                    </td>

                    <td className="px-5 py-4 text-[11px] font-medium text-emerald-300">
                      {ward.ward_number}
                    </td>

                    <td className="px-5 py-4 text-[11px] font-medium text-white">
                      {ward.ward_name}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-slate-300">
                      {ward.zone || 'Not specified'}
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
