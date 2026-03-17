import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, FileText, Loader2, Award } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { listCertificates, type CertificateRecord } from '@/services/certificateService'
import type { Student, Institution, Track, Strand } from '@/types'
import type { PublishOptions } from '@/pages/CertificateBuilder/components/PublishOptionsPanel'
import { designHasRankingVariables } from '@/pages/CertificateBuilder/certificateDesignUtils'
import { useConsolidatedGrades } from '@/hooks/useConsolidatedGrades'
import CertificatePreviewModal from './CertificatePreviewModal'

interface ClassSectionCertificatesTabProps {
  students: (Student & { assignmentId: string })[]
  gradeLevel: string
  institution?: Institution | null
  getFullName: (user: { first_name?: string; middle_name?: string; last_name?: string; ext_name?: string }) => string
  sectionId: string
  quarter: number
  track?: Track | null
  strand?: Strand | null
}

interface RankingEntry {
  student_id: string
  gpa: number
  rank: number
  remarks: string
}

/** Extract the numeric part from grade strings like "Grade 10", "10", "grade 7", etc. */
function normalizeGrade(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits || raw.trim().toLowerCase()
}

const getRemarks = (finalGrade: number | null) => {
  if (finalGrade === null) return 'N/A'
  if (finalGrade >= 98) return 'With Highest Honors'
  if (finalGrade >= 95) return 'With High Honor'
  if (finalGrade >= 90) return 'With Honors'
  return ''
}

const getBaseTitle = (title: string) => title.split(/[-(]/)[0].trim()

const calculateFinalGradeFromGrouped = (
  subjects: Array<{ grade: number | string | null; subject_type?: string }>
): number | null => {
  const parentAndRegular = subjects.filter((s) => s.subject_type !== 'child')
  const validGrades = parentAndRegular
    .map((s) => {
      const g = typeof s.grade === 'string' ? parseFloat(s.grade) : s.grade
      return g != null && !Number.isNaN(g) ? g : null
    })
    .filter((g): g is number => g !== null)
  if (validGrades.length === 0) return null
  return Math.round(validGrades.reduce((a, b) => a + b, 0) / validGrades.length)
}

function isCertificateVisibleForGrade(cert: CertificateRecord, gradeLevel: string): boolean {
  const design = cert.design_json
  if (!design) return true
  const po: PublishOptions | undefined = design.publish_options
  if (!po) return true
  if (!po.scopeGradeLevelsOnly) return true
  if (!Array.isArray(po.gradeLevels) || po.gradeLevels.length === 0) return true
  const sectionGrade = normalizeGrade(gradeLevel)
  return po.gradeLevels.some((g) => normalizeGrade(g) === sectionGrade)
}

export default function ClassSectionCertificatesTab({
  students,
  gradeLevel,
  institution,
  getFullName,
  sectionId,
  quarter,
  track = null,
  strand = null,
}: ClassSectionCertificatesTabProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [previewState, setPreviewState] = useState<{
    certificate: CertificateRecord
    student: Student
  } | null>(null)

  const { data: certsResponse, isLoading: certsLoading } = useQuery({
    queryKey: ['certificates', 'all-for-section'],
    queryFn: () => listCertificates({ per_page: 200 }),
    staleTime: 5 * 60 * 1000,
  })

  const certificates = useMemo(() => {
    const all: CertificateRecord[] = certsResponse?.data || []
    return all.filter((c) => isCertificateVisibleForGrade(c, gradeLevel))
  }, [certsResponse?.data, gradeLevel])

  const hasAnyRankingCert = useMemo(
    () => certificates.some((c) => designHasRankingVariables(c.design_json)),
    [certificates]
  )

  const { data: gradesData } = useConsolidatedGrades(
    hasAnyRankingCert ? sectionId : '',
    hasAnyRankingCert ? quarter : ''
  )

  const rankingMap = useMemo<Map<string, RankingEntry>>(() => {
    const map = new Map<string, RankingEntry>()
    if (!gradesData?.students) return map

    const entries = gradesData.students.map((student: any) => {
      const grouped: Record<string, { grades: (number | string | null)[]; subjects: any[] }> = {}
      const individualSubjects: any[] = []
      student.subjects.forEach((subject: any) => {
        if (subject.subject_variant && String(subject.subject_variant).trim() !== '') {
          const base = getBaseTitle(subject.subject_title)
          if (!grouped[base]) grouped[base] = { grades: [], subjects: [] }
          grouped[base].grades.push(subject.grade)
          grouped[base].subjects.push(subject)
        } else {
          individualSubjects.push(subject)
        }
      })
      const groupedList = Object.keys(grouped).map((base) => {
        const grades = grouped[base].grades
          .map((g) => (g == null ? null : typeof g === 'string' ? parseFloat(g) : g))
          .filter((g) => g != null && !Number.isNaN(g)) as number[]
        const avg = grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null
        const subjects = grouped[base].subjects
        const isChildGroup = subjects.every((s: any) => s.subject_type === 'child')
        return {
          subject_title: base,
          grade: avg,
          subject_type: isChildGroup ? 'child' : (subjects[0]?.subject_type || 'regular'),
        }
      })
      const individualList = individualSubjects.map((s: any) => ({
        subject_title: s.subject_title,
        grade: s.grade,
        subject_type: s.subject_type,
      }))
      const allSubjects = [...groupedList, ...individualList]
      const gpa = calculateFinalGradeFromGrouped(allSubjects)
      const remarks = getRemarks(gpa)
      return { student_id: student.student_id as string, gpa: gpa ?? 0, rank: 0, remarks }
    })

    const honorEntries = entries
      .filter((e) => e.remarks && e.remarks !== '' && e.remarks !== 'N/A')
      .sort((a, b) => b.gpa - a.gpa)
    honorEntries.forEach((e, i) => { e.rank = i + 1 })
    honorEntries.forEach((e) => map.set(e.student_id, e))
    return map
  }, [gradesData])

  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students
    const q = searchTerm.toLowerCase()
    return students.filter((s) => {
      const full = getFullName(s).toLowerCase()
      const lrn = s.lrn?.toLowerCase() || ''
      return full.includes(q) || lrn.includes(q)
    })
  }, [students, searchTerm, getFullName])

  const getCertificatesForStudent = (student: Student) => {
    return certificates.filter((cert) => {
      if (designHasRankingVariables(cert.design_json)) {
        return rankingMap.has(student.id)
      }
      return true
    })
  }

  const enrichStudentForCert = (student: Student, cert: CertificateRecord): Student => {
    if (!designHasRankingVariables(cert.design_json)) return student
    const entry = rankingMap.get(student.id)
    if (!entry) return student
    return {
      ...student,
      ranking: entry.remarks,
      student_rank: String(entry.rank),
      student_gpa: String(entry.gpa),
    } as Student
  }

  const grouped = useMemo(() => {
    const map: Record<string, (Student & { assignmentId: string })[]> = {}
    filteredStudents.forEach((s) => {
      const g = (s.gender || 'other').toLowerCase()
      if (!map[g]) map[g] = []
      map[g].push(s)
    })
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => {
        const na = `${a.last_name} ${a.first_name} ${a.middle_name || ''}`.toLowerCase()
        const nb = `${b.last_name} ${b.first_name} ${b.middle_name || ''}`.toLowerCase()
        return na.localeCompare(nb)
      })
    )
    return map
  }, [filteredStudents])

  const genderOrder = ['male', 'female', 'other']
  const sortedGenders = Object.keys(grouped).sort(
    (a, b) => (genderOrder.indexOf(a) === -1 ? 99 : genderOrder.indexOf(a)) - (genderOrder.indexOf(b) === -1 ? 99 : genderOrder.indexOf(b))
  )

  const genderLabel = (g: string) => {
    if (g === 'male') return 'Male'
    if (g === 'female') return 'Female'
    return g.charAt(0).toUpperCase() + g.slice(1)
  }

  if (certsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
        <span className="ml-3 text-sm text-gray-500">Loading certificates...</span>
      </div>
    )
  }

  if (certificates.length === 0) {
    return (
      <div className="text-center py-16">
        <Award className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <h3 className="text-base font-medium text-gray-500 mb-1">No certificates available</h3>
        <p className="text-sm text-gray-400">
          No certificates are published for {/^\d+$/.test(gradeLevel) ? `Grade ${gradeLevel}` : gradeLevel}. Create certificates in the Certificate Builder.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or LRN..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
        </div>
        <span className="text-xs text-gray-500">
          {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} &middot; {certificates.length} certificate{certificates.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table per gender group */}
      {sortedGenders.map((gender) => {
        const groupStudents = grouped[gender]
        if (!groupStudents || groupStudents.length === 0) return null

        return (
          <motion.div
            key={gender}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Gender header */}
            <div className="flex items-center gap-2 mb-2 mt-4 first:mt-0">
              <div className={`w-2 h-2 rounded-full ${gender === 'male' ? 'bg-blue-500' : gender === 'female' ? 'bg-pink-500' : 'bg-gray-400'}`} />
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                {genderLabel(gender)} ({groupStudents.length})
              </h4>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3 w-1/3">
                      Student Name
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">
                      Certificates
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groupStudents.map((student, idx) => {
                    const studentCerts = getCertificatesForStudent(student)
                    if (studentCerts.length === 0) return null
                    return (
                      <tr
                        key={student.id}
                        className={`hover:bg-gray-50/80 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900">{getFullName(student)}</span>
                            {student.lrn && (
                              <span className="text-xs text-gray-400 mt-0.5">LRN: {student.lrn}</span>
                            )}
                            {rankingMap.has(student.id) && (
                              <span className="text-xs text-amber-600 mt-0.5 font-medium">
                                {rankingMap.get(student.id)!.remarks} (Rank #{rankingMap.get(student.id)!.rank})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {studentCerts.map((cert) => (
                              <button
                                key={cert.id}
                                onClick={() => setPreviewState({ certificate: cert, student: enrichStudentForCert(student, cert) })}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all
                                  bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 hover:shadow-sm"
                                title={`View ${cert.title} for ${getFullName(student)}`}
                              >
                                <FileText className="w-3.5 h-3.5" />
                                {cert.title}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )
      })}

      {filteredStudents.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">No students match your search.</p>
        </div>
      )}

      {/* Preview / Download Modal */}
      {previewState && (
        <CertificatePreviewModal
          isOpen={!!previewState}
          onClose={() => setPreviewState(null)}
          certificate={previewState.certificate}
          student={previewState.student}
          institution={institution}
          sectionData={{ track, strand }}
        />
      )}
    </div>
  )
}
