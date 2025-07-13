import React from 'react'
import { motion } from 'framer-motion'
import { 
  ListBulletIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon
} from '@heroicons/react/24/outline'
import type { Topic } from '../../../types'

interface TopicsTabProps {
  subjectId: string
}

// Placeholder data for topics
const placeholderTopics: Topic[] = [
  {
    id: '1',
    subject_id: '1',
    title: 'Introduction to Algebra',
    description: 'Basic concepts and terminology in algebra',
    order: 1,
    is_completed: true,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
  {
    id: '2',
    subject_id: '1',
    title: 'Linear Equations',
    description: 'Solving equations with one variable',
    order: 2,
    is_completed: true,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
  {
    id: '3',
    subject_id: '1',
    title: 'Systems of Linear Equations',
    description: 'Solving systems of equations with multiple variables',
    order: 3,
    is_completed: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
  {
    id: '4',
    subject_id: '1',
    title: 'Quadratic Equations',
    description: 'Solving quadratic equations and factoring',
    order: 4,
    is_completed: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
  {
    id: '5',
    subject_id: '1',
    title: 'Polynomial Functions',
    description: 'Understanding polynomial functions and their graphs',
    order: 5,
    is_completed: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
]

export const TopicsTab: React.FC<TopicsTabProps> = ({ subjectId }) => {
  // Filter topics for this subject
  const topics = placeholderTopics.filter(topic => topic.subject_id === subjectId)
  const completedTopics = topics.filter(topic => topic.is_completed)
  const progressPercentage = topics.length > 0 ? (completedTopics.length / topics.length) * 100 : 0

  if (topics.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ListBulletIcon className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Topics</h3>
        <p className="text-gray-500">No topics have been created for this subject yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-900">Course Progress</h3>
          <span className="text-sm text-gray-600">
            {completedTopics.length} of {topics.length} topics completed
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {Math.round(progressPercentage)}% complete
        </div>
      </div>

      {/* Topics List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Topics</h3>
          <button className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
            <PlusIcon className="w-4 h-4 mr-1" />
            Add Topic
          </button>
        </div>

        <div className="space-y-3">
          {topics.map((topic) => (
            <motion.div
              key={topic.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors ${
                topic.is_completed 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex-shrink-0 mt-1">
                {topic.is_completed ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-400 rounded-full" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className={`text-sm font-medium truncate ${
                    topic.is_completed ? 'text-green-900' : 'text-gray-900'
                  }`}>
                    {topic.order}. {topic.title}
                  </h4>
                  {topic.is_completed && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Completed
                    </span>
                  )}
                </div>
                
                {topic.description && (
                  <p className={`text-sm mb-2 ${
                    topic.is_completed ? 'text-green-700' : 'text-gray-600'
                  }`}>
                    {topic.description}
                  </p>
                )}
                
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <div className="flex items-center space-x-1">
                    <ClockIcon className="w-3 h-3" />
                    <span>Topic {topic.order}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  className={`p-1 transition-colors ${
                    topic.is_completed 
                      ? 'text-green-600 hover:text-green-700' 
                      : 'text-gray-400 hover:text-indigo-600'
                  }`}
                  title={topic.is_completed ? 'Mark as incomplete' : 'Mark as complete'}
                >
                  {topic.is_completed ? (
                    <CheckCircleIcon className="w-4 h-4" />
                  ) : (
                    <div className="w-4 h-4 border-2 border-gray-400 rounded-full" />
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
} 