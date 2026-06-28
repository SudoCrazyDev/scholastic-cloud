import React from 'react';
import { motion } from 'framer-motion';
import { Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, Pin, ChevronRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { announcementService } from '../services/announcementService';

const formatAnnouncementDate = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const announcementRoleLabel = (slug: string | null): string => {
  if (!slug) return 'Staff';
  if (slug === 'subject-teacher') return 'Teacher';
  if (['super-administrator', 'principal', 'institution-administrator'].includes(slug)) return 'Admin';
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const RecentAnnouncements: React.FC = () => {
  const feedQuery = useQuery({
    queryKey: ['announcement-feed'],
    queryFn: () => announcementService.getFeed(),
  });

  const announcements = (feedQuery.data?.data ?? []).slice(0, 5);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <h3 className="inline-flex items-center gap-2 text-base font-semibold text-gray-900">
          <Megaphone className="w-5 h-5 text-indigo-600" /> Announcements
        </h3>
        <Link to="/announcements" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700">
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {feedQuery.isLoading ? (
        <div className="p-6 text-center text-sm text-gray-500">Loading…</div>
      ) : announcements.length === 0 ? (
        <div className="p-8 text-center">
          <Megaphone className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">No announcements right now.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {announcements.map((a) => (
            <Link
              key={a.id}
              to="/announcements"
              className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              {!a.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600" aria-label="Unread" />}
              <div className={`min-w-0 ${a.is_read ? 'pl-5' : ''}`}>
                <div className="flex items-center gap-1.5">
                  {a.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                  <p className={`truncate text-sm ${a.is_read ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'}`}>
                    {a.title}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {announcementRoleLabel(a.author_role)} · {a.author_name} · {formatAnnouncementDate(a.publish_at || a.created_at)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();

  if (user?.role?.slug === 'finance') {
    return <Navigate to="/finance" replace />;
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: 'easeOut' },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Welcome Section */}
      <motion.div variants={itemVariants} className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              Welcome back, {user?.first_name} {user?.last_name}! 👋
            </h1>
            <p className="text-indigo-100">
              Here's what's happening with your ScholasticCloud platform today.
            </p>
          </div>
          <div className="hidden md:block">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Recent Announcements */}
      <motion.div variants={itemVariants}>
        <RecentAnnouncements />
      </motion.div>
    </motion.div>
  );
};

export default Dashboard; 