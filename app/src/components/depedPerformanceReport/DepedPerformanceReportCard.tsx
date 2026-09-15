import { useMemo } from 'react';
import { Page, Text, View, Document, PDFViewer, StyleSheet, Image, Font } from '@react-pdf/renderer';

import { useStudentReportCard } from '../../hooks/useStudentReportCard';
import { useInstitutionLogo } from '../../hooks/useInstitutionLogo';
import { useGradingPeriodsForYear } from '../../hooks/useGradingPeriods';
import { calculateFinalGrade, getPassFailRemarks, getQuarterGrade, calculateAgeAsOfOctober31 } from '../../utils/gradeUtils';
import { fitPdfSingleLineFontSizePx, formatStudentNameReportCard } from '../../utils/reportCardPdfUtils';
import { PERFORMANCE_DESCRIPTOR_BANDS } from './depedPerformanceDescriptors';
import type { SchoolDay, StudentAttendance, Subject, User } from '../../types';
import type { StudentRunningGrade } from '../../services/studentRunningGradeService';

// Prevent mid-word hyphenation so long learning-area names wrap at word
// boundaries, as in the existing card.
Font.registerHyphenationCallback((word) => [word]);

/**
 * DepEd's Learner's Performance Report — Annex G of DepEd Order 15, s. 2026.
 *
 * ## This is a second card, not a new version of the first one
 *
 * `components/studentReportCard/studentReportCard.tsx` prints the DO 8, s. 2015
 * form and keeps printing it. DO 15 repealed DO 8, but a school hands out cards
 * for years it has already graded, and which form a parent receives is the
 * school's decision to announce. So the two live side by side and share their
 * data source (`useStudentReportCard`) and nothing else. Nothing here should be
 * imported by the older card, and nothing there should be changed to suit this.
 *
 * ## What actually differs, and why each difference is load-bearing
 *
 * - **Three term columns, never four.** DO 9, s. 2026 replaced the four-quarter
 *   calendar with three terms, and Annex G is drawn with exactly three. There is
 *   no honest way to render a four-quarter year on it, so the caller refuses
 *   rather than dropping a quarter — see `ClassSectionPerformanceReportTab`.
 * - **New descriptors.** Advancing / Benchmarking / Connecting / Developing /
 *   Emerging, from Table 11, replacing Outstanding … Did Not Meet Expectations.
 *   They live in `depedPerformanceDescriptors.ts` so the two cards' legends
 *   cannot drift into each other.
 * - **No Observed Values table.** DO 15 drops the Maka-Diyos / Maka-Tao /
 *   Makakalikasan / Makabansa grid with its AO/SO/RO/NO marks; values are
 *   carried by the GMRC / Values Education row of the learning-area table
 *   instead. The data is still recorded — the Core Values tab and the older card
 *   both still use it — this form simply has nowhere to print it.
 * - **Teacher's comments are three empty ruled boxes.** DepEd's template leaves
 *   them blank for the adviser to write in, and the platform stores no per-term
 *   adviser remark for a numeric section, so they print blank. If a field for
 *   them is ever added, this is where it lands.
 *
 * ## Page size
 *
 * A4 landscape, one sheet, two columns — the proportions Annex G is drawn at.
 * The older card is A5 landscape across two sheets; this one carries three
 * comment boxes and a Remarks column it does not, and will not fit on a half
 * sheet without shrinking the table past reading size.
 */

/** Local asset (public/deped-logo.png) to avoid CORS from external URLs. */
const DEPED_LOGO_URL = '/deped-logo.png';

/**
 * The attendance window, and why it is spelled out here rather than imported.
 *
 * These are the same ten months the numeric attendance record is kept in, so the
 * figures match the Attendance tab and the older card exactly. It is a local
 * constant because the two cards' month tables are free to diverge — DepEd's
 * Annex G leaves its month headings blank for the school to fill — and a shared
 * constant would quietly tie a change in one form to the other.
 */
const ACADEMIC_YEAR_MONTHS = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const ATTENDANCE_MONTH_LABELS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

const toAbsoluteUrl = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;

    if (raw.startsWith('/')) {
        const apiBase = (import.meta.env.VITE_API_URL || '').trim();
        if (apiBase) {
            try {
                return `${new URL(apiBase).origin}${raw}`;
            } catch {
                // Fall back to current origin if VITE_API_URL is malformed.
            }
        }
        return `${window.location.origin}${raw}`;
    }

    return raw;
};

const formatGradeLevel = (value: unknown) => String(value ?? '').trim().replace(/^grade\s*/i, '').trim();

/** Next grade for the eligibility line: numeric grade level + 1 (e.g. 7 → 8). */
const incrementGradeLevelDisplay = (value: unknown) => {
    const n = parseInt(formatGradeLevel(value), 10);
    return Number.isNaN(n) ? '' : String(n + 1);
};

const formatTeacherName = (teacher: User | null | undefined) => {
    if (!teacher) return '';
    const first = String(teacher.first_name || '').trim();
    const middle = String(teacher.middle_name || '').trim();
    const last = String(teacher.last_name || '').trim();
    return [first, middle ? `${middle.charAt(0)}.` : '', last].filter(Boolean).join(' ').trim();
};

/**
 * A ruled blank: the line a DepEd form leaves for a value, with the value
 * sitting on it.
 *
 * Annex G draws a rule under every fill-in — Name, LRN, Age, Sex, Grade,
 * Section, the signature lines, the transfer grades — and the rule is there
 * whether or not anything is written on it. Underlining the *text* instead, as
 * the older card does, gives a line only as wide as the value and none at all
 * when there is nothing to print, which is not the same document.
 *
 * `flexGrow` rather than a width so a row of these divides the space it is
 * given; the line then stretches to the column instead of being a guessed
 * number of underscores.
 */
const RuledBlank = ({ value = '', grow = 1, align = 'left' as 'left' | 'center' }) => (
    <View style={{ flexGrow: grow, flexBasis: 0, borderBottom: '1px solid black', marginLeft: 3, justifyContent: 'flex-end' }}>
        <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica', textAlign: align, paddingBottom: 1 }}>
            {value || ' '}
        </Text>
    </View>
);

const styles = StyleSheet.create({
    page: { display: 'flex', flexDirection: 'row', fontFamily: 'Helvetica', paddingVertical: 18 },
    column: { width: '50%', paddingHorizontal: 18, display: 'flex', flexDirection: 'column' },
    sectionHeading: { fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4 },
    cell: { fontSize: 7, fontFamily: 'Helvetica', textAlign: 'center' },
    cellBold: { fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
    label: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
    body: { fontSize: 7.5, fontFamily: 'Helvetica' },
    tableOuter: { borderTop: '1px solid black', borderLeft: '1px solid black' },
    row: { display: 'flex', flexDirection: 'row' },
    // Attendance: 22% label + 10 months + Total, each 7.09% → 92.9% + 22% wraps,
    // so the label column is narrower than the older card's to fit eleven cells.
    attendanceCell: { width: '7.09%', borderRight: '1px solid black', borderBottom: '1px solid black', paddingVertical: 2, justifyContent: 'center' },
    attendanceLabel: { width: '22%', borderRight: '1px solid black', borderBottom: '1px solid black', padding: 2, justifyContent: 'center' },
    commentBox: { borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black', height: 34, padding: 3 },
});

interface DepedPerformanceReportCardProps {
    studentId?: string;
    classSectionId?: string;
    institutionId?: string;
    academicYear?: string;
    viewerKey?: string;
    viewerHeight?: string;
    principalName?: string;
    /** When set, displayed instead of the age calculated as of 31 October. */
    overrideAge?: string;
}

export default function DepedPerformanceReportCard({
    studentId = '',
    classSectionId = '',
    institutionId = '',
    academicYear = '2026-2027',
    viewerKey,
    viewerHeight = '100%',
    principalName = '',
    overrideAge,
}: DepedPerformanceReportCardProps) {
    const {
        student,
        institution,
        classSection,
        subjects,
        grades,
        attendances,
        schoolDays,
        isLoading,
        error,
    } = useStudentReportCard({ studentId, classSectionId, institutionId, academicYear, enabled: true });

    const { schoolLogoUrl } = useInstitutionLogo(institutionId || undefined);

    /*
     * Read from the year rather than assumed, even though this form only ever
     * draws three columns. The tab refuses a four-quarter year before rendering
     * this, so `periods` is three here — but reading it keeps the labels ("Term
     * 1") coming from the one place that owns them.
     */
    const gradingPeriods = useGradingPeriodsForYear(academicYear);
    const periodValues = gradingPeriods.values;
    /** Of the *header band*, which is 27% of the row. */
    const periodColumnWidth = `${100 / gradingPeriods.count}%`;
    /** Of the whole row — body cells are siblings of every other column. */
    const termCellWidth = `${27 / gradingPeriods.count}%`;

    const attendanceByMonth = useMemo(() => {
        const map: Record<number, { classDays: number; present: number; absent: number }> = {};
        ACADEMIC_YEAR_MONTHS.forEach((month) => { map[month] = { classDays: 0, present: 0, absent: 0 }; });

        (schoolDays || []).forEach((schoolDay: SchoolDay) => {
            const month = Number(schoolDay.month);
            if (map[month] !== undefined) map[month].classDays = Number(schoolDay.total_days) || 0;
        });

        // Only days absent are stored; present is the remainder of the month's
        // class days, exactly as the older card derives it.
        (attendances || []).forEach((attendance: StudentAttendance) => {
            const month = Number(attendance.month);
            if (map[month] !== undefined) map[month].absent = Number(attendance.days_absent) || 0;
        });

        ACADEMIC_YEAR_MONTHS.forEach((month) => {
            map[month].present = Math.max(0, map[month].classDays - map[month].absent);
        });

        return map;
    }, [attendances, schoolDays]);

    const attendanceTotals = useMemo(() => {
        return Object.values(attendanceByMonth).reduce(
            (totals, month) => ({
                classDays: totals.classDays + month.classDays,
                present: totals.present + month.present,
                absent: totals.absent + month.absent,
            }),
            { classDays: 0, present: 0, absent: 0 }
        );
    }, [attendanceByMonth]);

    /**
     * Learning areas in the order the section lists them, parents before their
     * own children.
     *
     * Same ordering the older card uses. A child subject (MAPEH's Music and
     * Arts, say) prints indented under its parent and carries term grades but no
     * final grade of its own — the parent row holds that.
     */
    const orderedSubjects = useMemo(() => {
        const list = (subjects || []).filter((subject: Subject) => {
            if (!subject.variant) return true;
            return (grades || []).some((grade: StudentRunningGrade) => grade.subject_id === subject.id);
        });

        const orderOf = (subject: Subject) =>
            subject.subject_type === 'child'
                ? list.find((s: Subject) => s.id === subject.parent_subject_id)?.order ?? subject.order ?? 0
                : subject.order ?? 0;

        return [...list].sort((a: Subject, b: Subject) => {
            const byParent = orderOf(a) - orderOf(b);
            if (byParent !== 0) return byParent;
            // Within one area the parent leads, then its children by their own order.
            if (a.subject_type === 'child' && b.subject_type !== 'child') return 1;
            if (b.subject_type === 'child' && a.subject_type !== 'child') return -1;
            return (a.order ?? 0) - (b.order ?? 0);
        });
    }, [subjects, grades]);

    /**
     * General Average: the mean of the final grades, one entry per learning
     * area, whole number. DO 15 §53.
     *
     * Areas the learner has no grades in are skipped rather than counted as
     * zero — a section may offer four specialisations and a learner take one.
     */
    const generalAverage = useMemo(() => {
        const parents = (subjects || []).filter((s: Subject) => s.subject_type === 'parent');
        let sum = 0;
        let count = 0;

        for (const parent of parents) {
            const idsInArea = [
                parent.id,
                ...(subjects || []).filter((s: Subject) => s.parent_subject_id === parent.id).map((s: Subject) => s.id),
            ];
            const areaGrades = idsInArea
                .map((id: string) => calculateFinalGrade((grades || []).filter((g: StudentRunningGrade) => g.subject_id === id)))
                .filter((grade: number) => grade > 0);

            if (areaGrades.length === 0) continue;
            sum += Math.round(areaGrades.reduce((a: number, b: number) => a + b, 0) / areaGrades.length);
            count += 1;
        }

        return count === 0 ? 0 : Math.round(sum / count);
    }, [subjects, grades]);

    /**
     * The General Average only prints once every area the learner has marks in
     * has a grade for all three terms. A part-year average on a card a parent
     * keeps reads as a final one.
     */
    const allTermsComplete = useMemo(() => {
        const parents = (subjects || []).filter((s: Subject) => s.subject_type === 'parent');

        for (const parent of parents) {
            const idsInArea = [
                parent.id,
                ...(subjects || []).filter((s: Subject) => s.parent_subject_id === parent.id).map((s: Subject) => s.id),
            ];
            const idsWithGrades = idsInArea.filter(
                (id: string) => (grades || []).some((g: StudentRunningGrade) => g.subject_id === id)
            );
            if (idsWithGrades.length === 0) continue;

            for (const id of idsWithGrades) {
                const subjectGrades = (grades || []).filter((g: StudentRunningGrade) => g.subject_id === id);
                if (!periodValues.every((period) => getQuarterGrade(subjectGrades, period) > 0)) return false;
            }
        }

        return true;
    }, [subjects, grades, periodValues]);

    if (isLoading) {
        return (
            <div className="w-full flex items-center justify-center bg-white" style={{ height: viewerHeight }}>
                <div className="text-sm text-gray-600">Loading performance report…</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full flex items-center justify-center bg-white" style={{ height: viewerHeight }}>
                <div className="text-sm text-red-700">Error loading performance report: {error}</div>
            </div>
        );
    }

    const studentAge = overrideAge !== undefined && overrideAge !== ''
        ? overrideAge
        : calculateAgeAsOfOctober31(student.birthdate, academicYear);
    const teacherName = formatTeacherName(classSection?.adviser_user);
    const principalDisplay = (principalName || '').trim() || ' ';
    const schoolLogo = schoolLogoUrl || toAbsoluteUrl(institution?.logo) || '';
    const teacherNameFontPx = fitPdfSingleLineFontSizePx(teacherName || ' ', 150, 8);
    const principalNameFontPx = fitPdfSingleLineFontSizePx(principalDisplay, 150, 8);

    const pdfKey = viewerKey || `${studentId}|${classSectionId}|${institutionId}|${academicYear}`;

    return (
        <PDFViewer key={pdfKey} className="w-full" style={{ height: viewerHeight }}>
            <Document>
                <Page size="A4" orientation="landscape" style={styles.page}>

                    {/* ── Left column: identity, learning areas, legend ─────────── */}
                    <View style={styles.column}>
                        <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                            <Image src={DEPED_LOGO_URL} style={{ height: 40, width: 40, objectFit: 'contain' }} />
                            <View style={{ flexGrow: 1, alignItems: 'center' }}>
                                <Text style={{ fontSize: 7 }}>Republic of the Philippines</Text>
                                <Text style={{ fontSize: 7 }}>Department of Education</Text>
                                <Text style={{ fontSize: 7 }}>{institution.region || 'Region ______'}</Text>
                                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }}>
                                    SCHOOLS DIVISION OFFICE OF {String(institution.division || '').toUpperCase() || '____________'}
                                </Text>
                                <Text style={{ fontSize: 7 }}>{institution.address || ''}</Text>
                                <Text style={{ fontSize: 7, marginTop: 1 }}>School: {institution.title || ''}</Text>
                            </View>
                            {schoolLogo
                                ? <Image src={schoolLogo} style={{ height: 40, width: 40, objectFit: 'contain' }} />
                                : <View style={{ height: 40, width: 40 }} />}
                        </View>

                        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 6 }}>
                            LEARNER'S PERFORMANCE REPORT
                        </Text>
                        <Text style={{ fontSize: 7, textAlign: 'center' }}>School Year {academicYear}</Text>

                        <View style={{ marginTop: 6 }}>
                            <View style={[styles.row, { alignItems: 'flex-end' }]}>
                                <Text style={styles.body}>Name:</Text>
                                <RuledBlank grow={3} value={formatStudentNameReportCard(student).toUpperCase()} />
                                <Text style={[styles.body, { marginLeft: 8 }]}>Age:</Text>
                                <RuledBlank value={String(studentAge)} align="center" />
                                <Text style={[styles.body, { marginLeft: 8 }]}>Sex:</Text>
                                <RuledBlank
                                    align="center"
                                    value={student.gender === 'male' ? 'M' : student.gender === 'female' ? 'F' : 'O'}
                                />
                            </View>
                            <View style={[styles.row, { marginTop: 4, alignItems: 'flex-end' }]}>
                                <Text style={styles.body}>LRN:</Text>
                                <RuledBlank
                                    grow={3}
                                    value={student?.lrn && String(student.lrn).trim() ? String(student.lrn) : ''}
                                />
                                <Text style={[styles.body, { marginLeft: 8 }]}>Grade:</Text>
                                <RuledBlank align="center" value={formatGradeLevel(classSection.grade_level)} />
                                <Text style={[styles.body, { marginLeft: 8 }]}>Section:</Text>
                                <RuledBlank align="center" value={classSection.title || ''} />
                            </View>
                        </View>

                        <View style={{ marginTop: 6 }}>
                            <Text style={styles.body}>Dear Parents,</Text>
                            <Text style={[styles.body, { marginTop: 1 }]}>
                                {'    '}This Performance Report shows the ability and progress your child has made in
                                the different learning areas as well as his/her core values.
                            </Text>
                            <Text style={styles.body}>
                                {'    '}The school welcomes you should you desire to know more about your child's progress.
                            </Text>
                        </View>

                        <Text style={[styles.sectionHeading, { marginTop: 8 }]}>LEARNING PROGRESS AND ACHIEVEMENT</Text>

                        {/* Header: Learning Areas | TERM 1 2 3 | Final Grade | Remarks */}
                        <View style={styles.tableOuter}>
                            <View style={styles.row}>
                                <View style={{ width: '40%', borderRight: '1px solid black', borderBottom: '1px solid black', justifyContent: 'center', padding: 2 }}>
                                    <Text style={styles.cellBold}>Learning Areas</Text>
                                </View>
                                <View style={{ width: '27%', borderRight: '1px solid black', borderBottom: '1px solid black' }}>
                                    <Text style={[styles.cellBold, { paddingVertical: 1 }]}>{gradingPeriods.noun.toUpperCase()}</Text>
                                    <View style={[styles.row, { borderTop: '1px solid black' }]}>
                                        {gradingPeriods.periods.map((period, index) => (
                                            <View
                                                key={`head-${period.value}`}
                                                style={{
                                                    width: periodColumnWidth,
                                                    borderRight: index === gradingPeriods.count - 1 ? undefined : '1px solid black',
                                                    paddingVertical: 1,
                                                }}
                                            >
                                                <Text style={styles.cellBold}>{period.value}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                                <View style={{ width: '13%', borderRight: '1px solid black', borderBottom: '1px solid black', justifyContent: 'center', padding: 2 }}>
                                    <Text style={styles.cellBold}>Final Grade</Text>
                                </View>
                                <View style={{ width: '20%', borderRight: '1px solid black', borderBottom: '1px solid black', justifyContent: 'center', padding: 2 }}>
                                    <Text style={styles.cellBold}>Remarks</Text>
                                </View>
                            </View>

                            {orderedSubjects.map((subject: Subject) => {
                                const subjectGrades = (grades || []).filter((g: StudentRunningGrade) => g.subject_id === subject.id);
                                const termGrades = periodValues.map((period) => getQuarterGrade(subjectGrades, period));
                                const finalGrade = calculateFinalGrade(subjectGrades);
                                const isChild = subject.subject_type === 'child';
                                const complete = termGrades.every((grade) => grade > 0);
                                // A child row carries term marks only; its parent holds the area's
                                // final grade, which is what DO 15 §52 averages.
                                const showFinal = !isChild && complete && finalGrade > 0;

                                return (
                                    <View key={subject.id} style={styles.row}>
                                        <View style={{ width: '40%', borderRight: '1px solid black', borderBottom: '1px solid black', padding: 2, justifyContent: 'center' }}>
                                            <Text style={[styles.cell, {
                                                textAlign: 'left',
                                                marginLeft: isChild ? 10 : 0,
                                                fontFamily: isChild ? 'Helvetica-Oblique' : 'Helvetica',
                                            }]}>
                                                {subject.variant ? `${subject.title} – ${subject.variant}` : subject.title}
                                            </Text>
                                        </View>
                                        {/*
                                          * Term cells are siblings of the other columns, not a
                                          * nested row inside a 27% wrapper.
                                          *
                                          * Nested, the inner row is only as tall as its own text,
                                          * so on any row the Learning Areas cell makes taller — a
                                          * wrapped subject title, or a parent like MAPEH sitting
                                          * above its children — the cells' right-hand rules stopped
                                          * short and the column looked broken. Flat siblings all
                                          * stretch to the row, so every rule runs its full height.
                                          */}
                                        {termGrades.map((grade, index) => (
                                            <View
                                                key={`${subject.id}-${periodValues[index]}`}
                                                style={{
                                                    width: termCellWidth,
                                                    borderRight: '1px solid black',
                                                    borderBottom: '1px solid black',
                                                    paddingVertical: 2,
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                <Text style={styles.cell}>{grade > 0 ? grade : ''}</Text>
                                            </View>
                                        ))}
                                        <View style={{ width: '13%', borderRight: '1px solid black', borderBottom: '1px solid black', paddingVertical: 2, justifyContent: 'center' }}>
                                            <Text style={styles.cell}>{showFinal ? finalGrade : ''}</Text>
                                        </View>
                                        <View style={{ width: '20%', borderRight: '1px solid black', borderBottom: '1px solid black', paddingVertical: 2, justifyContent: 'center' }}>
                                            <Text style={styles.cell}>{showFinal ? getPassFailRemarks(finalGrade) : ''}</Text>
                                        </View>
                                    </View>
                                );
                            })}

                            <View style={styles.row}>
                                <View style={{ width: '67%', borderRight: '1px solid black', borderBottom: '1px solid black', paddingVertical: 2, justifyContent: 'center' }}>
                                    <Text style={[styles.cellBold, { textAlign: 'right', paddingRight: 6 }]}>General Average</Text>
                                </View>
                                <View style={{ width: '13%', borderRight: '1px solid black', borderBottom: '1px solid black', paddingVertical: 2, justifyContent: 'center' }}>
                                    <Text style={styles.cellBold}>
                                        {allTermsComplete && generalAverage > 0 ? generalAverage : ''}
                                    </Text>
                                </View>
                                <View style={{ width: '20%', borderRight: '1px solid black', borderBottom: '1px solid black' }} />
                            </View>
                        </View>

                        <Text style={[styles.label, { marginTop: 8 }]}>PERFORMANCE DESCRIPTORS</Text>
                        <View style={[styles.row, { marginTop: 3 }]}>
                            <Text style={[styles.cellBold, { width: '30%' }]}>Grading Scale</Text>
                            <Text style={[styles.cellBold, { width: '45%' }]}>Description</Text>
                            <Text style={[styles.cellBold, { width: '25%' }]}>Remarks</Text>
                        </View>
                        {PERFORMANCE_DESCRIPTOR_BANDS.map((band) => (
                            <View key={band.scale} style={styles.row}>
                                <Text style={[styles.cell, { width: '30%' }]}>{band.scale}</Text>
                                <Text style={[styles.cell, { width: '45%' }]}>{band.description}</Text>
                                <Text style={[styles.cell, { width: '25%' }]}>{band.remarks}</Text>
                            </View>
                        ))}
                    </View>

                    {/* ── Right column: attendance, comments, signatures, transfer ─ */}
                    <View style={styles.column}>
                        <Text style={styles.sectionHeading}>ATTENDANCE RECORD</Text>
                        <View style={styles.tableOuter}>
                            <View style={styles.row}>
                                <View style={styles.attendanceLabel}>
                                    <Text style={styles.cellBold}>Month</Text>
                                </View>
                                {ATTENDANCE_MONTH_LABELS.map((month) => (
                                    <View key={month} style={styles.attendanceCell}>
                                        <Text style={styles.cell}>{month}</Text>
                                    </View>
                                ))}
                                <View style={styles.attendanceCell}>
                                    <Text style={styles.cellBold}>Total</Text>
                                </View>
                            </View>

                            {([
                                ['No. of Class Days', 'classDays'],
                                ['No. of Days Present', 'present'],
                                ['No. of Days Absent', 'absent'],
                            ] as const).map(([label, key]) => (
                                <View key={key} style={styles.row}>
                                    <View style={styles.attendanceLabel}>
                                        <Text style={[styles.cell, { textAlign: 'left', fontSize: 6 }]}>{label}</Text>
                                    </View>
                                    {ACADEMIC_YEAR_MONTHS.map((month) => {
                                        const value = attendanceByMonth[month]?.[key] ?? 0;
                                        return (
                                            <View key={`${key}-${month}`} style={styles.attendanceCell}>
                                                <Text style={styles.cell}>{value > 0 ? value : ''}</Text>
                                            </View>
                                        );
                                    })}
                                    <View style={styles.attendanceCell}>
                                        <Text style={styles.cellBold}>
                                            {attendanceTotals[key] > 0 ? attendanceTotals[key] : ''}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        <Text style={[styles.sectionHeading, { marginTop: 10 }]}>TEACHER'S COMMENTS/REMARKS</Text>
                        <View style={{ borderTop: '1px solid black' }}>
                            {gradingPeriods.periods.map((period) => (
                                <View key={`comment-${period.value}`} style={styles.commentBox}>
                                    <Text style={styles.label}>{period.numbered}</Text>
                                </View>
                            ))}
                        </View>

                        <Text style={[styles.sectionHeading, { marginTop: 10 }]}>PARENTS/GUARDIAN'S SIGNATURE</Text>
                        {gradingPeriods.periods.map((period) => (
                            <View key={`sign-${period.value}`} style={[styles.row, { marginTop: 10, alignItems: 'flex-end' }]}>
                                <Text style={[styles.label, { width: '22%' }]}>{period.numbered}</Text>
                                <RuledBlank grow={1} />
                            </View>
                        ))}

                        <Text style={[styles.sectionHeading, { marginTop: 10 }]}>CERTIFICATE OF TRANSFER</Text>
                        <Text style={styles.body}>
                            This is to certify that the above-named learner has satisfactorily completed the
                            requirements for the grade level indicated.
                        </Text>
                        <View style={[styles.row, { marginTop: 6, alignItems: 'flex-end' }]}>
                            <Text style={styles.body}>Admitted to Grade:</Text>
                            <RuledBlank value={formatGradeLevel(classSection.grade_level)} />
                        </View>
                        <View style={[styles.row, { marginTop: 4, alignItems: 'flex-end' }]}>
                            <Text style={styles.body}>Eligible for Admission to Grade:</Text>
                            <RuledBlank value={incrementGradeLevelDisplay(classSection.grade_level)} />
                        </View>
                        <Text style={[styles.body, { marginTop: 4 }]}>Approved:</Text>

                        <View style={[styles.row, { marginTop: 16 }]}>
                            <View style={{ width: '50%', paddingRight: 8 }}>
                                <View style={{ borderBottom: '1px solid black', justifyContent: 'flex-end' }}>
                                    <Text wrap={false} style={{ fontSize: principalNameFontPx, fontFamily: 'Helvetica', textTransform: 'uppercase', textAlign: 'center', paddingBottom: 1 }}>
                                        {principalDisplay}
                                    </Text>
                                </View>
                                <Text style={[styles.body, { marginTop: 1, textAlign: 'center' }]}>School Head</Text>
                            </View>
                            <View style={{ width: '50%', paddingLeft: 8 }}>
                                <View style={{ borderBottom: '1px solid black', justifyContent: 'flex-end' }}>
                                    <Text wrap={false} style={{ fontSize: teacherNameFontPx, fontFamily: 'Helvetica', textAlign: 'center', paddingBottom: 1 }}>
                                        {teacherName || ' '}
                                    </Text>
                                </View>
                                <Text style={[styles.body, { marginTop: 1, textAlign: 'center' }]}>Adviser</Text>
                            </View>
                        </View>

                        <Text style={[styles.sectionHeading, { marginTop: 10 }]}>CANCELLATION OF ELIGIBILITY TO TRANSFER</Text>
                        <View style={[styles.row, { marginTop: 4, alignItems: 'flex-end' }]}>
                            <Text style={styles.body}>Admitted in:</Text>
                            <RuledBlank grow={2} />
                            <Text style={[styles.body, { marginLeft: 8 }]}>Date:</Text>
                            <RuledBlank />
                        </View>
                        <View style={{ width: '50%', marginTop: 16 }}>
                            <View style={{ borderBottom: '1px solid black', height: 10 }} />
                            <Text style={[styles.body, { marginTop: 1, textAlign: 'center' }]}>School Head</Text>
                        </View>
                    </View>

                </Page>
            </Document>
        </PDFViewer>
    );
}
