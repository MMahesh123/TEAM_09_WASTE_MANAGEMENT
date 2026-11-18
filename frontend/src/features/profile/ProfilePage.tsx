
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  LockKeyhole,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { apiClient, getApiErrorMessage } from '../../services/api/client'

interface Profile {
  id: number
  username: string
  email: string
  role: string
  created_at: string | null
}

interface ProfileForm {
  username: string
  email: string
}

interface PasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const emptyPasswordForm: PasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-[#101b2a] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-60'

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

function updateStoredUsername(username: string) {
  try {
    const storedUser = JSON.parse(localStorage.getItem('wms_user') || '{}')

    if (storedUser && typeof storedUser === 'object') {
      localStorage.setItem(
        'wms_user',
        JSON.stringify({ ...storedUser, username }),
      )
    }
  } catch {
    // The profile remains saved on the server even if local storage is invalid.
  }
}

function formatDate(value: string | null) {
  if (!value) return 'Not available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Not available'

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState<ProfileForm>({
    username: '',
    email: '',
  })
  const [passwordForm, setPasswordForm] =
    useState<PasswordForm>(emptyPasswordForm)

  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [editing, setEditing] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await apiClient.get('/auth/profile')
      const data = response.data?.data as Profile | undefined

      if (
        !data ||
        typeof data.id !== 'number' ||
        typeof data.username !== 'string' ||
        typeof data.email !== 'string'
      ) {
        throw new Error('Invalid profile response from server.')
      }

      setProfile(data)
      setForm({
        username: data.username,
        email: data.email,
      })
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  function startEditing() {
    if (!profile) return

    setForm({
      username: profile.username,
      email: profile.email,
    })
    setEditing(true)
    setError('')
    setSuccess('')
  }

  function cancelEditing() {
    if (profile) {
      setForm({
        username: profile.username,
        email: profile.email,
      })
    }

    setEditing(false)
    setError('')
  }

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const username = form.username.trim()
    const email = form.email.trim().toLowerCase()

    if (!username || !email) {
      setError('Please enter both your name and email address.')
      return
    }

    if (username.length > 100) {
      setError('Name must not exceed 100 characters.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }

    setSavingProfile(true)

    try {
      const response = await apiClient.put('/auth/profile', {
        username,
        email,
      })

      const updated = response.data?.data as Profile | undefined

      if (!updated) {
        throw new Error('The server did not return the updated profile.')
      }

      setProfile(updated)
      setForm({
        username: updated.username,
        email: updated.email,
      })

      updateStoredUsername(updated.username)

      setEditing(false)
      setSuccess(response.data?.message || 'Profile updated successfully.')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setSavingProfile(false)
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      setError('Please complete all password fields.')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setError('Your new password must contain at least 8 characters.')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setError('Your new password must be different from the current one.')
      return
    }

    setChangingPassword(true)

    try {
      const response = await apiClient.put('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })

      setPasswordForm(emptyPasswordForm)
      setSuccess(
        response.data?.message || 'Password changed successfully.',
      )
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              WMS / Account Settings
            </p>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            My Profile
          </h1>

          <p className="mt-1 text-xs text-slate-400">
            View your account information and manage your security settings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadProfile()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1521] px-3 py-2.5 text-[11px] text-slate-300 hover:border-emerald-400/40 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
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
          className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-xs text-emerald-200"
        >
          <CheckCircle2 size={15} />
          {success}
        </div>
      )}

      {loading ? (
        <Panel className="flex items-center justify-center gap-3 p-12 text-sm text-slate-400">
          <RefreshCw size={16} className="animate-spin" />
          Loading your profile...
        </Panel>
      ) : profile ? (
        <>
          <Panel className="overflow-hidden">
            <div className="border-b border-white/[0.06] p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
                  <UserRound size={26} className="text-emerald-300" />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-white">
                    {profile.username}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {profile.email}
                  </p>
                </div>

                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 text-[10px] font-semibold text-emerald-300">
                  {profile.role}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Account ID
                </p>
                <p className="mt-2 text-sm font-medium text-slate-200">
                  #{profile.id}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Member Since
                </p>
                <p className="mt-2 text-sm font-medium text-slate-200">
                  {formatDate(profile.created_at)}
                </p>
              </div>
            </div>
          </Panel>

          <Panel className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-sky-400/10 p-2.5">
                  <UserRound size={18} className="text-sky-300" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Personal Information
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Manage your name and email address.
                  </p>
                </div>
              </div>

              {!editing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] font-medium text-slate-300 hover:border-emerald-400/40 hover:text-emerald-300"
                >
                  Edit Profile
                </button>
              )}
            </div>

            <form onSubmit={handleProfileSave} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-[11px] text-slate-400">
                  Full Name / Username
                </span>
                <div className="relative">
                  <UserRound
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    required
                    maxLength={100}
                    disabled={!editing || savingProfile}
                    value={form.username}
                    onChange={(event) =>
                      setForm({ ...form, username: event.target.value })
                    }
                    placeholder="Enter your name"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-[11px] text-slate-400">
                  Email Address
                </span>
                <div className="relative">
                  <Mail
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    required
                    type="email"
                    disabled={!editing || savingProfile}
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                    placeholder="Enter your email"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </label>

              {editing && (
                <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={savingProfile}
                    className="rounded-lg border border-slate-700 px-4 py-2.5 text-[11px] text-slate-300 hover:bg-white/[0.03] disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </form>
          </Panel>

          <Panel className="p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-amber-400/10 p-2.5">
                <LockKeyhole size={18} className="text-amber-300" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Change Password
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Verify your current password before setting a new one.
                </p>
              </div>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-[11px] text-slate-400">
                  Current Password
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={changingPassword}
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm({
                      ...passwordForm,
                      currentPassword: event.target.value,
                    })
                  }
                  placeholder="Enter current password"
                  className={inputClass}
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-[11px] text-slate-400">
                    New Password
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    disabled={changingPassword}
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm({
                        ...passwordForm,
                        newPassword: event.target.value,
                      })
                    }
                    placeholder="Minimum 8 characters"
                    className={inputClass}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-[11px] text-slate-400">
                    Confirm New Password
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    disabled={changingPassword}
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm({
                        ...passwordForm,
                        confirmPassword: event.target.value,
                      })
                    }
                    placeholder="Re-enter new password"
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="flex justify-end border-t border-white/[0.06] pt-4">
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                >
                  <ShieldCheck size={14} />
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </Panel>
        </>
      ) : (
        <Panel className="p-8 text-center">
          <AlertCircle size={22} className="mx-auto text-red-300" />
          <p className="mt-3 text-sm font-medium text-white">
            Could not load your profile
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Please refresh the page and try again.
          </p>
          <button
            type="button"
            onClick={() => void loadProfile()}
            className="mt-4 rounded-lg bg-emerald-400 px-4 py-2.5 text-[11px] font-semibold text-slate-950"
          >
            Try Again
          </button>
        </Panel>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-3 text-[10px] leading-5 text-emerald-200/80">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Your profile and password changes are saved through the authenticated
        WMS backend. Your account role is managed by the system and cannot be
        edited here.
      </p>
    </div>
  )
}
