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
  CheckCircle,
  User as UserIcon,
} from "lucide-react";
import {
  getSubjectEcrsBySubjectId,
  getSubjectEcrItemsBySubjectEcrId,
  getStudentEcrItemScoresByItemId,
} from "@/lib/db";
import { GradeItemCard, SummativeAssessmentTab, ClassRecordTab } from "@/components";

export function SubjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { subject, classSection, students, institution, loading, error } =
    useSubjectDetail(id);
  const [activeTab, setActiveTab] = useState("class-record");
  const [activeQuarter, setActiveQuarter] = useState("All");
  const [ecrItems, setEcrItems] = useState([]);
  const [studentScores, setStudentScores] = useState([]);
  const [loadingEcrData, setLoadingEcrData] = useState(false);
  const [subjectEcrs, setSubjectEcrs] = useState([]);

  // Load ECR items and scores when subject changes
  const loadEcrData = async () => {
    if (!subject?.id) return;

    try {
      setLoadingEcrData(true);

      // Get subject ECRs
      const ecrs = await getSubjectEcrsBySubjectId(subject.id);
      setSubjectEcrs(ecrs);

      // Get ECR items for each ECR
      const itemsPromises = ecrs.map(async (ecr) => {
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
  };

  useEffect(() => {
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

  // Calculate statistics
  const totalStudents = students.length;
  const totalItems = filteredEcrItems.length;
  const totalScores = studentScores.length;
  const completionRate =
    totalItems > 0
      ? Math.round((totalScores / (totalStudents * totalItems)) * 100)
      : 0;

  // Gender distribution
  const genderDistribution = students.reduce((acc, student) => {
    const gender = student.gender || "other";
    acc[gender] = (acc[gender] || 0) + 1;
    return acc;
  }, {});

  const tabs = [
    // Temporarily hidden - Phase 1 focus on Class Record only
    // {
    //   id: "student-scores",
    //   label: "Student Scores",
    //   icon: Users,
    // },
    // {
    //   id: "summative-assessment",
    //   label: "Components of Summative Assessment",
    //   icon: List,
    // },
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Subject Not Found
            </h3>
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
              <h1 className="text-2xl font-bold text-gray-900">
                {subject.title}
              </h1>
              {subject.variant && (
                <p className="text-sm text-gray-600">{subject.variant}</p>
              )}
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
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        Student Scores
                      </h3>
                      <p className="text-sm text-gray-500">
                        Manage grades for {students.length} students
                      </p>
                    </div>
                  </div>

                  {/* Student Statistics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-500">
                            Total Students
                          </p>
                          <p className="text-lg font-semibold text-gray-900">
                            {totalStudents}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <FileText className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-500">
                            Grade Items
                          </p>
                          <p className="text-lg font-semibold text-gray-900">
                            {totalItems}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-yellow-600" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-500">
                            Scores Entered
                          </p>
                          <p className="text-lg font-semibold text-gray-900">
                            {totalScores}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                          <GraduationCap className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-500">
                            Completion
                          </p>
                          <p className="text-lg font-semibold text-gray-900">
                            {completionRate}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Gender Distribution */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Student Distribution
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                        <UserIcon className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium text-blue-900">
                            Male Students
                          </p>
                          <p className="text-lg font-semibold text-blue-700">
                            {genderDistribution.male || 0}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 p-3 bg-pink-50 rounded-lg">
                        <Users className="w-5 h-5 text-pink-600" />
                        <div>
                          <p className="text-sm font-medium text-pink-900">
                            Female Students
                          </p>
                          <p className="text-lg font-semibold text-pink-700">
                            {genderDistribution.female || 0}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <Users className="w-5 h-5 text-gray-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Other Students
                          </p>
                          <p className="text-lg font-semibold text-gray-700">
                            {genderDistribution.other || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quarter Filter */}
                  <div className="bg-white rounded-lg border border-gray-200">
                    <div className="border-b border-gray-200">
                      <nav className="flex space-x-8 px-4" aria-label="Quarters">
                        {["All", "1", "2", "3", "4"].map((quarter) => {
                          const quarterLabel =
                            quarter === "All"
                              ? "All Quarters"
                              : `Quarter ${quarter}`;
                          return (
                            <button
                              key={quarter}
                              onClick={() => setActiveQuarter(quarter)}
                              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeQuarter === quarter
                                  ? "border-indigo-500 text-indigo-600"
                                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                              }`}
                            >
                              {quarterLabel}
                            </button>
                          );
                        })}
                      </nav>
                    </div>
                  </div>

                  {/* Components of Summative Assessment Info */}
                  {subjectEcrs.length > 0 ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-blue-900 mb-2">
                        Components of Summative Assessment
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
                        {subjectEcrs.map((component) => (
                          <div key={component.id}>
                            <span className="font-medium">
                              {component.title}:
                            </span>{" "}
                            {component.percentage}% of Quarter Grade
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-yellow-900 mb-2">
                        Components of Summative Assessment
                      </h4>
                      <p className="text-sm text-yellow-800">
                        No components of summative assessment have been created
                        yet. Please sync data from the server.
                      </p>
                    </div>
                  )}

                  {/* Grade Items */}
                  <div className="space-y-4">
                    {loadingEcrData ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                        <span className="ml-3 text-gray-600">
                          Loading grade items...
                        </span>
                      </div>
                    ) : filteredEcrItems.length === 0 ? (
                      <div className="text-center py-12">
                        <List className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          No Grade Items
                        </h3>
                        <p className="text-gray-600">
                          {activeQuarter === "All"
                            ? "No grade items have been synced for this subject yet."
                            : `No grade items found for Quarter ${activeQuarter}.`}
                        </p>
                      </div>
                    ) : (
                      filteredEcrItems.map((item) => (
                        <GradeItemCard
                          key={item.id}
                          item={item}
                          students={students}
                          scores={studentScores}
                          onScoresUpdate={loadEcrData}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === "summative-assessment" && (
                <SummativeAssessmentTab subjectId={subject.id} />
              )}

              {activeTab === "class-record" && (
                <ClassRecordTab
                  subjectId={subject.id}
                  classSectionId={subject.class_section_id}
                  students={students}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
