/**
 * Design JSON shape (elements only) for variable checks.
 * Full design also has paper, orientation, zoom, bgColor, bgImage, etc.
 */
export interface DesignElementsLike {
	elements?: Array<{ variableType?: string; variableKey?: string }>;
}

/**
 * Returns true if the certificate design contains any element with variableType === 'student'.
 * Such certificates are "student certificates" and should only be used with student data.
 * Use this when listing certificates, generating PDFs per student, or enforcing rules.
 */
export function designHasStudentVariables(design: DesignElementsLike | null | undefined): boolean {
	if (!design?.elements || !Array.isArray(design.elements)) return false;
	return design.elements.some((el) => el.variableType === 'student');
}

/**
 * Returns true if the design has any variable placeholder (institution or student).
 * Useful for future "has variables" badges or filtering.
 */
export function designHasVariables(design: DesignElementsLike | null | undefined): boolean {
	if (!design?.elements || !Array.isArray(design.elements)) return false;
	return design.elements.some((el) => Boolean(el.variableType && el.variableKey));
}

const TRACK_STRAND_VARIABLE_KEYS = ['track', 'strand'];

/**
 * Returns true if the design contains any section-level track/strand variable.
 * When present, the certificate should only target Grade 11 and Grade 12.
 */
export function designHasTrackStrandVariables(design: DesignElementsLike | null | undefined): boolean {
	if (!design?.elements || !Array.isArray(design.elements)) return false;
	return design.elements.some(
		(el) => el.variableType === 'section' && TRACK_STRAND_VARIABLE_KEYS.includes(el.variableKey ?? '')
	);
}

const RANKING_VARIABLE_KEYS = ['ranking', 'student_rank', 'student_gpa'];

/**
 * Returns true if the design contains any student ranking variable (ranking, student_rank, student_gpa).
 * Certificates with ranking variables should only be shown for honor students.
 */
export function designHasRankingVariables(design: DesignElementsLike | null | undefined): boolean {
	if (!design?.elements || !Array.isArray(design.elements)) return false;
	return design.elements.some(
		(el) => el.variableType === 'student' && RANKING_VARIABLE_KEYS.includes(el.variableKey ?? '')
	);
}
