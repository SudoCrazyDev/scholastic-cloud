import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAssignedSubjects } from "@/hooks/useAssignedSubjects";
import { Input } from "@/components";
import { BookOpen, Clock, Users, ChevronRight, Loader2, Search } from "lucide-react";

export function AssignedSubjects() {
  const navigate = useNavigate();
  const { subjects, loading, error, searchValue, handleSearchChange } = useAssignedSubjects();

  // Group subjects by class section
  const groupedSubjects = subjects.reduce((groups, subject) => {
    const sectionKey = subject.class_section?.id || "no-section";
    const sectionTitle = subject.class_section?.title || "No Section";
    const gradeLevel = subject.class_section?.grade_level || "Unknown Grade";

    if (!groups[sectionKey]) {
      groups[sectionKey] = {
        sectionId: sectionKey,
        sectionTitle,
        gradeLevel,
        subjects: [],
      };
    }

    groups[sectionKey].subjects.push(subject);
    return groups;
  }, {});

  // Convert to array and sort by grade level and section title
  const sortedGroups = Object.values(groupedSubjects).sort((a, b) => {
    const gradeA = parseInt(a.gradeLevel) || 0;
    const gradeB = parseInt(b.gradeLevel) || 0;
    if (gradeA !== gradeB) return gradeA - gradeB;
    return a.sectionTitle.localeCompare(b.sectionTitle);
  });

  const handleSubjectClick = (subject) => {
    // Navigate to subject detail (to be implemented later)
    // navigate(`/assigned-subjects/${subject.id}`);
    console.log("Subject clicked:", subject);
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto space-y-6"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            {/* Title and Stats */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">My Assigned Subjects</h1>
                <p className="text-sm text-gray-600">
                  {subjects.length} subject{subjects.length !== 1 ? "s" : ""} assigned to you
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="w-full sm:w-80">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search subjects..."
                  value={searchValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="ml-3 text-gray-600">Loading assigned subjects...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Subjects</h3>
              <p className="text-gray-500">{error.message || String(error)}</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && subjects.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Assigned Subjects</h3>
              <p className="text-gray-500 mb-6">
                You don't have any subjects assigned to you yet.
              </p>
            </div>
          </div>
        )}

        {/* Subjects Grid */}
        {!loading && !error && subjects.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="space-y-8">
              {sortedGroups.map((group) => (
                <div key={group.sectionId} className="space-y-4">
                  {/* Section Header */}
                  <div className="border-b border-gray-200 pb-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {group.gradeLevel} - {group.sectionTitle}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {group.subjects.length} subject{group.subjects.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Subjects Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {group.subjects.map((subject) => (
                      <motion.div
                        key={subject.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="group relative"
                      >
                        <div
                          onClick={() => handleSubjectClick(subject)}
                          className="block border rounded-lg p-4 transition-all duration-200 hover:shadow-md border-gray-200 bg-white hover:border-gray-300 cursor-pointer"
                        >
                          {/* Subject Icon */}
                          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-3">
                            <BookOpen className="w-6 h-6 text-indigo-600" />
                          </div>

                          {/* Subject Info */}
                          <div className="space-y-2">
                            <div>
                              <h3
                                className="font-semibold text-gray-900 text-sm truncate"
                                title={subject.title}
                              >
                                {subject.title}
                              </h3>
                              {subject.variant && (
                                <p className="text-xs text-gray-500 font-medium">{subject.variant}</p>
                              )}
                            </div>

                            {/* Time */}
                            {subject.start_time && subject.end_time && (
                              <div className="flex items-center text-xs text-gray-600">
                                <Clock className="w-3 h-3 mr-1 flex-shrink-0" />
                                <span>
                                  {subject.start_time} - {subject.end_time}
                                </span>
                              </div>
                            )}

                            {/* Subject Type */}
                            {subject.subject_type && (
                              <div className="flex items-center">
                                <span
                                  className={`px-2 py-1 rounded text-xs ${
                                    subject.subject_type === "parent"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-purple-100 text-purple-800"
                                  }`}
                                >
                                  {subject.subject_type}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Arrow indicator */}
                          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

