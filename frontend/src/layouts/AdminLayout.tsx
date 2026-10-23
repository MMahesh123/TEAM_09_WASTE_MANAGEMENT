import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Activity, BarChart3, Bell, Building2, ChevronLeft, ClipboardList,
  CreditCard, LayoutDashboard, Leaf, LogOut, Menu, Recycle, Settings,
  Truck, UserRound, Users, X,
} from 'lucide-react'
import { getStoredUser, logout } from '../features/auth/authService'

const navigation = [
  { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Complaints', path: '/complaints', icon: ClipboardList },
  { label: 'Vehicles', path: '/vehicles', icon: Truck },
  { label: 'Wards', path: '/wards', icon: Building2 },
  { label: 'Assignments', path: '/assignments', icon: Users },
  { label: 'Collection', path: '/collection', icon: Recycle },
  { label: 'Disposal', path: '/disposal', icon: Activity },
  { label: 'Payments', path: '/payments', icon: CreditCard },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
]

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const user = getStoredUser()

  function handleLogout() {
    logout()
    setMobileOpen(false)
    navigate('/login', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.06] px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-slate-950 shadow-[0_0_24px_rgba(22,230,161,0.15)]">
          <Leaf size={23} strokeWidth={2.5} />
        </div>
        {(!collapsed || mobileOpen) && (
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-wide text-white">ECO<span className="text-emerald-400">PULSE</span></p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">City operations</p>
          </div>
        )}
        {mobileOpen && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-2 text-slate-400 lg:hidden" aria-label="Close navigation">
            <X size={19} />
          </button>
        )}
      </div>

      <div className="px-4 pb-2 pt-6">
        {(!collapsed || mobileOpen) && <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Workspace</p>}
        <nav className="space-y-1" aria-label="Main navigation">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setMobileOpen(false)}
              title={collapsed && !mobileOpen ? label : undefined}
              className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] transition-colors ${isActive ? 'border border-emerald-400/15 bg-emerald-400/[0.09] font-semibold text-emerald-300' : 'border border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}
            >
              <Icon size={18} className="shrink-0" />
              {(!collapsed || mobileOpen) && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto space-y-1 border-t border-white/[0.06] p-4">
        <NavLink to="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/[0.04] hover:text-white">
          <UserRound size={18} />
          {(!collapsed || mobileOpen) && 'My profile'}
        </NavLink>
        <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-rose-400/[0.07] hover:text-rose-300">
          <LogOut size={18} />
          {(!collapsed || mobileOpen) && 'Sign out'}
        </button>
        <button onClick={() => setCollapsed((value) => !value)} className="hidden w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500 hover:bg-white/[0.04] hover:text-white lg:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <ChevronLeft size={18} className={collapsed ? 'rotate-180' : ''} />
          {!collapsed && 'Collapse sidebar'}
        </button>
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-xs font-bold uppercase text-emerald-300">
            {user?.username?.slice(0, 2) || 'US'}
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-200">{user?.username || 'Signed-in user'}</p>
              <p className="mt-1 text-[10px] capitalize text-slate-500">{user?.role || 'User'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#080c12] text-slate-100">
      {mobileOpen && <button aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/70 lg:hidden" />}

      <aside className={`fixed inset-y-0 left-0 z-50 hidden border-r border-white/[0.06] bg-[#0b111a] transition-[width] duration-200 lg:block ${collapsed ? 'w-[84px]' : 'w-[252px]'}`}>
        {sidebar}
      </aside>
      <aside className={`fixed inset-y-0 left-0 z-50 w-[270px] border-r border-white/[0.06] bg-[#0b111a] transition-transform duration-200 lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebar}
      </aside>

      <div className={`min-h-screen transition-[padding] duration-200 ${collapsed ? 'lg:pl-[84px]' : 'lg:pl-[252px]'}`}>
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-white/[0.06] bg-[#080c12]/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg border border-white/10 p-2 text-slate-300 lg:hidden" aria-label="Open navigation"><Menu size={19} /></button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">City Waste Management</p>
              <p className="mt-1 hidden text-[11px] text-slate-500 sm:block">Bengaluru · Operations control</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <span className="hidden items-center gap-2 rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1.5 text-[10px] font-medium text-amber-200 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> PREVIEW UI
            </span>
            <button aria-label="Notifications" title="Notifications are not connected yet" className="relative rounded-xl border border-white/[0.07] p-2.5 text-slate-400 hover:text-white">
              <Bell size={17} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </button>
            <div className="hidden h-8 w-px bg-white/10 sm:block" />
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-cyan-400 text-xs font-black uppercase text-slate-950">{user?.username?.slice(0, 2) || 'US'}</div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-slate-200">{user?.username || 'Signed-in user'}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{user?.role || 'User'}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] p-4 sm:p-7 lg:p-9">
          <Outlet />
          <footer className="mt-10 flex flex-col gap-2 border-t border-white/[0.06] py-5 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>ECOPULSE · City Waste Management System</span>
            <span className="flex items-center gap-2"><Settings size={12} /> Internal preview · Not connected to live operations</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
