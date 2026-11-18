
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Plus, Search, RefreshCw, Trash2, Edit3, X, Recycle,
  MapPin, Gauge, ArrowDownToLine, ArrowUpFromLine,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

type DisposalSite = {
  site_id: number
  name: string
  location: string
  max_capacity_tons: number
  current_load_tons: number
  utilization_pct: number
}

type SiteForm = {
  name: string
  location: string
  max_capacity_tons: string
}

type LoadForm = {
  tons: string
  action: 'add' | 'remove'
}

const emptyForm: SiteForm = {
  name: '',
  location: '',
  max_capacity_tons: '',
}

function getUtilization(site: DisposalSite) {
  if (Number.isFinite(Number(site.utilization_pct))) {
    return Number(site.utilization_pct)
  }

  const capacity = Number(site.max_capacity_tons)
  if (!capacity) return 0

  return (Number(site.current_load_tons) / capacity) * 100
}

function utilizationLabel(value: number) {
  if (value >= 100) return 'Full'
  if (value >= 80) return 'High'
  if (value >= 50) return 'Moderate'
  return 'Normal'
}

function utilizationColor(value: number) {
  if (value >= 100) return 'bg-red-500'
  if (value >= 80) return 'bg-orange-500'
  if (value >= 50) return 'bg-yellow-500'
  return 'bg-emerald-500'
}

export default function DisposalPage() {
  const [sites, setSites] = useState<DisposalSite[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')

  const [showSiteModal, setShowSiteModal] = useState(false)
  const [editingSite, setEditingSite] = useState<DisposalSite | null>(null)
  const [siteForm, setSiteForm] = useState<SiteForm>(emptyForm)

  const [loadSite, setLoadSite] = useState<DisposalSite | null>(null)
  const [loadForm, setLoadForm] = useState<LoadForm>({
    tons: '',
    action: 'add',
  })

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('wms_user') || '{}')
    } catch {
      return {}
    }
  }, [])

  const role = String(user.role || '')
  const isAdmin = role === 'Admin'
  const canManageLoad = isAdmin || role === 'Supervisor'

  async function fetchSites() {
    setLoading(true)
    setError('')

    try {
      const response = await apiClient.get('/disposal')
      const payload = response.data
      const rows = Array.isArray(payload) ? payload : payload?.data

      setSites(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchSites()
  }, [])

  function openCreateModal() {
    setEditingSite(null)
    setSiteForm(emptyForm)
    setShowSiteModal(true)
    setError('')
    setSuccess('')
  }

  function openEditModal(site: DisposalSite) {
    setEditingSite(site)
    setSiteForm({
      name: site.name,
      location: site.location,
      max_capacity_tons: String(site.max_capacity_tons),
    })
    setShowSiteModal(true)
    setError('')
    setSuccess('')
  }

  async function handleSiteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const capacity = Number(siteForm.max_capacity_tons)

    if (!siteForm.name.trim() || !siteForm.location.trim()) {
      setError('Please enter the site name and location.')
      return
    }

    if (!Number.isFinite(capacity) || capacity <= 0) {
      setError('Maximum capacity must be greater than zero.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const body = {
      name: siteForm.name.trim(),
      location: siteForm.location.trim(),
      max_capacity_tons: capacity,
    }

    try {
      if (editingSite) {
        await apiClient.put(`/disposal/${editingSite.site_id}`, body)
        setSuccess('Disposal site updated successfully.')
      } else {
        await apiClient.post('/disposal', body)
        setSuccess('Disposal site created successfully.')
      }

      setShowSiteModal(false)
      await fetchSites()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(site: DisposalSite) {
    const confirmed = window.confirm(
      `Delete disposal site "${site.name}"? This action cannot be undone.`,
    )

    if (!confirmed) return

    setError('')
    setSuccess('')

    try {
      await apiClient.delete(`/disposal/${site.site_id}`)
      setSuccess('Disposal site deleted successfully.')
      await fetchSites()
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  function openLoadModal(site: DisposalSite, action: 'add' | 'remove') {
    setLoadSite(site)
    setLoadForm({ tons: '', action })
    setError('')
    setSuccess('')
  }

  async function handleLoadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!loadSite) return

    const tons = Number(loadForm.tons)

    if (!Number.isFinite(tons) || tons <= 0) {
      setError('Enter a valid quantity greater than zero.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await apiClient.post(`/disposal/${loadSite.site_id}/load`, {
        tons,
        action: loadForm.action,
      })

      setLoadSite(null)
      setSuccess(
        loadForm.action === 'add'
          ? 'Waste load added successfully.'
          : 'Waste load removed successfully.',
      )

      await fetchSites()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const filteredSites = sites.filter((site) => {
    const query = search.toLowerCase()

    const matchesSearch =
      site.name.toLowerCase().includes(query) ||
      site.location.toLowerCase().includes(query)

    const utilization = getUtilization(site)

    const matchesFilter =
      filter === 'All' ||
      (filter === 'Normal' && utilization < 50) ||
      (filter === 'Moderate' && utilization >= 50 && utilization < 80) ||
      (filter === 'High' && utilization >= 80 && utilization < 100) ||
      (filter === 'Full' && utilization >= 100)

    return matchesSearch && matchesFilter
  })

  const totalCapacity = sites.reduce(
    (sum, site) => sum + Number(site.max_capacity_tons || 0),
    0,
  )

  const totalLoad = sites.reduce(
    (sum, site) => sum + Number(site.current_load_tons || 0),
    0,
  )

  const overallUtilization =
    totalCapacity > 0 ? (totalLoad / totalCapacity) * 100 : 0

  return (
    <div className="min-h-screen space-y-6 bg-[#09090f] p-4 text-white sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400">
              <Recycle size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Disposal Management</h1>
              <p className="mt-1 text-sm text-gray-400">
                Monitor disposal sites and manage waste capacity
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void fetchSites()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400"
            >
              <Plus size={17} />
              Add Site
            </button>
          )}
        </div>
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
        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <p className="text-sm text-gray-400">Disposal Sites</p>
          <p className="mt-2 text-3xl font-bold">{sites.length}</p>
          <p className="mt-1 text-xs text-gray-500">Registered facilities</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <p className="text-sm text-gray-400">Total Capacity</p>
          <p className="mt-2 text-3xl font-bold">
            {totalCapacity.toFixed(2)}
            <span className="ml-1 text-sm font-normal text-gray-400">tons</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">Combined site capacity</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <p className="text-sm text-gray-400">Current Waste Load</p>
          <p className="mt-2 text-3xl font-bold">
            {totalLoad.toFixed(2)}
            <span className="ml-1 text-sm font-normal text-gray-400">tons</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">Waste currently stored</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-5">
          <p className="text-sm text-gray-400">Overall Utilization</p>
          <p className="mt-2 text-3xl font-bold">
            {overallUtilization.toFixed(1)}%
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${utilizationColor(overallUtilization)}`}
              style={{ width: `${Math.min(overallUtilization, 100)}%` }}
            />
          </div>
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
            placeholder="Search site name or location..."
            className="w-full rounded-xl border border-white/10 bg-[#12121b] py-3 pl-10 pr-4 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded-xl border border-white/10 bg-[#12121b] px-4 py-3 text-sm outline-none focus:border-emerald-500"
        >
          <option value="All">All utilization levels</option>
          <option value="Normal">Normal</option>
          <option value="Moderate">Moderate</option>
          <option value="High">High</option>
          <option value="Full">Full</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-[#12121b] p-12 text-center text-gray-400">
          Loading disposal sites...
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#12121b] p-12 text-center">
          <Recycle className="mx-auto mb-3 text-gray-500" size={32} />
          <p className="font-semibold">No disposal sites found</p>
          <p className="mt-1 text-sm text-gray-500">
            Try changing your search or add a disposal site.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {filteredSites.map((site) => {
            const utilization = getUtilization(site)
            const currentLoad = Number(site.current_load_tons || 0)
            const capacity = Number(site.max_capacity_tons || 0)

            return (
              <div
                key={site.site_id}
                className="rounded-2xl border border-white/10 bg-[#12121b] p-5 transition hover:border-emerald-500/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400">
                      <Recycle size={22} />
                    </div>
                    <div>
                      <h2 className="font-semibold">{site.name}</h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-400">
                        <MapPin size={14} />
                        {site.location}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        Site ID: #{site.site_id}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300">
                    {utilizationLabel(utilization)}
                  </span>
                </div>

                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-gray-400">
                      <Gauge size={15} />
                      Capacity utilization
                    </span>
                    <span className="font-semibold">
                      {utilization.toFixed(1)}%
                    </span>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${utilizationColor(utilization)}`}
                      style={{ width: `${Math.min(utilization, 100)}%` }}
                    />
                  </div>

                  <div className="mt-3 flex justify-between text-sm">
                    <span className="text-gray-400">
                      Current load:{' '}
                      <strong className="text-white">
                        {currentLoad.toFixed(2)} tons
                      </strong>
                    </span>
                    <span className="text-gray-400">
                      Capacity:{' '}
                      <strong className="text-white">
                        {capacity.toFixed(2)} tons
                      </strong>
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    Remaining capacity: {Math.max(0, capacity - currentLoad).toFixed(2)} tons
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                  {canManageLoad && (
                    <>
                      <button
                        onClick={() => openLoadModal(site, 'add')}
                        className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                      >
                        <ArrowDownToLine size={15} />
                        Add Load
                      </button>

                      <button
                        onClick={() => openLoadModal(site, 'remove')}
                        className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
                      >
                        <ArrowUpFromLine size={15} />
                        Remove Load
                      </button>
                    </>
                  )}

                  {isAdmin && (
                    <>
                      <button
                        onClick={() => openEditModal(site)}
                        className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5"
                      >
                        <Edit3 size={14} />
                        Edit
                      </button>

                      <button
                        onClick={() => void handleDelete(site)}
                        className="flex items-center gap-2 rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showSiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleSiteSubmit}
            className="w-full max-w-lg space-y-5 rounded-2xl border border-white/10 bg-[#151520] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  {editingSite ? 'Edit Disposal Site' : 'Add Disposal Site'}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Enter the disposal facility details.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSiteModal(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-gray-300">Site name</span>
              <input
                required
                value={siteForm.name}
                onChange={(event) =>
                  setSiteForm({ ...siteForm, name: event.target.value })
                }
                placeholder="e.g. North Zone Disposal Facility"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-gray-300">Location</span>
              <input
                required
                value={siteForm.location}
                onChange={(event) =>
                  setSiteForm({ ...siteForm, location: event.target.value })
                }
                placeholder="Enter facility location"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-gray-300">Maximum capacity (tons)</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={siteForm.max_capacity_tons}
                onChange={(event) =>
                  setSiteForm({
                    ...siteForm,
                    max_capacity_tons: event.target.value,
                  })
                }
                placeholder="e.g. 500"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </label>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSiteModal(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                type="submit"
                className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingSite ? 'Update Site' : 'Create Site'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loadSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleLoadSubmit}
            className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-[#151520] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  {loadForm.action === 'add' ? 'Add Waste Load' : 'Remove Waste Load'}
                </h2>
                <p className="mt-1 text-sm text-gray-400">{loadSite.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setLoadSite(null)}
                className="rounded-lg p-2 text-gray-400 hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            <div className="rounded-xl bg-white/5 p-4 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Current load</span>
                <strong className="text-white">
                  {Number(loadSite.current_load_tons || 0).toFixed(2)} tons
                </strong>
              </div>
              <div className="mt-2 flex justify-between text-gray-400">
                <span>Maximum capacity</span>
                <strong className="text-white">
                  {Number(loadSite.max_capacity_tons || 0).toFixed(2)} tons
                </strong>
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-gray-300">Quantity (tons)</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={loadForm.tons}
                onChange={(event) =>
                  setLoadForm({ ...loadForm, tons: event.target.value })
                }
                placeholder="Enter quantity"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />
            </label>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLoadSite(null)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                type="submit"
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50 ${
                  loadForm.action === 'add'
                    ? 'bg-emerald-500 hover:bg-emerald-400'
                    : 'bg-blue-400 hover:bg-blue-300'
                }`}
              >
                {saving
                  ? 'Processing...'
                  : loadForm.action === 'add'
                    ? 'Add Load'
                    : 'Remove Load'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
