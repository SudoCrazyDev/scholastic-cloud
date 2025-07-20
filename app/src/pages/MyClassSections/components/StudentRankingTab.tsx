import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Trophy, 
  Medal, 
  Award, 
  GraduationCap, 
  Search,
  Filter,
  Download,
  Eye
} from 'lucide-react';
import { Button } from '../../../components/button';
import { Input } from '../../../components/input';
import { Select } from '../../../components/select';
import type { Student } from '../../../types';

interface StudentRankingTabProps {
  students: (Student & { assignmentId: string })[];
  classSectionTitle: string;
}

interface StudentWithRanking extends Student {
  assignmentId: string;
  gpa: number;
  rank: number;
  honorCategory: 'highest' | 'high' | 'honor' | 'none';
}

const StudentRankingTab: React.FC<StudentRankingTabProps> = ({ students, classSectionTitle }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGender, setSelectedGender] = useState('');

  const getFullName = (student: Student) => {
    const parts = [student.first_name, student.middle_name, student.last_name, student.ext_name];
    return parts.filter(Boolean).join(' ');
  };

  // Mock GPA calculation (in real implementation, this would come from API)
  const studentsWithRanking: StudentWithRanking[] = students.map((student, index) => {
    // Generate mock GPA between 85-100 for demonstration
    const mockGpa = Math.round((85 + Math.random() * 15) * 10) / 10;
    
    let honorCategory: 'highest' | 'high' | 'honor' | 'none';
    if (mockGpa >= 98) {
      honorCategory = 'highest';
    } else if (mockGpa >= 95) {
      honorCategory = 'high';
    } else if (mockGpa >= 90) {
      honorCategory = 'honor';
    } else {
      honorCategory = 'none';
    }

    return {
      ...student,
      gpa: mockGpa,
      rank: index + 1,
      honorCategory
    };
  }).sort((a, b) => b.gpa - a.gpa); // Sort by GPA descending

  // Update ranks after sorting
  studentsWithRanking.forEach((student, index) => {
    student.rank = index + 1;
  });

  const filteredStudents = studentsWithRanking.filter(student => {
    const matchesSearch = getFullName(student).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGender = !selectedGender || student.gender === selectedGender;
    return matchesSearch && matchesGender;
  });

  const getHonorCategoryStudents = (category: 'highest' | 'high' | 'honor') => {
    return filteredStudents.filter(student => student.honorCategory === category);
  };

  const getHonorCategoryInfo = (category: 'highest' | 'high' | 'honor') => {
    switch (category) {
      case 'highest':
        return {
          title: 'With Highest Honor',
          description: 'GPA 98-100',
          icon: <Trophy className="w-6 h-6 text-yellow-500" />,
          color: 'bg-gradient-to-r from-yellow-400 to-yellow-600',
          textColor: 'text-yellow-800',
          borderColor: 'border-yellow-200',
          bgColor: 'bg-yellow-50'
        };
      case 'high':
        return {
          title: 'With High Honor',
          description: 'GPA 95-97',
          icon: <Medal className="w-6 h-6 text-blue-500" />,
          color: 'bg-gradient-to-r from-blue-400 to-blue-600',
          textColor: 'text-blue-800',
          borderColor: 'border-blue-200',
          bgColor: 'bg-blue-50'
        };
      case 'honor':
        return {
          title: 'With Honor',
          description: 'GPA 90-94',
          icon: <Award className="w-6 h-6 text-green-500" />,
          color: 'bg-gradient-to-r from-green-400 to-green-600',
          textColor: 'text-green-800',
          borderColor: 'border-green-200',
          bgColor: 'bg-green-50'
        };
    }
  };

  const StudentCard: React.FC<{ student: StudentWithRanking }> = ({ student }) => {
    // Only show students with honor categories
    if (student.honorCategory === 'none') {
      return null;
    }
    
    const categoryInfo = getHonorCategoryInfo(student.honorCategory);
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`p-4 rounded-lg border ${categoryInfo.borderColor} ${categoryInfo.bgColor} hover:shadow-md transition-all duration-200`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full ${categoryInfo.color} text-white`}>
              {categoryInfo.icon}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{getFullName(student)}</h3>
              <p className="text-sm text-gray-600">LRN: {student.lrn}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{student.gpa}</div>
            <div className="text-sm text-gray-600">GPA</div>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">Rank: <span className="font-semibold">{student.rank}</span></span>
            <span className="text-gray-600">of <span className="font-semibold">{students.length}</span></span>
            <span className="text-gray-600 capitalize">{student.gender}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-900"
          >
            <Eye className="w-4 h-4 mr-1" />
            View Details
          </Button>
        </div>
      </motion.div>
    );
  };

  const genderOptions = [
    { label: 'All Genders', value: '' },
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
  ];

  const totalStudents = students.length;
  const highestHonorCount = getHonorCategoryStudents('highest').length;
  const highHonorCount = getHonorCategoryStudents('high').length;
  const honorCount = getHonorCategoryStudents('honor').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-3 bg-indigo-100 rounded-lg">
          <Trophy className="w-8 h-8 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Student Ranking</h2>
          <p className="text-gray-600">Academic excellence recognition for {classSectionTitle}</p>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{highestHonorCount}</div>
              <div className="text-sm text-gray-600">With Highest Honor</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <Medal className="w-6 h-6 text-blue-500" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{highHonorCount}</div>
              <div className="text-sm text-gray-600">With High Honor</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <Award className="w-6 h-6 text-green-500" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{honorCount}</div>
              <div className="text-sm text-gray-600">With Honor</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <GraduationCap className="w-6 h-6 text-indigo-500" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalStudents}</div>
              <div className="text-sm text-gray-600">Total Students</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
        <div className="flex items-center space-x-4 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Student
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gender
            </label>
            <Select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              options={genderOptions}
              placeholder="Select gender"
            />
          </div>
          
          <div className="flex items-end">
            <Button
              variant="solid"
              color="primary"
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>
      </div>

      {/* Honor Categories */}
      <div className="space-y-8">
        {/* With Highest Honor */}
        {highestHonorCount > 0 && (
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <Trophy className="w-6 h-6 text-yellow-500" />
              <h3 className="text-xl font-bold text-gray-900">With Highest Honor (GPA 98-100)</h3>
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
                {highestHonorCount} students
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getHonorCategoryStudents('highest').map((student) => (
                <StudentCard key={student.id} student={student} />
              ))}
            </div>
          </div>
        )}

        {/* With High Honor */}
        {highHonorCount > 0 && (
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <Medal className="w-6 h-6 text-blue-500" />
              <h3 className="text-xl font-bold text-gray-900">With High Honor (GPA 95-97)</h3>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                {highHonorCount} students
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getHonorCategoryStudents('high').map((student) => (
                <StudentCard key={student.id} student={student} />
              ))}
            </div>
          </div>
        )}

        {/* With Honor */}
        {honorCount > 0 && (
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <Award className="w-6 h-6 text-green-500" />
              <h3 className="text-xl font-bold text-gray-900">With Honor (GPA 90-94)</h3>
              <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                {honorCount} students
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getHonorCategoryStudents('honor').map((student) => (
                <StudentCard key={student.id} student={student} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredStudents.length === 0 && (
        <div className="text-center py-12">
          <GraduationCap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
          <p className="text-gray-600">Try adjusting your search criteria or filters.</p>
        </div>
      )}
    </div>
  );
};

export default StudentRankingTab; 