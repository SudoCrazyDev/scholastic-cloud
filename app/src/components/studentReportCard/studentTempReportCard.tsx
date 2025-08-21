import { Page, Text, View, Document, PDFViewer } from '@react-pdf/renderer';
import type { SectionSubject, StudentSubjectGrade, Institution, ClassSection, Student } from '../../types';
import { roundGrade } from '@/utils/gradeUtils';

interface PrintTempReportCardProps {
  sectionSubjects?: SectionSubject[]
  studentSubjectsGrade?: StudentSubjectGrade[]
  institution?: Institution
  classSection?: ClassSection | null
  student?: Student | null
}

export default function PrintTempReportCard({ 
  sectionSubjects = [], 
  studentSubjectsGrade = [],
  institution,
  classSection,
  student
}: PrintTempReportCardProps) {

    return (
        <PDFViewer className='w-full' style={{height: '600px'}}>
            <Document>
                <Page size="A5" orientation="landscape" style={{height: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'center', fontFamily: 'Helvetica', flexWrap: 'wrap'}}>
                    <View style={{ width: '95%', alignContent: "center", display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: '10px' }}>
                        <Text style={{ textTransform: 'uppercase', textAlign: 'center', fontSize: '13px' }}>
                          {institution?.title || 'SCHOOL NAME'}
                        </Text>
                        <Text style={{ fontSize: '10px', textAlign: 'center' }}>
                          {institution?.address || 'School Address'}
                          {institution?.division && `, ${institution.division}`}
                          {institution?.region && `, ${institution.region}`}
                        </Text>
                    </View>
                    <View style={{ paddingHorizontal: '20px', width: '100%', display: 'flex', flexDirection: 'row', marginTop: '5px'}}>
                        <Text style={{ textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', fontSize: '12px'}}>
                          {student ? `${student.last_name}, ${student.first_name} ${student.middle_name ? student.middle_name + ' ' : ''}${student.ext_name || ''}`.trim() : 'STUDENT NAME'}
                        </Text>
                        <Text style={{ marginLeft: 'auto', fontFamily: 'Helvetica-Bold', fontSize: '12px' }}>
                          LRN: {student?.lrn || ""}
                        </Text>
                    </View>
                    <View style={{width: '50%', paddingHorizontal: '20px', display: 'flex', flexDirection: 'column', marginTop: '5px'}}>
                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', marginBottom: '10px'}}>REPORT ON LEARNING PROGRESS AND ACHIEVEMENT</Text>
                        <View style={{display: 'flex', flexDirection: 'row', border: '1px solid black'}}>
                            <View style={{width: '30%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Learning Areas</Text>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'column', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Quarter</Text>
                                <View style={{display: 'flex', flexDirection: 'row', borderTop: '1px solid black'}}>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>1</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>2</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>3</Text>
                                    </View>
                                    <View style={{width: '25%'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>4</Text>
                                    </View>
                                </View>
                            </View>
                            <View style={{width: '10%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Final Grade</Text>
                            </View>
                            <View style={{width: '20%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Remarks</Text>
                            </View>
                        </View>

                        {/* Dynamic subject rows */}
                        {sectionSubjects && sectionSubjects.length > 0 ? (
                          sectionSubjects.map((subject, index) => {
                            const studentGrade = studentSubjectsGrade.find(grade => grade.subject_id === subject.id);
                            const quarter1Grade = roundGrade(studentGrade?.quarter1_grade) || '';
                            const quarter2Grade = roundGrade(studentGrade?.quarter2_grade) || '';
                            const quarter3Grade = roundGrade(studentGrade?.quarter3_grade) || '';
                            const quarter4Grade = roundGrade(studentGrade?.quarter4_grade) || '';
                            const finalGrade = roundGrade(studentGrade?.final_grade) || '';
                            const remarks = studentGrade?.remarks || '';
                            
                            return (
                              <View key={index} style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                                <View style={{paddingLeft: '2px', paddingVertical: '2px', width: '30%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'flex-start', borderRight: '1px solid black'}}>
                                  <Text style={{fontSize: '8px', fontFamily: 'Helvetica', marginLeft: `${subject.subject_type === 'parent' ? '0px' : '10px'}`}}>{subject.title ||  'Subject'} {subject.variant ? `- ${subject.variant}` : ''}</Text>
                                </View>
                                <View style={{width: '40%', display: 'flex', flexDirection: 'row', borderRight: '1px solid black', alignItems: 'center', justifyContent: 'center'}}>
                                  <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>{quarter1Grade}</Text>
                                  </View>
                                  <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>{quarter2Grade}</Text>
                                  </View>
                                  <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>{quarter3Grade}</Text>
                                  </View>
                                  <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>{quarter4Grade}</Text>
                                  </View>
                                </View>
                                <View style={{width: '10%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                  <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>{finalGrade}</Text>
                                </View>
                                <View style={{width: '20%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center'}}>
                                  {/* <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>{remarks}</Text> */}
                                </View>
                              </View>
                            );
                          })
                        ) : (
                          <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{paddingLeft: '2px', paddingVertical: '2px', width: '100%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center'}}>
                              <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>No subjects available</Text>
                            </View>
                          </View>
                        )}

                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '70%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>GENERAL AVERAGE</Text>
                            </View>
                            <View style={{width: '10%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>
                                  {(() => {
                                    const validGrades = studentSubjectsGrade
                                      .filter(grade => grade.final_grade && !isNaN(Number(grade.final_grade)))
                                      .map(grade => parseFloat(String(grade.final_grade)));
                                    if (validGrades.length === 0) return '-';
                                    const average = validGrades.reduce((sum, grade) => sum + grade, 0) / validGrades.length;
                                    return average.toFixed(2);
                                  })()}
                                </Text>
                            </View>
                            <View style={{width: '20%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>
                                  {(() => {
                                    const validGrades = studentSubjectsGrade
                                      .filter(grade => grade.final_grade && !isNaN(Number(grade.final_grade)))
                                      .map(grade => parseFloat(String(grade.final_grade)));
                                    if (validGrades.length === 0) return '-';
                                    const average = validGrades.reduce((sum, grade) => sum + grade, 0) / validGrades.length;
                                    return average >= 75 ? 'Passed' : 'Failed';
                                  })()}
                                </Text>
                            </View>
                        </View>
                            
                        <View style={{marginTop: '0', display: 'flex', flexDirection: 'row', flexWrap: 'wrap'}}>
                            <View style={{width: '40%'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Descriptors</Text>
                            </View>
                            <View style={{width: '30%'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Grading Scale</Text>
                            </View>
                            <View style={{width: '30%'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Remarks</Text>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row', marginTop: '5px'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Outstanding</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>90-100</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Passed</Text>
                                </View>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Very Satisfactory</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>85-89</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Passed</Text>
                                </View>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Satisfactory</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>80-84</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Passed</Text>
                                </View>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Fairly Satisfactory</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>75-79</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Passed</Text>
                                </View>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Did Not Meet Expectations</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Below 75</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Failed</Text>
                                </View>
                            </View>
                        </View>
                        <View style={{ display: 'flex', flexDirection: 'column', marginTop: '10px', marginBottom: '5px'}}>
                            <Text style={{ textTransform: 'uppercase', fontSize: '10px', fontFamily: 'Helvetica-Bold' }}>
                              {classSection?.adviser?.first_name && classSection?.adviser?.last_name 
                                ? `${classSection.adviser.first_name} ${classSection.adviser.last_name}` 
                                : 'TEACHER NAME'}
                            </Text>
                            <Text style={{ fontSize: '8px'}}>ADVISER</Text>
                            {classSection?.grade_level && (
                              <Text style={{ fontSize: '8px', marginTop: '2px'}}>
                                Grade Level: {classSection.grade_level}
                              </Text>
                            )}
                            {classSection?.academic_year && (
                              <Text style={{ fontSize: '8px', marginTop: '2px'}}>
                                Academic Year: {classSection.academic_year}
                              </Text>
                            )}
                        </View>
                    </View>
                    
                    <View style={{width: '50%', paddingHorizontal: '20px', display: 'flex', flexDirection: 'column', marginTop: '5px'}}>
                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', marginBottom: '10px'}}>REPORT ON LEARNER'S OBSERVED VALUES</Text>
                        <View style={{display: 'flex', flexDirection: 'row', border: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Core Values</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Behavior Statements</Text>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'column'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Quarter</Text>
                                <View style={{display: 'flex', flexDirection: 'row', borderTop: '1px solid black'}}>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>1</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>2</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>3</Text>
                                    </View>
                                    <View style={{width: '25%'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>4</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica', textAlign: 'center'}}>Maka-Diyos</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <View style={{height: '30px', borderBottom: '1px solid black'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                        Expresses one's spiritual beliefs while respecting the spiritual beliefs of others
                                    </Text>
                                </View>
                                <View>
                                    <Text style={{height: '25px', fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                        Show adherence to ethical principles by upholding truth
                                    </Text>
                                </View>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica', textAlign: 'center'}}>Maka-Tao</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <View style={{height: '30px', borderBottom: '1px solid black'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                        Is sensitive to individual, social, and cultural differences.
                                    </Text>
                                </View>
                                <View>
                                    <Text style={{height: '25px', fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                        Demonstrates contributions toward solidarity.
                                    </Text>
                                </View>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica', textAlign: 'center'}}>Makakalikasan</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <View style={{height: '30px'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                        Cares for the environment and utilizes resources wisely, judiciously, and economically.
                                    </Text>
                                </View>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica', textAlign: 'center'}}>Makabansa</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <View style={{height: '30px', borderBottom: '1px solid black'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                        Demonstrates pride being a Filipino; excercises the rights and responsibilities of a Filipino Citizen.
                                    </Text>
                                </View>
                                <View>
                                    <Text style={{height: '25px', fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                        Demonstrates appropriate behavior in carrying out activities in the school, community, and country.
                                    </Text>
                                </View>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{marginTop: '0', display: 'flex', flexDirection: 'column'}}>
                            <View style={{display: 'flex', flexDirection: 'row', paddingBottom: '5px'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Marking</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Non-numerical Rating</Text>
                            </View>
                            <View style={{display: 'flex', flexDirection: 'row'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica', fontSize: '8px'}}>AO</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Always Observed</Text>
                            </View>
                            <View style={{display: 'flex', flexDirection: 'row'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica', fontSize: '8px'}}>SO</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Sometimes Observed</Text>
                            </View>
                            <View style={{display: 'flex', flexDirection: 'row'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica', fontSize: '8px'}}>RO</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Rarely Observed</Text>
                            </View>
                            <View style={{display: 'flex', flexDirection: 'row'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica', fontSize: '8px'}}>NO</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Not Observed</Text>
                            </View>
                        </View>
                        
                    </View>
                </Page>
            </Document>
        </PDFViewer>
    );
}