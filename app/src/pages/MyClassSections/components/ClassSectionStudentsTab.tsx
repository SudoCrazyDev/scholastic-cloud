import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/badge';
import { Search, User, Plus, Edit, Trash2 } from 'lucide-react';
import type { Student, Subject } from '../../../types';

interface ClassSectionStudentsTabProps {
  students: (Student & { assignmentId: string })[];
  groupedStudents: Record<string, (Student & { assignmentId: string })[]>;
  subjects: Subject[];
  studentSearchTerm: string;
  setStudentSearchTerm: (term: string) => void;
  onCreateStudent: () => void;
  onAssignStudents: () => void;
  onEditStudent: (student: Student & { assignmentId: string }) => void;
  onRemoveStudent: (student: Student & { assignmentId: string }) => void;
  studentsLoading: boolean;
  studentsError: any;
  removeStudentMutationPending: boolean;
  getFullName: (student: Student) => string;
  navigate: (url: string) => void;
}

const ClassSectionStudentsTab: React.FC<ClassSectionStudentsTabProps> = ({
  students,
  groupedStudents,
  subjects,
  studentSearchTerm,
  setStudentSearchTerm,
  onCreateStudent,
  onAssignStudents,
  onEditStudent,
  onRemoveStudent,
  studentsLoading,
  studentsError,
  removeStudentMutationPending,
  getFullName,
  navigate,
}) => {
  return (
    <motion.div
      key="students"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      {/* Class Summary */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-600">
              {studentSearchTerm ? `${students.length}` : students.length}
            </div>
            <div className="text-sm text-gray-600">
              {studentSearchTerm ? 'Filtered/Total' : 'Total Students'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {groupedStudents.male?.length || 0}
            </div>
            <div className="text-sm text-gray-600">Male Students</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-pink-600">
              {groupedStudents.female?.length || 0}
            </div>
            <div className="text-sm text-gray-600">Female Students</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{subjects.length}</div>
            <div className="text-sm text-gray-600">Subjects</div>
          </div>
        </div>
      </div>

      {/* Add Students Button and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h3 className="text-lg font-medium text-gray-900">Class Students</h3>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search students..."
              value={studentSearchTerm}
              onChange={(e) => setStudentSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            />
          </div>
          <Button
            onClick={onCreateStudent}
            size="sm"
            variant="outline"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Student
          </Button>
          <Button
            onClick={onAssignStudents}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Assign Students
          </Button>
        </div>
      </div>

      {studentsLoading ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-indigo-600">Loading...</span>
        </div>
      ) : studentsError ? (
        <div className="text-red-600">Failed to load students</div>
      ) : students.length === 0 ? (
        <div className="text-center py-8">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
          <p className="text-gray-600 mb-4">
            {studentSearchTerm 
              ? `No students match "${studentSearchTerm}". Try a different search term.`
              : 'No students have been assigned to this class section yet.'
            }
          </p>
          {!studentSearchTerm && (
            <Button
              onClick={onAssignStudents}
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Students
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedStudents).map(([gender, studentsList]) => (
            <div key={gender} className="space-y-3">
              <div className="flex items-center space-x-2">
                {gender === 'male' ? (
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">M</span>
                  </div>
                ) : gender === 'female' ? (
                  <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">F</span>
                  </div>
                ) : (
                  <User className="w-5 h-5 text-gray-500" />
                )}
                <h3 className="text-lg font-semibold text-gray-900 capitalize">
                  {gender} Students ({studentsList.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {studentsList.map((student, index) => (
                  <motion.div
                    key={student.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/students/${student.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="flex-shrink-0">
                          {student.profile_picture ? (
                            <img
                              src={student.profile_picture}
                              alt={getFullName(student)}
                              className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 group-hover:border-indigo-300 transition-colors"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center border-2 border-gray-200 group-hover:border-indigo-300 transition-colors">
                              <User className="w-6 h-6 text-gray-600" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-600 transition-colors uppercase overflow-wrap max-w-[200px]">
                            {getFullName(student)}
                          </p>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge color={student.gender === 'male' ? 'blue' : 'pink'} className="text-xs px-1 py-0.5">
                              {student.gender === 'male' ? 'M' : 'F'}
                            </Badge>
                            <span className="text-xs text-gray-500">LRN: {student.lrn}</span>
                          </div>
                          {student.religion && (
                            <p className="text-xs text-gray-500 mt-1">
                              {student.religion}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-center space-x-1">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditStudent(student);
                          }}
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                          title="Edit student information"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/students/${student.id}`);
                          }}
                          variant="ghost"
                          size="sm"
                          className="text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
                          title="View student details"
                        >
                          <User className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveStudent(student);
                          }}
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                          disabled={removeStudentMutationPending}
                          title="Remove student from class"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default ClassSectionStudentsTab; 