import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  GraduationCap,
  Users as UsersIcon,
  Calendar,
  X,
  User,
} from "lucide-react";
import { StudentScoreInput } from "./StudentScoreInput";

export function GradeItemCard({ item, students, scores, onScoresUpdate }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getCategoryIcon = (category) => {
    switch (category) {
      case "Written Works":
        return <FileText className="w-4 h-4 text-blue-600" />;
      case "Performance Tasks":
        return <GraduationCap className="w-4 h-4 text-green-600" />;
      case "Quarterly Assessment":
        return <UsersIcon className="w-4 h-4 text-purple-600" />;
      default:
        return <FileText className="w-4 h-4 text-gray-600" />;
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case "Written Works":
        return "bg-blue-50 border-blue-200";
      case "Performance Tasks":
        return "bg-green-50 border-green-200";
      case "Quarterly Assessment":
        return "bg-purple-50 border-purple-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  // Group students by gender and sort alphabetically
  const groupedStudents = students.reduce((groups, student) => {
    const gender = student.gender || "other";
    if (!groups[gender]) {
      groups[gender] = [];
    }
    groups[gender].push(student);
    return groups;
  }, {});

  // Sort students by last name within each group
  Object.keys(groupedStudents).forEach((gender) => {
    groupedStudents[gender].sort((a, b) => {
      const lastNameA = a.last_name?.toLowerCase() || "";
      const lastNameB = b.last_name?.toLowerCase() || "";
      return lastNameA.localeCompare(lastNameB);
    });
  });

  const getGenderIcon = (gender) => {
    switch (gender) {
      case "male":
        return <User className="w-4 h-4 text-blue-600" />;
      case "female":
        return <UsersIcon className="w-4 h-4 text-pink-600" />;
      default:
        return <UsersIcon className="w-4 h-4 text-gray-600" />;
    }
  };

  const getGenderText = (gender) => {
    switch (gender) {
      case "male":
        return "Male Students";
      case "female":
        return "Female Students";
      default:
        return "Other Students";
    }
  };

  const getStudentScore = (studentId) => {
    const score = scores.find(
      (s) => s.student_id === studentId && s.subject_ecr_item_id === item.id
    );
    return score;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <>
      <div
        className={`rounded-lg border ${getCategoryColor(
          item.subject_ecr?.title || item.category || "Written Works"
        )}`}
      >
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/50 transition-colors"
          onClick={() => setIsModalOpen(true)}
        >
          <div className="flex items-center space-x-3">
            {getCategoryIcon(item.subject_ecr?.title || item.category)}
            <div>
              <h3 className="text-sm font-medium text-gray-900">
                {item.title}
              </h3>
              {item.description && (
                <p className="text-xs text-gray-500">{item.description}</p>
              )}
              <div className="flex items-center space-x-2 mt-1">
                {item.date && (
                  <>
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-500">
                      {formatDate(item.date)}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                  </>
                )}
                <span className="text-xs text-gray-500">
                  {item.subject_ecr?.title || item.category || "N/A"}
                </span>
                {item.quarter && (
                  <>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">
                      Quarter {item.quarter}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm font-medium text-gray-900">
              {students.length} students
            </div>
            <div className="text-xs text-gray-500">Max: {item.score} pts</div>
          </div>
        </div>
      </div>

      {/* Full Screen Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-start sm:items-center justify-center p-0 sm:p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity"
                onClick={() => setIsModalOpen(false)}
              />

              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="relative transform overflow-hidden bg-white shadow-xl transition-all w-full h-full sm:h-auto sm:max-h-[90vh] sm:rounded-lg sm:w-full sm:max-w-4xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {item.title}
                    </h2>
                    <p className="text-sm text-gray-500">
                      Max Score: {item.score} pts
                    </p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 p-2"
                    aria-label="Close"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Student List */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                  <div className="max-w-3xl mx-auto space-y-6">
                    {Object.entries(groupedStudents).map(
                      ([gender, genderStudents]) => (
                        <div key={gender} className="space-y-2">
                          {/* Gender Header */}
                          <div className="flex items-center space-x-2 mb-3">
                            {getGenderIcon(gender)}
                            <h3 className="text-sm font-semibold text-gray-900">
                              {getGenderText(gender)}
                            </h3>
                            <span className="text-xs text-gray-500">
                              ({genderStudents.length})
                            </span>
                          </div>

                          {/* Students List */}
                          <div className="space-y-2">
                            {genderStudents.map((student, index) => {
                              const scoreObj = getStudentScore(student.id);
                              const inputId = `score-input-${student.id}-${item.id}`;
                              const nextInputId =
                                index < genderStudents.length - 1
                                  ? `score-input-${genderStudents[index + 1].id}-${item.id}`
                                  : null;

                              return (
                                <div
                                  key={student.id}
                                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-3">
                                      <div className="w-10 h-10 sm:w-8 sm:h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-medium text-indigo-600">
                                          {student.first_name?.charAt(0) || ""}
                                          {student.last_name?.charAt(0) || ""}
                                        </span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-sm sm:text-base font-medium text-gray-900 truncate">
                                          {student.first_name}{" "}
                                          {student.last_name}
                                        </h4>
                                        <p className="text-xs text-gray-500">
                                          LRN: {student.lrn || "N/A"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                                    <div className="text-sm sm:text-base font-medium whitespace-nowrap">
                                      <span>{scoreObj?.score ?? "—"}</span>
                                      <span className="text-gray-400">
                                        /{item.score}
                                      </span>
                                    </div>
                                    <div className="w-24 sm:w-28">
                                      <StudentScoreInput
                                        studentId={student.id}
                                        itemId={item.id}
                                        maxScore={item.score}
                                        initialScore={scoreObj?.score}
                                        scoreId={scoreObj?.id}
                                        inputId={inputId}
                                        onSuccess={() => onScoresUpdate?.()}
                                        onEnterPress={() => {
                                          // Move focus to next input
                                          if (nextInputId) {
                                            setTimeout(() => {
                                              const nextInput =
                                                document.querySelector(
                                                  `input[data-input-id="${nextInputId}"]`
                                                );
                                              if (nextInput) {
                                                nextInput.focus();
                                                nextInput.select();
                                              }
                                            }, 100);
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
