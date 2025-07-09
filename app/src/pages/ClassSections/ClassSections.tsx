import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ClassSectionHeader, ClassSectionList, ClassSectionModal, ClassSectionSubjects, ClassSectionSubjectModal } from './components'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import type { ClassSection, ClassSectionSubject } from '../../types'

const ClassSections: React.FC = () => {
  // Mock data for demonstration
  const [classSections, setClassSections] = useState<ClassSection[]>([
    {
      id: '1',
      grade_level: 'Grade 7',
      title: 'Section A',
      adviser: 'John Doe',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '2',
      grade_level: 'Grade 8',
      title: 'Section B',
      adviser: 'Jane Smith',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '3',
      grade_level: 'Grade 9',
      title: 'Section C',
      adviser: 'Mike Johnson',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }
  ])

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

  // State management
  const [selectedClassSection, setSelectedClassSection] = useState<ClassSection | null>(null)
  const [isClassSectionModalOpen, setIsClassSectionModalOpen] = useState(false)
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false)
  const [editingClassSection, setEditingClassSection] = useState<ClassSection | null>(null)
  const [editingSubject, setEditingSubject] = useState<ClassSectionSubject | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean
    type: 'classSection' | 'subject'
    item: ClassSection | ClassSectionSubject | null
    onConfirm: () => void
  }>({
    isOpen: false,
    type: 'classSection',
    item: null,
    onConfirm: () => {}
  })

  // Filter and search state
  const [gradeFilter, setGradeFilter] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState<string>('')

  const gradeLevels = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']

  // Filtered class sections
  const filteredClassSections = classSections.filter(section => {
    const matchesGrade = !gradeFilter || section.grade_level === gradeFilter
    const matchesSearch = !searchTerm || 
      section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      section.adviser.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesGrade && matchesSearch
  })

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

  // Handlers
  const handleCreateClassSection = () => {
    setEditingClassSection(null)
    setIsClassSectionModalOpen(true)
  }

  const handleEditClassSection = (classSection: ClassSection) => {
    setEditingClassSection(classSection)
    setIsClassSectionModalOpen(true)
  }

  const handleDeleteClassSection = (classSection: ClassSection) => {
    setDeleteConfirmation({
      isOpen: true,
      type: 'classSection',
      item: classSection,
      onConfirm: () => {
        console.log('Delete class section:', classSection.id)
        setClassSections(prevSections => 
          prevSections.filter(section => section.id !== classSection.id)
        )
        // Also remove subjects for this class section
        setSubjects(prevSubjects => 
          prevSubjects.filter(subject => subject.class_section_id !== classSection.id)
        )
        // Clear selection if the deleted section was selected
        if (selectedClassSection?.id === classSection.id) {
          setSelectedClassSection(null)
        }
        setDeleteConfirmation({ isOpen: false, type: 'classSection', item: null, onConfirm: () => {} })
      }
    })
  }

  const handleClassSectionSubmit = async (data: any) => {
    console.log('Class section submit:', data)
    
    if (editingClassSection) {
      // Update existing class section
      setClassSections(prevSections => 
        prevSections.map(section => 
          section.id === editingClassSection.id 
            ? { ...section, ...data }
            : section
        )
      )
    } else {
      // Create new class section
      const newClassSection: ClassSection = {
        id: Date.now().toString(), // Temporary ID for demo
        grade_level: data.grade_level,
        title: data.title,
        adviser: data.adviser,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      setClassSections(prevSections => [...prevSections, newClassSection])
    }
    
    setIsClassSectionModalOpen(false)
  }

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
    setDeleteConfirmation({
      isOpen: true,
      type: 'subject',
      item: subject,
      onConfirm: () => {
        console.log('Delete subject:', subject.id)
        setSubjects(prevSubjects => 
          prevSubjects.filter(s => s.id !== subject.id)
        )
        setDeleteConfirmation({ isOpen: false, type: 'subject', item: null, onConfirm: () => {} })
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

  // Helper function to flatten hierarchical subjects back to flat array
  const flattenSubjects = (subjects: ClassSectionSubject[]): ClassSectionSubject[] => {
    const result: ClassSectionSubject[] = []
    subjects.forEach(subject => {
      result.push({ ...subject, children: undefined }) // Remove children for flat storage
      if (subject.children && subject.children.length > 0) {
        result.push(...flattenSubjects(subject.children))
      }
    })
    return result
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <ClassSectionHeader onCreate={handleCreateClassSection} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* First Column - Class Sections List */}
        <div className="space-y-4">
          <ClassSectionList
            classSections={filteredClassSections}
            selectedClassSection={selectedClassSection}
            gradeFilter={gradeFilter}
            searchTerm={searchTerm}
            gradeLevels={gradeLevels}
            onGradeFilterChange={setGradeFilter}
            onSearchChange={setSearchTerm}
            onSelectClassSection={setSelectedClassSection}
            onEdit={handleEditClassSection}
            onDelete={handleDeleteClassSection}
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
        isOpen={isClassSectionModalOpen}
        onClose={() => setIsClassSectionModalOpen(false)}
        onSubmit={handleClassSectionSubmit}
        classSection={editingClassSection}
        gradeLevels={gradeLevels}
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

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, type: 'classSection', item: null, onConfirm: () => {} })}
        onConfirm={deleteConfirmation.onConfirm}
        title={`Delete ${deleteConfirmation.type === 'classSection' ? 'Class Section' : 'Subject'}`}
        message={`Are you sure you want to delete this ${deleteConfirmation.type === 'classSection' ? 'class section' : 'subject'}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </motion.div>
  )
}

export default ClassSections 