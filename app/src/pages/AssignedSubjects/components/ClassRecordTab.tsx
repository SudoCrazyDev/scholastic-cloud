import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  UserIcon,
  UsersIcon,
  UserGroupIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  AcademicCapIcon,
  CalendarIcon,
  IdentificationIcon,
  CalculatorIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { useStudents } from '../../../hooks/useStudents'
import { useStudentRunningGrades } from '../../../hooks/useStudentRunningGrades'
import { StudentGradesByQuarter } from './StudentGradesByQuarter'
import { Alert } from '../../../components/alert'
import { ErrorHandler } from '../../../utils/errorHandler'
import type { Student } from '../../../types'

interface ClassRecordTabProps {
  subjectId: string
  classSectionId?: string
}

// Placeholder student data
const placeholderStudents: Student[] = [
  // 30 Male Students
  {
    id: '1',
    lrn: '123456789001',
    first_name: 'Juan',
    middle_name: 'Dela',
    last_name: 'Cruz',
    ext_name: 'Jr.',
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-05-15',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '2',
    lrn: '123456789002',
    first_name: 'Ahmed',
    middle_name: undefined,
    last_name: 'Hassan',
    ext_name: undefined,
    gender: 'male',
    religion: 'Islam',
    birthdate: '2010-03-10',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '3',
    lrn: '123456789003',
    first_name: 'Pedro',
    middle_name: 'Martinez',
    last_name: 'Lopez',
    ext_name: 'III',
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-07-18',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '4',
    lrn: '123456789004',
    first_name: 'Miguel',
    middle_name: 'Angel',
    last_name: 'Torres',
    ext_name: undefined,
    gender: 'male',
    religion: 'Baptists',
    birthdate: '2010-09-12',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '5',
    lrn: '123456789005',
    first_name: 'Carlos',
    middle_name: 'Jose',
    last_name: 'Reyes',
    ext_name: 'Sr.',
    gender: 'male',
    religion: 'Others',
    birthdate: '2010-12-03',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '6',
    lrn: '123456789006',
    first_name: 'Diego',
    middle_name: 'Alejandro',
    last_name: 'Vargas',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-01-30',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '7',
    lrn: '123456789007',
    first_name: 'Luis',
    middle_name: 'Fernando',
    last_name: 'Mendoza',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-04-22',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '8',
    lrn: '123456789008',
    first_name: 'Roberto',
    middle_name: 'Carlos',
    last_name: 'Silva',
    ext_name: undefined,
    gender: 'male',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-08-15',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '9',
    lrn: '123456789009',
    first_name: 'Antonio',
    middle_name: 'Manuel',
    last_name: 'Gonzalez',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-11-08',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '10',
    lrn: '123456789010',
    first_name: 'Javier',
    middle_name: 'Luis',
    last_name: 'Ramirez',
    ext_name: undefined,
    gender: 'male',
    religion: 'Baptists',
    birthdate: '2010-06-25',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '11',
    lrn: '123456789011',
    first_name: 'Fernando',
    middle_name: 'Jose',
    last_name: 'Herrera',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-02-14',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '12',
    lrn: '123456789012',
    first_name: 'Ricardo',
    middle_name: 'Antonio',
    last_name: 'Morales',
    ext_name: undefined,
    gender: 'male',
    religion: 'Others',
    birthdate: '2010-10-03',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '13',
    lrn: '123456789013',
    first_name: 'Eduardo',
    middle_name: 'Luis',
    last_name: 'Flores',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-07-30',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '14',
    lrn: '123456789014',
    first_name: 'Gabriel',
    middle_name: 'Alejandro',
    last_name: 'Reyes',
    ext_name: undefined,
    gender: 'male',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-12-18',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '15',
    lrn: '123456789015',
    first_name: 'Daniel',
    middle_name: 'Carlos',
    last_name: 'Castro',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-03-05',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '16',
    lrn: '123456789016',
    first_name: 'Alejandro',
    middle_name: 'Jose',
    last_name: 'Ortiz',
    ext_name: undefined,
    gender: 'male',
    religion: 'Baptists',
    birthdate: '2010-09-20',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '17',
    lrn: '123456789017',
    first_name: 'Manuel',
    middle_name: 'Antonio',
    last_name: 'Jimenez',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-05-12',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '18',
    lrn: '123456789018',
    first_name: 'Francisco',
    middle_name: 'Luis',
    last_name: 'Moreno',
    ext_name: undefined,
    gender: 'male',
    religion: 'Others',
    birthdate: '2010-01-25',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '19',
    lrn: '123456789019',
    first_name: 'Rafael',
    middle_name: 'Carlos',
    last_name: 'Delgado',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-08-08',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '20',
    lrn: '123456789020',
    first_name: 'Alberto',
    middle_name: 'Jose',
    last_name: 'Vega',
    ext_name: undefined,
    gender: 'male',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-11-15',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '21',
    lrn: '123456789021',
    first_name: 'Victor',
    middle_name: 'Manuel',
    last_name: 'Carrillo',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-04-30',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '22',
    lrn: '123456789022',
    first_name: 'Hector',
    middle_name: 'Luis',
    last_name: 'Rios',
    ext_name: undefined,
    gender: 'male',
    religion: 'Baptists',
    birthdate: '2010-06-10',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '23',
    lrn: '123456789023',
    first_name: 'Oscar',
    middle_name: 'Carlos',
    last_name: 'Mendez',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-02-28',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '24',
    lrn: '123456789024',
    first_name: 'Adrian',
    middle_name: 'Jose',
    last_name: 'Acosta',
    ext_name: undefined,
    gender: 'male',
    religion: 'Others',
    birthdate: '2010-10-22',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '25',
    lrn: '123456789025',
    first_name: 'Mario',
    middle_name: 'Antonio',
    last_name: 'Medina',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-07-05',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '26',
    lrn: '123456789026',
    first_name: 'Sergio',
    middle_name: 'Luis',
    last_name: 'Aguilar',
    ext_name: undefined,
    gender: 'male',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-12-12',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '27',
    lrn: '123456789027',
    first_name: 'Arturo',
    middle_name: 'Carlos',
    last_name: 'Paredes',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-03-18',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '28',
    lrn: '123456789028',
    first_name: 'Enrique',
    middle_name: 'Jose',
    last_name: 'Valdez',
    ext_name: undefined,
    gender: 'male',
    religion: 'Baptists',
    birthdate: '2010-09-03',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '29',
    lrn: '123456789029',
    first_name: 'Raul',
    middle_name: 'Manuel',
    last_name: 'Campos',
    ext_name: undefined,
    gender: 'male',
    religion: 'Catholic',
    birthdate: '2010-05-25',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '30',
    lrn: '123456789030',
    first_name: 'Tomas',
    middle_name: 'Luis',
    last_name: 'Salazar',
    ext_name: undefined,
    gender: 'male',
    religion: 'Others',
    birthdate: '2010-01-08',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  // 30 Female Students
  {
    id: '31',
    lrn: '123456789031',
    first_name: 'Maria',
    middle_name: 'Santos',
    last_name: 'Garcia',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-08-22',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '32',
    lrn: '123456789032',
    first_name: 'Fatima',
    middle_name: 'Al',
    last_name: 'Zahra',
    ext_name: undefined,
    gender: 'female',
    religion: 'Islam',
    birthdate: '2010-11-05',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '33',
    lrn: '123456789033',
    first_name: 'Ana',
    middle_name: 'Clara',
    last_name: 'Rodriguez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-02-28',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '34',
    lrn: '123456789034',
    first_name: 'Isabella',
    middle_name: 'Rose',
    last_name: 'Fernandez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-04-25',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '35',
    lrn: '123456789035',
    first_name: 'Sofia',
    middle_name: 'Elena',
    last_name: 'Morales',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-06-14',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '36',
    lrn: '123456789036',
    first_name: 'Valentina',
    middle_name: 'Maria',
    last_name: 'Silva',
    ext_name: undefined,
    gender: 'female',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-10-08',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '37',
    lrn: '123456789037',
    first_name: 'Camila',
    middle_name: 'Isabella',
    last_name: 'Torres',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-03-15',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '38',
    lrn: '123456789038',
    first_name: 'Gabriela',
    middle_name: 'Sofia',
    last_name: 'Lopez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Baptists',
    birthdate: '2010-07-20',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '39',
    lrn: '123456789039',
    first_name: 'Daniela',
    middle_name: 'Maria',
    last_name: 'Gonzalez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-09-12',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '40',
    lrn: '123456789040',
    first_name: 'Victoria',
    middle_name: 'Isabella',
    last_name: 'Perez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Others',
    birthdate: '2010-01-30',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '41',
    lrn: '123456789041',
    first_name: 'Lucia',
    middle_name: 'Sofia',
    last_name: 'Martinez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-05-08',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '42',
    lrn: '123456789042',
    first_name: 'Elena',
    middle_name: 'Maria',
    last_name: 'Hernandez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-11-25',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '43',
    lrn: '123456789043',
    first_name: 'Adriana',
    middle_name: 'Isabella',
    last_name: 'Ramirez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-04-18',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '44',
    lrn: '123456789044',
    first_name: 'Natalia',
    middle_name: 'Sofia',
    last_name: 'Flores',
    ext_name: undefined,
    gender: 'female',
    religion: 'Baptists',
    birthdate: '2010-08-05',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '45',
    lrn: '123456789045',
    first_name: 'Carolina',
    middle_name: 'Maria',
    last_name: 'Reyes',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-12-10',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '46',
    lrn: '123456789046',
    first_name: 'Fernanda',
    middle_name: 'Isabella',
    last_name: 'Castro',
    ext_name: undefined,
    gender: 'female',
    religion: 'Others',
    birthdate: '2010-02-22',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '47',
    lrn: '123456789047',
    first_name: 'Mariana',
    middle_name: 'Sofia',
    last_name: 'Ortiz',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-06-30',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '48',
    lrn: '123456789048',
    first_name: 'Alejandra',
    middle_name: 'Maria',
    last_name: 'Jimenez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-10-15',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '49',
    lrn: '123456789049',
    first_name: 'Paula',
    middle_name: 'Isabella',
    last_name: 'Moreno',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-03-28',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '50',
    lrn: '123456789050',
    first_name: 'Carmen',
    middle_name: 'Sofia',
    last_name: 'Delgado',
    ext_name: undefined,
    gender: 'female',
    religion: 'Baptists',
    birthdate: '2010-07-12',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '51',
    lrn: '123456789051',
    first_name: 'Rosa',
    middle_name: 'Maria',
    last_name: 'Vega',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-01-05',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '52',
    lrn: '123456789052',
    first_name: 'Teresa',
    middle_name: 'Isabella',
    last_name: 'Carrillo',
    ext_name: undefined,
    gender: 'female',
    religion: 'Others',
    birthdate: '2010-05-20',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '53',
    lrn: '123456789053',
    first_name: 'Patricia',
    middle_name: 'Sofia',
    last_name: 'Rios',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-09-08',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '54',
    lrn: '123456789054',
    first_name: 'Monica',
    middle_name: 'Maria',
    last_name: 'Mendez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-12-25',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '55',
    lrn: '123456789055',
    first_name: 'Veronica',
    middle_name: 'Isabella',
    last_name: 'Acosta',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-04-12',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '56',
    lrn: '123456789056',
    first_name: 'Beatriz',
    middle_name: 'Sofia',
    last_name: 'Medina',
    ext_name: undefined,
    gender: 'female',
    religion: 'Baptists',
    birthdate: '2010-08-30',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '57',
    lrn: '123456789057',
    first_name: 'Claudia',
    middle_name: 'Maria',
    last_name: 'Aguilar',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-02-14',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '58',
    lrn: '123456789058',
    first_name: 'Diana',
    middle_name: 'Isabella',
    last_name: 'Paredes',
    ext_name: undefined,
    gender: 'female',
    religion: 'Others',
    birthdate: '2010-06-18',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '59',
    lrn: '123456789059',
    first_name: 'Eva',
    middle_name: 'Sofia',
    last_name: 'Valdez',
    ext_name: undefined,
    gender: 'female',
    religion: 'Catholic',
    birthdate: '2010-10-28',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '60',
    lrn: '123456789060',
    first_name: 'Gloria',
    middle_name: 'Maria',
    last_name: 'Campos',
    ext_name: undefined,
    gender: 'female',
    religion: 'Iglesia Ni Cristo',
    birthdate: '2010-03-02',
    profile_picture: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  }
]

interface StudentCardProps {
  student: Student
}

interface StudentScores {
  q1: string
  q2: string
  q3: string
  q4: string
  final: string
}

const StudentCard: React.FC<StudentCardProps> = ({ student }) => {
  const [scores, setScores] = useState<StudentScores>({
    q1: '',
    q2: '',
    q3: '',
    q4: '',
    final: ''
  })

  const getFullName = (student: Student) => {
    const parts = [student.first_name, student.middle_name, student.last_name].filter(Boolean)
    const fullName = parts.join(' ')
    return student.ext_name ? `${fullName} ${student.ext_name}` : fullName
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const calculateAge = (birthdate: string) => {
    const birth = new Date(birthdate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    
    return age
  }

  const getGenderColor = (gender: string) => {
    switch (gender) {
      case 'male': return 'blue'
      case 'female': return 'pink'
      default: return 'zinc'
    }
  }

  const getReligionColor = (religion: string) => {
    switch (religion) {
      case 'Islam': return 'green'
      case 'Catholic': return 'purple'
      case 'Iglesia Ni Cristo': return 'blue'
      case 'Baptists': return 'indigo'
      case 'Others': return 'zinc'
      default: return 'zinc'
    }
  }

  const handleScoreChange = (field: keyof StudentScores, value: string) => {
    setScores(prev => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
    >
      <div className="flex items-start space-x-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {student.profile_picture ? (
            <img
              src={student.profile_picture}
              alt={getFullName(student)}
              className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
            />
          ) : (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
              student.gender === 'male' ? 'border-blue-200 bg-blue-100' : 'border-pink-200 bg-pink-100'
            }`}>
              <UserIcon className={`w-6 h-6 ${
                student.gender === 'male' ? 'text-blue-600' : 'text-pink-600'
              }`} />
            </div>
          )}
        </div>

        {/* Student Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {getFullName(student)}
            </h3>
          </div>
          
          <div className="flex items-center space-x-2 mb-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              student.gender === 'male' 
                ? 'bg-blue-100 text-blue-800' 
                : 'bg-pink-100 text-pink-800'
            }`}>
              {student.gender === 'male' ? 'Male' : 'Female'}
            </span>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              getReligionColor(student.religion) === 'green' ? 'bg-green-100 text-green-800' :
              getReligionColor(student.religion) === 'purple' ? 'bg-purple-100 text-purple-800' :
              getReligionColor(student.religion) === 'blue' ? 'bg-blue-100 text-blue-800' :
              getReligionColor(student.religion) === 'indigo' ? 'bg-indigo-100 text-indigo-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {student.religion}
            </span>
          </div>

          <div className="flex items-center space-x-4 mb-4">
            <div className="flex items-center text-xs text-gray-600">
              <IdentificationIcon className="w-3 h-3 mr-1 flex-shrink-0" />
              <span className="font-mono">LRN: {student.lrn}</span>
            </div>
            
            <div className="flex items-center text-xs text-gray-600">
              <CalendarIcon className="w-3 h-3 mr-1 flex-shrink-0" />
              <span>{formatDate(student.birthdate)} ({calculateAge(student.birthdate)} years old)</span>
            </div>
          </div>

          {/* Score Inputs */}
          <div className="grid grid-cols-5 gap-2">
            <Input
              label="Q1"
              size="sm"
              value={scores.q1}
              onChange={(e) => handleScoreChange('q1', e.target.value)}
              placeholder="0"
              type="number"
              min="0"
              max="100"
            />
            <Input
              label="Q2"
              size="sm"
              value={scores.q2}
              onChange={(e) => handleScoreChange('q2', e.target.value)}
              placeholder="0"
              type="number"
              min="0"
              max="100"
            />
            <Input
              label="Q3"
              size="sm"
              value={scores.q3}
              onChange={(e) => handleScoreChange('q3', e.target.value)}
              placeholder="0"
              type="number"
              min="0"
              max="100"
            />
            <Input
              label="Q4"
              size="sm"
              value={scores.q4}
              onChange={(e) => handleScoreChange('q4', e.target.value)}
              placeholder="0"
              type="number"
              min="0"
              max="100"
            />
            <Input
              label="Final"
              size="sm"
              value={scores.final}
              onChange={(e) => handleScoreChange('final', e.target.value)}
              placeholder="0"
              type="number"
              min="0"
              max="100"
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

interface GenderGroupProps {
  gender: 'male' | 'female' | 'other'
  students: Student[]
}

const GenderGroup: React.FC<GenderGroupProps> = ({ gender, students }) => {
  const [isExpanded, setIsExpanded] = useState(true)

  const getGenderIcon = (gender: string) => {
    switch (gender) {
      case 'male':
        return <UserIcon className="w-5 h-5 text-blue-600" />
      case 'female':
        return <UsersIcon className="w-5 h-5 text-pink-600" />
      default:
        return <UserGroupIcon className="w-5 h-5 text-gray-600" />
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
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          {getGenderIcon(gender)}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{getGenderText(gender)}</h3>
            <p className="text-sm text-gray-600">{students.length} students</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="text-sm text-gray-500">
            {isExpanded ? 'Collapse' : 'Expand'}
          </div>
          {isExpanded ? (
            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRightIcon className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white rounded-b-lg p-4">
          <div className="space-y-4">
            {students.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const ClassRecordTab: React.FC<ClassRecordTabProps> = ({ subjectId, classSectionId }) => {
  // Fetch students
  const { students, loading: studentsLoading, error: studentsError } = useStudents({ class_section_id: classSectionId });
  
  // Fetch running grades for all students
  const { data: runningGradesData, isLoading: gradesLoading, error: gradesError } = useStudentRunningGrades({
    subjectId,
    classSectionId,
  });

  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Quarter filter state for mobile/tablet
  const [selectedQuarter, setSelectedQuarter] = useState<string>('1');
  
  // Quarter options for the filter
  const quarterOptions = [
    { value: '1', label: 'Quarter 1' },
    { value: '2', label: 'Quarter 2' },
    { value: '3', label: 'Quarter 3' },
    { value: '4', label: 'Quarter 4' },
  ];

  // Handle errors
  useEffect(() => {
    if (studentsError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(studentsError).message });
    } else if (gradesError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(gradesError).message });
    } else {
      setAlert(null);
    }
  }, [studentsError, gradesError]);

  // Group running grades by student
  const gradesByStudent = runningGradesData?.data?.reduce((acc: any, grade: any) => {
    if (!acc[grade.student_id]) {
      acc[grade.student_id] = [];
    }
    acc[grade.student_id].push(grade);
    return acc;
  }, {}) || {};

  // Calculate statistics
  const totalStudents = students.length;
  const totalGrades = runningGradesData?.data?.length || 0;
  const gradesWithFinalGrade = runningGradesData?.data?.filter((grade: any) => grade.final_grade !== null).length || 0;
  const completionRate = totalGrades > 0 ? Math.round((gradesWithFinalGrade / totalGrades) * 100) : 0;

  // Gender distribution
  const genderDistribution = students.reduce((acc: any, student: any) => {
    acc[student.gender] = (acc[student.gender] || 0) + 1;
    return acc;
  }, {});

  if (studentsLoading || gradesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
          show={true}
        />
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Class Records</h3>
          <p className="text-sm text-gray-500">Manage final grades for {students.length} students</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <CalculatorIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Click calculator icon to use calculated grade</span>
          <span className="sm:hidden">Use calculator for auto-grade</span>
        </div>
      </div>

      {/* Mobile Summary - Only visible on mobile and tablet */}
      <div className="lg:hidden bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <UserGroupIcon className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-900">{totalStudents} Students</span>
            </div>
            <div className="flex items-center space-x-2">
              <AcademicCapIcon className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-900">{totalGrades} Grades</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <CalculatorIcon className="w-5 h-5 text-yellow-600" />
            <span className="text-sm font-medium text-gray-900">{completionRate}% Complete</span>
          </div>
        </div>
      </div>

      {/* Quarter Filter - Only visible on mobile and tablet */}
      <div className="lg:hidden bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-900">Filter by Quarter</h4>
          <span className="text-xs text-gray-500">Select to focus on specific quarter</span>
        </div>
        <Select
          value={selectedQuarter}
          onChange={(e) => setSelectedQuarter(e.target.value)}
          options={quarterOptions}
          placeholder="Select quarter"
          className="w-full"
        />
        <div className="mt-3 p-2 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-700">
            Showing Quarter {selectedQuarter} grades for {students.length} students
          </p>
        </div>
      </div>

      {/* Statistics - Hidden on mobile and tablet */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-4 gap-4">
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
              <AcademicCapIcon className="w-4 h-4 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Grades</p>
              <p className="text-lg font-semibold text-gray-900">{totalGrades}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
              <CalculatorIcon className="w-4 h-4 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Final Grades Set</p>
              <p className="text-lg font-semibold text-gray-900">{gradesWithFinalGrade}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <ChartBarIcon className="w-4 h-4 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completion</p>
              <p className="text-lg font-semibold text-gray-900">{completionRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gender Distribution - Hidden on mobile and tablet */}
      <div className="hidden lg:block bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Student Distribution</h4>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">How to Use Final Grades</h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-blue-800">
          <div>
            <span className="font-medium">Manual Input:</span> Type the final grade directly in the input field
          </div>
          <div>
            <span className="font-medium">Calculated Grade:</span> Click the calculator icon to use the system-calculated grade
          </div>
        </div>
      </div>

      {/* Student Grades List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-900">Student Final Grades by Quarter</h4>
        </div>
        
        <div className="divide-y divide-gray-200">
          {students.length === 0 ? (
            <div className="text-center py-12">
              <UserGroupIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Found</h3>
              <p className="text-gray-500">No students are assigned to this class section.</p>
            </div>
          ) : (
            // Group students by gender and sort by last name
            (() => {
              // Sort students by last name first
              const sortedStudents = [...students].sort((a, b) => 
                a.last_name.localeCompare(b.last_name)
              );
              
              // Group by gender
              const groupedStudents = sortedStudents.reduce((acc, student) => {
                if (!acc[student.gender]) {
                  acc[student.gender] = [];
                }
                acc[student.gender].push(student);
                return acc;
              }, {} as Record<string, typeof students>);
              
              // Define gender order for display
              const genderOrder: ('male' | 'female' | 'other')[] = ['male', 'female', 'other'];
              
              return genderOrder.map((gender) => {
                const studentsInGroup = groupedStudents[gender] || [];
                if (studentsInGroup.length === 0) return null;
                
                return (
                  <div key={gender} className="border-b border-gray-200 last:border-b-0">
                    {/* Gender Group Header */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-center space-x-2">
                        {gender === 'male' && <UserIcon className="w-4 h-4 text-blue-600" />}
                        {gender === 'female' && <UsersIcon className="w-4 h-4 text-pink-600" />}
                        {gender === 'other' && <UserGroupIcon className="w-4 h-4 text-gray-600" />}
                        <h5 className="text-sm font-medium text-gray-900 capitalize">
                          {gender} Students ({studentsInGroup.length})
                        </h5>
                      </div>
                    </div>
                    
                    {/* Students in this gender group */}
                    <div className="divide-y divide-gray-100">
                      {studentsInGroup.map((student) => (
                        <StudentGradesByQuarter
                          key={student.id}
                          student={student}
                          subjectId={subjectId}
                          runningGrades={gradesByStudent[student.id] || []}
                          academicYear="2025-2026"
                          selectedQuarter={selectedQuarter}
                        />
                      ))}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>
    </div>
  );
}; 