import React, { useState, useEffect } from "react";
import { Loader2, Users, GraduationCap, Calculator, User as UserIcon, Download, Upload, Clock, CheckCircle, AlertCircle, RefreshCw, Search } from "lucide-react";
import {
  getStudentRunningGradesBySubjectId,
  upsertStudentRunningGrade,
  getPendingCount,
  getLastSyncLog,
  getCurrentUser,
} from "@/lib/db";
import { syncService } from "@/services/syncService";
import { useToast } from "@/contexts/ToastContext";

export function ClassRecordTab({ subjectId, classSectionId, students }) {
  const toast = useToast();
  const [runningGrades, setRunningGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchChanges, setBatchChanges] = useState({});
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);

  // Load running grades and sync status
  useEffect(() => {
    loadRunningGrades();
    loadSyncStatus();
  }, [subjectId]);

  const loadRunningGrades = async () => {
    try {
      setLoading(true);
      const grades = await getStudentRunningGradesBySubjectId(subjectId);
      setRunningGrades(grades);
    } catch (err) {
      console.error("Error loading running grades:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const count = await getPendingCount("student_running_grades");
      setPendingSyncCount(count);

      const lastUpload = await getLastSyncLog("running_grades", "upload");
      const lastDownload = await getLastSyncLog("running_grades", "download");

      // Use the most recent sync
      if (lastUpload && lastDownload) {
        const uploadDate = new Date(lastUpload.completed_at);
        const downloadDate = new Date(lastDownload.completed_at);
        setLastSync(uploadDate > downloadDate ? lastUpload : lastDownload);
      } else {
        setLastSync(lastUpload || lastDownload);
      }
    } catch (err) {
      console.error("Error loading sync status:", err);
    }
  };

  // Get grade for student and quarter
  const getGrade = (studentId, quarter) => {
    const grade = runningGrades.find(
      (g) => g.student_id === studentId && g.quarter === quarter
    );
    return grade;
  };

  // Handle grade change
  const handleGradeChange = (studentId, quarter, value) => {
    const key = `${studentId}-${quarter}`;
    setBatchChanges((prev) => ({
      ...prev,
      [key]: {
        student_id: studentId,
        subject_id: subjectId,
        quarter,
        final_grade: value === "" ? null : parseFloat(value),
        academic_year: "2025-2026",
      },
    }));
  };

  // Handle keyboard navigation
  const handleKeyDown = (e, studentId, quarter) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(studentId, quarter, "down");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(studentId, quarter, "up");
    } else if (e.key === "Tab" || e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus(studentId, quarter, "right");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(studentId, quarter, "left");
    }
  };

  const moveFocus = (currentStudentId, currentQuarter, direction) => {
    const flatStudents = Object.values(groupedStudents).flat();
    const currentIndex = flatStudents.findIndex((s) => s.id === currentStudentId);
    const quarterIndex = quarters.indexOf(currentQuarter);

    let nextStudentId = currentStudentId;
    let nextQuarter = currentQuarter;

    if (direction === "down") {
      if (currentIndex < flatStudents.length - 1) {
        nextStudentId = flatStudents[currentIndex + 1].id;
      }
    } else if (direction === "up") {
      if (currentIndex > 0) {
        nextStudentId = flatStudents[currentIndex - 1].id;
      }
    } else if (direction === "right") {
      if (quarterIndex < quarters.length - 1) {
        nextQuarter = quarters[quarterIndex + 1];
      } else if (currentIndex < flatStudents.length - 1) {
        // Move to next student's first quarter
        nextStudentId = flatStudents[currentIndex + 1].id;
        nextQuarter = quarters[0];
      }
    } else if (direction === "left") {
      if (quarterIndex > 0) {
        nextQuarter = quarters[quarterIndex - 1];
      } else if (currentIndex > 0) {
        // Move to previous student's last quarter
        nextStudentId = flatStudents[currentIndex - 1].id;
        nextQuarter = quarters[quarters.length - 1];
      }
    }

    const key = `${nextStudentId}-${nextQuarter}`;
    if (inputRefs.current[key]) {
      inputRefs.current[key].focus();
      inputRefs.current[key].select();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveAll();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [batchChanges]);

  // Save all changes locally
  const handleSaveAll = async () => {
    try {
      const changes = Object.values(batchChanges);
      if (changes.length === 0) {
        toast.info("No changes to save");
        return;
      }
      
      for (const change of changes) {
        await upsertStudentRunningGrade(change);
      }
      setBatchChanges({});
      await loadRunningGrades();
      await loadSyncStatus(); // Refresh pending count
      toast.success("All grades saved locally!\nClick 'Upload to Server' to sync.");
    } catch (err) {
      console.error("Error saving grades:", err);
      toast.error(`Failed to save grades: ${err.message}`);
    }
  };

  // Unified Sync Function
  const handleSync = async () => {
    try {
      setSyncing(true);
      
      // Get token
      let token = localStorage.getItem("token");
      if (!token) {
        const user = await getCurrentUser();
        if (user?.token) {
          token = user.token;
          localStorage.setItem("token", token);
        }
      }

      if (!token) {
        toast.error("Not authenticated. Please login first.");
        setSyncing(false);
        return;
      }

      syncService.setToken(token);

      // 1. Upload pending changes if any
      if (pendingSyncCount > 0) {
        setSyncProgress({ type: "upload", message: "Uploading pending changes..." });
        const uploadResult = await syncService.uploadRunningGrades(subjectId);
        
        if (uploadResult.connectionLost) {
          toast.warning("Connection lost during upload. Some items may not have been synced.");
        } else if (uploadResult.summary.failed_count > 0) {
          toast.warning(`Upload complete with ${uploadResult.summary.failed_count} failures.`);
        }
      }

      // 2. Download latest grades
      setSyncProgress({ type: "download", message: "Downloading latest grades..." });
      const downloadResult = await syncService.downloadRunningGrades(subjectId, classSectionId);

      // 3. Refresh data
      await loadRunningGrades();
      await loadSyncStatus();

      toast.success("Sync completed successfully!");
    } catch (err) {
      console.error("Error during sync:", err);
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const inputRefs = React.useRef({});

  // Format last sync date
  const formatLastSync = (syncLog) => {
    if (!syncLog || !syncLog.completed_at) return "Never";

    const date = new Date(syncLog.completed_at);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString();
  };

  // Filter students based on search query
  const filteredStudents = students.filter((student) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${student.last_name}, ${student.first_name} ${student.middle_name || ""}`.toLowerCase();
    return fullName.includes(query);
  });

  // Group students by gender
  const groupedStudents = filteredStudents.reduce((acc, student) => {
    const gender = student.gender || "other";
    if (!acc[gender]) acc[gender] = [];
    acc[gender].push(student);
    return acc;
  }, {});

  // Sort students within each group
  Object.keys(groupedStudents).forEach((gender) => {
    groupedStudents[gender].sort((a, b) =>
      a.last_name?.localeCompare(b.last_name || "") || 0
    );
  });

  const getFullName = (student) => {
    const parts = [
      student.last_name ? `${student.last_name},` : "",
      student.first_name || "",
      student.middle_name ? `${student.middle_name.charAt(0)}.` : "",
      student.ext_name || "",
    ];
    return parts.filter(Boolean).join(" ");
  };

  const quarters = ["1", "2", "3", "4"];
  const pendingCount = Object.keys(batchChanges).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading class records...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Progress Modal */}
      {syncing && syncProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center space-x-3">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {syncProgress.type === "download" ? "Downloading..." : "Uploading..."}
                </h3>
                <p className="text-sm text-gray-600">{syncProgress.message}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Class Records</h3>
          <p className="text-sm text-gray-500">
            Manage final grades for {students.length} students
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {pendingCount > 0 && (
            <button
              onClick={handleSaveAll}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium shadow-sm"
            >
              Save All Changes ({pendingCount})
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            <span>Sync Data</span>
            {pendingSyncCount > 0 && (
              <span className="bg-indigo-500 px-2 py-0.5 rounded-full text-xs">
                {pendingSyncCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Sync Status Bar */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between text-sm">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-gray-600">
            <Clock className="w-4 h-4" />
            <span>Last synced: <span className="font-medium text-gray-900">{formatLastSync(lastSync)}</span></span>
          </div>
          <div className="flex items-center space-x-2">
            {pendingSyncCount > 0 ? (
              <>
                <AlertCircle className="w-4 h-4 text-yellow-500" />
                <span className="text-yellow-700 font-medium">{pendingSyncCount} changes pending upload</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-green-700 font-medium">All changes synced</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Students</p>
              <p className="text-lg font-semibold text-gray-900">
                {students.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Grades</p>
              <p className="text-lg font-semibold text-gray-900">
                {runningGrades.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
              <Calculator className="w-4 h-4 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Pending Changes</p>
              <p className="text-lg font-semibold text-gray-900">
                {pendingCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Shortcuts */}
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <div className="flex items-center justify-between">
            <span className="font-medium">Keyboard Shortcuts:</span>
            <div className="flex gap-4 text-xs">
              <span>Arrow keys to navigate</span>
              <span>Enter to move down</span>
              <span>Tab to move right</span>
              <span>Ctrl+S to save</span>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Student Grades Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-900">
            Student Final Grades by Quarter
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                  Student Name
                </th>
                {quarters.map((q) => (
                  <th
                    key={q}
                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Quarter {q}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(groupedStudents).map(([gender, genderStudents]) => (
                <React.Fragment key={gender}>
                  {/* Gender Header */}
                  <tr className="bg-gray-100">
                    <td
                      colSpan={5}
                      className="px-4 py-2 text-sm font-medium text-gray-900"
                    >
                      <div className="flex items-center space-x-2">
                        <UserIcon className="w-4 h-4" />
                        <span className="capitalize">
                          {gender} Students ({genderStudents.length})
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Students */}
                  {genderStudents.map((student) => {
                    return (
                      <tr key={student.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-white z-10">
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-indigo-600">
                                {student.first_name?.charAt(0) || ""}
                                {student.last_name?.charAt(0) || ""}
                              </span>
                            </div>
                            <span className="uppercase">
                              {getFullName(student)}
                            </span>
                          </div>
                        </td>
                        {quarters.map((quarter) => {
                          const grade = getGrade(student.id, quarter);
                          const key = `${student.id}-${quarter}`;
                          const hasChange = batchChanges[key];
                          const displayValue = hasChange
                            ? batchChanges[key].final_grade ?? ""
                            : grade?.final_grade ?? "";

                          // Determine visual state
                          const numValue = parseFloat(displayValue);
                          const isFailing = !isNaN(numValue) && numValue < 75;
                          const isInvalid = !isNaN(numValue) && (numValue < 0 || numValue > 100);
                          
                          let inputClass = "w-20 px-2 py-1 text-center border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors duration-150";
                          
                          if (isInvalid) {
                            inputClass += " bg-red-50 border-red-500 text-red-900";
                          } else if (hasChange) {
                            inputClass += " bg-yellow-50 border-yellow-300";
                            if (isFailing) inputClass += " text-red-600 font-medium";
                          } else if (grade) {
                            inputClass += " bg-green-50 border-green-200";
                            if (isFailing) inputClass += " text-red-600 font-medium";
                          } else {
                            inputClass += " bg-gray-50 border-gray-200";
                          }

                          return (
                            <td
                              key={quarter}
                              className="px-4 py-3 text-center"
                            >
                              <input
                                ref={(el) => (inputRefs.current[key] = el)}
                                type="text"
                                inputMode="decimal"
                                value={displayValue}
                                onKeyDown={(e) => handleKeyDown(e, student.id, quarter)}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  // Allow empty or numbers only
                                  if (val === "" || /^\d*\.?\d*$/.test(val)) {
                                    handleGradeChange(
                                      student.id,
                                      quarter,
                                      val
                                    );
                                  }
                                }}
                                className={inputClass}
                                placeholder=""
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
