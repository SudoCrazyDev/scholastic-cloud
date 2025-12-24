import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useMyClassSections } from "@/hooks/useMyClassSections";
import { Button, Input, Badge } from "@/components";
import { Search, BookOpen, Calendar, User, ArrowRight, Loader2 } from "lucide-react";

export function MyClassSections() {
  const navigate = useNavigate();
  const { classSections, loading, error, searchValue, handleSearchChange } = useMyClassSections();

  const handleClassSectionClick = (classSection) => {
    navigate(`/my-class-sections/${classSection.id}`);
  };

  const getFullName = (user) => {
    if (!user) return "N/A";
    const parts = [user.first_name, user.middle_name, user.last_name, user.ext_name];
    return parts.filter(Boolean).join(" ");
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm font-medium text-red-800">Error Loading Class Sections</div>
            <div className="text-sm text-red-600 mt-1">
              {error.message || "Failed to load your class sections. Please try again."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Class Sections</h1>
            <p className="text-gray-600 mt-1">
              Manage and view your assigned class sections, report cards, and consolidated grades
            </p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search class sections..."
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Loading State */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center py-12 bg-white rounded-xl shadow-sm border border-gray-200"
          >
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </motion.div>
        )}

        {/* Class Sections Grid */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classSections.map((classSection, index) => (
              <motion.div
                key={classSection.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                onClick={() => handleClassSectionClick(classSection)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                      {classSection.title}
                    </h3>
                    <Badge color="indigo" className="mt-2">
                      {classSection.grade_level}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2">
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </div>

                <div className="space-y-3">
                  {classSection.academic_year && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="w-4 h-4 mr-2" />
                      <span>{classSection.academic_year}</span>
                    </div>
                  )}

                  {classSection.status && (
                    <div className="flex items-center text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          classSection.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {classSection.status}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && classSections.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200"
          >
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No class sections found</h3>
            <p className="text-gray-600">
              {searchValue
                ? "No class sections match your search criteria."
                : "You haven't been assigned to any class sections yet."}
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

