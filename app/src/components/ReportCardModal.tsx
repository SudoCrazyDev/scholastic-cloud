import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from './button'
import PrintTempReportCard from './studentReportCard/studentTempReportCard.tsx'
import type { SectionSubject, StudentSubjectGrade, Institution, ClassSection, Student } from '../types'

interface ReportCardModalProps {
  isOpen: boolean
  onClose: () => void
  studentName?: string
  studentId?: string
  sectionSubjects?: SectionSubject[]
  studentSubjectsGrade?: StudentSubjectGrade[]
  institution?: Institution
  classSection?: ClassSection | null
  student?: Student | null
  loading?: boolean
}

export function ReportCardModal({
  isOpen,
  onClose,
  studentName,
  sectionSubjects,
  studentSubjectsGrade,
  institution,
  classSection,
  student,
  loading = false,
}: ReportCardModalProps) {
  const handleClose = () => {
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-6xl bg-white rounded-lg shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Report Card - {studentName || 'Student'}
                  </h3>
                </div>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {loading || !institution || !classSection || !student ? (
                  <div className="flex items-center justify-center h-[600px]">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">
                        {loading ? 'Loading report card data...' : 'Preparing report card...'}
                      </p>
                      {!loading && (!institution || !classSection || !student) && (
                        <div className="mt-4 text-sm text-gray-500">
                          <p>Missing data:</p>
                          <p>Institution: {institution ? '✓' : '✗'}</p>
                          <p>Class Section: {classSection ? '✓' : '✗'}</p>
                          <p>Student: {student ? '✓' : '✗'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-[600px]">
                    <PrintTempReportCard 
                      sectionSubjects={sectionSubjects}
                      studentSubjectsGrade={studentSubjectsGrade}
                      institution={institution}
                      classSection={classSection}
                      student={student}
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <Button
                  type="button"
                  onClick={handleClose}
                  variant="outline"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
} 