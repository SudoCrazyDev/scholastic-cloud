import React, { useMemo } from 'react';
import { useCoreValueMarkings, useCreateCoreValueMarking, useUpdateCoreValueMarking } from '../../../hooks/useCoreValueMarkings';
import { useStudents } from '../../../hooks/useStudents';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '../../../components/input';
import { Select } from '../../../components/select';

interface Student {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
}

interface ClassSectionCoreValuesTabProps {
  classSectionId: string;
  classSectionData: any;
}

const CORE_VALUES = [
  {
    key: 'Maka-Diyos',
    label: 'Maka-Diyos',
    behaviors: [
      "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others.",
      'Shows adherence to ethical principles by upholding truth',
    ],
  },
  {
    key: 'Maka-Tao',
    label: 'Maka-Tao',
    behaviors: [
      'Is sensitive to individual, social, and cultural differences',
      'Demonstrates contributions toward solidarity',
    ],
  },
  {
    key: 'Makakalikasan',
    label: 'Makakalikasan',
    behaviors: [
      'Cares for the environment and utilizes resources wisely, judiciously, and economically.',
    ],
  },
  {
    key: 'Makabansa',
    label: 'Makabansa',
    behaviors: [
      'Demonstrates pride in being a Filipino; exercises the rights and responsibilities of a Filipino citizen',
      'Demonstrates appropriate behavior in carrying out activities in the school, community, and country',
    ],
  },
];

const QUARTER_LABELS = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'];
const QUARTERS = [1, 2, 3, 4];
const MARKINGS = ['AO', 'SO', 'RO', 'NO'];

const getFullName = (student: Student) =>
  [student.last_name, student.first_name, student.middle_name, student.ext_name].filter(Boolean).join(' ');

const ClassSectionCoreValuesTab: React.FC<ClassSectionCoreValuesTabProps> = ({ classSectionId, classSectionData }) => {
  const academicYear = classSectionData?.academic_year || '';
  const [selectedQuarter, setSelectedQuarter] = React.useState<string>('1');
  const [studentFilter, setStudentFilter] = React.useState('');

  // Fetch students by class section
  const { students, loading: studentsLoading, error: studentsError } = useStudents({ class_section_id: classSectionId });

  // Fetch core value markings for all students in this section and quarter
  const studentIds = useMemo(() => students.map(s => s.id), [students]);
  const { data: markings, isLoading: markingsLoading, error: markingsError } = useCoreValueMarkings({
    student_ids: studentIds.join(','),
    quarter: selectedQuarter, // Ensure quarter is a string
    academic_year: academicYear,
  }, { enabled: studentIds.length > 0 && !!academicYear });

  // Group markings by studentId, core_value, and behavior_statement
  const markingMap = useMemo(() => {
    const map: Record<string, Record<string, Record<string, any>>> = {};
    (Array.isArray(markings) ? markings : []).forEach((m: any) => {
      if (!map[m.student_id]) map[m.student_id] = {};
      if (!map[m.student_id][m.core_value]) map[m.student_id][m.core_value] = {};
      map[m.student_id][m.core_value][m.behavior_statement] = m;
    });
    return map;
  }, [markings]);

  // Group students by gender, with filtering
  const groupedStudents = useMemo(() => {
    const groups: Record<string, Student[]> = { male: [], female: [], other: [] };
    const filter = studentFilter.trim().toLowerCase();
    students.forEach((student) => {
      const fullName = getFullName(student).toLowerCase();
      if (!filter || fullName.includes(filter)) {
        if (student.gender === 'male') groups.male.push(student);
        else if (student.gender === 'female') groups.female.push(student);
        else groups.other.push(student);
      }
    });
    return groups;
  }, [students, studentFilter]);

  const genderLabels: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
  };

  // Mutations for create/update
  const createMarking = useCreateCoreValueMarking();
  const updateMarking = useUpdateCoreValueMarking();

  // Handle marking change
  const handleMarkingChange = async (studentId: string, coreValue: string, behavior: string, value: string) => {
    const existing = markingMap[studentId]?.[coreValue]?.[behavior];
    const payload = {
      student_id: studentId,
      core_value: coreValue,
      behavior_statement: behavior,
      marking: value,
      quarter: selectedQuarter, // Ensure quarter is a string
      academic_year: academicYear,
    };
    try {
      if (existing) {
        await updateMarking.mutateAsync({ id: existing.id, data: payload });
      } else {
        await createMarking.mutateAsync(payload);
      }
    } catch (error: any) {
      toast.error('Failed to save marking.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Core Values</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-700">Quarter:</span>
            <Select
              options={QUARTERS.map(q => ({ value: q.toString(), label: QUARTER_LABELS[q-1] }))}
              value={selectedQuarter}
              onChange={e => setSelectedQuarter(e.target.value)}
              className="min-w-[140px]"
            />
          </div>
        </div>
        {studentsLoading || markingsLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : studentsError ? (
          <div className="text-red-500 text-center py-8">Failed to load students.</div>
        ) : markingsError ? (
          <div className="text-red-500 text-center py-8">Failed to load core value markings.</div>
        ) : (
          <>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="w-full sm:w-80">
                <Input
                  type="text"
                  size="md"
                  placeholder="Search student by name..."
                  value={studentFilter}
                  onChange={e => setStudentFilter(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-10">
              {(['male', 'female', 'other'] as const).map(gender =>
                groupedStudents[gender].length > 0 && (
                  <motion.div
                    key={gender}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.4, type: 'spring', bounce: 0.2 }}
                  >
                    <h4 className="text-lg font-bold text-gray-700 mb-4 pl-1">{genderLabels[gender]}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <AnimatePresence>
                        {groupedStudents[gender].map((student) => (
                          <motion.div
                            key={student.id}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.35, type: 'spring', bounce: 0.25 }}
                            layout
                            className="bg-white rounded-xl border border-gray-200 shadow-md p-5 flex flex-col gap-4 hover:shadow-lg transition-shadow"
                          >
                            <div className="font-bold text-lg text-indigo-700 mb-2 truncate" title={getFullName(student)}>{getFullName(student)}</div>
                            <div className="flex flex-col gap-4">
                              {CORE_VALUES.map((cv) => (
                                <div key={cv.key} className="">
                                  <div className="font-semibold text-gray-800 mb-1">{cv.label}</div>
                                  <div className="flex flex-col gap-2">
                                    {cv.behaviors.length > 0 ? cv.behaviors.map((b, i) => {
                                      const marking = markingMap[student.id]?.[cv.key]?.[b];
                                      const isSaving = createMarking.isPending || updateMarking.isPending;
                                      return (
                                        <div key={cv.key + '-' + i} className="flex items-center gap-2">
                                          <span
                                            className="truncate max-w-[180px] text-xs text-gray-600 font-medium cursor-help"
                                            title={b}
                                            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                          >
                                            {b}
                                          </span>
                                          <Select
                                            options={[
                                              { value: '', label: '—' },
                                              ...MARKINGS.map(m => ({ value: m, label: m }))
                                            ]}
                                            value={marking?.marking || ''}
                                            onChange={e => handleMarkingChange(student.id, cv.key, b, e.target.value)}
                                            disabled={isSaving}
                                            className="text-xs min-w-[60px] max-w-[80px]"
                                          />
                                        </div>
                                      );
                                    }) : (
                                      <div className="text-gray-400 text-xs">—</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ClassSectionCoreValuesTab; 