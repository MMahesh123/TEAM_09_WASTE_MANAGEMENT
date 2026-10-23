
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  Leaf,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

type Ward = {
  ward_number?: number | string
  ward_name?: string
  zone?: string
  id?: number
  name?: string
}

type ApiComplaint = {
  id?: number | string
  ward: string
  type: string
  description?: string
  status?: string
}

const complaintTypes = [
  'Overflowing bin',
  'Missed waste collection',
  'Illegal dumping',
  'Waste segregation issue',
  'Damaged public bin',
  'Other',
]

export default function ComplaintsPage() {
  const [wards, setWards] = useState<Ward[]>([])
  const [ward, setWard] = useState('')
  const [type, setType] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [loadingWards, setLoadingWards] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<ApiComplaint | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true

    async function loadWards() {
      try {
        const response = await apiClient.get<Ward[]>('/wards')
        if (active) setWards(Array.isArray(response.data) ? response.data : [])
      } catch (err) {
        if (active) setError(getApiErrorMessage(err))
      } finally {
        if (active) setLoadingWards(false)
      }
    }

    void loadWards()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!image) {
      setImagePreview('')
      return
    }

    const url = URL.createObjectURL(image)
    setImagePreview(url)

    return () => URL.revokeObjectURL(url)
  }, [image])

  function getWardLabel(item: Ward) {
    const number = item.ward_number ?? item.id
    const name = item.ward_name ?? item.name
    const zone = item.zone ? ` · ${item.zone}` : ''

    if (number !== undefined && name) return `Ward ${number} — ${name}${zone}`
    if (number !== undefined) return `Ward ${number}${zone}`
    return name ?? 'Unnamed ward'
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess(null)

    if (!ward || !type) {
      setError('Please select a ward and complaint type.')
      return
    }

    setSubmitting(true)

    try {
      const response = await apiClient.post<{
        success: boolean
        message: string
        data: ApiComplaint
      }>('/complaints', {
        ward,
        type,
        description: description.trim(),
      })

      setSuccess(response.data.data)
      setWard('')
      setType('')
      setLocation('')
      setDescription('')
      setImage(null)

      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Citizen services / Complaints
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Report a Waste Issue
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Help keep our city clean. Tell us what happened and where it needs
          attention.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.8fr)]">
        <section className="rounded-2xl border border-emerald-300/15 bg-[#0d1521] p-5 shadow-xl shadow-black/10 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-300">
              <FileImage size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Complaint details
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Fields marked * are required
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs leading-5 text-rose-200"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 size={18} />
                Complaint submitted successfully!
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Your report has been registered with status{' '}
                <span className="font-semibold text-emerald-300">
                  {success.status ?? 'Pending'}
                </span>
                {success.id !== undefined ? ` · Reference #${success.id}` : ''}.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="complaint-type"
                className="mb-2 block text-xs font-medium text-slate-300"
              >
                Complaint type <span className="text-emerald-300">*</span>
              </label>
              <select
                id="complaint-type"
                required
                value={type}
                onChange={(event) => setType(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-[#101b29] px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
              >
                <option value="">Select complaint type</option>
                {complaintTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="complaint-ward"
                className="mb-2 block text-xs font-medium text-slate-300"
              >
                Ward <span className="text-emerald-300">*</span>
              </label>
              <select
                id="complaint-ward"
                required
                value={ward}
                onChange={(event) => setWard(event.target.value)}
                disabled={loadingWards}
                className="w-full rounded-xl border border-slate-700 bg-[#101b29] px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300/60 disabled:opacity-60"
              >
                <option value="">
                  {loadingWards ? 'Loading wards…' : 'Select your ward'}
                </option>
                {wards.map((item, index) => (
                  <option
                    key={`${item.ward_number ?? item.id ?? index}`}
                    value={String(item.ward_number ?? item.id ?? item.ward_name ?? item.name ?? '')}
                  >
                    {getWardLabel(item)}
                  </option>
                ))}
              </select>
              {!loadingWards && wards.length === 0 && (
                <p className="mt-2 text-[11px] text-amber-300">
                  No wards were returned. Check that the backend is running and
                  wards exist in the database.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="complaint-location"
                className="mb-2 block text-xs font-medium text-slate-300"
              >
                Location
              </label>
              <div className="relative">
                <MapPin
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  id="complaint-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Street, landmark, or nearby area"
                  className="w-full rounded-xl border border-slate-700 bg-[#101b29] py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/60"
                />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-600">
                Location is currently for the form only; the existing API does
                not save it.
              </p>
            </div>

            <div>
              <label
                htmlFor="complaint-description"
                className="mb-2 block text-xs font-medium text-slate-300"
              >
                Description
              </label>
              <textarea
                id="complaint-description"
                rows={4}
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the issue and any useful details…"
                className="w-full resize-y rounded-xl border border-slate-700 bg-[#101b29] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/60"
              />
              <p className="mt-1 text-right text-[10px] text-slate-600">
                {description.length}/2000
              </p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-300">
                Attach a photo <span className="text-slate-500">(optional)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  if (file && file.size > 5 * 1024 * 1024) {
                    setError('Please choose an image smaller than 5 MB.')
                    event.target.value = ''
                    setImage(null)
                    return
                  }
                  setError('')
                  setImage(file)
                }}
                className="sr-only"
                id="complaint-photo"
              />

              {imagePreview ? (
                <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-[#101b29] p-3">
                  <img
                    src={imagePreview}
                    alt="Selected complaint"
                    className="max-h-56 w-full rounded-lg object-contain"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="truncate text-xs text-slate-300">
                      {image?.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null)
                        if (fileInputRef.current) {
                          fileInputRef.current.value = ''
                        }
                      }}
                      className="flex shrink-0 items-center gap-1 text-xs text-rose-300 hover:text-rose-200"
                    >
                      <X size={14} /> Remove
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    Preview only — the current backend does not store image
                    uploads.
                  </p>
                </div>
              ) : (
                <label
                  htmlFor="complaint-photo"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-white/[0.015] px-4 py-7 text-center transition hover:border-emerald-300/40 hover:bg-emerald-300/[0.03]"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-300">
                    <Upload size={19} />
                  </div>
                  <span className="text-xs font-medium text-slate-200">
                    Click to upload a photo
                  </span>
                  <span className="mt-1 text-[10px] text-slate-500">
                    PNG, JPG, or WebP · Max 5 MB
                  </span>
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || loadingWards || wards.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3.5 text-sm font-bold text-[#06120f] shadow-[0_0_25px_rgba(52,211,153,0.12)] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <LoaderCircle size={17} className="animate-spin" />
                  Submitting complaint…
                </>
              ) : (
                <>
                  <CheckCircle2 size={17} />
                  Submit Complaint
                </>
              )}
            </button>

            <p className="text-center text-[10px] leading-5 text-slate-500">
              Your complaint will be registered in the waste management system.
              Please avoid including sensitive personal information.
            </p>
          </form>
        </section>

        {/* Your Impact panel */}
        <aside className="space-y-4">
          <section className="relative overflow-hidden rounded-2xl border border-emerald-300/15 bg-gradient-to-br from-[#102b25] via-[#0e1c22] to-[#101827] p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-300/[0.09] blur-3xl" />
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300">
                <Leaf size={22} />
              </div>
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Your Impact
              </p>
              <h2 className="mt-2 text-xl font-semibold leading-7 text-white">
                Small reports.
                <br />
                Cleaner communities.
              </h2>
              <p className="mt-3 text-xs leading-6 text-slate-400">
                Every report helps the city identify waste issues and direct
                attention where it is needed.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700/60 bg-[#0d1521] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300">
                <ShieldCheck size={19} />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-white">
                  Report responsibly
                </h3>
                <p className="mt-1 text-[10px] text-slate-500">
                  Clear details help faster action.
                </p>
              </div>
            </div>
            <div className="my-4 h-px bg-white/[0.06]" />
            <div className="space-y-3 text-[11px] leading-5 text-slate-400">
              <p className="flex gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                Choose the correct ward and issue type.
              </p>
              <p className="flex gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                Include a useful landmark or description.
              </p>
              <p className="flex gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                Only upload a relevant photo if available.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700/60 bg-[#0d1521] p-5">
            <div className="flex items-center gap-2 text-emerald-300">
              <Sparkles size={16} />
              <h3 className="text-xs font-semibold text-white">
                Together for a cleaner city
              </h3>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              Your submitted complaints are initially marked Pending. The
              responsible team can update the status as work progresses.
            </p>
          </section>

          <Link
            to="/dashboard"
            className="block rounded-xl border border-slate-700/60 px-4 py-3 text-center text-xs text-slate-400 transition hover:border-emerald-300/30 hover:text-emerald-300"
          >
            ← Back to Dashboard
          </Link>
        </aside>
      </div>
    </div>
  )
}
