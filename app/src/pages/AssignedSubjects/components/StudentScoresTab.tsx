import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  UserGroupIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  AcademicCapIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  UserIcon,
  UsersIcon
} from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { AddGradeItemModal } from './AddGradeItemModal'

interface StudentScoresTabProps {
  subjectId: string
  classSectionId: string
}

// Types for the grading system
interface GradeItem {
  id: string
  title: string
  date: string
  description: string
  total_score: number
  category: 'Written Works' | 'Performance Tasks' | 'Quarterly Assessment'
  quarter: 'First Quarter' | 'Second Quarter' | 'Third Quarter' | 'Fourth Quarter'
}

interface StudentScore {
  student_id: string
  item_id: string
  score: number
  date_submitted?: string
}

interface Student {
  id: string
  lrn: string
  first_name: string
  middle_name?: string
  last_name: string
  ext_name?: string
  gender: 'male' | 'female' | 'other'
  profile_picture?: string
}

// Placeholder data for grade items
const placeholderGradeItems: GradeItem[] = [
  // First Quarter - Written Works
  { id: 'q1-ww-1', title: 'Quiz 1: Basic Operations', date: '2024-08-15', description: 'Addition and subtraction', total_score: 10, category: 'Written Works', quarter: 'First Quarter' },
  { id: 'q1-ww-2', title: 'Quiz 2: Multiplication', date: '2024-08-20', description: 'Multiplication tables', total_score: 10, category: 'Written Works', quarter: 'First Quarter' },
  { id: 'q1-ww-3', title: 'Assignment 1: Word Problems', date: '2024-08-25', description: 'Simple word problems', total_score: 10, category: 'Written Works', quarter: 'First Quarter' },
  
  // First Quarter - Performance Tasks
  { id: 'q1-pt-1', title: 'Group Project: Math Games', date: '2024-08-18', description: 'Create educational games', total_score: 10, category: 'Performance Tasks', quarter: 'First Quarter' },
  { id: 'q1-pt-2', title: 'Individual Presentation', date: '2024-08-25', description: 'Present math concepts', total_score: 10, category: 'Performance Tasks', quarter: 'First Quarter' },
  
  // First Quarter - Quarterly Assessment
  { id: 'q1-qa-1', title: 'First Quarter Exam', date: '2024-10-25', description: 'Comprehensive quarter exam', total_score: 100, category: 'Quarterly Assessment', quarter: 'First Quarter' },
  
  // Second Quarter - Written Works
  { id: 'q2-ww-1', title: 'Quiz 1: Advanced Topics', date: '2024-11-01', description: 'Advanced math topic 1', total_score: 10, category: 'Written Works', quarter: 'Second Quarter' },
  { id: 'q2-ww-2', title: 'Quiz 2: Complex Operations', date: '2024-11-08', description: 'Complex math operations', total_score: 10, category: 'Written Works', quarter: 'Second Quarter' },
  
  // Second Quarter - Performance Tasks
  { id: 'q2-pt-1', title: 'Performance Task 1', date: '2024-11-05', description: 'Advanced performance task 1', total_score: 10, category: 'Performance Tasks', quarter: 'Second Quarter' },
  { id: 'q2-pt-2', title: 'Performance Task 2', date: '2024-11-12', description: 'Advanced performance task 2', total_score: 10, category: 'Performance Tasks', quarter: 'Second Quarter' },
  
  // Second Quarter - Quarterly Assessment
  { id: 'q2-qa-1', title: 'Second Quarter Exam', date: '2024-12-15', description: 'Comprehensive quarter exam', total_score: 100, category: 'Quarterly Assessment', quarter: 'Second Quarter' },
]

// Placeholder students data with 60 students for better demonstration
const placeholderStudents: Student[] = [
  // Male Students (30)
  { id: '1', lrn: '123456789001', first_name: 'Alejandro', last_name: 'Aguilar', gender: 'male' },
  { id: '2', lrn: '123456789002', first_name: 'Benjamin', last_name: 'Alvarez', gender: 'male' },
  { id: '3', lrn: '123456789003', first_name: 'Carlos', last_name: 'Andrade', gender: 'male' },
  { id: '4', lrn: '123456789004', first_name: 'Daniel', last_name: 'Bautista', gender: 'male' },
  { id: '5', lrn: '123456789005', first_name: 'Eduardo', last_name: 'Cabrera', gender: 'male' },
  { id: '6', lrn: '123456789006', first_name: 'Fernando', last_name: 'Campos', gender: 'male' },
  { id: '7', lrn: '123456789007', first_name: 'Gabriel', last_name: 'Cardenas', gender: 'male' },
  { id: '8', lrn: '123456789008', first_name: 'Hector', last_name: 'Castillo', gender: 'male' },
  { id: '9', lrn: '123456789009', first_name: 'Ignacio', last_name: 'Cervantes', gender: 'male' },
  { id: '10', lrn: '123456789010', first_name: 'Javier', last_name: 'Chavez', gender: 'male' },
  { id: '11', lrn: '123456789011', first_name: 'Kevin', last_name: 'Cruz', gender: 'male' },
  { id: '12', lrn: '123456789012', first_name: 'Luis', last_name: 'Dela Cruz', gender: 'male' },
  { id: '13', lrn: '123456789013', first_name: 'Manuel', last_name: 'Diaz', gender: 'male' },
  { id: '14', lrn: '123456789014', first_name: 'Nicolas', last_name: 'Escobar', gender: 'male' },
  { id: '15', lrn: '123456789015', first_name: 'Oscar', last_name: 'Espinoza', gender: 'male' },
  { id: '16', lrn: '123456789016', first_name: 'Pablo', last_name: 'Fernandez', gender: 'male' },
  { id: '17', lrn: '123456789017', first_name: 'Quentin', last_name: 'Flores', gender: 'male' },
  { id: '18', lrn: '123456789018', first_name: 'Rafael', last_name: 'Garcia', gender: 'male' },
  { id: '19', lrn: '123456789019', first_name: 'Samuel', last_name: 'Gomez', gender: 'male' },
  { id: '20', lrn: '123456789020', first_name: 'Tomas', last_name: 'Gonzalez', gender: 'male' },
  { id: '21', lrn: '123456789021', first_name: 'Victor', last_name: 'Gutierrez', gender: 'male' },
  { id: '22', lrn: '123456789022', first_name: 'Xavier', last_name: 'Hernandez', gender: 'male' },
  { id: '23', lrn: '123456789023', first_name: 'Yago', last_name: 'Jimenez', gender: 'male' },
  { id: '24', lrn: '123456789024', first_name: 'Zachary', last_name: 'Lopez', gender: 'male' },
  { id: '25', lrn: '123456789025', first_name: 'Adrian', last_name: 'Martinez', gender: 'male' },
  { id: '26', lrn: '123456789026', first_name: 'Bruno', last_name: 'Mendoza', gender: 'male' },
  { id: '27', lrn: '123456789027', first_name: 'Cesar', last_name: 'Morales', gender: 'male' },
  { id: '28', lrn: '123456789028', first_name: 'David', last_name: 'Moreno', gender: 'male' },
  { id: '29', lrn: '123456789029', first_name: 'Emilio', last_name: 'Navarro', gender: 'male' },
  { id: '30', lrn: '123456789030', first_name: 'Felipe', last_name: 'Ortiz', gender: 'male' },
  
  // Female Students (30)
  { id: '31', lrn: '123456789031', first_name: 'Adriana', last_name: 'Perez', gender: 'female' },
  { id: '32', lrn: '123456789032', first_name: 'Beatriz', last_name: 'Ramirez', gender: 'female' },
  { id: '33', lrn: '123456789033', first_name: 'Camila', last_name: 'Reyes', gender: 'female' },
  { id: '34', lrn: '123456789034', first_name: 'Daniela', last_name: 'Rivera', gender: 'female' },
  { id: '35', lrn: '123456789035', first_name: 'Elena', last_name: 'Rodriguez', gender: 'female' },
  { id: '36', lrn: '123456789036', first_name: 'Fatima', last_name: 'Romero', gender: 'female' },
  { id: '37', lrn: '123456789037', first_name: 'Gabriela', last_name: 'Ruiz', gender: 'female' },
  { id: '38', lrn: '123456789038', first_name: 'Helena', last_name: 'Salazar', gender: 'female' },
  { id: '39', lrn: '123456789039', first_name: 'Isabella', last_name: 'Sanchez', gender: 'female' },
  { id: '40', lrn: '123456789040', first_name: 'Julia', last_name: 'Santos', gender: 'female' },
  { id: '41', lrn: '123456789041', first_name: 'Karina', last_name: 'Silva', gender: 'female' },
  { id: '42', lrn: '123456789042', first_name: 'Laura', last_name: 'Soto', gender: 'female' },
  { id: '43', lrn: '123456789043', first_name: 'Maria', last_name: 'Torres', gender: 'female' },
  { id: '44', lrn: '123456789044', first_name: 'Natalia', last_name: 'Valdez', gender: 'female' },
  { id: '45', lrn: '123456789045', first_name: 'Olivia', last_name: 'Vargas', gender: 'female' },
  { id: '46', lrn: '123456789046', first_name: 'Patricia', last_name: 'Vega', gender: 'female' },
  { id: '47', lrn: '123456789047', first_name: 'Quinn', last_name: 'Villa', gender: 'female' },
  { id: '48', lrn: '123456789048', first_name: 'Rosa', last_name: 'Villanueva', gender: 'female' },
  { id: '49', lrn: '123456789049', first_name: 'Sofia', last_name: 'Villareal', gender: 'female' },
  { id: '50', lrn: '123456789050', first_name: 'Teresa', last_name: 'Zamora', gender: 'female' },
  { id: '51', lrn: '123456789051', first_name: 'Valentina', last_name: 'Zavala', gender: 'female' },
  { id: '52', lrn: '123456789052', first_name: 'Wendy', last_name: 'Zuniga', gender: 'female' },
  { id: '53', lrn: '123456789053', first_name: 'Ximena', last_name: 'Acosta', gender: 'female' },
  { id: '54', lrn: '123456789054', first_name: 'Yolanda', last_name: 'Aguirre', gender: 'female' },
  { id: '55', lrn: '123456789055', first_name: 'Zara', last_name: 'Alvarado', gender: 'female' },
  { id: '56', lrn: '123456789056', first_name: 'Ana', last_name: 'Arias', gender: 'female' },
  { id: '57', lrn: '123456789057', first_name: 'Bianca', last_name: 'Avila', gender: 'female' },
  { id: '58', lrn: '123456789058', first_name: 'Carmen', last_name: 'Barajas', gender: 'female' },
  { id: '59', lrn: '123456789059', first_name: 'Diana', last_name: 'Beltran', gender: 'female' },
  { id: '60', lrn: '123456789060', first_name: 'Eva', last_name: 'Bravo', gender: 'female' },
]

interface ScoreInputProps {
  student: Student
  item: GradeItem
  currentScore: number
  onScoreChange: (studentId: string, itemId: string, score: number) => void
}

const ScoreInput: React.FC<ScoreInputProps> = ({ 
  student, 
  item, 
  currentScore, 
  onScoreChange
}) => {
  const [score, setScore] = useState(currentScore)

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = Number(e.target.value)
    if (numValue >= 0 && numValue <= item.total_score) {
      setScore(numValue)
      onScoreChange(student.id, item.id, numValue)
    }
  }

  const getScoreColor = (score: number, total: number) => {
    const percentage = (score / total) * 100
    if (percentage >= 90) return 'text-green-600'
    if (percentage >= 75) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBackground = (score: number, total: number) => {
    const percentage = (score / total) * 100
    if (percentage >= 90) return 'bg-green-50 border-green-200'
    if (percentage >= 75) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-white border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-indigo-600">
              {student.first_name.charAt(0)}{student.last_name.charAt(0)}
            </span>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {student.first_name} {student.last_name}
            </h4>
            <p className="text-xs text-gray-500">LRN: {student.lrn}</p>
          </div>
        </div>
      </div>
      
      <div className="flex items-center space-x-3">
        <div className={`text-sm font-medium ${getScoreColor(score, item.total_score)}`}>
          <span>{score}</span>
          <span className="text-gray-400">/{item.total_score}</span>
        </div>
        
        <div className="w-24">
          <Input
            type="number"
            min="0"
            max={item.total_score}
            value={score}
                         onChange={handleScoreChange}
            size="sm"
            className="text-center"
            variant="outlined"
          />
        </div>
      </div>
    </div>
  )
}

interface StudentGroupProps {
  gender: 'male' | 'female' | 'other'
  students: Student[]
  item: GradeItem
  scores: StudentScore[]
  onScoreChange: (studentId: string, itemId: string, score: number) => void
}

const StudentGroup: React.FC<StudentGroupProps> = ({ 
  gender, 
  students, 
  item, 
  scores, 
  onScoreChange 
}) => {
  const [isExpanded, setIsExpanded] = useState(true)

  const getGenderIcon = (gender: string) => {
    switch (gender) {
      case 'male':
        return <UserIcon className="w-4 h-4 text-blue-600" />
      case 'female':
        return <UsersIcon className="w-4 h-4 text-pink-600" />
      default:
        return <UserGroupIcon className="w-4 h-4 text-gray-600" />
    }
  }

  const getGenderColor = (gender: string) => {
    switch (gender) {
      case 'male':
        return 'bg-blue-50 border-blue-200'
      case 'female':
        return 'bg-pink-50 border-pink-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const getGenderText = (gender: string) => {
    switch (gender) {
      case 'male':
        return 'Male Students'
      case 'female':
        return 'Female Students'
      default:
        return 'Other Students'
    }
  }

  return (
    <div className={`rounded-lg border ${getGenderColor(gender)}`}>
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          {getGenderIcon(gender)}
          <div>
            <h3 className="text-sm font-medium text-gray-900">{getGenderText(gender)}</h3>
            <p className="text-xs text-gray-500">{students.length} students</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="text-xs text-gray-500">
            {isExpanded ? 'Collapse' : 'Expand'}
          </div>
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white rounded-b-lg">
          {students.map((student) => {
            const score = scores.find(s => s.student_id === student.id && s.item_id === item.id)?.score || 0
            
            return (
              <ScoreInput
                key={`${student.id}-${item.id}`}
                student={student}
                item={item}
                currentScore={score}
                onScoreChange={onScoreChange}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface GradeItemSectionProps {
  item: GradeItem
  students: Student[]
  scores: StudentScore[]
  onScoreChange: (studentId: string, itemId: string, score: number) => void
}

const GradeItemSection: React.FC<GradeItemSectionProps> = ({ 
  item, 
  students, 
  scores, 
  onScoreChange 
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Group students by gender and sort alphabetically
  const groupedStudents = students.reduce((groups, student) => {
    const gender = student.gender
    if (!groups[gender]) {
      groups[gender] = []
    }
    groups[gender].push(student)
    return groups
  }, {} as Record<string, Student[]>)

  // Sort students by last name within each group
  Object.keys(groupedStudents).forEach(gender => {
    groupedStudents[gender].sort((a, b) => {
      const lastNameA = a.last_name.toLowerCase()
      const lastNameB = b.last_name.toLowerCase()
      return lastNameA.localeCompare(lastNameB)
    })
  })

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Written Works':
        return <DocumentTextIcon className="w-4 h-4 text-blue-600" />
      case 'Performance Tasks':
        return <AcademicCapIcon className="w-4 h-4 text-green-600" />
      case 'Quarterly Assessment':
        return <UserGroupIcon className="w-4 h-4 text-purple-600" />
      default:
        return <DocumentTextIcon className="w-4 h-4 text-gray-600" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Written Works':
        return 'bg-blue-50 border-blue-200'
      case 'Performance Tasks':
        return 'bg-green-50 border-green-200'
      case 'Quarterly Assessment':
        return 'bg-purple-50 border-purple-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  return (
    <div className={`rounded-lg border ${getCategoryColor(item.category)}`}>
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          {getCategoryIcon(item.category)}
          <div>
            <h3 className="text-sm font-medium text-gray-900">{item.title}</h3>
            <p className="text-xs text-gray-500">{item.description}</p>
            <div className="flex items-center space-x-2 mt-1">
              <CalendarIcon className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-500">{new Date(item.date).toLocaleDateString()}</span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-gray-500">{item.category}</span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-gray-500">{item.quarter}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm font-medium text-gray-900">
              {students.length} students
            </div>
            <div className="text-xs text-gray-500">
              Max: {item.total_score} pts
            </div>
          </div>
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white rounded-b-lg p-4 space-y-4">
          {Object.entries(groupedStudents).map(([gender, studentsInGroup]) => (
            <StudentGroup
              key={gender}
              gender={gender as 'male' | 'female' | 'other'}
              students={studentsInGroup}
              item={item}
              scores={scores}
              onScoreChange={onScoreChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const StudentScoresTab: React.FC<StudentScoresTabProps> = ({ subjectId, classSectionId }) => {
  const [students, setStudents] = useState<Student[]>([])
  const [gradeItems, setGradeItems] = useState<GradeItem[]>(placeholderGradeItems)
  const [scores, setScores] = useState<StudentScore[]>([
    // Mock initial scores for demonstration
    { student_id: '1', item_id: 'q1-ww-1', score: 8 },
    { student_id: '2', item_id: 'q1-ww-1', score: 9 },
    { student_id: '3', item_id: 'q1-ww-1', score: 7 },
    { student_id: '4', item_id: 'q1-ww-1', score: 10 },
    { student_id: '5', item_id: 'q1-ww-1', score: 8 },
    { student_id: '1', item_id: 'q1-pt-1', score: 9 },
    { student_id: '2', item_id: 'q1-pt-1', score: 8 },
    { student_id: '3', item_id: 'q1-pt-1', score: 10 },
    { student_id: '4', item_id: 'q1-pt-1', score: 7 },
    { student_id: '5', item_id: 'q1-pt-1', score: 9 },
    { student_id: '1', item_id: 'q1-qa-1', score: 85 },
    { student_id: '2', item_id: 'q1-qa-1', score: 92 },
    { student_id: '3', item_id: 'q1-qa-1', score: 78 },
    { student_id: '4', item_id: 'q1-qa-1', score: 88 },
    { student_id: '5', item_id: 'q1-qa-1', score: 90 },
  ])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeQuarter, setActiveQuarter] = useState<string>('First Quarter')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [showAddModal, setShowAddModal] = useState(false)

  // Load mock data
  useEffect(() => {
    const loadMockData = () => {
      setLoading(true)
      // Simulate API delay
      setTimeout(() => {
        setStudents(placeholderStudents)
        setLoading(false)
      }, 500)
    }

    loadMockData()
  }, [classSectionId])

  const handleScoreChange = (studentId: string, itemId: string, score: number) => {
    setScores(prev => {
      const existingIndex = prev.findIndex(s => s.student_id === studentId && s.item_id === itemId)
      
      if (existingIndex >= 0) {
        // Update existing score
        const newScores = [...prev]
        newScores[existingIndex] = { ...newScores[existingIndex], score }
        return newScores
      } else {
        // Add new score
        return [...prev, { student_id: studentId, item_id: itemId, score }]
      }
    })
  }

  const handleSaveAllScores = async () => {
    try {
      // Mock API call - simulate saving
      console.log('Saving scores:', scores)
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate API delay
      alert('Scores saved successfully!')
    } catch (error) {
      console.error('Error saving scores:', error)
      alert('Failed to save scores')
    }
  }

  const handleAddGradeItem = () => {
    setShowAddModal(true)
  }

  const handleGradeItemSuccess = () => {
    // In a real implementation, you would fetch the updated grade items
    // For now, just show success message
    alert('Grade item created successfully!')
    // You could also add the new item to the local state here
  }

  const quarters = ['First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter']
  const categories = ['All', 'Written Works', 'Performance Tasks', 'Quarterly Assessment']

  const filteredItems = gradeItems.filter(item => {
    const quarterMatch = activeQuarter === 'All' || item.quarter === activeQuarter
    const categoryMatch = activeCategory === 'All' || item.category === activeCategory
    return quarterMatch && categoryMatch
  })

  // Calculate statistics
  const totalStudents = students.length
  const totalItems = filteredItems.length
  const totalScores = scores.length
  const completionRate = totalItems > 0 ? Math.round((totalScores / (totalStudents * totalItems)) * 100) : 0

  // Gender distribution
  const genderDistribution = students.reduce((acc, student) => {
    acc[student.gender] = (acc[student.gender] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Data</h3>
        <p className="text-gray-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Student Scores</h3>
          <p className="text-sm text-gray-500">Manage grades for {students.length} students</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleSaveAllScores}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
          >
            <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
            Save All Scores
          </button>
          <button 
            onClick={handleAddGradeItem}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Add Grade Item
          </button>
        </div>
      </div>

      {/* Student Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <UserGroupIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Students</p>
              <p className="text-lg font-semibold text-gray-900">{totalStudents}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <DocumentTextIcon className="w-4 h-4 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Grade Items</p>
              <p className="text-lg font-semibold text-gray-900">{totalItems}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="w-4 h-4 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Scores Entered</p>
              <p className="text-lg font-semibold text-gray-900">{totalScores}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <AcademicCapIcon className="w-4 h-4 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completion</p>
              <p className="text-lg font-semibold text-gray-900">{completionRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gender Distribution */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Student Distribution</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
            <UserIcon className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">Male Students</p>
              <p className="text-lg font-semibold text-blue-700">{genderDistribution.male || 0}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-pink-50 rounded-lg">
            <UsersIcon className="w-5 h-5 text-pink-600" />
            <div>
              <p className="text-sm font-medium text-pink-900">Female Students</p>
              <p className="text-lg font-semibold text-pink-700">{genderDistribution.female || 0}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <UserGroupIcon className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">Other Students</p>
              <p className="text-lg font-semibold text-gray-700">{genderDistribution.other || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Quarter Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quarter</label>
            <select
              value={activeQuarter}
              onChange={(e) => setActiveQuarter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="All">All Quarters</option>
              {quarters.map(quarter => (
                <option key={quarter} value={quarter}>{quarter}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grading System Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">Grading System</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
          <div>
            <span className="font-medium">Written Works:</span> 30% of Quarter Grade
          </div>
          <div>
            <span className="font-medium">Performance Tasks:</span> 50% of Quarter Grade
          </div>
          <div>
            <span className="font-medium">Quarterly Assessment:</span> 20% of Quarter Grade
          </div>
        </div>
      </div>

      {/* Grade Items */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Grade Items Found</h3>
            <p className="text-gray-500">No grade items match the current filters.</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <GradeItemSection
              key={item.id}
              item={item}
              students={students}
              scores={scores}
              onScoreChange={handleScoreChange}
            />
          ))
        )}
      </div>

      {/* Add Grade Item Modal */}
      <AddGradeItemModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        subjectId={subjectId}
        onSuccess={handleGradeItemSuccess}
      />
    </div>
  )
} 