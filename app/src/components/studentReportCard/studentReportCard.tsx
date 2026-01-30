
import { useMemo } from 'react';
import { Page, Text, View, Document, PDFViewer, StyleSheet } from '@react-pdf/renderer';
import { useStudentReportCard } from '../../hooks/useStudentReportCard';
import { calculateFinalGrade, getPassFailRemarks, getQuarterGrade, calculateAge } from '../../utils/gradeUtils';

const CORE_VALUE_BEHAVIORS: Record<string, string[]> = {
    'Maka-Diyos': [
        "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others.",
        'Shows adherence to ethical principles by upholding truth',
    ],
    'Maka-Tao': [
        'Is sensitive to individual, social, and cultural differences',
        'Demonstrates contributions toward solidarity',
    ],
    'Makakalikasan': [
        'Cares for the environment and utilizes resources wisely, judiciously, and economically.',
    ],
    'Makabansa': [
        'Demonstrates pride in being a Filipino; exercises the rights and responsibilities of a Filipino citizen',
        'Demonstrates appropriate behavior in carrying out activities in the school, community, and country',
    ],
};

const styles = StyleSheet.create({
    // Attendance table:
    // - 1 label column + 13 month/total columns
    // - widths must not overflow (7% * 13 + 15% = 106% caused misalignment/double borders)
    attendanceMonthContainer: {width: '6.53%', textAlign: 'center', borderRight: '1px solid black'},
    attendanceMonthContainerLast: {width: '6.53%', textAlign: 'center'},
    attendanceMonthText: {fontSize: '7px', fontFamily: 'Helvetica'}
});

interface PrintReportCardProps {
    studentId?: string;
    classSectionId?: string;
    institutionId?: string;
    academicYear?: string;
    viewerKey?: string;
    viewerHeight?: string;
    principalName?: string;
}

export default function PrintReportCard({ 
    studentId = "", 
    classSectionId = "", 
    institutionId = "", 
    academicYear = '2025-2026',
    viewerKey,
    viewerHeight = '100%',
    principalName = '',
}: PrintReportCardProps) {
    const { 
        student, 
        institution, 
        classSection, 
        subjects, 
        grades, 
        coreValueMarkings,
        attendances,
        schoolDays,
        isLoading, 
        error 
    } = useStudentReportCard({
        studentId,
        classSectionId,
        institutionId,
        academicYear,
        enabled: true
    });

    // MUST be above early returns (hooks order must be consistent).
    const coreValueMap = useMemo(() => {
        const map: Record<string, Record<string, Record<string, string>>> = {};
        (Array.isArray(coreValueMarkings) ? coreValueMarkings : []).forEach((m: any) => {
            const cv = String(m.core_value || '');
            const bs = String(m.behavior_statement || '');
            const q = String(m.quarter || '');
            const marking = String(m.marking || '');

            if (!cv || !bs || !q) return;
            if (!map[cv]) map[cv] = {};
            if (!map[cv][bs]) map[cv][bs] = {};
            map[cv][bs][q] = marking;
        });
        return map;
    }, [coreValueMarkings]);

    const mark = (coreValue: string, behaviorStatement: string, quarter: '1' | '2' | '3' | '4') => {
        return coreValueMap?.[coreValue]?.[behaviorStatement]?.[quarter] || '';
    };

    // Organize attendance data by month (academic year order: Jul=7, Aug=8, ..., Jun=6)
    // Map database months (1-12) to academic year order (7,8,9,10,11,12,1,2,3,4,5,6)
    const attendanceByMonth = useMemo(() => {
        const map: Record<number, { schoolDays: number; present: number; absent: number }> = {};
        
        // Initialize all months
        const academicYearMonths = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
        academicYearMonths.forEach(month => {
            map[month] = { schoolDays: 0, present: 0, absent: 0 };
        });

        // Fill in school days data (normalize month to number in case API returns string)
        (schoolDays || []).forEach((schoolDay: any) => {
            const month = Number(schoolDay.month);
            if (month >= 1 && month <= 12 && map[month] !== undefined) {
                map[month].schoolDays = Number(schoolDay.total_days) || 0;
            }
        });

        // Fill in attendance data (days present from API)
        (attendances || []).forEach((attendance: any) => {
            const month = Number(attendance.month);
            if (month >= 1 && month <= 12 && map[month] !== undefined) {
                map[month].present = Number(attendance.days_present) || 0;
            }
        });

        // Auto-calculate No. of days absent = school days - days present (per month)
        academicYearMonths.forEach(month => {
            const school = map[month].schoolDays;
            const present = map[month].present;
            map[month].absent = Math.max(0, school - present);
        });

        return map;
    }, [attendances, schoolDays]);

    // Calculate totals
    const attendanceTotals = useMemo(() => {
        const totals = { schoolDays: 0, present: 0, absent: 0 };
        Object.values(attendanceByMonth).forEach(monthData => {
            totals.schoolDays += monthData.schoolDays;
            totals.present += monthData.present;
            totals.absent += monthData.absent;
        });
        return totals;
    }, [attendanceByMonth]);

    // Helper to get attendance for a specific month (in academic year order)
    const getAttendanceForMonth = (academicYearMonthIndex: number) => {
        // academicYearMonthIndex: 0=Jul, 1=Aug, ..., 11=Jun
        const academicYearMonths = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
        const month = academicYearMonths[academicYearMonthIndex];
        return attendanceByMonth[month] || { schoolDays: 0, present: 0, absent: 0 };
    };

    if (isLoading) {
        return (
            <div className="w-full flex items-center justify-center bg-white" style={{ height: viewerHeight }}>
                <div className="text-sm text-gray-600">Loading report card…</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full flex items-center justify-center bg-white" style={{ height: viewerHeight }}>
                <div className="text-sm text-red-700">Error loading report card: {error}</div>
            </div>
        );
    }

    const finalGrade = calculateFinalGrade(grades);
    const finalGradeRemarks = getPassFailRemarks(finalGrade);
    const studentAge = calculateAge(student.birthdate);
    const teacher = (classSection as any)?.adviser
    const teacherName = teacher
      ? `${teacher.last_name || ''}, ${teacher.first_name || ''}${teacher.middle_name ? `, ${String(teacher.middle_name).trim().charAt(0)}.` : ''}${teacher.ext_name ? `, ${teacher.ext_name}` : ''}`.toUpperCase()
      : ''
    const principalDisplay = (principalName || '').trim() ? principalName : ' '

    const pdfKey = viewerKey || `${studentId}|${classSectionId}|${institutionId}|${academicYear}`

    return(
        <PDFViewer key={pdfKey} className='w-full' style={{height: viewerHeight}}>
            <Document>
                <Page size="A5" orientation="landscape" style={{display: 'flex', flexDirection: 'row'}}>
                    <View style={{width: '50%', padding: '20px'}}>
                        <View style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                            <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', marginBottom: '10px'}}>REPORT ON ATTENDANCE</Text>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'column', border: '1px solid black'}}>
                                <View style={{width: '100%', display: 'flex', flexDirection: 'row', borderBottom: '1px solid black'}}>
                                    <View style={{width: '15%', borderRight: '1px solid black', padding: '2px'}}>
                                        <Text style={{fontSize: '5px', textAlign: 'center'}}></Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Jul</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Aug</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Sep</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Oct</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Nov</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Dec</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Jan</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Feb</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Mar</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Apr</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>May</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainer}>
                                        <Text style={styles.attendanceMonthText}>Jun</Text>
                                    </View>
                                    <View style={styles.attendanceMonthContainerLast}>
                                        <Text style={styles.attendanceMonthText}>Total</Text>
                                    </View>
                                </View>
                                <View style={{width: '100%', display: 'flex', flexDirection: 'row', borderBottom: '1px solid black'}}>
                                    <View style={{width: '15%', borderRight: '1px solid black', padding: '2px'}}>
                                        <Text style={{fontSize: '5px', textAlign: 'center'}}>No. of school days</Text>
                                    </View>
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => {
                                        const monthData = getAttendanceForMonth(index);
                                        return (
                                            <View key={`school-days-${index}`} style={{width: '6.53%', textAlign: 'center', display: 'flex', flexDirection: "column", justifyContent: "center", borderRight: '1px solid black'}}>
                                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica'}}>{monthData.schoolDays ?? ''}</Text>
                                            </View>
                                        );
                                    })}
                                    <View style={{width: '6.53%', textAlign: 'center', display: 'flex', flexDirection: "column", justifyContent: "center"}}>
                                        <Text style={{fontSize: '7px', fontFamily: 'Helvetica'}}>{attendanceTotals.schoolDays ?? ''}</Text>
                                    </View>
                                </View>
                                <View style={{width: '100%', display: 'flex', flexDirection: 'row', borderBottom: '1px solid black'}}>
                                    <View style={{width: '15%', borderRight: '1px solid black', padding: '2px'}}>
                                        <Text style={{fontSize: '5px', textAlign: 'center'}}>No. of days present</Text>
                                    </View>
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => {
                                        const monthData = getAttendanceForMonth(index);
                                        return (
                                            <View key={`present-${index}`} style={{width: '6.53%', textAlign: 'center', display: 'flex', flexDirection: "column", justifyContent: "center", borderRight: '1px solid black'}}>
                                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica'}}>{monthData.present || ''}</Text>
                                            </View>
                                        );
                                    })}
                                    <View style={{width: '6.53%', textAlign: 'center', display: 'flex', flexDirection: "column", justifyContent: "center"}}>
                                        <Text style={{fontSize: '7px', fontFamily: 'Helvetica'}}>{attendanceTotals.present || ''}</Text>
                                    </View>
                                </View>
                                <View style={{width: '100%', display: 'flex', flexDirection: 'row'}}>
                                    <View style={{width: '15%', borderRight: '1px solid black', padding: '2px'}}>
                                        <Text style={{fontSize: '5px', textAlign: 'center'}}>No. of days absent</Text>
                                    </View>
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => {
                                        const monthData = getAttendanceForMonth(index);
                                        const absent = Number(monthData.absent);
                                        return (
                                            <View key={`absent-${index}`} style={{width: '6.53%', textAlign: 'center', display: 'flex', flexDirection: "column", justifyContent: "center", borderRight: '1px solid black'}}>
                                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica'}}>{isNaN(absent) ? '' : String(absent)}</Text>
                                            </View>
                                        );
                                    })}
                                    <View style={{width: '6.53%', textAlign: 'center', display: 'flex', flexDirection: "column", justifyContent: "center"}}>
                                        <Text style={{fontSize: '7px', fontFamily: 'Helvetica'}}>{isNaN(Number(attendanceTotals.absent)) ? '' : String(attendanceTotals.absent)}</Text>
                                    </View>
                                </View>
                            </View>
                            <Text style={{fontSize: '10px', fontFamily: 'Helvetica-Bold', marginTop: '50px'}}>PARENT / GUARDIAN'S SIGNATURE</Text>
                            <Text style={{fontSize: '10px', fontFamily: 'Helvetica-Bold', marginTop: '20px', alignSelf: 'flex-start'}}>1st Quarter ___________________________________</Text>
                            <Text style={{fontSize: '10px', fontFamily: 'Helvetica-Bold', marginTop: '20px', alignSelf: 'flex-start'}}>2nd Quarter ___________________________________</Text>
                            <Text style={{fontSize: '10px', fontFamily: 'Helvetica-Bold', marginTop: '20px', alignSelf: 'flex-start'}}>3rd Quarter ___________________________________</Text>
                            <Text style={{fontSize: '10px', fontFamily: 'Helvetica-Bold', marginTop: '20px', alignSelf: 'flex-start'}}>4th Quarter ___________________________________</Text>
                        </View>
                    </View>
                    
                    <View style={{width: '50%', padding: '20px', paddingTop: '8px'}}>
                        
                        <View style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                            <View style={{display: 'flex', flexDirection: 'row', marginBottom: '3px', width: '90%'}}>
                                <Text style={{fontSize: '6px', fontFamily:'Helvetica'}}>DepEd SF-9</Text>
                                <Text style={{fontSize: '6px', fontFamily:'Helvetica', marginLeft: 'auto'}}>School ID: {institution.gov_id || 'N/A'}</Text>
                            </View>
                            <View style={{display: 'flex', flexDirection: 'row', marginBottom: '3px'}}>
                                {/* NOTE: temporarily removed logo images to prevent PDFViewer blanking if remote assets fail */}
                                <View style={{height: 49, width: 49}} />
                                <View style={{display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px', marginHorizontal: '10px'}}>
                                    <Text style={{fontSize: '8px', fontFamily:'Helvetica'}}>Republic of the Philippines</Text>
                                    <Text style={{fontSize: '8px', fontFamily:'Helvetica'}}>Department of Education</Text>
                                    <Text style={{fontSize: '8px', fontFamily:'Helvetica-Bold'}}>Region XII-SOCCSKSARGEN</Text>
                                    <Text style={{fontSize: '8px', fontFamily:'Helvetica'}}>Division of General Santos City</Text>
                                </View>
                                <View style={{height: 49, width: 49}} />
                            </View>
                            <Text style={{fontSize: '6px', fontFamily:'Helvetica-Bold', alignSelf:'center'}}>{institution.title}</Text>
                            <Text style={{fontSize: '6px', fontFamily:'Helvetica-Bold', alignSelf:'center'}}>{institution.address || 'Address not available'}</Text>
                            
                            <View style={{backgroundColor: 'black', marginTop: '10px', width: '100%', paddingVertical: '4px'}}>
                                <Text style={{color: 'white', fontSize: '8px', fontFamily:'Helvetica-Bold', alignSelf:'center'}}>REPORT CARD </Text>
                            </View>
                            
                            <Text style={{fontFamily: 'Helvetica', fontSize: '8px', alignSelf:'flex-end'}}>
                                LRN: {student?.lrn && String(student.lrn).trim() ? student.lrn : '-'}
                            </Text>
                            
                            <View style={{marginTop: '2px', display: 'flex', flexDirection: 'row', alignSelf: 'flex-start'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px', textTransform: 'uppercase'}}>
                                    Name:{' '}
                                    <Text style={{textDecoration: 'underline'}}>
                                        {`${student.last_name || ''}, ${student.first_name || ''}${
                                            student.middle_name ? `, ${String(student.middle_name).trim().charAt(0)}.` : ''
                                        }${student.ext_name ? `, ${student.ext_name}` : ''}`.toUpperCase()}
                                    </Text>
                                </Text>
                            </View>
                            
                            <View style={{marginTop: '3px', display: 'flex', flexDirection: 'row', alignSelf: 'flex-start'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px', marginRight: 20}}>Age: <Text style={{textDecoration: 'underline'}}>{studentAge}</Text></Text>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Sex: <Text style={{textDecoration: 'underline'}}>{student.gender === 'male' ? 'M' : student.gender === 'female' ? 'F' : 'O'}</Text></Text>
                            </View>
                            
                            <View style={{marginTop: '3px', display: 'flex', flexDirection: 'row', alignSelf: 'flex-start'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px', marginRight: 8}}>Grade: <Text style={{textDecoration: 'underline'}}>{classSection.grade_level}</Text></Text>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Section: <Text style={{textDecoration: 'underline'}}>{classSection.title}</Text></Text>
                            </View>
                            
                            <View style={{marginTop: '3px', display: 'flex', flexDirection: 'row', alignSelf: 'flex-start'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>School Year: {academicYear}</Text>
                            </View>
                            
                            <View style={{marginTop: '5px', display: 'flex', flexDirection: 'column'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', marginBottom: '5px'}}>Dear Parent:</Text>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', marginLeft: '10px'}}>This report card shows the ability and progress your child has made</Text>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica'}}>in different learning areas as well as his/her core values.</Text>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', marginLeft: '10px'}}>{" "}The school welcomes you should you desire to know more about your</Text>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica'}}>child's progress.</Text>
                            </View>
                            
                            <View style={{marginTop: '3px', width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'space-between'}}>
                                <View style={{marginTop: '8px', width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                    <Text style={{fontSize: '8px', textTransform: 'uppercase', textDecoration: 'underline'}}>{principalDisplay}</Text>
                                    <Text style={{fontSize: '8px', fontFamily: 'Helvetica', marginTop: '2px'}}>Principal</Text>
                                </View>
                                <View style={{width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                    <Text style={{fontSize: '8px', textTransform: 'uppercase', textDecoration: 'underline'}}>{teacherName || ' '}</Text>
                                    <Text style={{fontSize: '8px', fontFamily: 'Helvetica', marginTop: '2px'}}>Teacher</Text>
                                </View>
                            </View>
                            
                            <View style={{backgroundColor: 'black', width: '100%', paddingVertical: '4px'}}>
                                <Text style={{color: 'white', fontSize: '8px', fontFamily:'Helvetica-Bold', alignSelf:'center'}}>Certificate of Transfer </Text>
                            </View>
                            
                            <View style={{marginTop: '0px', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '10px'}}></Text>
                                <View style={{display: 'flex', flexDirection: 'row', marginTop: '2px', marginBottom: '8px', alignSelf: 'flex-start'}}>
                                    <Text style={{fontSize: '8px', fontFamily: 'Helvetica'}}>Admitted to Grade:______________</Text>
                                    <Text style={{fontSize: '8px', fontFamily: 'Helvetica'}}>Section:______________</Text>
                                </View>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'flex-start'}}>Eligibility for Admission to Grade:_______________________</Text>
                                <View style={{display: 'flex', flexDirection: 'row', marginTop: '5px'}}>
                                    <View style={{width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                        <Text style={{fontSize: '8px', textTransform: 'uppercase', textDecoration: 'underline'}}>{principalDisplay}</Text>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica', marginTop: '2px'}}>Principal</Text>
                                    </View>
                                    <View style={{width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                        <Text style={{fontSize: '8px', textTransform: 'uppercase', textDecoration: 'underline'}}>{teacherName || ' '}</Text>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica', marginTop: '2px'}}>Teacher</Text>
                                    </View>
                                </View>
                            </View>
                            
                            <View style={{backgroundColor: 'black', marginTop: '2px', width: '100%', paddingVertical: '4px'}}>
                                <Text style={{color: 'white', fontSize: '8px', fontFamily:'Helvetica-Bold', alignSelf:'center'}}>CANCELLATION OF ELIGIBILITY TO TRANSFER </Text>
                            </View>
                            
                            <View style={{marginTop:"2px", display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: "100%"}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'flex-start'}}>Admitted in:_______________________</Text>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'flex-start'}}>Date: _____________________________</Text>
                                <View style={{width:"100%",display: 'flex', flexDirection: 'row', justifyContent: "flex-end"}}>
                                    <View style={{width: '50%', display: 'flex', flexDirection: 'column', alignItems: "center"}}>
                                        <Text>___________</Text>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica'}}>Principal</Text>
                                    </View>
                                </View>
                            </View>
                            
                        </View>
                        
                    </View>
                </Page>
                <Page size="A5" orientation="landscape" style={{display: 'flex', flexDirection: 'row', fontFamily: 'Helvetica'}}>
                    
                    <View style={{height: '100%', width: '50%', padding: '20px', display: 'flex', flexDirection: 'column'}}>
                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', marginBottom: '10px'}}>REPORT ON LEARNING PROGRESS AND ACHIEVEMENT</Text>
                        {/* TABLE HEADER */}
                        <View style={{display: 'flex', flexDirection: 'row', border: '1px solid black'}}>
                            <View style={{width: '30%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center'}}>Learning Areas</Text>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'column', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center'}}>Quarter</Text>
                                <View style={{display: 'flex', flexDirection: 'row', borderTop: '1px solid black'}}>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>1</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>2</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>3</Text>
                                    </View>
                                    <View style={{width: '25%'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>4</Text>
                                    </View>
                                </View>
                            </View>
                            <View style={{width: '10%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>Final Grade</Text>
                            </View>
                            <View style={{width: '20%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center'}}>Remarks</Text>
                            </View>
                        </View>

                        {/* ===== SUBJECTS START =====*/}
                        {subjects.map((subject) => {
                            const subjectGrades = grades.filter(grade => grade.subject_id === subject.id);
                            const quarter1Grade = getQuarterGrade(subjectGrades, '1');
                            const quarter2Grade = getQuarterGrade(subjectGrades, '2');
                            const quarter3Grade = getQuarterGrade(subjectGrades, '3');
                            const quarter4Grade = getQuarterGrade(subjectGrades, '4');
                            
                            // Calculate final grade for this subject
                            const subjectFinalGrade = calculateFinalGrade(subjectGrades);
                            const subjectRemarks = getPassFailRemarks(subjectFinalGrade);
                            
                            return (
                                <View key={subject.id} style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                                    <View style={{width: '30%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black', padding: '2px'}}>
                                        <Text style={{fontSize: '7px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>{subject.title}</Text>
                                    </View>
                                    <View style={{width: '40%', display: 'flex', flexDirection: 'row', borderRight: '1px solid black'}}>
                                        <View style={{width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2px'}}>
                                            <Text style={{fontSize: '7px', fontFamily: 'Helvetica', textAlign: 'center'}}>
                                                {quarter1Grade > 0 ? quarter1Grade : ''}
                                            </Text>
                                        </View>
                                        <View style={{width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2px'}}>
                                            <Text style={{fontSize: '7px', fontFamily: 'Helvetica', textAlign: 'center'}}>
                                                {quarter2Grade > 0 ? quarter2Grade : ''}
                                            </Text>
                                        </View>
                                        <View style={{width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2px'}}>
                                            <Text style={{fontSize: '7px', fontFamily: 'Helvetica', textAlign: 'center'}}>
                                                {quarter3Grade > 0 ? quarter3Grade : ''}
                                            </Text>
                                        </View>
                                        <View style={{width: '25%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2px'}}>
                                            <Text style={{fontSize: '7px', fontFamily: 'Helvetica', textAlign: 'center'}}>
                                                {quarter4Grade > 0 ? quarter4Grade : ''}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{width: '10%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black', padding: '2px'}}>
                                        <Text style={{fontSize: '7px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>
                                            {subjectFinalGrade > 0 ? subjectFinalGrade : ''}
                                        </Text>
                                    </View>
                                    <View style={{width: '20%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', padding: '2px'}}>
                                        <Text style={{fontSize: '7px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>
                                            {subjectFinalGrade > 0 ? subjectRemarks : ''}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                        {/* ===== SUBJECTS END =====*/}
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '70%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>GENERAL AVERAGE</Text>
                            </View>
                            <View style={{width: '10%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>
                                    {finalGrade > 0 ? finalGrade : ''}
                                </Text>
                            </View>
                            <View style={{width: '20%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>
                                    {finalGrade > 0 ? finalGradeRemarks : ''}
                                </Text>
                            </View>
                        </View>

                            <View style={{marginTop: '30px', display: 'flex', flexDirection: 'row', flexWrap: 'wrap'}}>
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
                    </View>
                    
                    <View style={{height: '100%', width: '50%', padding: '20px', display: 'flex', flexDirection: 'column'}}>
                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', marginBottom: '10px'}}>REPORT ON LEARNER'S OBSERVED VALUES</Text>
                        <View style={{display: 'flex', flexDirection: 'row', border: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>Core Values</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>Behavior Statements</Text>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'column'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center'}}>Quarter</Text>
                                <View style={{display: 'flex', flexDirection: 'row', borderTop: '1px solid black'}}>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>1</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>2</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>3</Text>
                                    </View>
                                    <View style={{width: '25%'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>4</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica', alignSelf: 'center'}}>Maka-Diyos</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection:'column', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <View style={{height: '30px', borderBottom: '1px solid black'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                        {CORE_VALUE_BEHAVIORS['Maka-Diyos'][0]}
                                    </Text>
                                </View>
                                <View>
                                    <Text style={{height: '25px', fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                        {CORE_VALUE_BEHAVIORS['Maka-Diyos'][1]}
                                    </Text>
                                </View>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Diyos', CORE_VALUE_BEHAVIORS['Maka-Diyos'][0], '1')}
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Diyos', CORE_VALUE_BEHAVIORS['Maka-Diyos'][1], '1')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Diyos', CORE_VALUE_BEHAVIORS['Maka-Diyos'][0], '2')}
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Diyos', CORE_VALUE_BEHAVIORS['Maka-Diyos'][1], '2')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Diyos', CORE_VALUE_BEHAVIORS['Maka-Diyos'][0], '3')}
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Diyos', CORE_VALUE_BEHAVIORS['Maka-Diyos'][1], '3')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Diyos', CORE_VALUE_BEHAVIORS['Maka-Diyos'][0], '4')}
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Diyos', CORE_VALUE_BEHAVIORS['Maka-Diyos'][1], '4')}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica', alignSelf: 'center'}}>Maka-Tao</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection:'column', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <View style={{height: '25px', width: '100%',  borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                        {CORE_VALUE_BEHAVIORS['Maka-Tao'][0]}
                                    </Text>
                                </View>
                                <View style={{height: '25px', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                        {CORE_VALUE_BEHAVIORS['Maka-Tao'][1]}
                                    </Text>
                                </View>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{height: '25px', width: '100%',  borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Tao', CORE_VALUE_BEHAVIORS['Maka-Tao'][0], '1')}
                                        </Text>
                                    </View>
                                    <View style={{height: '25px', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Tao', CORE_VALUE_BEHAVIORS['Maka-Tao'][1], '1')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{height: '25px', width: '100%',  borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Tao', CORE_VALUE_BEHAVIORS['Maka-Tao'][0], '2')}
                                        </Text>
                                    </View>
                                    <View style={{height: '25px', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Tao', CORE_VALUE_BEHAVIORS['Maka-Tao'][1], '2')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{height: '25px', width: '100%',  borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Tao', CORE_VALUE_BEHAVIORS['Maka-Tao'][0], '3')}
                                        </Text>
                                    </View>
                                    <View style={{height: '25px', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Tao', CORE_VALUE_BEHAVIORS['Maka-Tao'][1], '3')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{height: '25px', width: '100%',  borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Tao', CORE_VALUE_BEHAVIORS['Maka-Tao'][0], '4')}
                                        </Text>
                                    </View>
                                    <View style={{height: '25px', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '4px'}}>
                                            {mark('Maka-Tao', CORE_VALUE_BEHAVIORS['Maka-Tao'][1], '4')}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica', alignSelf: 'center'}}>Makakalikasan</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection:'column', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <View>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                        {CORE_VALUE_BEHAVIORS['Makakalikasan'][0]}
                                    </Text>
                                </View>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '6px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>{mark('Makakalikasan', CORE_VALUE_BEHAVIORS['Makakalikasan'][0], '1')}</Text>
                                </View>
                                <View style={{height:'100%' ,fontSize: '6px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>{mark('Makakalikasan', CORE_VALUE_BEHAVIORS['Makakalikasan'][0], '2')}</Text>
                                </View>
                                <View style={{height:'100%' ,fontSize: '6px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>{mark('Makakalikasan', CORE_VALUE_BEHAVIORS['Makakalikasan'][0], '3')}</Text>
                                </View>
                                <View style={{height:'100%' ,fontSize: '6px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>{mark('Makakalikasan', CORE_VALUE_BEHAVIORS['Makakalikasan'][0], '4')}</Text>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica', alignSelf: 'center'}}>Makabansa</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection:'column', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <View style={{height: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderBottom: '1px solid black'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                        {CORE_VALUE_BEHAVIORS['Makabansa'][0]}
                                    </Text>
                                </View>
                                <View style={{height: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                        {CORE_VALUE_BEHAVIORS['Makabansa'][1]}
                                    </Text>
                                </View>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{height: '30px', width: '100%',  borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                            {mark('Makabansa', CORE_VALUE_BEHAVIORS['Makabansa'][0], '1')}
                                        </Text>
                                    </View>
                                    <View style={{height: '30px', width: '100%',  display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                            {mark('Makabansa', CORE_VALUE_BEHAVIORS['Makabansa'][1], '1')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{height: '30px', width: '100%',  borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                            {mark('Makabansa', CORE_VALUE_BEHAVIORS['Makabansa'][0], '2')}
                                        </Text>
                                    </View>
                                    <View style={{height: '30px', width: '100%',  display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                            {mark('Makabansa', CORE_VALUE_BEHAVIORS['Makabansa'][1], '2')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{height: '30px', width: '100%',  borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                            {mark('Makabansa', CORE_VALUE_BEHAVIORS['Makabansa'][0], '3')}
                                        </Text>
                                    </View>
                                    <View style={{height: '30px', width: '100%',  display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                            {mark('Makabansa', CORE_VALUE_BEHAVIORS['Makabansa'][1], '3')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{height: '30px', width: '100%',  borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                            {mark('Makabansa', CORE_VALUE_BEHAVIORS['Makabansa'][0], '4')}
                                        </Text>
                                    </View>
                                    <View style={{height: '30px', width: '100%',  display: 'flex', flexDirection: 'column', justifyContent:'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', alignSelf: 'center', padding: '3px'}}>
                                            {mark('Makabansa', CORE_VALUE_BEHAVIORS['Makabansa'][1], '4')}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{marginTop: '20px', display: 'flex', flexDirection: 'column'}}>
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
                            <View style={{display: 'flex', flexDirection: 'row'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica', fontSize: '8px'}}> </Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}> </Text>
                            </View>
                        </View>
                        
                    </View>
                    
                </Page>
            </Document>
        </PDFViewer>
    );
};