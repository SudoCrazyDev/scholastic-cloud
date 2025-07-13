import React from 'react'
import { motion } from 'framer-motion'
import { 
  CalendarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  PlusIcon
} from '@heroicons/react/24/outline'
import type { CalendarEvent } from '../../../types'

interface CalendarTabProps {
  subjectId: string
}

// Placeholder data for calendar events
const placeholderCalendarEvents: CalendarEvent[] = [
  {
    id: '1',
    subject_id: '1',
    title: 'Algebra Quiz 1',
    description: 'Basic algebraic expressions and equations',
    event_date: '2024-01-15',
    event_type: 'exam',
    is_all_day: false,
    start_time: '08:00',
    end_time: '09:30',
    created_at: '2024-01-10',
    updated_at: '2024-01-10',
  },
  {
    id: '2',
    subject_id: '1',
    title: 'Linear Equations Assignment Due',
    description: 'Submit your assignment on solving linear equations',
    event_date: '2024-01-20',
    event_type: 'assignment_due',
    is_all_day: true,
    created_at: '2024-01-15',
    updated_at: '2024-01-15',
  },
  {
    id: '3',
    subject_id: '1',
    title: 'Midterm Examination',
    description: 'Comprehensive exam covering chapters 1-5',
    event_date: '2024-02-01',
    event_type: 'exam',
    is_all_day: false,
    start_time: '08:00',
    end_time: '10:00',
    created_at: '2024-01-25',
    updated_at: '2024-01-25',
  },
  {
    id: '4',
    subject_id: '1',
    title: 'Mathematical Modeling Project Due',
    description: 'Final submission for the mathematical modeling project',
    event_date: '2024-02-15',
    event_type: 'project_due',
    is_all_day: true,
    created_at: '2024-02-01',
    updated_at: '2024-02-01',
  },
  {
    id: '5',
    subject_id: '1',
    title: 'National Mathematics Day',
    description: 'School holiday for National Mathematics Day',
    event_date: '2024-02-22',
    event_type: 'holiday',
    is_all_day: true,
    created_at: '2024-02-01',
    updated_at: '2024-02-01',
  },
]

const getEventTypeIcon = (type: CalendarEvent['event_type']) => {
  switch (type) {
    case 'exam':
      return <DocumentTextIcon className="w-5 h-5 text-red-600" />
    case 'assignment_due':
      return <DocumentTextIcon className="w-5 h-5 text-orange-600" />
    case 'project_due':
      return <DocumentTextIcon className="w-5 h-5 text-purple-600" />
    case 'holiday':
      return <CalendarIcon className="w-5 h-5 text-blue-600" />
    default:
      return <CalendarIcon className="w-5 h-5 text-gray-600" />
  }
}

const getEventTypeLabel = (type: CalendarEvent['event_type']) => {
  switch (type) {
    case 'exam':
      return 'Exam'
    case 'assignment_due':
      return 'Assignment Due'
    case 'project_due':
      return 'Project Due'
    case 'holiday':
      return 'Holiday'
    default:
      return 'Other'
  }
}

const getEventTypeColor = (type: CalendarEvent['event_type']) => {
  switch (type) {
    case 'exam':
      return 'bg-red-100 text-red-800'
    case 'assignment_due':
      return 'bg-orange-100 text-orange-800'
    case 'project_due':
      return 'bg-purple-100 text-purple-800'
    case 'holiday':
      return 'bg-blue-100 text-blue-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const isEventUpcoming = (eventDate: string) => {
  const today = new Date()
  const eventDateObj = new Date(eventDate)
  return eventDateObj >= today
}

export const CalendarTab: React.FC<CalendarTabProps> = ({ subjectId }) => {
  // Filter events for this subject
  const calendarEvents = placeholderCalendarEvents.filter(event => event.subject_id === subjectId)
  const upcomingEvents = calendarEvents.filter(event => isEventUpcoming(event.event_date))
  const pastEvents = calendarEvents.filter(event => !isEventUpcoming(event.event_date))

  if (calendarEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CalendarIcon className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Calendar Events</h3>
        <p className="text-gray-500">No calendar events have been created for this subject yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Add Event Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Calendar Events</h3>
        <button className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
          <PlusIcon className="w-4 h-4 mr-1" />
          Add Event
        </button>
      </div>

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-900 flex items-center space-x-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-orange-600" />
            <span>Upcoming Events</span>
          </h4>
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-orange-50 border border-orange-200 rounded-lg p-4 hover:border-orange-300 transition-colors"
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {getEventTypeIcon(event.event_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <h5 className="text-sm font-medium text-orange-900 truncate">
                        {event.title}
                      </h5>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getEventTypeColor(event.event_type)}`}>
                        {getEventTypeLabel(event.event_type)}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-sm text-orange-700 mb-2">{event.description}</p>
                    )}
                    <div className="flex items-center space-x-4 text-xs text-orange-600">
                      <div className="flex items-center space-x-1">
                        <CalendarIcon className="w-3 h-3" />
                        <span>{new Date(event.event_date).toLocaleDateString()}</span>
                      </div>
                      {!event.is_all_day && event.start_time && event.end_time && (
                        <div className="flex items-center space-x-1">
                          <ClockIcon className="w-3 h-3" />
                          <span>{event.start_time} - {event.end_time}</span>
                        </div>
                      )}
                      {event.is_all_day && (
                        <div className="flex items-center space-x-1">
                          <ClockIcon className="w-3 h-3" />
                          <span>All day</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Past Events */}
      {pastEvents.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-900 flex items-center space-x-2">
            <AcademicCapIcon className="w-4 h-4 text-gray-600" />
            <span>Past Events</span>
          </h4>
          <div className="space-y-3">
            {pastEvents.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {getEventTypeIcon(event.event_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <h5 className="text-sm font-medium text-gray-900 truncate">
                        {event.title}
                      </h5>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getEventTypeColor(event.event_type)}`}>
                        {getEventTypeLabel(event.event_type)}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                    )}
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <div className="flex items-center space-x-1">
                        <CalendarIcon className="w-3 h-3" />
                        <span>{new Date(event.event_date).toLocaleDateString()}</span>
                      </div>
                      {!event.is_all_day && event.start_time && event.end_time && (
                        <div className="flex items-center space-x-1">
                          <ClockIcon className="w-3 h-3" />
                          <span>{event.start_time} - {event.end_time}</span>
                        </div>
                      )}
                      {event.is_all_day && (
                        <div className="flex items-center space-x-1">
                          <ClockIcon className="w-3 h-3" />
                          <span>All day</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 