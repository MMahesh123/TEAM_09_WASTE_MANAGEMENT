import {
  Activity, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3,
  MapPin, MoreHorizontal, Recycle, Truck, TriangleAlert,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from 'recharts'

const weeklyData = [
  { day: 'Mon', collected: 38, target: 45 },
  { day: 'Tue', collected: 52, target: 48 },
  { day: 'Wed', collected: 43, target: 50 },
  { day: 'Thu', collected: 67, target: 54 },
  { day: 'Fri', collected: 58, target: 57 },
  { day: 'Sat', collected: 76, target: 62 },
  { day: 'Sun', collected: 61, target: 60 },
]

const complaints = [
  { id: 'CMP-1042', title: 'Overflowing community bin', area: 'Indiranagar · Ward 83', status: 'In Progress', color: 'text-cyan-300 bg-cyan-300/10 border-cyan-300/15', time: '12 min ago' },
  { id: 'CMP-1041', title: 'Missed waste collection', area: 'Koramangala · Ward 151', status: 'Pending', color: 'text-amber-300 bg-amber-300/10 border-amber-300/15', time: '28 min ago' },
  { id: 'CMP-1040', title: 'Illegal dumping reported', area: 'Whitefield · Ward 84', status: 'Pending', color: 'text-amber-300 bg-amber-300/10 border-amber-300/15', time: '46 min ago' },
  { id: 'CMP-1039', title: 'Collection vehicle delay', area: 'Jayanagar · Ward 172', status: 'Resolved', color: 'text-emerald-300 bg-emerald-300/10 border-emerald-300/15', time: '1 hr ago' },
]

const metrics = [
  { label: 'Total complaints', value: '1,284', change: '+12.8%', positive: false, icon: TriangleAlert, tint: 'text-cyan-300 bg-cyan-300/10', note: 'vs previous period' },
  { label: 'Awaiting action', value: '86', change: '−8.2%', positive: true, icon: Clock3, tint: 'text-amber-300 bg-amber-300/10', note: 'vs previous period' },
  { label: 'Active vehicles', value: '42', change: '+4.5%', positive: true, icon: Truck, tint: 'text-violet-300 bg-violet-300/10', note: 'vs previous period' },
  { label: 'Resolved cases', value: '92.4%', change: '+3.1%', positive: true, icon: CheckCircle2, tint: 'text-emerald-300 bg-emerald-300/10', note: 'resolution rate' },
]

function SectionTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: string }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      {action && <button className="shrink-0 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-slate-300 transition hover:border-emerald-300/30 hover:text-emerald-300">{action}</button>}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-2xl border border-emerald-300/15 bg-gradient-to-r from-[#10251f] via-[#10201f] to-[#111a29] p-5 sm:p-7 lg:p-8">
        <div className="panel-grid absolute inset-0 opacity-40" />
        <div className="absolute -right-10 -top-24 h-64 w-64 rounded-full bg-emerald-400/[0.08] blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              <Activity size={12} /> Operations overview
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">A cleaner city starts <span className="text-emerald-300">with visibility.</span></h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">Monitor service requests, collection activity, and fleet indicators from one operational workspace.</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-300"><MapPin size={19} /></div>
            <div><p className="text-xs font-medium text-white">Bengaluru, Karnataka</p><p className="mt-1 text-[10px] text-slate-500">City operations preview</p></div>
          </div>
        </div>
      </section>

      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">Dashboard overview</h2>
          <p className="mt-1 text-xs text-slate-500">A snapshot of city service indicators.</p>
        </div>
        <p className="text-[10px] text-amber-300/80">Illustrative demo metrics · Not live database data</p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {metrics.map(({ label, value, change, positive, icon: Icon, tint, note }) => (
          <article key={label} className="glass-card group rounded-2xl p-5 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300/20">
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}><Icon size={19} /></div>
              <button aria-label={`More about ${label}`} className="rounded-lg p-1.5 text-slate-600 hover:bg-white/5 hover:text-slate-300"><MoreHorizontal size={18} /></button>
            </div>
            <p className="mt-5 text-xs font-medium text-slate-400">{label}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
              <span className={`inline-flex items-center text-[11px] ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
                {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{change}
              </span>
            </div>
            <p className="mt-2 text-[10px] text-slate-600">{note} <span className="text-slate-700">· demo only</span></p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.65fr_1fr]">
        <article className="glass-card min-w-0 rounded-2xl p-5 sm:p-6">
          <SectionTitle title="Collection activity" subtitle="Illustrative daily collection volume · tonnes" action="Last 7 days" />
          <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px]">
            <span className="flex items-center gap-2 text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-300" />Collected</span>
            <span className="flex items-center gap-2 text-slate-400"><span className="h-2 w-2 rounded-full bg-cyan-300" />Target</span>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16e6a1" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#16e6a1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="targetFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d5e8" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#00d5e8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(143,161,181,0.10)" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#718399', fontSize: 11 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fill: '#718399', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#101925', border: '1px solid #263548', borderRadius: 12, fontSize: 12 }} labelStyle={{ color: '#edf4fa' }} />
                <Area type="monotone" dataKey="target" name="Target" stroke="#00d5e8" strokeWidth={1.5} strokeDasharray="5 5" fill="url(#targetFill)" />
                <Area type="monotone" dataKey="collected" name="Collected" stroke="#16e6a1" strokeWidth={2.5} fill="url(#collectedFill)" activeDot={{ r: 5, fill: '#16e6a1', stroke: '#080c12', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="glass-card rounded-2xl p-5 sm:p-6">
          <SectionTitle title="Service health" subtitle="Illustrative operational indicators" />
          <div className="space-y-6 pt-1">
            {[
              { label: 'Complaint resolution', value: 92, color: 'bg-emerald-300', amount: '92%' },
              { label: 'Collection target', value: 76, color: 'bg-cyan-300', amount: '76%' },
              { label: 'Fleet availability', value: 84, color: 'bg-violet-300', amount: '84%' },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-2.5 flex items-center justify-between gap-3 text-xs"><span className="text-slate-300">{item.label}</span><span className="font-semibold text-white">{item.amount}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.value}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-7 flex items-start gap-3 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3.5">
            <Activity size={17} className="mt-0.5 shrink-0 text-amber-300" />
            <div><p className="text-xs font-medium text-slate-200">Preview indicators</p><p className="mt-1 text-[11px] leading-5 text-slate-500">These values are sample visuals. Live calculations will be added when the corresponding API is verified.</p></div>
          </div>
        </article>
      </section>

      <section className="glass-card overflow-hidden rounded-2xl">
        <div className="p-5 sm:p-6">
          <SectionTitle title="Recent complaints" subtitle="Sample records to preview the table layout" action="View all complaints" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse text-left">
            <thead><tr className="border-y border-white/[0.06] bg-white/[0.015] text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <th className="px-6 py-3.5 font-medium">Complaint</th><th className="px-5 py-3.5 font-medium">Area</th><th className="px-5 py-3.5 font-medium">Status</th><th className="px-5 py-3.5 font-medium">Reported</th>
            </tr></thead>
            <tbody>
              {complaints.map((complaint) => (
                <tr key={complaint.id} className="border-b border-white/[0.04] last:border-0 transition hover:bg-white/[0.02]">
                  <td className="px-6 py-4"><p className="text-xs font-medium text-slate-200">{complaint.title}</p><p className="mt-1 text-[10px] text-slate-600">{complaint.id}</p></td>
                  <td className="px-5 py-4 text-xs text-slate-400">{complaint.area}</td>
                  <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${complaint.color}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{complaint.status}</span></td>
                  <td className="px-5 py-4 text-xs text-slate-500">{complaint.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] px-5 py-4 sm:px-6">
          <p className="text-[10px] text-slate-600">Sample data · No live records loaded</p>
          <span className="text-[10px] text-slate-500">4 preview rows</span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { icon: Recycle, title: 'Collection', text: 'Review collection records and validation workflows.', color: 'text-emerald-300 bg-emerald-300/10', path: '/collection' },
          { icon: Truck, title: 'Fleet management', text: 'Prepare vehicle status and fleet views.', color: 'text-cyan-300 bg-cyan-300/10', path: '/vehicles' },
          { icon: ClipboardIcon, title: 'Complaint handling', text: 'Open the complaints workspace.', color: 'text-violet-300 bg-violet-300/10', path: '/complaints' },
        ].map(({ icon: Icon, title, text, color, path }) => (
          <a key={title} href={path} className="glass-card flex items-start gap-4 rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-emerald-300/20">
            <div className={`rounded-xl p-3 ${color}`}><Icon size={20} /></div>
            <div><h3 className="text-xs font-semibold text-slate-200">{title}</h3><p className="mt-1.5 text-[11px] leading-5 text-slate-500">{text}</p></div>
          </a>
        ))}
      </section>
    </div>
  )
}

function ClipboardIcon(props: { size?: number }) {
  return <Activity size={props.size ?? 20} />
}
