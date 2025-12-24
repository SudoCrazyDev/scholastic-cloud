import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown, LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "@/lib/db";
import {
  clearUserCache,
  clearInstitutionCache,
  clearClassSectionCache,
  clearSubjectCache,
  clearStudentCache,
  clearStudentSectionCache,
  clearSubjectEcrCache,
  clearSubjectEcrItemCache,
  clearStudentEcrItemScoreCache,
  clearStudentRunningGradeCache,
} from "@/lib/db";

export function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [user, setUser] = useState(null);
  const profileRef = useRef(null);

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    }
    loadUser();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      // Clear all data from SQLite
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

      // Navigate to login
      navigate("/login");
    } catch (error) {
      console.error("Error during logout:", error);
      // Still navigate to login even if clearing fails
      navigate("/login");
    }
  };

  const getInitials = () => {
    if (!user) return "U";
    const first = user.first_name?.[0] || "";
    const last = user.last_name?.[0] || "";
    return (first + last).toUpperCase() || "U";
  };

  const getFullName = () => {
    if (!user) return "User";
    const parts = [user.first_name, user.last_name].filter(Boolean);
    return parts.join(" ") || "User";
  };

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 z-10"
    >
      <div className="flex items-center justify-between">
        {/* Left Section - Burger Menu (only on mobile) */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 cursor-pointer lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Right Section - Profile */}
        <div className="relative" ref={profileRef}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 cursor-pointer"
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-white">{getInitials()}</span>
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-gray-900">{getFullName()}</p>
              <p className="text-xs text-gray-500">{user?.email || "User"}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </motion.button>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
              >
                <div className="p-4 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{getFullName()}</p>
                  <p className="text-sm text-gray-500">{user?.email || ""}</p>
                </div>
                <div className="p-2">
                  <motion.button
                    whileHover={{ backgroundColor: "#fef2f2" }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleLogout}
                    className="w-full flex items-center px-3 py-2 text-sm text-red-700 rounded-md hover:bg-red-50 transition-colors duration-200 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 mr-3" />
                    Sign out
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

