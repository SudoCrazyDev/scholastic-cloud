import React, { useMemo } from 'react';
import { useCoreValueMarkings, useCreateCoreValueMarking, useUpdateCoreValueMarking } from '../../../hooks/useCoreValueMarkings';
import { useStudents } from '../../../hooks/useStudents';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Input } from '../../../components/input';
import { Select } from '../../../components/select';

interface Student {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  gender?: 'male' | 'female' | string;
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

const getFullName = (student: Student) => {
  const last = (student.last_name || '').trim();
  const first = (student.first_name || '').trim();
  const middle = (student.middle_name || '').trim();
  const middleInitial = middle ? `${middle.charAt(0)}.` : '';
  const ext = (student.ext_name || '').trim();

  const base = `${last}, ${first}${middleInitial ? `, ${middleInitial}` : ''}`;
  const withExt = ext ? `${base} ${ext}` : base;

  return withExt.toUpperCase();
};

const CORE_VALUE_CODE: Record<string, string> = {
  'Maka-Diyos': 'MD',
  'Maka-Tao': 'MT',
  'Makakalikasan': 'MK',
  'Makabansa': 'MB',
};

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

  const isSaving = createMarking.isPending || updateMarking.isPending;

  const CoreValuesTable: React.FC<{ title: string; students: Student[] }> = ({ title, students }) => {
    const flatColumns = CORE_VALUES.flatMap((cv) =>
      cv.behaviors.map((behavior, idx) => ({
        coreKey: cv.key,
        coreLabel: cv.label,
        behavior,
        idx,
        code: `${CORE_VALUE_CODE[cv.key] ?? 'CV'}${idx + 1}`,
      }))
    );

    return (
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h4 className="text-lg font-bold text-gray-900">{title}</h4>
            <p className="text-xs text-gray-600">
              {students.length} {students.length === 1 ? 'student' : 'students'}
            </p>
          </div>
          <div className="text-xs text-gray-600">
            <span className="font-semibold">Marking legend:</span> AO, SO, RO, NO
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-[980px] w-full border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 bg-gray-50 border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-900"
                >
                  Student
                </th>
                {CORE_VALUES.map((cv) => (
                  <th
                    key={cv.key}
                    colSpan={cv.behaviors.length}
                    className="border-b border-gray-200 px-3 py-3 text-center text-xs font-semibold text-indigo-700"
                  >
                    {cv.label}
                  </th>
                ))}
              </tr>
              <tr>
                {flatColumns.map((col) => (
                  <th
                    key={`${col.coreKey}-${col.idx}`}
                    title={col.behavior}
                    className="border-b border-gray-200 px-3 py-2 text-center text-[11px] font-semibold text-gray-700"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className="text-[10px] font-normal text-gray-500 max-w-[180px] text-center leading-snug"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {col.behavior}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {students.map((student, rowIdx) => {
                const fullName = getFullName(student);
                const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                const stickyBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                return (
                  <tr key={student.id} className={`${rowBg} hover:bg-indigo-50/50 transition-colors`}>
                    <td
                      className={`sticky left-0 z-10 ${stickyBg} border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap`}
                      title={fullName}
                    >
                      {fullName}
                    </td>
                    {flatColumns.map((col) => {
                      const marking = markingMap[student.id]?.[col.coreKey]?.[col.behavior];
                      return (
                        <td key={`${student.id}-${col.coreKey}-${col.idx}`} className="border-b border-gray-200 px-3 py-2">
                          <Select
                            options={[
                              { value: '', label: '—' },
                              ...MARKINGS.map((m) => ({ value: m, label: m })),
                            ]}
                            value={marking?.marking || ''}
                            onChange={(e) => handleMarkingChange(student.id, col.coreKey, col.behavior, e.target.value)}
                            disabled={isSaving}
                            className="text-xs min-w-[68px]"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
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
              {groupedStudents.male.length > 0 && <CoreValuesTable title={genderLabels.male} students={groupedStudents.male} />}
              {groupedStudents.female.length > 0 && (
                <CoreValuesTable title={genderLabels.female} students={groupedStudents.female} />
              )}
              {/* Keep 'Other' available if your dataset uses it */}
              {groupedStudents.other.length > 0 && <CoreValuesTable title={genderLabels.other} students={groupedStudents.other} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ClassSectionCoreValuesTab; 