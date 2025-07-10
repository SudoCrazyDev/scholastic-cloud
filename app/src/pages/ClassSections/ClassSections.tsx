import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ClassSectionHeader, ClassSectionList, ClassSectionModal, ClassSectionSubjects, ClassSectionSubjectModal } from './components'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { Alert } from '../../components/alert'
import { useClassSections } from '../../hooks/useClassSections'
import { useSubjects } from '../../hooks/useSubjects'
import { useAuth } from '../../hooks/useAuth'
import type { ClassSection, Subject } from '../../types'

const ClassSections: React.FC = () => {
  const { user } = useAuth()
  const institutionId = user?.user_institutions?.[0]?.institution_id || ''
  
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

  // State management for selected class section
  const [selectedClassSection, setSelectedClassSection] = useState<ClassSection | null>(null)

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

  // Subjects API integration
  const {
    subjects,
    loading: subjectsLoading,
    error: subjectsError,
    isModalOpen: isSubjectModalOpen,
    editingSubject,
    modalLoading: subjectModalLoading,
    modalError: subjectModalError,
    modalSuccess: subjectModalSuccess,
    deleteConfirmation: subjectDeleteConfirmation,
    handleCreate: handleCreateSubject,
    handleEdit: handleEditSubject,
    handleDelete: handleDeleteSubject,
    handleModalSubmit: handleSubjectSubmit,
    handleModalClose: handleSubjectModalClose,
    handleDeleteConfirmationClose: handleSubjectDeleteConfirmationClose,
    reorderMutation,
    refetch: refetchSubjects,
  } = useSubjects({
    class_section_id: selectedClassSection?.id,
    institution_id: institutionId,
  })

  const gradeLevels = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']

  // Helper function to build hierarchical structure
  const buildSubjectHierarchy = (subjects: Subject[]) => {
    const subjectMap = new Map<string, Subject>()
    const rootSubjects: Subject[] = []

    // First pass: create map and identify root subjects
    subjects.forEach(subject => {
      subjectMap.set(subject.id, { ...subject, childSubjects: [] })
      if (!subject.parent_subject_id) {
        rootSubjects.push(subjectMap.get(subject.id)!)
      }
    })

    // Second pass: build hierarchy
    subjects.forEach(subject => {
      if (subject.parent_subject_id && subjectMap.has(subject.parent_subject_id)) {
        const parent = subjectMap.get(subject.parent_subject_id)!
        if (!parent.childSubjects) parent.childSubjects = []
        parent.childSubjects.push(subjectMap.get(subject.id)!)
      }
    })

    return rootSubjects
  }

  // Filtered subjects for selected class section
  const filteredSubjects = selectedClassSection 
    ? buildSubjectHierarchy(subjects)
    : []

  const handleReorderSubjects = async (classSectionId: string, subjectOrders: Array<{ id: string; order: number }>) => {
    try {
      await reorderMutation.mutateAsync({ classSectionId, subjectOrders })
    } catch (error) {
      // Error is handled in the mutation onError
      throw error
    }
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

      {subjectModalSuccess && (
        <Alert
          type="success"
          message={subjectModalSuccess}
          onClose={() => handleSubjectModalClose()}
          show={true}
        />
      )}
      
      {subjectModalError && (
        <Alert
          type="error"
          message={subjectModalError}
          onClose={() => handleSubjectModalClose()}
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
            loading={subjectsLoading}
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
        onClose={handleSubjectModalClose}
        onSubmit={handleSubjectSubmit}
        subject={editingSubject}
        classSectionId={selectedClassSection?.id || ''}
        institutionId={institutionId}
        parentSubjects={subjects.filter(s => 
          selectedClassSection && 
          s.class_section_id === selectedClassSection.id && 
          s.subject_type === 'parent'
        )}
        loading={subjectModalLoading}
        error={subjectModalError}
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
        onClose={handleSubjectDeleteConfirmationClose}
        onConfirm={subjectDeleteConfirmation.onConfirm}
        title={subjectDeleteConfirmation.title}
        message={subjectDeleteConfirmation.message}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={subjectDeleteConfirmation.loading}
      />
    </motion.div>
  )
}

export default ClassSections 