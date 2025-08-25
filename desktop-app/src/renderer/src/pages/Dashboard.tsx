import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, BookOpen, School, Database, 
  Wifi, WifiOff, RefreshCw, Download, 
  Upload, LogOut, BarChart3, Settings,
  ChevronRight, AlertCircle, CheckCircle
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface DashboardStats {
  students: number;
  sections: number;
  subjects: number;
  gradeItems: number;
  unsyncedRecords: number;
  lastSync: string | null;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const isOnline = useOnlineStatus();
  const [stats, setStats] = useState<DashboardStats>({
    students: 0,
    sections: 0,
    subjects: 0,
    gradeItems: 0,
    unsyncedRecords: 0,
    lastSync: null
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const dbStats = await window.api.database.getStats();
      const syncStatus = await window.api.sync.getStatus();
      
      setStats({
        students: dbStats.students || 0,
        sections: dbStats.class_sections || 0,
        subjects: dbStats.subjects || 0,
        gradeItems: dbStats.grade_items || 0,
        unsyncedRecords: syncStatus.unsyncedCount || 0,
        lastSync: syncStatus.lastSync?.completed_at || localStorage.getItem('lastSync')
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleSync = async () => {
    if (!isOnline || !token) {
      setSyncMessage({ 
        type: 'error', 
        text: isOnline ? 'No authentication token available' : 'Cannot sync while offline' 
      });
      return;
    }

    setIsSyncing(true);
    setSyncMessage(null);
    
    try {
      const apiUrl = localStorage.getItem('apiUrl') || 'http://localhost:3000/api';
      const result = await window.api.sync.syncNow(apiUrl, token);
      
      if (result.success) {
        setSyncMessage({
          type: 'success',
          text: `Successfully synced ${result.recordsSynced} records`
        });
        localStorage.setItem('lastSync', new Date().toISOString());
        loadStats();
      } else {
        setSyncMessage({
          type: 'error',
          text: 'Sync failed. Please try again.'
        });
      }
    } catch (error: any) {
      setSyncMessage({
        type: 'error',
        text: error.message || 'Sync failed'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExport = async () => {
    try {
      const filePath = await window.api.sync.exportData();
      if (filePath) {
        setSyncMessage({
          type: 'success',
          text: `Data exported to: ${filePath}`
        });
      } else {
        setSyncMessage({
          type: 'info',
          text: 'No data to export'
        });
      }
    } catch (error: any) {
      setSyncMessage({
        type: 'error',
        text: 'Export failed'
      });
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const menuItems = [
    {
      title: 'Grade Management',
      description: 'Manage student grades and scores',
      icon: <BarChart3 className="w-6 h-6" />,
      path: '/grades',
      color: 'bg-blue-500'
    },
    {
      title: 'Students',
      description: 'View and manage student records',
      icon: <Users className="w-6 h-6" />,
      path: '/students',
      color: 'bg-green-500'
    },
    {
      title: 'Subjects',
      description: 'Manage subjects and assignments',
      icon: <BookOpen className="w-6 h-6" />,
      path: '/subjects',
      color: 'bg-purple-500'
    },
    {
      title: 'Class Sections',
      description: 'Manage class sections',
      icon: <School className="w-6 h-6" />,
      path: '/sections',
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                Scholastic Desktop
              </h1>
              <div className="ml-4 flex items-center">
                {isOnline ? (
                  <div className="flex items-center text-green-600">
                    <Wifi className="w-4 h-4 mr-1" />
                    <span className="text-sm">Online</span>
                  </div>
                ) : (
                  <div className="flex items-center text-orange-600">
                    <WifiOff className="w-4 h-4 mr-1" />
                    <span className="text-sm">Offline</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {user?.email}
              </span>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-700"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Sync Status Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-6 mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Sync Status
            </h2>
            <div className="flex space-x-2">
              <button
                onClick={handleExport}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center"
              >
                <Download className="w-4 h-4 mr-1" />
                Export
              </button>
              <button
                onClick={handleSync}
                disabled={!isOnline || isSyncing}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-1" />
                    Sync Now
                  </>
                )}
              </button>
            </div>
          </div>
          
          {syncMessage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`mb-4 p-3 rounded-lg flex items-center ${
                syncMessage.type === 'success' ? 'bg-green-50 text-green-700' :
                syncMessage.type === 'error' ? 'bg-red-50 text-red-700' :
                'bg-blue-50 text-blue-700'
              }`}
            >
              {syncMessage.type === 'success' ? (
                <CheckCircle className="w-4 h-4 mr-2" />
              ) : syncMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 mr-2" />
              ) : (
                <AlertCircle className="w-4 h-4 mr-2" />
              )}
              <span className="text-sm">{syncMessage.text}</span>
            </motion.div>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Unsynced Records</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.unsyncedRecords}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Sync</p>
              <p className="text-sm font-medium text-gray-900">
                {stats.lastSync 
                  ? new Date(stats.lastSync).toLocaleString()
                  : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Local Database</p>
              <p className="text-sm font-medium text-gray-900 flex items-center">
                <Database className="w-4 h-4 mr-1" />
                Active
              </p>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow-sm p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Students</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {stats.students}
                </p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow-sm p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Sections</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {stats.sections}
                </p>
              </div>
              <School className="w-8 h-8 text-green-500" />
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-lg shadow-sm p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Subjects</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {stats.subjects}
                </p>
              </div>
              <BookOpen className="w-8 h-8 text-purple-500" />
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-lg shadow-sm p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Grade Items</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {stats.gradeItems}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-orange-500" />
            </div>
          </motion.div>
        </div>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {menuItems.map((item, index) => (
            <motion.button
              key={item.path}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * (index + 1) }}
              onClick={() => navigate(item.path)}
              className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow text-left group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className={`inline-flex p-3 rounded-lg ${item.color} text-white mb-4`}>
                    {item.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {item.description}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 mt-1" />
              </div>
            </motion.button>
          ))}
        </div>
      </main>
    </div>
  );
};