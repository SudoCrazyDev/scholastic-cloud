import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

interface StudentOnlyRouteProps {
  children: React.ReactElement
}

const StudentOnlyRoute: React.FC<StudentOnlyRouteProps> = ({ children }) => {
  const { isLoading, isAuthenticated, user } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role?.slug !== 'student') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default StudentOnlyRoute
