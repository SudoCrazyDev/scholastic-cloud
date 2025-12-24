import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { useClassSectionDetail } from "@/hooks/useClassSectionDetail";
import { Badge } from "@/components";
import {
  ArrowLeft,
  Users,
  BookOpen,
  Loader2,
  Trophy,
  Calendar,
  User,
} from "lucide-react";

export function ClassSectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { classSection, students, subjects, loading, error } = useClassSectionDetail(id);
  const [activeTab, setActiveTab] = useState("students");
  const [studentSearchTerm, setStudentSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");

  const getFullName = (student) => {
    const parts = [
      student.last_name ? `${student.last_name},` : "",
      student.first_name || "",
      student.middle_name ? `${student.middle_name.charAt(0)}.` : "",
      student.ext_name || "",
    ];
    return parts.filter(Boolean).join(" ");
  };

  const filteredStudents = useMemo(() => {
    let filtered = students;

    // Apply gender filter
    if (genderFilter !== "all") {
      filtered = filtered.filter((student) => student.gender === genderFilter);
    }

    // Apply search filter
    if (studentSearchTerm) {
      const searchLower = studentSearchTerm.toLowerCase();
      filtered = filtered.filter((student) => {
        const fullName = getFullName(student).toLowerCase();
        const lrn = student.lrn?.toLowerCase() || "";
        return fullName.includes(searchLower) || lrn.includes(searchLower);
      });
    }

    return filtered;
  }, [students, studentSearchTerm, genderFilter]);

  const groupedStudents = useMemo(() => {
    const grouped = {};

    filteredStudents.forEach((student) => {
      const gender = student.gender || "other";
      if (!grouped[gender]) {
        grouped[gender] = [];
      }
      grouped[gender].push(student);
    });

    // Sort each group alphabetically
    Object.keys(grouped).forEach((gender) => {
      grouped[gender].sort((a, b) => {
        const nameA = `${a.last_name} ${a.first_name} ${a.middle_name || ""}`.toLowerCase();
        const nameB = `${b.last_name} ${b.first_name} ${b.middle_name || ""}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
    });

    return grouped;
  }, [filteredStudents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !classSection) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm font-medium text-red-800">Error Loading Class Section</div>
          <div className="text-sm text-red-600 mt-1">
            {error || "Failed to load class section details. Please try again."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Back Button */}
      <button
        onClick={() => navigate("/my-class-sections")}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 shadow-sm transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Back to Sections</span>
      </button>

      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-100 via-white to-purple-100 rounded-2xl shadow-xl border border-gray-200 p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2 tracking-tight">
              {classSection.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mb-2">
              <span className="inline-flex items-center text-sm text-gray-700 font-medium">
                <Calendar className="w-4 h-4 mr-1 text-indigo-500" />
                SY {classSection.academic_year}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge color="indigo" className="text-xs font-semibold px-3 py-1 rounded-full">
                Grade {classSection.grade_level}
              </Badge>
              {classSection.status === "active" && (
                <Badge color="green" className="text-xs font-semibold px-3 py-1 rounded-full">
                  Active
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 min-w-[120px]">
            <span className="text-xs text-gray-500">Class Section ID</span>
            <span className="font-mono text-sm text-gray-700 bg-gray-100 rounded px-2 py-1 select-all">
              {classSection.id.substring(0, 8)}...
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg">
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto space-x-2 sm:space-x-8 px-2 sm:px-6 py-1 sm:py-0">
            <button
              onClick={() => setActiveTab("students")}
              className={`py-3 px-2 sm:py-4 sm:px-1 border-b-2 font-medium text-sm transition-all duration-200 rounded-t-lg ${
                activeTab === "students"
                  ? "border-indigo-500 text-indigo-700 bg-indigo-50 shadow-sm"
                  : "border-transparent text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60"
              }`}
            >
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Students ({students.length})</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab("subjects")}
              className={`py-3 px-2 sm:py-4 sm:px-1 border-b-2 font-medium text-sm transition-all duration-200 rounded-t-lg ${
                activeTab === "subjects"
                  ? "border-indigo-500 text-indigo-700 bg-indigo-50 shadow-sm"
                  : "border-transparent text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60"
              }`}
            >
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4" />
                <span>Subjects ({subjects.length})</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-8 min-h-[300px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
            >
              {activeTab === "students" && (
                <div className="space-y-4">
                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Search students by name or LRN..."
                        value={studentSearchTerm}
                        onChange={(e) => setStudentSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <select
                      value={genderFilter}
                      onChange={(e) => setGenderFilter(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="all">All Genders</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>

                  {/* Students List */}
                  {Object.keys(groupedStudents).length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
                      <p className="text-gray-600">
                        {studentSearchTerm || genderFilter !== "all"
                          ? "No students match your search criteria."
                          : "No students are assigned to this class section yet."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(groupedStudents).map(([gender, genderStudents]) => (
                        <div key={gender}>
                          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">
                            {gender === "male" ? "Male" : gender === "female" ? "Female" : "Other"} (
                            {genderStudents.length})
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {genderStudents.map((student, index) => (
                              <motion.div
                                key={student.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors"
                              >
                                <div className="flex items-center space-x-3">
                                  <div className="flex-shrink-0">
                                    {student.profile_picture ? (
                                      <img
                                        src={student.profile_picture}
                                        alt={getFullName(student)}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                                      />
                                    ) : (
                                      <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center border-2 border-gray-200">
                                        <User className="w-6 h-6 text-gray-600" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate uppercase">
                                      {getFullName(student)}
                                    </p>
                                    <div className="flex items-center space-x-2 mt-1">
                                      <Badge
                                        color={student.gender === "male" ? "blue" : "pink"}
                                        className="text-xs px-1 py-0.5"
                                      >
                                        {student.gender === "male" ? "M" : "F"}
                                      </Badge>
                                      {student.lrn && (
                                        <span className="text-xs text-gray-500">LRN: {student.lrn}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "subjects" && (
                <div className="space-y-4">
                  {subjects.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No subjects found</h3>
                      <p className="text-gray-600">
                        No subjects are assigned to this class section yet.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {subjects.map((subject, index) => (
                        <motion.div
                          key={subject.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-indigo-300 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                                {subject.title}
                              </h3>
                              {subject.variant && (
                                <p className="text-xs text-gray-600 mb-2">{subject.variant}</p>
                              )}
                              <div className="flex items-center space-x-2 mt-2">
                                <Badge
                                  color={subject.subject_type === "parent" ? "blue" : "purple"}
                                  className="text-xs"
                                >
                                  {subject.subject_type}
                                </Badge>
                                {subject.start_time && subject.end_time && (
                                  <span className="text-xs text-gray-500">
                                    {subject.start_time} - {subject.end_time}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

