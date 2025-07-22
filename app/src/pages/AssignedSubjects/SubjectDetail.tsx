import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ArrowLeftIcon,
  BookOpenIcon,
  ClockIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  ListBulletIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import { useSubjectDetail } from '@hooks'
import { ClassRecordTab } from './components/ClassRecordTab'
import { TopicsTab } from './components/TopicsTab'
import { CalendarTab } from './components/CalendarTab'
import { StudentScoresTab } from './components/StudentScoresTab'
import SummativeAssessmentTab from './components/SummativeAssessmentTab'
import type { Subject, Student, ClassSection } from '../../types'

type TabType = 'class-record' | 'topics' | 'calendar' | 'student-scores' | 'summative-assessment'

// Extend types locally to allow students array on class_section
interface ClassSectionWithStudents extends ClassSection {
  students?: Student[];
}
interface SubjectWithClassSectionStudents extends Subject {
  class_section?: ClassSectionWithStudents;
}

const SubjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error } = useSubjectDetail(id)
  const [activeTab, setActiveTab] = useState<TabType>('student-scores')

  const subject = data?.data as SubjectWithClassSectionStudents;
  
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-gray-600">Loading subject info...</span>
        </div>
      </div>
    )
  }

  if (error || !subject) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpenIcon className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Subject Not Found</h3>
          <p className="text-gray-500 mb-6">{error ? (error as any).message : "The subject you're looking for doesn't exist."}</p>
          <Link
            to="/assigned-subjects"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Back to Assigned Subjects
          </Link>
        </div>
      </div>
    )
  }

  const tabs = [
    {
      id: 'class-record' as TabType,
      label: 'Class Record',
      icon: DocumentTextIcon,
    },
    {
      id: 'student-scores' as TabType,
      label: 'Student Scores',
      icon: UserGroupIcon,
    },
    {
      id: 'summative-assessment' as TabType,
      label: 'Components of Summative Assessment',
      icon: ListBulletIcon,
    },
    // {
    //   id: 'topics' as TabType,
    //   label: 'Topics',
    //   icon: ListBulletIcon,
    // },
    // {
    //   id: 'calendar' as TabType,
    //   label: 'Calendar of Events',
    //   icon: CalendarIcon,
    // },
  ]

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
            <Link
              to="/assigned-subjects"
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <BookOpenIcon className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{subject.title}</h1>
              {subject.variant && (
                <p className="text-sm text-gray-600">{subject.variant}</p>
              )}
            </div>
          </div>
        </div>

        {/* Subject Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <AcademicCapIcon className="w-4 h-4" />
            <span>{subject.class_section?.grade_level} - {subject.class_section?.title}</span>
          </div>
          
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <BuildingOfficeIcon className="w-4 h-4" />
            <span>{subject.institution?.title}</span>
          </div>
          
          {subject.start_time && subject.end_time && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <ClockIcon className="w-4 h-4" />
              <span>{subject.start_time} - {subject.end_time}</span>
            </div>
          )}
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <UserGroupIcon className="w-4 h-4" />
            <span>{subject.class_section?.students?.length ?? 0} students</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'class-record' && <ClassRecordTab key={`${subject.id}-${subject.class_section_id}`} subjectId={subject.id} classSectionId={subject.class_section_id} />}
          {activeTab === 'student-scores' && <StudentScoresTab key={`${subject.id}-${subject.class_section_id}`} subjectId={subject.id} classSectionId={subject.class_section_id} />}
          {activeTab === 'summative-assessment' && <SummativeAssessmentTab subjectId={subject.id} />}
          {activeTab === 'topics' && <TopicsTab subjectId={subject.id} />}
          {activeTab === 'calendar' && <CalendarTab subjectId={subject.id} />}
        </div>
      </div>
    </motion.div>
  )
}

export default SubjectDetail 