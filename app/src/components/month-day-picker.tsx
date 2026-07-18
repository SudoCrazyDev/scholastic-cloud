import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { CalendarIcon } from '@heroicons/react/24/outline'
import { MONTH_NAMES, MONTH_NAMES_SHORT } from '../utils/monthNames'

// Leap reference year so February offers 29 days.
const daysInMonth = (month: number) => new Date(2024, month, 0).getDate()

export interface MonthDayPickerProps {
  month: number
  day: number
  onChange: (value: { month: number; day: number }) => void
  disabled?: boolean
  className?: string
}

// A date picker without a year: pick a month, then a day. Used for recurring
// annual dates (e.g. installment due dates) where showing a year would wrongly
// suggest the date belongs to a specific calendar year.
export function MonthDayPicker({ month, day, onChange, disabled, className }: MonthDayPickerProps) {
  const monthIndex = Math.min(Math.max(month, 1), 12) - 1
  const label = month && day ? `${MONTH_NAMES[monthIndex]} ${day}` : 'Pick a date'

  const selectMonth = (m: number) => {
    onChange({ month: m, day: Math.min(day || 1, daysInMonth(m)) })
  }

  return (
    <Headless.Popover className={clsx('relative', className)}>
      <Headless.PopoverButton
        disabled={disabled}
        className={clsx(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-left text-base text-gray-900',
          'transition-all duration-200 ease-in-out hover:border-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <span className={clsx(!(month && day) && 'text-gray-400')}>{label}</span>
        <CalendarIcon className="w-5 h-5 shrink-0 text-gray-400" />
      </Headless.PopoverButton>

      <Headless.PopoverPanel
        anchor="bottom start"
        className="z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg [--anchor-gap:6px]"
      >
        {({ close }) => (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500">Month</p>
              <div className="grid grid-cols-4 gap-1">
                {MONTH_NAMES_SHORT.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => selectMonth(i + 1)}
                    className={clsx(
                      'rounded-md px-1 py-1.5 text-xs font-medium transition-colors',
                      i + 1 === month
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500">Day</p>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: daysInMonth(month || 1) }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      onChange({ month: month || 1, day: d })
                      close()
                    }}
                    className={clsx(
                      'rounded-md py-1 text-xs font-medium transition-colors',
                      d === day ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Headless.PopoverPanel>
    </Headless.Popover>
  )
}
