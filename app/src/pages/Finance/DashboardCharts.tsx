import React from 'react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import type { FinanceDashboardFee, FinanceGradeSummary } from '../../types'

interface DashboardChartsProps {
  fees: FinanceDashboardFee[]
  grades: FinanceGradeSummary[]
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd',
  '#818cf8', '#4f46e5', '#7c3aed', '#5b21b6',
  '#3730a3', '#312e81', '#6d28d9', '#4338ca',
  '#2563eb', '#3b82f6',
]

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      {label && <p className="font-medium text-gray-900 mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  )
}

const PieLabel = (props: {
  cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; percent?: number
}) => {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props
  if (percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

const DashboardCharts: React.FC<DashboardChartsProps> = ({ fees, grades }) => {
  const paymentsByFee = fees.map((fee, idx) => {
    const total = grades.reduce((sum, g) => sum + (g.payments.by_fee?.[fee.id] ?? 0), 0)
    return { name: fee.name, value: total, color: COLORS[idx % COLORS.length] }
  }).filter((d) => d.value > 0)

  const paymentsByGrade = grades.map((g, idx) => ({
    name: g.grade_level,
    total: g.payments.total,
    color: COLORS[idx % COLORS.length],
  })).filter((d) => d.total > 0)

  const collectiblesByFee = fees.map((fee, idx) => {
    const total = grades.reduce((sum, g) => sum + (g.payable.by_fee?.[fee.id] ?? 0), 0)
    return { name: fee.name, value: total, color: COLORS[idx % COLORS.length] }
  }).filter((d) => d.value > 0)

  const collectiblesByGrade = grades.map((g, idx) => ({
    name: g.grade_level,
    total: g.payable.total,
    color: COLORS[idx % COLORS.length],
  })).filter((d) => d.total > 0)

  const hasAnyData = paymentsByFee.length > 0 || paymentsByGrade.length > 0
    || collectiblesByFee.length > 0 || collectiblesByGrade.length > 0

  if (!hasAnyData) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center">
        <p className="text-gray-500">No chart data available for this academic year.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Payments by Fee Type</h3>
        {paymentsByFee.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={paymentsByFee}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={PieLabel}
                outerRadius={100}
                dataKey="value"
              >
                {paymentsByFee.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No payments recorded yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Total Payments by Grade Level</h3>
        {paymentsByGrade.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={paymentsByGrade} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `₱${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Payments" radius={[4, 4, 0, 0]}>
                {paymentsByGrade.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No payments recorded yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Collectibles by Fee Type</h3>
        {collectiblesByFee.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={collectiblesByFee}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={PieLabel}
                outerRadius={100}
                dataKey="value"
              >
                {collectiblesByFee.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No fee data configured.</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Collectibles by Grade Level</h3>
        {collectiblesByGrade.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={collectiblesByGrade} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `₱${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Collectibles" radius={[4, 4, 0, 0]}>
                {collectiblesByGrade.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No fee data configured.</p>
        )}
      </div>
    </div>
  )
}

export default DashboardCharts
