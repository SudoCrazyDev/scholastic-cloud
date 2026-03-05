
import { useMemo } from 'react';
import { Page, Text, View, Document, PDFViewer, StyleSheet, Image } from '@react-pdf/renderer';
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

const ACADEMIC_YEAR_MONTHS = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
const ATTENDANCE_MONTH_LABELS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
const DEPED_LOGO_URL = 'https://depedrizal.ph/wp-content/uploads/2018/08/deped-logo.png';

const toAbsoluteUrl = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;

    if (raw.startsWith('/')) {
        const apiBase = (import.meta.env.VITE_API_URL || '').trim();
        if (apiBase) {
            try {
                const origin = new URL(apiBase).origin;
                return `${origin}${raw}`;
            } catch {
                // Fall back to current origin if VITE_API_URL is malformed.
            }
        }
        return `${window.location.origin}${raw}`;
    }

    return raw;
};

const formatGradeLevel = (value: unknown) => {
    const asText = String(value ?? '').trim();
    if (!asText) return '';
    return asText.replace(/^grade\s*/i, '').trim();
};

const formatTeacherName = (teacher: any) => {
    if (!teacher) return '';
    const first = String(teacher.first_name || '').trim();
    const middle = String(teacher.middle_name || '').trim();
    const last = String(teacher.last_name || '').trim();
    const middleInitial = middle ? `${middle.charAt(0)}.` : '';

    return [first, middleInitial, last].filter(Boolean).join(' ').trim();
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

    const attendanceByMonth = useMemo(() => {
        const map: Record<number, { schoolDays: number; present: number; absent: number }> = {};
        
        ACADEMIC_YEAR_MONTHS.forEach(month => {
            map[month] = { schoolDays: 0, present: 0, absent: 0 };
        });

        // Fill in school days data (normalize month to number in case API returns string)
        (schoolDays || []).forEach((schoolDay: any) => {
            const month = Number(schoolDay.month);
            if (month >= 1 && month <= 12 && map[month] !== undefined) {
                map[month].schoolDays = Number(schoolDay.total_days) || 0;
            }
        });

        // Fill in attendance data (days absent from API — we only store/edit days absent in the UI)
        (attendances || []).forEach((attendance: any) => {
            const month = Number(attendance.month);
            if (month >= 1 && month <= 12 && map[month] !== undefined) {
                map[month].absent = Number(attendance.days_absent) || 0;
            }
        });

        // Auto-calculate No. of days present = school days - days absent (per month)
        ACADEMIC_YEAR_MONTHS.forEach(month => {
            const school = map[month].schoolDays;
            const absent = map[month].absent;
            map[month].present = Math.max(0, school - absent);
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

    const getAttendanceForMonth = (academicYearMonthIndex: number) => {
        const month = ACADEMIC_YEAR_MONTHS[academicYearMonthIndex];
        return attendanceByMonth[month] || { schoolDays: 0, present: 0, absent: 0 };
    };

    // General average: one entry per parent subject; subjects with variants count as one. MUST be above early returns (hooks order).
    const generalAverage = useMemo(() => {
        const parentSubjects = (subjects || []).filter((s: any) => s.subject_type === 'parent');
        let sum = 0;
        let count = 0;
        for (const parent of parentSubjects) {
            const subjectIdsInArea = [
                parent.id,
                ...(subjects || []).filter((s: any) => s.parent_subject_id === parent.id).map((s: any) => s.id),
            ];
            const gradesInArea = subjectIdsInArea
                .map((sid: string) => calculateFinalGrade((grades || []).filter((g: any) => g.subject_id === sid)))
                .filter((g: number) => g > 0);
            if (gradesInArea.length === 0) continue;
            const areaGrade = Math.round(
                gradesInArea.reduce((a: number, b: number) => a + b, 0) / gradesInArea.length
            );
            sum += areaGrade;
            count += 1;
        }
        return count === 0 ? 0 : Math.round(sum / count);
    }, [subjects, grades]);

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

    const studentAge = calculateAge(student.birthdate);
    const teacher = (classSection as any)?.adviser
    const teacherName = formatTeacherName(teacher)
    const schoolLogoUrl = toAbsoluteUrl(institution.logo)
    const leftHeaderLogo = DEPED_LOGO_URL
    const rightHeaderLogo = schoolLogoUrl || DEPED_LOGO_URL
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
                                    {ATTENDANCE_MONTH_LABELS.map((monthLabel) => (
                                        <View key={monthLabel} style={styles.attendanceMonthContainer}>
                                            <Text style={styles.attendanceMonthText}>{monthLabel}</Text>
                                        </View>
                                    ))}
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
                                {leftHeaderLogo ? (
                                    <Image src={leftHeaderLogo} style={{height: 49, width: 49, objectFit: 'contain'}} />
                                ) : (
                                    <View style={{height: 49, width: 49}} />
                                )}
                                <View style={{display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px', marginHorizontal: '10px'}}>
                                    <Text style={{fontSize: '8px', fontFamily:'Helvetica'}}>Republic of the Philippines</Text>
                                    <Text style={{fontSize: '8px', fontFamily:'Helvetica'}}>Department of Education</Text>
                                    <Text style={{fontSize: '8px', fontFamily:'Helvetica-Bold'}}>Region XII-SOCCSKSARGEN</Text>
                                    <Text style={{fontSize: '8px', fontFamily:'Helvetica'}}>Division of General Santos City</Text>
                                </View>
                                {rightHeaderLogo ? (
                                    <Image src={rightHeaderLogo} style={{height: 49, width: 49, objectFit: 'contain'}} />
                                ) : (
                                    <View style={{height: 49, width: 49}} />
                                )}
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
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px', marginRight: 8}}>Grade: <Text style={{textDecoration: 'underline'}}>{formatGradeLevel(classSection.grade_level)}</Text></Text>
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
                                    <Text style={{fontSize: '8px', textDecoration: 'underline'}}>{teacherName || ' '}</Text>
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
                                        <Text style={{fontSize: '8px', textDecoration: 'underline'}}>{teacherName || ' '}</Text>
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
                        {subjects
                            .filter(subject => {
                                if (subject.variant) {
                                    const subjectGrades = grades.filter(grade => grade.subject_id === subject.id);
                                    return subjectGrades.some(g => {
                                        const q = Number((g as any).quarter_grade || (g as any).grade || 0);
                                        return q > 0;
                                    }) || subjectGrades.length > 0;
                                }
                                return true;
                            })
                            .sort((a, b) => {
                                if (a.subject_type === 'parent' && b.subject_type === 'parent') return a.order - b.order;
                                if (a.subject_type === 'child' && b.subject_type === 'child') {
                                    if (a.parent_subject_id !== b.parent_subject_id) {
                                        const aParentOrder = subjects.find(s => s.id === a.parent_subject_id)?.order || 0;
                                        const bParentOrder = subjects.find(s => s.id === b.parent_subject_id)?.order || 0;
                                        return aParentOrder - bParentOrder;
                                    }
                                    return a.order - b.order;
                                }
                                if (a.subject_type === 'parent' && b.subject_type === 'child') {
                                    if (b.parent_subject_id === a.id) return -1;
                                    const bParentOrder = subjects.find(s => s.id === b.parent_subject_id)?.order || 0;
                                    return a.order - bParentOrder;
                                }
                                if (a.subject_type === 'child' && b.subject_type === 'parent') {
                                    if (a.parent_subject_id === b.id) return 1;
                                    const aParentOrder = subjects.find(s => s.id === a.parent_subject_id)?.order || 0;
                                    return aParentOrder - b.order;
                                }
                                return a.order - b.order;
                            })
                            .map((subject) => {
                            const subjectGrades = grades.filter(grade => grade.subject_id === subject.id);
                            const quarter1Grade = getQuarterGrade(subjectGrades, '1');
                            const quarter2Grade = getQuarterGrade(subjectGrades, '2');
                            const quarter3Grade = getQuarterGrade(subjectGrades, '3');
                            const quarter4Grade = getQuarterGrade(subjectGrades, '4');
                            
                            const subjectFinalGrade = calculateFinalGrade(subjectGrades);
                            const subjectRemarks = getPassFailRemarks(subjectFinalGrade);
                            const displayTitle = subject.variant ? `${subject.title} - ${subject.variant}` : subject.title;
                            const isChild = subject.subject_type === 'child';
                            const showFinalAndRemarks = !isChild && subjectFinalGrade > 0;
                            
                            return (
                                <View key={subject.id} style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                                    <View style={{width: '30%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'flex-start', borderRight: '1px solid black', padding: '2px'}}>
                                        <Text style={{fontSize: '7px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center', marginLeft: isChild ? '10px' : '0px'}}>{displayTitle}</Text>
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
                                            {showFinalAndRemarks ? subjectFinalGrade : ''}
                                        </Text>
                                    </View>
                                    <View style={{width: '20%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', padding: '2px'}}>
                                        <Text style={{fontSize: '7px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>
                                            {showFinalAndRemarks ? subjectRemarks : ''}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                        {/* ===== SUBJECTS END =====*/}
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '90%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', alignSelf: 'center'}}>GENERAL AVERAGE</Text>
                            </View>
                            <View style={{width: '10%', display: 'flex', flexDirection:'row', alignContent: 'center', justifyContent: 'center'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', alignSelf: 'center', textAlign: 'center'}}>
                                    {generalAverage > 0 ? generalAverage : ''}
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