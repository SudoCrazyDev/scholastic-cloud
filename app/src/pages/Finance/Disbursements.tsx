import React from 'react'
import { motion } from 'framer-motion'
import { useDisbursements } from '../../hooks/useDisbursements'
import { Wallet, Tags, BarChart3 } from 'lucide-react'
import { DisbursementsListTab } from './DisbursementsListTab'
import { DisbursementTypesTab } from './DisbursementTypesTab'
import { DisbursementReportingTab } from './DisbursementReportingTab'

const tabs = [
  { id: 'list', name: 'Disbursements', icon: Wallet },
  { id: 'types', name: 'Manage Types', icon: Tags },
  { id: 'report', name: 'Reporting', icon: BarChart3 },
]

/**
 * Who may open this screen is decided by the `disbursements` module permission,
 * enforced by the route's RequireModule guard and again by the API on every
 * request. This page deliberately holds no gate of its own: the earlier check
 * here listed role slugs, which turned away any role a school built itself —
 * a custom "Finance Officer" granted Disbursements was bounced to the dashboard
 * because its slug was not one of the four hard-coded names.
 */
const Disbursements: React.FC = () => {
  const dm = useDisbursements()
  const [activeTab, setActiveTab] = React.useState('list')

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Wallet className="w-7 h-7" />
          Disbursements
        </h1>
        <p className="text-gray-600 mt-1">Record and track expenses, manage types, and review reporting.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <nav aria-label="Disbursement sections" className="flex flex-wrap gap-1 p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.name}
              </button>
            )
          })}
        </nav>
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        {activeTab === 'list' && <DisbursementsListTab dm={dm} />}
        {activeTab === 'types' && <DisbursementTypesTab dm={dm} />}
        {activeTab === 'report' && <DisbursementReportingTab dm={dm} />}
      </motion.div>
    </motion.div>
  )
}

export default Disbursements
