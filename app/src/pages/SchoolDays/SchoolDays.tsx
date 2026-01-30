import React, { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Navigate } from 'react-router-dom'
import { useRoleAccess } from '../../hooks/useRoleAccess'
import { useSchoolDays } from '../../hooks/useSchoolDays'
import { useAuth } from '../../hooks/useAuth'
import { Loader2, Calendar, Save, Building2, AlertCircle } from 'lucide-react'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { Badge } from '../../components/badge'
import { Alert } from '../../components/alert'

const MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const SchoolDays: React.FC = () => {
  const { hasAccess } = useRoleAccess(['principal', 'institution-administrator'])
  const { user } = useAuth()
  const currentYear = new Date().getFullYear()

  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('')
  const [schoolDaysData, setSchoolDaysData] = useState<Record<number, number>>({})

  // Get institution ID from user
  const institutionId = useMemo(() => {
    return user?.user_institutions?.[0]?.institution_id || ''
  }, [user])

  // Generate year options (current year and previous 2 years)
  const yearOptions = useMemo(() => {
    const years = []
    for (let i = 0; i < 3; i++) {
      const year = currentYear - i
      years.push({ value: year.toString(), label: year.toString() })
    }
    return years
  }, [currentYear])

  // Generate academic year options (common format: 2024-2025)
  const academicYearOptions = useMemo(() => {
    const years = []
    for (let i = 0; i < 5; i++) {
      const startYear = currentYear - i
      const endYear = startYear + 1
      const academicYear = `${startYear}-${endYear}`
      years.push({ value: academicYear, label: academicYear })
    }
    return years
  }, [currentYear])

  const {
    schoolDays,
    isLoading,
    bulkUpsert,
    isBulkUpserting,
    refetch,
  } = useSchoolDays({
    institutionId,
    academicYear: selectedAcademicYear,
    year: selectedYear,
    enabled: !!institutionId && !!selectedAcademicYear,
  })

  // Sync local form state from API whenever we have finished loading (fixes reload showing 0)
  React.useEffect(() => {
    if (isLoading) return
    const data: Record<number, number> = {}
    for (let month = 1; month <= 12; month++) {
      const record = schoolDays.find((d) => d.month === month)
      data[month] = record?.total_days ?? 0
    }
    setSchoolDaysData(data)
  }, [schoolDays, isLoading])

  // Auto-select first academic year if none selected
  React.useEffect(() => {
    if (!selectedAcademicYear && academicYearOptions.length > 0) {
      setSelectedAcademicYear(academicYearOptions[0].value)
    }
  }, [selectedAcademicYear, academicYearOptions])

  const handleDaysChange = useCallback((month: number, value: number) => {
    setSchoolDaysData((prev) => ({
      ...prev,
      [month]: Math.max(0, value),
    }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!institutionId || !selectedAcademicYear) {
      return
    }

    try {
      const schoolDays = Object.entries(schoolDaysData).map(([month, totalDays]) => ({
        month: parseInt(month),
        total_days: totalDays,
      }))

      await bulkUpsert({
        institution_id: institutionId,
        academic_year: selectedAcademicYear,
        year: selectedYear,
        school_days: schoolDays,
      })

      await refetch()
    } catch (error) {
      // Error is handled in the hook
    }
  }, [schoolDaysData, institutionId, selectedAcademicYear, selectedYear, bulkUpsert, refetch])

  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />
  }

  if (!institutionId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Alert
          type="error"
          title="No Institution Assigned"
          message="You need to be assigned to an institution to manage school days."
          show={true}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {/* Page Header */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <Calendar className="w-8 h-8 text-indigo-600" />
                  School Days
                </h1>
                <p className="mt-2 text-gray-600">
                  Set the total number of school days per month for your institution.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {user?.user_institutions?.[0]?.institution?.title || 'Institution'}
                </span>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 font-medium">Academic Year:</span>
                <div className="min-w-[160px]">
                  <Select
                    options={academicYearOptions}
                    value={selectedAcademicYear}
                    onChange={(e) => setSelectedAcademicYear(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 font-medium">Year:</span>
                <div className="min-w-[100px]">
                  <Select
                    options={yearOptions}
                    value={selectedYear.toString()}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  />
                </div>
              </div>
              <Button
                onClick={handleSave}
                disabled={isBulkUpserting || !selectedAcademicYear}
                className="flex items-center gap-2 ml-auto"
              >
                {isBulkUpserting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save All
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* School Days Table */}
          {isLoading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 shadow-sm">
              <div className="flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <p className="ml-3 text-sm text-gray-600">Loading school days...</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  School Days by Month
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Set the total number of school days for each month
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Month
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Total School Days
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {MONTHS.map((month, index) => {
                      const monthNumber = parseInt(month.value)
                      const days = schoolDaysData[monthNumber] || 0
                      return (
                        <tr
                          key={month.value}
                          className={`hover:bg-gray-50 transition-colors ${
                            index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                          }`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 text-indigo-600 mr-2" />
                              <span className="text-sm font-medium text-gray-900">
                                {month.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center justify-center">
                              <Input
                                type="number"
                                min="0"
                                max="31"
                                value={days}
                                onChange={(e) =>
                                  handleDaysChange(monthNumber, parseInt(e.target.value) || 0)
                                }
                                className="w-32 text-center"
                                placeholder="0"
                              />
                              <span className="ml-2 text-sm text-gray-500">days</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <span className="font-medium">Total School Days (Year):</span>{' '}
                <Badge color="blue">
                  {Object.values(schoolDaysData).reduce((sum, days) => sum + days, 0)} days
                </Badge>
              </div>
              <div className="text-sm text-gray-600">
                <span className="font-medium">Selected Period:</span>{' '}
                <Badge color="green">
                  {selectedAcademicYear} - {selectedYear}
                </Badge>
              </div>
            </div>
          </div>

          {/* Info Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Note:</p>
                <p>
                  Set the total number of school days for each month. This information is used
                  to calculate attendance percentages and validate attendance records.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default SchoolDays

