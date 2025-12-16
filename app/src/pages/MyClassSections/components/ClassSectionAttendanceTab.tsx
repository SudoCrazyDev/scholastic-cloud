import React, { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useStudentAttendance } from '../../../hooks/useStudentAttendance'
import { Loader2, Calendar, Save, User, Search } from 'lucide-react'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { Badge } from '../../../components/badge'
import type { Student } from '../../../types'

interface ClassSectionAttendanceTabProps {
  classSectionId: string
  students: Student[]
  academicYear: string
  getFullName: (student: Student) => string
}

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

const ClassSectionAttendanceTab: React.FC<ClassSectionAttendanceTabProps> = ({
  classSectionId,
  students,
  academicYear,
  getFullName,
}) => {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth.toString())
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [searchTerm, setSearchTerm] = useState('')
  const [attendanceData, setAttendanceData] = useState<Record<string, { days_present: number; days_absent: number }>>({})

  const {
    attendances,
    isLoading,
    bulkUpsert,
    isBulkUpserting,
    refetch,
  } = useStudentAttendance({
    classSectionId,
    academicYear,
    month: parseInt(selectedMonth),
    year: selectedYear,
    enabled: !!classSectionId && !!academicYear,
  })

  // Initialize attendance data from API response
  React.useEffect(() => {
    if (attendances.length > 0) {
      const data: Record<string, { days_present: number; days_absent: number }> = {}
      attendances.forEach((attendance) => {
        data[attendance.student_id] = {
          days_present: attendance.days_present,
          days_absent: attendance.days_absent,
        }
      })
      setAttendanceData(data)
    } else {
      // Initialize with zeros for all students
      const data: Record<string, { days_present: number; days_absent: number }> = {}
      students.forEach((student) => {
        if (!data[student.id]) {
          data[student.id] = { days_present: 0, days_absent: 0 }
        }
      })
      setAttendanceData(data)
    }
  }, [attendances, students])

  // Filter students by search term
  const filteredStudents = useMemo(() => {
    if (!searchTerm) return students
    const searchLower = searchTerm.toLowerCase()
    return students.filter((student) => {
      const fullName = getFullName(student).toLowerCase()
      const lrn = student.lrn?.toLowerCase() || ''
      return fullName.includes(searchLower) || lrn.includes(searchLower)
    })
  }, [students, searchTerm, getFullName])

  // Group students by gender
  const groupedStudents = useMemo(() => {
    const grouped: Record<string, Student[]> = {}
    filteredStudents.forEach((student) => {
      const gender = student.gender || 'other'
      if (!grouped[gender]) {
        grouped[gender] = []
      }
      grouped[gender].push(student)
    })

    // Sort each group by name
    Object.keys(grouped).forEach((gender) => {
      grouped[gender].sort((a, b) => {
        const nameA = `${a.last_name} ${a.first_name} ${a.middle_name || ''}`.toLowerCase()
        const nameB = `${b.last_name} ${b.first_name} ${b.middle_name || ''}`.toLowerCase()
        return nameA.localeCompare(nameB)
      })
    })

    return grouped
  }, [filteredStudents])

  const handleAttendanceChange = useCallback((studentId: string, field: 'days_present' | 'days_absent', value: number) => {
    setAttendanceData((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: Math.max(0, value),
      },
    }))
  }, [])

  const handleSave = useCallback(async () => {
    try {
      const attendances = Object.entries(attendanceData).map(([studentId, data]) => ({
        student_id: studentId,
        days_present: data.days_present,
        days_absent: data.days_absent,
      }))

      await bulkUpsert({
        class_section_id: classSectionId,
        academic_year: academicYear,
        month: parseInt(selectedMonth),
        year: selectedYear,
        attendances,
      })

      await refetch()
    } catch (error) {
      // Error is handled in the hook
    }
  }, [attendanceData, classSectionId, academicYear, selectedMonth, selectedYear, bulkUpsert, refetch])

  // Generate year options (current year and previous 2 years)
  const yearOptions = useMemo(() => {
    const years = []
    for (let i = 0; i < 3; i++) {
      const year = currentYear - i
      years.push({ value: year.toString(), label: year.toString() })
    }
    return years
  }, [currentYear])

  const genderLabels: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
  }

  if (isLoading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
          <p className="mt-2 text-sm text-gray-600">Loading attendance records...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">Student Attendance</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 font-medium">Month:</span>
              <div className="min-w-[140px]">
                <Select
                  options={MONTHS}
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value)
                    setAttendanceData({})
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 font-medium">Year:</span>
              <div className="min-w-[100px]">
                <Select
                  options={yearOptions}
                  value={selectedYear.toString()}
                  onChange={(e) => {
                    setSelectedYear(parseInt(e.target.value))
                    setAttendanceData({})
                  }}
                />
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={isBulkUpserting}
              className="flex items-center gap-2"
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
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search students by name or LRN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Attendance Table */}
      {Object.keys(groupedStudents).length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
          <p className="text-gray-600">
            {searchTerm ? `No students match "${searchTerm}"` : 'No students in this class section'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedStudents).map(([gender, studentsList]) => (
            <motion.div
              key={gender}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-3 border-b border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900">
                  {genderLabels[gender]} Students ({studentsList.length})
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="sticky left-0 z-10 px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Student Name
                        </div>
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 min-w-[150px]">
                        Days Present
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[150px]">
                        Days Absent
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {studentsList.map((student, index) => {
                      const attendance = attendanceData[student.id] || { days_present: 0, days_absent: 0 }
                      const totalDays = attendance.days_present + attendance.days_absent
                      return (
                        <tr
                          key={student.id}
                          className={`hover:bg-gray-50 transition-colors ${
                            index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                          }`}
                        >
                          <td className="sticky left-0 z-10 px-6 py-4 whitespace-nowrap bg-white border-r border-gray-200">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-8 w-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-indigo-600" />
                              </div>
                              <div className="ml-3">
                                <div className="text-sm font-medium text-gray-900">
                                  {getFullName(student)}
                                </div>
                                {student.lrn && (
                                  <div className="text-xs text-gray-500">LRN: {student.lrn}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center justify-center">
                              <Input
                                type="number"
                                min="0"
                                value={attendance.days_present}
                                onChange={(e) =>
                                  handleAttendanceChange(student.id, 'days_present', parseInt(e.target.value) || 0)
                                }
                                className="w-24 text-center"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                value={attendance.days_absent}
                                onChange={(e) =>
                                  handleAttendanceChange(student.id, 'days_absent', parseInt(e.target.value) || 0)
                                }
                                className="w-24 text-center"
                              />
                              {totalDays > 0 && (
                                <Badge color={totalDays >= 20 ? 'green' : totalDays >= 15 ? 'yellow' : 'red'}>
                                  Total: {totalDays}
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Total Students:</span>{' '}
            <Badge color="blue">{filteredStudents.length}</Badge>
          </div>
          <div className="text-sm text-gray-600">
            <span className="font-medium">Selected Period:</span>{' '}
            <Badge color="green">
              {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClassSectionAttendanceTab

