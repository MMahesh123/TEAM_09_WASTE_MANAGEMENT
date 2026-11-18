
import { useEffect, useState } from 'react'
import {
  apiClient,
  getApiErrorMessage,
} from '../../services/api/client'

type OperationsData = {
  collectionByWard: {
    ward: string
    collectionCount: number
    collectedTons: number
    acceptedTons: number
    pendingCount: number
    approvedCount: number
    rejectedCount: number
  }[]
  collectionVerification: {
    status: string
    total: number
    wasteTons: number
    acceptedTons: number
  }[]
  vehicleUsage: {
    vehicleId: number
    vehicle: string
    totalAssignments: number
    completedAssignments: number
    inProgressAssignments: number
    cancelledAssignments: number
  }[]
  disposalBySite: {
    siteId: number
    site: string
    deliveryCount: number
    deliveredTons: number
    acceptedTons: number
    pendingCount: number
    approvedCount: number
    rejectedCount: number
  }[]
  disposalVerification: {
    status: string
    total: number
    deliveredTons: number
    acceptedTons: number
  }[]
  paymentSummary: {
    status: string
    paymentCount: number
    totalAmount: number
    totalTons: number
  }[]
  totals: {
    collectionCount: number
    collectedTons: number
    acceptedCollectionTons: number
    totalAssignments: number
    completedAssignments: number
    deliveryCount: number
    deliveredTons: number
    acceptedDisposalTons: number
    paymentCount: number
    paymentAmount: number
  }
}

const emptyData: OperationsData = {
  collectionByWard: [],
  collectionVerification: [],
  vehicleUsage: [],
  disposalBySite: [],
  disposalVerification: [],
  paymentSummary: [],
  totals: {
    collectionCount: 0,
    collectedTons: 0,
    acceptedCollectionTons: 0,
    totalAssignments: 0,
    completedAssignments: 0,
    deliveryCount: 0,
    deliveredTons: 0,
    acceptedDisposalTons: 0,
    paymentCount: 0,
    paymentAmount: 0,
  },
}

function number(value: number) {
  return Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-[#12121b] p-5">
      <h2 className="mb-5 font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-sm text-gray-500">{message}</p>
  )
}

function StatusRows({
  items,
}: {
  items: { status: string; total: number }[]
}) {
  if (!items.length) {
    return <Empty message="No verification records for this period." />
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.status}
          className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3"
        >
          <span className="text-sm text-gray-300">{item.status}</span>
          <span className="font-semibold text-white">{number(item.total)}</span>
        </div>
      ))}
    </div>
  )
}

function Metric({
  label,
  value,
  suffix = '',
}: {
  label: string
  value: number
  suffix?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">
        {number(value)}{suffix}
      </p>
    </div>
  )
}

export default function OperationsReports({ period }: { period: string }) {
  const [data, setData] = useState<OperationsData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function fetchOperations() {
      setLoading(true)
      setError('')

      try {
        const response = await apiClient.get('/dashboard/operations', {
          params: { period },
        })

        const payload = response.data?.data

        if (!response.data?.success || !payload) {
          throw new Error('Invalid operational reports response.')
        }

        if (active) {
          setData({
            ...emptyData,
            ...payload,
            totals: {
              ...emptyData.totals,
              ...(payload.totals || {}),
            },
          })
        }
      } catch (err) {
        if (active) {
          setError(getApiErrorMessage(err))
          setData(emptyData)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void fetchOperations()

    return () => {
      active = false
    }
  }, [period])

  if (loading) {
    return (
      <section className="rounded-2xl border border-white/10 bg-[#12121b] p-8 text-center text-sm text-gray-400">
        Loading operational reports...
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
        <p className="text-sm font-medium text-red-300">
          Could not load operational reports
        </p>
        <p className="mt-2 text-sm text-gray-400">{error}</p>
      </section>
    )
  }

  const totals = data.totals

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">
          Operational Performance
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Collection, fleet, disposal and payment summaries for the selected period.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Waste Collected" value={totals.collectedTons} suffix=" tons" />
        <Metric label="Accepted Collection" value={totals.acceptedCollectionTons} suffix=" tons" />
        <Metric label="Completed Assignments" value={totals.completedAssignments} />
        <Metric label="Waste Delivered" value={totals.deliveredTons} suffix=" tons" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Collection by Ward">
          {data.collectionByWard.length === 0 ? (
            <Empty message="No collection records for this period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="pb-3">Ward</th>
                    <th className="pb-3">Collections</th>
                    <th className="pb-3">Collected (T)</th>
                    <th className="pb-3">Accepted (T)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.collectionByWard.map((row) => (
                    <tr key={row.ward} className="border-t border-white/10">
                      <td className="py-3 text-gray-200">{row.ward}</td>
                      <td className="py-3 text-gray-300">{number(row.collectionCount)}</td>
                      <td className="py-3 text-gray-300">{number(row.collectedTons)}</td>
                      <td className="py-3 text-emerald-300">{number(row.acceptedTons)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Collection Verification">
          <StatusRows items={data.collectionVerification} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric
              label="Total Collections"
              value={totals.collectionCount}
            />
            <Metric
              label="Accepted Waste"
              value={totals.acceptedCollectionTons}
              suffix=" tons"
            />
          </div>
        </Panel>

        <Panel title="Vehicle Usage">
          {data.vehicleUsage.length === 0 ? (
            <Empty message="No vehicle assignments for this period." />
          ) : (
            <div className="space-y-3">
              {data.vehicleUsage.map((vehicle) => (
                <div
                  key={vehicle.vehicleId}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">
                      {vehicle.vehicle}
                    </span>
                    <span className="text-xs text-gray-400">
                      {number(vehicle.totalAssignments)} assignments
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500">Completed</p>
                      <p className="mt-1 font-semibold text-emerald-300">
                        {number(vehicle.completedAssignments)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">In progress</p>
                      <p className="mt-1 font-semibold text-sky-300">
                        {number(vehicle.inProgressAssignments)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Cancelled</p>
                      <p className="mt-1 font-semibold text-orange-300">
                        {number(vehicle.cancelledAssignments)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Disposal Site Performance">
          {data.disposalBySite.length === 0 ? (
            <Empty message="No disposal deliveries for this period." />
          ) : (
            <div className="space-y-3">
              {data.disposalBySite.map((site) => (
                <div
                  key={site.siteId}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <p className="font-semibold text-white">{site.site}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Deliveries</p>
                      <p className="mt-1 text-gray-200">{number(site.deliveryCount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Delivered</p>
                      <p className="mt-1 text-gray-200">{number(site.deliveredTons)} tons</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Accepted</p>
                      <p className="mt-1 text-emerald-300">{number(site.acceptedTons)} tons</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Pending / Rejected</p>
                      <p className="mt-1 text-gray-300">
                        {number(site.pendingCount)} / {number(site.rejectedCount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Disposal Verification">
          <StatusRows items={data.disposalVerification} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Total Deliveries" value={totals.deliveryCount} />
            <Metric
              label="Accepted at Disposal"
              value={totals.acceptedDisposalTons}
              suffix=" tons"
            />
          </div>
        </Panel>

        <Panel title="Payment Summary">
          {data.paymentSummary.length === 0 ? (
            <Empty message="No payment records for this period." />
          ) : (
            <div className="space-y-3">
              {data.paymentSummary.map((payment) => (
                <div
                  key={payment.status}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">
                      {payment.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {number(payment.paymentCount)} payments
                    </span>
                  </div>
                  <p className="mt-2 text-xl font-bold text-emerald-300">
                    ₹{number(payment.totalAmount)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {number(payment.totalTons)} tons recorded
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 rounded-xl bg-white/[0.03] p-4">
            <p className="text-xs text-gray-400">Total recorded payment amount</p>
            <p className="mt-2 text-2xl font-bold text-white">
              ₹{number(totals.paymentAmount)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {number(totals.paymentCount)} payment records
            </p>
          </div>
        </Panel>
      </div>

      <p className="text-xs leading-5 text-gray-500">
        Accepted quantities are based on Approved verification records.
        Payment amounts represent recorded payment entries, not confirmation of a bank transfer.
      </p>
    </div>
  )
}
