# Student Report Card Component

## Overview

The `studentReportCard` component has been updated to dynamically fetch and display student data, including grades, subjects, institution information, and class section details. The component now focuses on the "REPORT ON LEARNING PROGRESS AND ACHIEVEMENT" section as requested.

## Features

### Dynamic Data Loading
- **Student Information**: Name, LRN, age, gender, birthdate
- **Institution Information**: School name, address, government ID
- **Class Section Information**: Grade level, section title
- **Subjects**: All subjects assigned to the class section
- **Grades**: Quarter grades for each subject with final grades and remarks

### Grade Calculations
- **Quarter Grades**: Individual grades for each quarter (1-4)
- **Final Grades**: Calculated average for each subject
- **General Average**: Overall average across all subjects
- **Remarks**: Pass/Fail status based on 75% passing grade

### Data Sources
The component uses the following hooks and services:
- `useStudentReportCard` - Custom hook for fetching all report card data
- `studentService` - Student information
- `institutionService` - Institution details
- `classSectionService` - Class section information
- `subjectService` - Subject listings
- `studentRunningGradeService` - Grade data

## Usage

### Basic Usage
```tsx
import PrintReportCard from './components/studentReportCard/studentReportCard';

function MyComponent() {
  return (
    <PrintReportCard
      studentId="student-uuid"
      classSectionId="section-uuid"
      institutionId="institution-uuid"
      academicYear="2024-2025"
    />
  );
}
```

### Required Props
- `studentId` (string): The unique identifier for the student
- `classSectionId` (string): The unique identifier for the class section
- `institutionId` (string): The unique identifier for the institution
- `academicYear` (string, optional): Academic year (defaults to "2024-2025")

### Example Component
See `StudentReportCardExample.tsx` for a complete usage example.

## Data Structure

### Student Data
```typescript
interface Student {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  birthdate: string;
  gender: 'male' | 'female' | 'other';
  religion: string;
  lrn: string;
  // ... other fields
}
```

### Grade Data
```typescript
interface StudentRunningGrade {
  id?: string;
  student_id: string;
  subject_id: string;
  quarter: '1' | '2' | '3' | '4';
  grade: number;
  final_grade?: number;
  academic_year: string;
  // ... other fields
}
```

## Grade Calculation Logic

### Final Grade Calculation
- Filters out grades with value 0 or null
- Calculates the average of all valid grades
- Rounds to 2 decimal places

### Remarks System
- **Passed**: Grade >= 75
- **Failed**: Grade < 75

### Grade Descriptors
- **Outstanding**: 90-100
- **Very Satisfactory**: 85-89
- **Satisfactory**: 80-84
- **Fairly Satisfactory**: 75-79
- **Did Not Meet Expectations**: Below 75

## Loading States

The component handles loading and error states:
- **Loading**: Shows "Loading report card..." message
- **Error**: Shows error message with details
- **Success**: Displays the complete report card

## Notes

- The "REPORT ON ATTENDANCE" and "REPORT ON LEARNER'S OBSERVED VALUES" sections remain unchanged as requested
- The component uses React PDF for rendering
- All data is fetched using TanStack Query for caching and performance
- The component is responsive and handles missing data gracefully 