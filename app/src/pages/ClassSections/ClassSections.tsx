import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ClassSectionHeader, ClassSectionList, ClassSectionModal, ClassSectionSubjects, ClassSectionSubjectModal } from './components'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { Alert } from '../../components/alert'
import { useClassSections } from '../../hooks/useClassSections'
import type { ClassSection, ClassSectionSubject } from '../../types'

const ClassSections: React.FC = () => {
  // State for search and filters
  const [searchValue, setSearchValue] = useState<string>('')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [gradeFilter, setGradeFilter] = useState<string>('')

  // API integration with TanStack Query
  const {
    classSections,
    loading,
    error,
    isModalOpen,
    editingClassSection,
    modalLoading,
    modalError,
    modalSuccess,
    deleteConfirmation,
    handleCreate,
    handleEdit,
    handleDelete,
    handleModalSubmit,
    handleModalClose,
    handleDeleteConfirmationClose,
    handleSearchChange: hookHandleSearchChange,
    handlePageChange: hookHandlePageChange,
    handleGradeFilterChange: hookHandleGradeFilterChange,
  } = useClassSections({
    search: searchValue,
    page: currentPage,
    grade_level: gradeFilter,
  })

  // Wrapper handlers to update local state
  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    hookHandleSearchChange(value)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    hookHandlePageChange(page)
  }

  const handleGradeFilterChange = (grade: string) => {
    setGradeFilter(grade)
    hookHandleGradeFilterChange(grade)
  }

  // Mock data for subjects (since there's no API for subjects yet)
  const [subjects, setSubjects] = useState<ClassSectionSubject[]>([
    {
      id: '1',
      class_section_id: '1',
      title: 'Mathematics',
      start_time: '08:00',
      end_time: '09:00',
      subject_teacher: 'Dr. Smith',
      order: 1,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '2',
      class_section_id: '1',
      title: 'Science',
      start_time: '09:00',
      end_time: '10:00',
      subject_teacher: 'Prof. Brown',
      order: 2,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '3',
      class_section_id: '1',
      title: 'MAPEH',
      start_time: '10:00',
      end_time: '12:00',
      order: 3,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '4',
      class_section_id: '1',
      title: 'PE',
      start_time: '10:00',
      end_time: '10:45',
      subject_teacher: 'Coach Wilson',
      parent_id: '3',
      order: 1,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '5',
      class_section_id: '1',
      title: 'Arts',
      start_time: '10:45',
      end_time: '11:30',
      subject_teacher: 'Ms. Rodriguez',
      parent_id: '3',
      order: 2,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '6',
      class_section_id: '1',
      title: 'Music',
      start_time: '11:30',
      end_time: '12:00',
      subject_teacher: 'Mr. Thompson',
      parent_id: '3',
      order: 3,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '7',
      class_section_id: '1',
      title: 'English',
      start_time: '13:00',
      end_time: '14:00',
      subject_teacher: 'Ms. Johnson',
      order: 4,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '8',
      class_section_id: '1',
      title: 'TLE',
      variant: 'Sewing',
      start_time: '14:00',
      end_time: '15:00',
      subject_teacher: 'Mrs. Garcia',
      order: 5,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '9',
      class_section_id: '1',
      title: 'TLE',
      variant: 'Machineries',
      start_time: '15:00',
      end_time: '16:00',
      subject_teacher: 'Mr. Santos',
      order: 6,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '10',
      class_section_id: '1',
      title: 'TLE',
      variant: 'Plumbing',
      start_time: '16:00',
      end_time: '17:00',
      subject_teacher: 'Engr. Lopez',
      order: 7,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }
  ])

  // State management for subjects
  const [selectedClassSection, setSelectedClassSection] = useState<ClassSection | null>(null)
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<ClassSectionSubject | null>(null)
  const [subjectDeleteConfirmation, setSubjectDeleteConfirmation] = useState<{
    isOpen: boolean
    item: ClassSectionSubject | null
    onConfirm: () => void
  }>({
    isOpen: false,
    item: null,
    onConfirm: () => {}
  })

  const gradeLevels = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']

  // Helper function to build hierarchical structure
  const buildSubjectHierarchy = (subjects: ClassSectionSubject[]) => {
    const subjectMap = new Map<string, ClassSectionSubject>()
    const rootSubjects: ClassSectionSubject[] = []

    // First pass: create map and identify root subjects
    subjects.forEach(subject => {
      subjectMap.set(subject.id, { ...subject, children: [] })
      if (!subject.parent_id) {
        rootSubjects.push(subjectMap.get(subject.id)!)
      }
    })

    // Second pass: build hierarchy
    subjects.forEach(subject => {
      if (subject.parent_id && subjectMap.has(subject.parent_id)) {
        const parent = subjectMap.get(subject.parent_id)!
        if (!parent.children) parent.children = []
        parent.children.push(subjectMap.get(subject.id)!)
      }
    })

    // Sort both root and children by order
    rootSubjects.sort((a, b) => a.order - b.order)
    rootSubjects.forEach(subject => {
      if (subject.children) {
        subject.children.sort((a, b) => a.order - b.order)
      }
    })

    return rootSubjects
  }

  // Filtered subjects for selected class section
  const filteredSubjects = selectedClassSection 
    ? buildSubjectHierarchy(
        subjects.filter(subject => subject.class_section_id === selectedClassSection.id)
      )
    : []

  // Subject handlers
  const handleCreateSubject = () => {
    if (!selectedClassSection) return
    setEditingSubject(null)
    setIsSubjectModalOpen(true)
  }

  const handleEditSubject = (subject: ClassSectionSubject) => {
    setEditingSubject(subject)
    setIsSubjectModalOpen(true)
  }

  const handleDeleteSubject = (subject: ClassSectionSubject) => {
    setSubjectDeleteConfirmation({
      isOpen: true,
      item: subject,
      onConfirm: () => {
        console.log('Delete subject:', subject.id)
        setSubjects(prevSubjects => 
          prevSubjects.filter(s => s.id !== subject.id)
        )
        setSubjectDeleteConfirmation({ isOpen: false, item: null, onConfirm: () => {} })
      }
    })
  }

  const handleSubjectSubmit = async (data: any) => {
    console.log('Subject submit:', data)
    
    if (editingSubject) {
      // Update existing subject
      setSubjects(prevSubjects => 
        prevSubjects.map(subject => 
          subject.id === editingSubject.id 
            ? { ...subject, ...data }
            : subject
        )
      )
    } else {
      // Create new subject
      const newSubject: ClassSectionSubject = {
        id: Date.now().toString(), // Temporary ID for demo
        class_section_id: data.class_section_id,
        title: data.title,
        variant: data.variant,
        start_time: data.start_time,
        end_time: data.end_time,
        subject_teacher: data.subject_teacher,
        order: subjects.filter(s => s.class_section_id === data.class_section_id).length + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      setSubjects(prevSubjects => [...prevSubjects, newSubject])
    }
    
    setIsSubjectModalOpen(false)
  }

  const handleReorderSubjects = (reorderedSubjects: ClassSectionSubject[]) => {
    console.log('Reordered subjects:', reorderedSubjects)
    setSubjects(prevSubjects => {
      // The reorderedSubjects are already flattened from the component
      // We just need to update the subjects for the selected class section
      const otherSubjects = prevSubjects.filter(subject => 
        subject.class_section_id !== selectedClassSection?.id
      )
      
      // Ensure all subjects have the correct class_section_id
      const updatedReorderedSubjects = reorderedSubjects.map(subject => ({
        ...subject,
        class_section_id: selectedClassSection?.id || ''
      }))
      
      return [...otherSubjects, ...updatedReorderedSubjects]
    })
  }

  // Show error alert if there's an API error
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <Alert
          type="error"
          title="Error Loading Class Sections"
          message={error.message || 'Failed to load class sections. Please try again.'}
          show={true}
        />
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Success/Error Alerts */}
      {modalSuccess && (
        <Alert
          type="success"
          message={modalSuccess}
          onClose={() => handleModalClose()}
          show={true}
        />
      )}
      
      {modalError && (
        <Alert
          type="error"
          message={modalError}
          onClose={() => handleModalClose()}
          show={true}
        />
      )}

      {/* Header */}
      <ClassSectionHeader onCreate={handleCreate} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* First Column - Class Sections List */}
        <div className="space-y-4">
          <ClassSectionList
            classSections={classSections}
            selectedClassSection={selectedClassSection}
            gradeFilter={gradeFilter}
            searchTerm={searchValue}
            gradeLevels={gradeLevels}
            onGradeFilterChange={handleGradeFilterChange}
            onSearchChange={handleSearchChange}
            onSelectClassSection={setSelectedClassSection}
            onEdit={handleEdit}
            onDelete={handleDelete}
            loading={loading}
          />
        </div>

        {/* Second Column - Subjects */}
        <div className="space-y-4">
          <ClassSectionSubjects
            selectedClassSection={selectedClassSection}
            subjects={filteredSubjects}
            onCreateSubject={handleCreateSubject}
            onEditSubject={handleEditSubject}
            onDeleteSubject={handleDeleteSubject}
            onReorderSubjects={handleReorderSubjects}
          />
        </div>
      </div>

      {/* Class Section Modal */}
      <ClassSectionModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        classSection={editingClassSection}
        gradeLevels={gradeLevels}
        loading={modalLoading}
      />

      {/* Subject Modal */}
      <ClassSectionSubjectModal
        isOpen={isSubjectModalOpen}
        onClose={() => setIsSubjectModalOpen(false)}
        onSubmit={handleSubjectSubmit}
        subject={editingSubject}
        classSectionId={selectedClassSection?.id || ''}
        parentSubjects={subjects.filter(s => 
          selectedClassSection && 
          s.class_section_id === selectedClassSection.id && 
          !s.parent_id && 
          !s.subject_teacher
        )}
      />

      {/* Delete Confirmation Modal for Class Sections */}
      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={handleDeleteConfirmationClose}
        onConfirm={deleteConfirmation.onConfirm}
        title={deleteConfirmation.title}
        message={deleteConfirmation.message}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleteConfirmation.loading}
      />

      {/* Delete Confirmation Modal for Subjects */}
      <ConfirmationModal
        isOpen={subjectDeleteConfirmation.isOpen}
        onClose={() => setSubjectDeleteConfirmation({ isOpen: false, item: null, onConfirm: () => {} })}
        onConfirm={subjectDeleteConfirmation.onConfirm}
        title="Delete Subject"
        message={`Are you sure you want to delete this subject? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </motion.div>
  )
}

export default ClassSections 