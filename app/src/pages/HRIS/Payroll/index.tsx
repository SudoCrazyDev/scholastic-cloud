import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { BanknotesIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import { Banknote } from 'lucide-react'
import CompensationTab from './CompensationTab'
import PeriodsTab from './PeriodsTab'

type Tab = 'periods' | 'rates'

const Payroll: React.FC = () => {
  const [tab, setTab] = useState<Tab>('periods')

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
      active
        ? 'border-indigo-600 text-indigo-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <Banknote className="h-8 w-8 text-indigo-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payroll</h1>
          <p className="mt-1 text-gray-600">
            Generate each employee's Salary and Working Time Record from the attendance logs.
          </p>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        <button type="button" onClick={() => setTab('periods')} className={tabClass(tab === 'periods')}>
          <CalendarDaysIcon className="h-4 w-4" />
          Payroll Periods
        </button>
        <button type="button" onClick={() => setTab('rates')} className={tabClass(tab === 'rates')}>
          <BanknotesIcon className="h-4 w-4" />
          Employee Rates
        </button>
      </div>

      {tab === 'periods' ? <PeriodsTab /> : <CompensationTab />}
    </motion.div>
  )
}

export default Payroll
