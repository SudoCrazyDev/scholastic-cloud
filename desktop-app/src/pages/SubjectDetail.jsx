import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { useSubjectDetail } from "@/hooks/useSubjectDetail";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Users,
  GraduationCap,
  Building2,
  Loader2,
  FileText,
  List,
  User,
} from "lucide-react";
import {
  getSubjectEcrsBySubjectId,
  getSubjectEcrItemsBySubjectEcrId,
  getStudentEcrItemScoresByItemId,
} from "@/lib/db";

export function SubjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { subject, classSection, students, institution, loading, error } = useSubjectDetail(id);
  const [activeTab, setActiveTab] = useState("student-scores");
  const [activeQuarter, setActiveQuarter] = useState("All");
  const [ecrItems, setEcrItems] = useState([]);
  const [studentScores, setStudentScores] = useState([]);
  const [loadingEcrData, setLoadingEcrData] = useState(false);

  // Load ECR items and scores when subject changes
  useEffect(() => {
    async function loadEcrData() {
      if (!subject?.id) return;

      try {
        setLoadingEcrData(true);

        // Get subject ECRs
        const subjectEcrs = await getSubjectEcrsBySubjectId(subject.id);

        // Get ECR items for each ECR
        const itemsPromises = subjectEcrs.map(async (ecr) => {
          const items = await getSubjectEcrItemsBySubjectEcrId(ecr.id);
          return items.map((item) => ({ ...item, subject_ecr: ecr }));
        });

        const itemsArrays = await Promise.all(itemsPromises);
        const allItems = itemsArrays.flat();
        setEcrItems(allItems);

        // Get scores for all items
        const scoresPromises = allItems.map(async (item) => {
          const scores = await getStudentEcrItemScoresByItemId(item.id);
          return scores.map((score) => ({ ...score, item }));
        });

        const scoresArrays = await Promise.all(scoresPromises);
        const allScores = scoresArrays.flat();
        setStudentScores(allScores);
      } catch (err) {
        console.error("Error loading ECR data:", err);
      } finally {
        setLoadingEcrData(false);
      }
    }

    loadEcrData();
  }, [subject?.id]);

  const getFullName = (student) => {
    const parts = [
      student.last_name ? `${student.last_name},` : "",
      student.first_name || "",
      student.middle_name ? `${student.middle_name.charAt(0)}.` : "",
      student.ext_name || "",
    ];
    return parts.filter(Boolean).join(" ");
  };

  // Filter ECR items by quarter
  const filteredEcrItems = useMemo(() => {
    if (activeQuarter === "All") return ecrItems;
    return ecrItems.filter((item) => item.quarter === activeQuarter);
  }, [ecrItems, activeQuarter]);

  // Group students by gender
  const groupedStudents = useMemo(() => {
    const grouped = {};

    students.forEach((student) => {
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
  }, [students]);

  // Get score for a student and item
  const getStudentScore = (studentId, itemId) => {
    const score = studentScores.find(
      (s) => s.student_id === studentId && s.subject_ecr_item_id === itemId
    );
    return score?.score ?? null;
  };

  const tabs = [
    {
      id: "student-scores",
      label: "Student Scores",
      icon: Users,
    },
    {
      id: "class-record",
      label: "Class Record",
      icon: FileText,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading subject info...</span>
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Subject Not Found</h3>
            <p className="text-gray-500 mb-6">
              {error || "The subject you're looking for doesn't exist."}
            </p>
            <button
              onClick={() => navigate("/assigned-subjects")}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Back to Assigned Subjects
            </button>
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
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate("/assigned-subjects")}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{subject.title}</h1>
              {subject.variant && <p className="text-sm text-gray-600">{subject.variant}</p>}
            </div>
          </div>
        </div>

        {/* Subject Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {classSection && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <GraduationCap className="w-4 h-4" />
              <span>
                {classSection.grade_level} - {classSection.title}
              </span>
            </div>
          )}

          {institution && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Building2 className="w-4 h-4" />
              <span>{institution.title}</span>
            </div>
          )}

          {subject.start_time && subject.end_time && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Clock className="w-4 h-4" />
              <span>
                {subject.start_time} - {subject.end_time}
              </span>
            </div>
          )}

          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Users className="w-4 h-4" />
            <span>{students.length} students</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
            >
              {activeTab === "student-scores" && (
                <div className="space-y-6">
                  {/* Quarter Filter */}
                  <div className="flex items-center gap-4 mb-4">
                    <label className="text-sm font-medium text-gray-700">Filter by Quarter:</label>
                    <select
                      value={activeQuarter}
                      onChange={(e) => setActiveQuarter(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="All">All Quarters</option>
                      <option value="1">First Quarter</option>
                      <option value="2">Second Quarter</option>
                      <option value="3">Third Quarter</option>
                      <option value="4">Fourth Quarter</option>
                    </select>
                  </div>

                  {loadingEcrData ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                      <span className="ml-3 text-gray-600">Loading grade items...</span>
                    </div>
                  ) : filteredEcrItems.length === 0 ? (
                    <div className="text-center py-12">
                      <List className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Grade Items</h3>
                      <p className="text-gray-600">
                        {activeQuarter === "All"
                          ? "No grade items have been created for this subject yet."
                          : `No grade items found for ${activeQuarter === "1" ? "First" : activeQuarter === "2" ? "Second" : activeQuarter === "3" ? "Third" : "Fourth"} Quarter.`}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {filteredEcrItems.map((item) => (
                        <div key={item.id} className="border border-gray-200 rounded-lg p-6">
                          <div className="mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                            {item.description && (
                              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-xs text-gray-500">
                                Category: {item.subject_ecr?.title || "N/A"}
                              </span>
                              {item.quarter && (
                                <span className="text-xs text-gray-500">
                                  Quarter: {item.quarter}
                                </span>
                              )}
                              {item.score && (
                                <span className="text-xs text-gray-500">Max Score: {item.score}</span>
                              )}
                            </div>
                          </div>

                          {/* Students Scores Table */}
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Student Name
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Score
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {Object.entries(groupedStudents).map(([gender, genderStudents]) =>
                                  genderStudents.map((student) => {
                                    const score = getStudentScore(student.id, item.id);
                                    return (
                                      <tr key={student.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-900">
                                          <div className="flex items-center space-x-2">
                                            {student.profile_picture ? (
                                              <img
                                                src={student.profile_picture}
                                                alt={getFullName(student)}
                                                className="w-8 h-8 rounded-full object-cover"
                                              />
                                            ) : (
                                              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                                                <User className="w-4 h-4 text-gray-600" />
                                              </div>
                                            )}
                                            <span className="uppercase">{getFullName(student)}</span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                          {score !== null ? score : "—"}
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "class-record" && (
                <div className="space-y-4">
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Class Record</h3>
                    <p className="text-gray-600">
                      Class record functionality will be available soon.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

