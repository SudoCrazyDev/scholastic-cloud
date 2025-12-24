import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import {
  getAllUsers,
  getCurrentUser,
  getUserCount,
  getDatabasePath,
  checkTableExists,
  getAllTables,
  clearUserCache,
  getAllInstitutions,
  getCurrentInstitution,
  clearInstitutionCache,
  getAllClassSections,
  getUserClassSections,
  clearClassSectionCache,
  getAllSubjects,
  getUserSubjects,
  clearSubjectCache,
  getAllStudents,
  clearStudentCache,
  getAllStudentSections,
  clearStudentSectionCache,
  getAllSubjectEcrs,
  clearSubjectEcrCache,
  getAllSubjectEcrItems,
  clearSubjectEcrItemCache,
  getAllStudentEcrItemScores,
  clearStudentEcrItemScoreCache,
  getAllStudentRunningGrades,
  clearStudentRunningGradeCache,
} from "@/lib/db";

/**
 * Debug modal to check SQLite database contents
 * Only available in development mode
 */
export function DebugDatabase({ isOpen, onClose }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userCount, setUserCount] = useState(0);
  const [institutions, setInstitutions] = useState([]);
  const [currentInstitution, setCurrentInstitution] = useState(null);
  const [institutionCount, setInstitutionCount] = useState(0);
  const [classSections, setClassSections] = useState([]);
  const [classSectionCount, setClassSectionCount] = useState(0);
  const [subjects, setSubjects] = useState([]);
  const [subjectCount, setSubjectCount] = useState(0);
  const [students, setStudents] = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [studentSections, setStudentSections] = useState([]);
  const [studentSectionCount, setStudentSectionCount] = useState(0);
  const [subjectEcrs, setSubjectEcrs] = useState([]);
  const [subjectEcrCount, setSubjectEcrCount] = useState(0);
  const [subjectEcrItems, setSubjectEcrItems] = useState([]);
  const [subjectEcrItemCount, setSubjectEcrItemCount] = useState(0);
  const [studentEcrItemScores, setStudentEcrItemScores] = useState([]);
  const [studentEcrItemScoreCount, setStudentEcrItemScoreCount] = useState(0);
  const [studentRunningGrades, setStudentRunningGrades] = useState([]);
  const [studentRunningGradeCount, setStudentRunningGradeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dbPath, setDbPath] = useState("");
  const [tableExists, setTableExists] = useState(false);
  const [institutionTableExists, setInstitutionTableExists] = useState(false);
  const [classSectionTableExists, setClassSectionTableExists] = useState(false);
  const [subjectTableExists, setSubjectTableExists] = useState(false);
  const [studentTableExists, setStudentTableExists] = useState(false);
  const [studentSectionTableExists, setStudentSectionTableExists] = useState(false);
  const [subjectEcrTableExists, setSubjectEcrTableExists] = useState(false);
  const [subjectEcrItemTableExists, setSubjectEcrItemTableExists] = useState(false);
  const [studentEcrItemScoreTableExists, setStudentEcrItemScoreTableExists] = useState(false);
  const [studentRunningGradeTableExists, setStudentRunningGradeTableExists] = useState(false);
  const [allTables, setAllTables] = useState([]);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
      getDbInfo();
    }
  }, [isOpen]);

  async function getDbInfo() {
    try {
      setDbPath(getDatabasePath());
      const [
        usersExists,
        institutionsExists,
        classSectionsExists,
        subjectsExists,
        studentsExists,
        studentSectionsExists,
        subjectEcrsExists,
        subjectEcrItemsExists,
        studentEcrItemScoresExists,
        studentRunningGradesExists,
      ] = await Promise.all([
        checkTableExists("users"),
        checkTableExists("institutions"),
        checkTableExists("class_sections"),
        checkTableExists("subjects"),
        checkTableExists("students"),
        checkTableExists("student_sections"),
        checkTableExists("subjects_ecr"),
        checkTableExists("subject_ecr_items"),
        checkTableExists("student_ecr_item_scores"),
        checkTableExists("student_running_grades"),
      ]);
      setTableExists(usersExists);
      setInstitutionTableExists(institutionsExists);
      setClassSectionTableExists(classSectionsExists);
      setSubjectTableExists(subjectsExists);
      setStudentTableExists(studentsExists);
      setStudentSectionTableExists(studentSectionsExists);
      setSubjectEcrTableExists(subjectEcrsExists);
      setSubjectEcrItemTableExists(subjectEcrItemsExists);
      setStudentEcrItemScoreTableExists(studentEcrItemScoresExists);
      setStudentRunningGradeTableExists(studentRunningGradesExists);
      const tables = await getAllTables();
      setAllTables(tables);
    } catch (err) {
      // Silent fail in production
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const currentUser = await getCurrentUser();
      const [
        allUsers,
        count,
        allInstitutions,
        currentInst,
        allClassSections,
        allSubjects,
        allStudents,
        allStudentSections,
        allSubjectEcrs,
        allSubjectEcrItems,
        allStudentEcrItemScores,
        allStudentRunningGrades,
      ] = await Promise.all([
        getAllUsers(),
        getUserCount(),
        getAllInstitutions(),
        getCurrentInstitution(),
        currentUser ? getUserClassSections(currentUser.id) : Promise.resolve([]),
        currentUser ? getUserSubjects(currentUser.id) : Promise.resolve([]),
        getAllStudents(),
        getAllStudentSections(),
        getAllSubjectEcrs(),
        getAllSubjectEcrItems(),
        getAllStudentEcrItemScores(),
        getAllStudentRunningGrades(),
      ]);
      setUsers(allUsers);
      setCurrentUser(currentUser);
      setUserCount(count);
      setInstitutions(allInstitutions);
      setCurrentInstitution(currentInst);
      setInstitutionCount(allInstitutions.length);
      setClassSections(allClassSections);
      setClassSectionCount(allClassSections.length);
      setSubjects(allSubjects);
      setSubjectCount(allSubjects.length);
      setStudents(allStudents);
      setStudentCount(allStudents.length);
      setStudentSections(allStudentSections);
      setStudentSectionCount(allStudentSections.length);
      setSubjectEcrs(allSubjectEcrs);
      setSubjectEcrCount(allSubjectEcrs.length);
      setSubjectEcrItems(allSubjectEcrItems);
      setSubjectEcrItemCount(allSubjectEcrItems.length);
      setStudentEcrItemScores(allStudentEcrItemScores);
      setStudentEcrItemScoreCount(allStudentEcrItemScores.length);
      setStudentRunningGrades(allStudentRunningGrades);
      setStudentRunningGradeCount(allStudentRunningGrades.length);
    } catch (error) {
      setError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleClearCache() {
    if (!window.confirm("Clear all data from the local database?")) return;
    try {
      setIsClearing(true);
      // Clear all tables
      await Promise.all([
        clearUserCache(),
        clearInstitutionCache(),
        clearClassSectionCache(),
        clearSubjectCache(),
        clearStudentCache(),
        clearStudentSectionCache(),
        clearSubjectEcrCache(),
        clearSubjectEcrItemCache(),
        clearStudentEcrItemScoreCache(),
        clearStudentRunningGradeCache(),
      ]);
      await loadData();
    } catch (error) {
      setError(error.message || String(error));
    } finally {
      setIsClearing(false);
    }
  }

  if (!isOpen) return null;

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
            onClick={onClose}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-900">SQLite Database Debug</h1>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClearCache}
                    disabled={loading || isClearing}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isClearing ? "Clearing..." : "Clear Data"}
                  </button>
                  <button
                    onClick={loadData}
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? "Loading..." : "Refresh"}
                  </button>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-lg hover:bg-gray-100"
                    aria-label="Close"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Content - Scrollable */}
              <div className="overflow-y-auto p-6 space-y-6 flex-1">

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-sm font-medium text-red-800">Error:</div>
              <div className="text-sm text-red-600 mt-1">{error}</div>
            </div>
          )}

          {/* Database Info */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="text-sm font-medium text-gray-700">Database Information</div>
            <div className="text-xs text-gray-600">
              <div><strong>Path:</strong> {dbPath || "Loading..."}</div>
              <div><strong>Users:</strong> {tableExists ? "✓" : "✗"}</div>
              <div><strong>Institutions:</strong> {institutionTableExists ? "✓" : "✗"}</div>
              <div><strong>Class Sections:</strong> {classSectionTableExists ? "✓" : "✗"}</div>
              <div><strong>Subjects:</strong> {subjectTableExists ? "✓" : "✗"}</div>
              <div><strong>Students:</strong> {studentTableExists ? "✓" : "✗"}</div>
              <div><strong>Student Sections:</strong> {studentSectionTableExists ? "✓" : "✗"}</div>
              <div><strong>Subjects ECR:</strong> {subjectEcrTableExists ? "✓" : "✗"}</div>
              <div><strong>Subject ECR Items:</strong> {subjectEcrItemTableExists ? "✓" : "✗"}</div>
              <div><strong>Student ECR Item Scores:</strong> {studentEcrItemScoreTableExists ? "✓" : "✗"}</div>
              <div><strong>Student Running Grades:</strong> {studentRunningGradeTableExists ? "✓" : "✗"}</div>
              <div><strong>All Tables:</strong> {allTables.length > 0 ? allTables.join(", ") : "None"}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-xs text-blue-600 font-medium">Users</div>
              <div className="text-xl font-bold text-blue-900">{userCount}</div>
            </div>
            <div className="bg-orange-50 p-3 rounded-lg">
              <div className="text-xs text-orange-600 font-medium">Institutions</div>
              <div className="text-xl font-bold text-orange-900">{institutionCount}</div>
            </div>
            <div className="bg-teal-50 p-3 rounded-lg">
              <div className="text-xs text-teal-600 font-medium">Class Sections</div>
              <div className="text-xl font-bold text-teal-900">{classSectionCount}</div>
            </div>
            <div className="bg-pink-50 p-3 rounded-lg">
              <div className="text-xs text-pink-600 font-medium">Subjects</div>
              <div className="text-xl font-bold text-pink-900">{subjectCount}</div>
            </div>
            <div className="bg-indigo-50 p-3 rounded-lg">
              <div className="text-xs text-indigo-600 font-medium">Students</div>
              <div className="text-xl font-bold text-indigo-900">{studentCount}</div>
            </div>
            <div className="bg-cyan-50 p-3 rounded-lg">
              <div className="text-xs text-cyan-600 font-medium">Student Sections</div>
              <div className="text-xl font-bold text-cyan-900">{studentSectionCount}</div>
            </div>
            <div className="bg-yellow-50 p-3 rounded-lg">
              <div className="text-xs text-yellow-600 font-medium">Subject ECRs</div>
              <div className="text-xl font-bold text-yellow-900">{subjectEcrCount}</div>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg">
              <div className="text-xs text-amber-600 font-medium">ECR Items</div>
              <div className="text-xl font-bold text-amber-900">{subjectEcrItemCount}</div>
            </div>
            <div className="bg-emerald-50 p-3 rounded-lg">
              <div className="text-xs text-emerald-600 font-medium">ECR Scores</div>
              <div className="text-xl font-bold text-emerald-900">{studentEcrItemScoreCount}</div>
            </div>
            <div className="bg-violet-50 p-3 rounded-lg">
              <div className="text-xs text-violet-600 font-medium">Running Grades</div>
              <div className="text-xl font-bold text-violet-900">{studentRunningGradeCount}</div>
            </div>
          </div>

          {/* Current User Details */}
          {currentUser && (
            <div className="border-t pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Logged-in User</h2>
              <div className="bg-gray-50 p-4 rounded-lg">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(currentUser, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Current Institution Details */}
          {currentInstitution && (
            <div className="border-t pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Institution</h2>
              <div className="bg-gray-50 p-4 rounded-lg">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(currentInstitution, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* All Users Table */}
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">All Users ({users.length})</h2>
            {users.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No users found in database</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Has Token
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-4 py-3 text-xs text-gray-900 font-mono">
                          {user.id.substring(0, 8)}...
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {user.first_name} {user.last_name || ""}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                        <td className="px-4 py-3 text-sm">
                          {user.token ? (
                            <span className="text-green-600">✓ Yes</span>
                          ) : (
                            <span className="text-gray-400">✗ No</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {user.updated_at || "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* All Institutions Table */}
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">All Institutions ({institutions.length})</h2>
            {institutions.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No institutions found in database</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Title
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Abbr
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Region
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Division
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {institutions.map((institution) => (
                      <tr key={institution.id}>
                        <td className="px-4 py-3 text-xs text-gray-900 font-mono">
                          {institution.id.substring(0, 8)}...
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {institution.title || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {institution.abbr || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {institution.region || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {institution.division || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {institution.updated_at || "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* All Class Sections Table */}
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">User Class Sections ({classSections.length})</h2>
            {classSections.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No class sections found in database</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Title
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Grade Level
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Academic Year
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {classSections.map((section) => (
                      <tr key={section.id}>
                        <td className="px-4 py-3 text-xs text-gray-900 font-mono">
                          {section.id.substring(0, 8)}...
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {section.title || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {section.grade_level || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {section.academic_year || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            section.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {section.status || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {section.updated_at || "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* All Subjects Table (Assigned Loads) */}
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Assigned Loads ({subjects.length})</h2>
            {subjects.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No subjects found in database</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Title
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Variant
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Limited
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {subjects.map((subject) => (
                      <tr key={subject.id}>
                        <td className="px-4 py-3 text-xs text-gray-900 font-mono">
                          {subject.id.substring(0, 8)}...
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {subject.title || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            subject.subject_type === 'parent' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {subject.subject_type || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {subject.variant || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {subject.start_time && subject.end_time 
                            ? `${subject.start_time} - ${subject.end_time}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {subject.is_limited_student ? (
                            <span className="text-green-600">✓ Yes</span>
                          ) : (
                            <span className="text-gray-400">✗ No</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {subject.updated_at || "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Students Table */}
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Students ({students.length})</h2>
            {students.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No students found in database</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">LRN</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gender</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {students.slice(0, 10).map((student) => (
                      <tr key={student.id}>
                        <td className="px-4 py-3 text-xs text-gray-900 font-mono">{student.id.substring(0, 8)}...</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {student.first_name} {student.last_name || ""}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{student.lrn || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{student.gender || "—"}</td>
                        <td className="px-4 py-3 text-sm">
                          {student.is_active ? (
                            <span className="text-green-600">✓ Yes</span>
                          ) : (
                            <span className="text-gray-400">✗ No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {students.length > 10 && (
                  <div className="text-xs text-gray-500 text-center py-2">
                    Showing 10 of {students.length} students
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Raw JSON */}
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Raw JSON Data</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Users ({users.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(users, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Institutions ({institutions.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(institutions, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Class Sections ({classSections.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(classSections, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Subjects ({subjects.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(subjects, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Students ({students.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(students, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Student Sections ({studentSections.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(studentSections, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Subject ECRs ({subjectEcrs.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(subjectEcrs, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Subject ECR Items ({subjectEcrItems.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(subjectEcrItems, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Student ECR Item Scores ({studentEcrItemScores.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(studentEcrItemScores, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Student Running Grades ({studentRunningGrades.length})</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(studentRunningGrades, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

