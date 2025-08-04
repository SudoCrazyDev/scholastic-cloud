import React, { useState, useEffect } from 'react';
import { useStudents } from '../../hooks/useStudents';
import { useInstitutions } from '../../hooks/useInstitutions';
import { useSF9 } from '../../hooks/useSF9';
import { useAuth } from '../../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { Loader2, FileText, Download, Search, User, Building } from 'lucide-react';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { Input } from '../../components/input';
import { Badge } from '../../components/badge';
import { Alert } from '../../components/alert';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { SF9PDF } from '../../components/SF9PDF';
import type { SF9Data } from '../../services/sf9Service';

const SF9: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [selectedInstitution, setSelectedInstitution] = useState<string>('');
  const [sf9Data, setSf9Data] = useState<SF9Data | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Handle pre-selected student from navigation
  useEffect(() => {
    const state = location.state as { selectedStudentId?: string };
    if (state?.selectedStudentId) {
      setSelectedStudent(state.selectedStudentId);
    }
  }, [location.state]);

  // Get user's default institution
  const defaultInstitution = user?.user_institutions?.find((ui: any) => ui.is_default)?.institution;

  // Hooks
  const { students, loading: studentsLoading } = useStudents();
  const { institutions, loading: institutionsLoading } = useInstitutions();
  const { generateSF9, generateSF9Loading } = useSF9();

  // Filter students based on search term
  const filteredStudents = students?.filter((student: any) => {
    const fullName = `${student.first_name || ''} ${student.middle_name || ''} ${student.last_name || ''}`.toLowerCase();
    const lrn = (student.lrn || '').toLowerCase();
    return fullName.includes(searchTerm.toLowerCase()) || lrn.includes(searchTerm.toLowerCase());
  }) || [];

  const handleGenerateSF9 = async () => {
    if (!selectedStudent || !selectedInstitution) {
      return;
    }

    try {
      const response = await generateSF9({
        student_id: selectedStudent,
        academic_year: "2025-2026",
        institution_id: selectedInstitution,
      });

      if (response.success) {
        setSf9Data(response.data);
      }
    } catch (error) {
      console.error('Error generating SF9:', error);
    }
  };

  const getStudentName = (studentId: string) => {
    const student = students?.find((s: any) => s.id === studentId);
    if (!student) return '';
    return `${student.last_name}, ${student.first_name} ${student.middle_name || ''} ${student.ext_name || ''}`;
  };

  const getInstitutionName = (institutionId: string) => {
    const institution = institutions?.find((i: any) => i.id === institutionId);
    return institution?.title || '';
  };

  if (studentsLoading || institutionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SF9 Generation</h1>
            <p className="text-sm text-gray-600 mt-1">
              Generate Student's Permanent Record (SF9) documents
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <Badge color="blue">DepEd SF9</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto py-8 px-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate SF9 Document</h2>
            
            {/* Student Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                Select Student
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search by name or LRN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md">
                {filteredStudents.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    {searchTerm ? 'No students found' : 'No students available'}
                  </div>
                ) : (
                  filteredStudents.map((student) => (
                    <button
                      key={student.id}
                      onClick={() => setSelectedStudent(student.id)}
                      className={`w-full text-left p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                        selectedStudent === student.id ? 'bg-indigo-50 border-indigo-200' : ''
                      }`}
                    >
                      <div className="font-medium text-gray-900">
                        {student.last_name}, {student.first_name} {student.middle_name || ''} {student.ext_name || ''}
                      </div>
                      <div className="text-sm text-gray-600">LRN: {student.lrn}</div>
                    </button>
                  ))
                )}
              </div>
              {selectedStudent && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                  <div className="text-sm font-medium text-green-800">
                    Selected: {getStudentName(selectedStudent)}
                  </div>
                </div>
              )}
            </div>



            {/* Institution Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building className="w-4 h-4 inline mr-1" />
                Institution
              </label>
              <Select
                value={selectedInstitution}
                onChange={(e) => setSelectedInstitution(e.target.value)}
                placeholder="Select Institution"
                options={institutions?.map((institution: any) => ({
                  value: institution.id,
                  label: institution.title
                })) || []}
              />
              {defaultInstitution && (
                <p className="mt-1 text-sm text-gray-500">
                  Default: {defaultInstitution.title}
                </p>
              )}
            </div>

            {/* Generate Button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleGenerateSF9}
                disabled={!selectedStudent || !selectedInstitution || generateSF9Loading}
                className="flex items-center gap-2"
              >
                {generateSF9Loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                {generateSF9Loading ? 'Generating...' : 'Generate SF9'}
              </Button>

              {sf9Data && (
                <PDFDownloadLink
                  document={<SF9PDF data={sf9Data} />}
                  fileName={`SF9-${getStudentName(selectedStudent).replace(/[^a-zA-Z0-9]/g, '-')}-${"2025-2026"}.pdf`}
                >
                  {({ loading }) => (
                    <Button variant="outline" disabled={loading} className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      {loading ? 'Preparing PDF...' : 'Download PDF'}
                    </Button>
                  )}
                </PDFDownloadLink>
              )}
            </div>
          </div>

          {/* Generated Data Preview */}
          {sf9Data && (
            <div className="mt-8 border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Generated SF9 Data</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Student Information */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-3">Student Information</h4>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Name:</span> {getStudentName(selectedStudent)}</div>
                    <div><span className="font-medium">LRN:</span> {sf9Data.student.lrn}</div>
                    <div><span className="font-medium">Gender:</span> {sf9Data.student.gender}</div>
                    <div><span className="font-medium">Birth Date:</span> {new Date(sf9Data.student.birthdate).toLocaleDateString()}</div>
                    <div><span className="font-medium">Religion:</span> {sf9Data.student.religion}</div>
                  </div>
                </div>

                {/* Institution Information */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-3">Institution Information</h4>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Name:</span> {getInstitutionName(selectedInstitution)}</div>
                    <div><span className="font-medium">Academic Year:</span> {sf9Data.current_academic_year}</div>
                    <div><span className="font-medium">Current Sections:</span> {sf9Data.current_sections.length}</div>
                    <div><span className="font-medium">Attendance Rate:</span> {sf9Data.attendance_summary.attendance_rate}%</div>
                  </div>
                </div>

                {/* Academic Performance Summary */}
                <div className="bg-gray-50 p-4 rounded-lg md:col-span-2">
                  <h4 className="font-medium text-gray-900 mb-3">Academic Performance Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {Object.entries(sf9Data.academic_performance).map(([quarter, grades]) => (
                      <div key={quarter} className="text-center">
                        <div className="font-medium text-gray-900">Quarter {quarter}</div>
                        <div className="text-gray-600">{grades.length} subjects</div>
                        <div className="text-indigo-600 font-medium">
                          {grades.filter(g => g.final_grade !== null).length > 0
                            ? Math.round(grades.reduce((sum, g) => sum + (g.final_grade || 0), 0) / grades.filter(g => g.final_grade !== null).length)
                            : 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Success Message */}
              <Alert
                type="success"
                title="SF9 Generated Successfully"
                message="The SF9 document has been generated with all student data. You can now download the PDF."
                show={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SF9; 