import * as XLSX from 'xlsx';

interface Student {
  student_id: string;
  student_name: string;
  gender?: string;
  subjects: Array<{
    subject_title: string;
    grade: number | string | null;
    subject_type?: string;
    parent_subject_id?: string | null;
  }>;
}

interface ConsolidatedGradesData {
  section: {
    title: string;
    academic_year: string;
  };
  students: Student[];
}

interface BaseSubject {
  base: string;
  subject_ids: string[];
  subject_title: string;
}

const formatGrade = (grade: number | string | null) => {
  if (grade === null || grade === undefined) return '';
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  if (isNaN(numGrade)) return '';
  return Math.round(numGrade).toString();
};

const calculateFinalGrade = (subjects: Array<{ grade: number | string | null; subject_type?: string; parent_subject_id?: string | null }>) => {
  // Filter out child subjects - only include parent subjects and regular subjects
  const parentAndRegularSubjects = subjects.filter(subject => 
    subject.subject_type !== 'child'
  );
  
  const validGrades = parentAndRegularSubjects
    .map(subject => {
      const grade = typeof subject.grade === 'string' ? parseFloat(subject.grade) : subject.grade;
      return isNaN(grade as number) ? null : grade;
    })
    .filter(grade => grade !== null) as number[];

  if (validGrades.length === 0) return null;
  const sum = validGrades.reduce((acc, grade) => acc + grade, 0);
  return Math.round(sum / validGrades.length);
};

const getRemarks = (finalGrade: number | null) => {
  if (finalGrade === null) return 'N/A';
  if (finalGrade >= 98) return 'With Highest Honors';
  if (finalGrade >= 95) return 'With High Honor';
  if (finalGrade >= 90) return 'With Honors';
  return '';
};


export const exportConsolidatedGradesToExcel = (
  data: ConsolidatedGradesData,
  baseSubjects: BaseSubject[],
  studentsWithGroupedSubjects: any[],
  institutionName: string,
  selectedQuarter: number
) => {
  const workbook = XLSX.utils.book_new();
  
  // Helper function to get quarter label
  const getQuarterLabel = (quarter: number) => {
    const quarters = {
      1: 'First Quarter',
      2: 'Second Quarter',
      3: 'Third Quarter',
      4: 'Fourth Quarter',
    };
    return quarters[quarter as keyof typeof quarters] || `Quarter ${quarter}`;
  };

  // Group students by gender
  const groupedStudents: Record<string, Student[]> = data.students.reduce((acc, student) => {
    const gender = student.gender ? student.gender.toLowerCase() : 'other';
    if (!acc[gender]) acc[gender] = [];
    acc[gender].push(student);
    return acc;
  }, {} as Record<string, Student[]>);

  // Sort each gender group by last name alphabetically
  Object.keys(groupedStudents).forEach(gender => {
    groupedStudents[gender].sort((a, b) => {
      const lastNameA = a.student_name.split(',')[0]?.trim() || '';
      const lastNameB = b.student_name.split(',')[0]?.trim() || '';
      return lastNameA.localeCompare(lastNameB);
    });
  });

  const genderLabels: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
  };

  // Create worksheets for each gender group
  const genderOrder = ['male', 'female', 'other'];
  
  genderOrder.forEach(gender => {
    const students = groupedStudents[gender];
    if (!students || students.length === 0) return;

    const worksheetData: any[][] = [];
    
    // Header information
    worksheetData.push([institutionName]);
    worksheetData.push([`Consolidated Grades - ${data.section.title}`]);
    worksheetData.push([`${getQuarterLabel(selectedQuarter)} - ${data.section.academic_year}`]);
    worksheetData.push([`${genderLabels[gender]} Students`]);
    worksheetData.push([]); // Empty row
    
    // Table headers
    const headers = ['Student Name', ...baseSubjects.map(s => s.subject_title), 'Final Grade', 'Remarks'];
    worksheetData.push(headers);
    
    // Student data rows
    students.forEach(student => {
      const grouped = studentsWithGroupedSubjects.find((s: any) => s.student_id === student.student_id)?.groupedSubjects || [];
      const row = [student.student_name];
      
      // Add grades for each subject
      baseSubjects.forEach(subject => {
        const subj = grouped.find((g: any) => g.subject_title === subject.subject_title);
        row.push(formatGrade(subj?.grade));
      });
      
      // Add final grade and remarks
      const finalGrade = calculateFinalGrade(grouped);
      row.push(formatGrade(finalGrade));
      row.push(getRemarks(finalGrade));
      
      worksheetData.push(row);
    });
    
    // Summary row
    worksheetData.push([]);
    worksheetData.push(['Total Students:', students.length]);
    worksheetData.push(['Total Subjects:', baseSubjects.length]);
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    const colWidths = [
      { wch: 30 }, // Student Name
      ...baseSubjects.map(() => ({ wch: 15 })), // Subject columns
      { wch: 12 }, // Final Grade
      { wch: 20 }, // Remarks
    ];
    worksheet['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, `${genderLabels[gender]} Students`);
  });

  // Create a summary worksheet
  const summaryData: any[][] = [];
  summaryData.push([institutionName]);
  summaryData.push([`Consolidated Grades Summary - ${data.section.title}`]);
  summaryData.push([`${getQuarterLabel(selectedQuarter)} - ${data.section.academic_year}`]);
  summaryData.push([]);
  
  // Summary statistics
  summaryData.push(['Summary Statistics']);
  summaryData.push(['Total Students:', data.students.length]);
  summaryData.push(['Total Subjects:', baseSubjects.length]);
  summaryData.push([]);
  
  // Gender breakdown
  summaryData.push(['Gender Breakdown']);
  Object.entries(groupedStudents).forEach(([gender, students]) => {
    if (students.length > 0) {
      summaryData.push([`${genderLabels[gender]}:`, students.length]);
    }
  });
  
  const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWorksheet['!cols'] = [{ wch: 20 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');

  // Generate filename
  const fileName = `consolidated-grades-${data.section.title}-q${selectedQuarter}-${data.section.academic_year}.xlsx`;
  
  // Save the file
  XLSX.writeFile(workbook, fileName);
};

export default exportConsolidatedGradesToExcel;
