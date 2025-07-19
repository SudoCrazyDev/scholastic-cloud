/**
 * Safely formats a grade number to one decimal place
 * @param grade - The grade number or string to format
 * @returns Formatted grade string or '0.0' if invalid
 */
export const formatGrade = (grade: number | string | null | undefined): string => {
  if (grade === null || grade === undefined) {
    return '0.0';
  }
  
  // Convert string to number if needed
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  
  if (isNaN(numGrade)) {
    return '0.0';
  }
  
  return numGrade.toFixed(1);
};

/**
 * Gets the color class for a grade based on its value
 * @param grade - The grade number or string
 * @returns CSS color class
 */
export const getGradeColor = (grade: number | string | null | undefined): string => {
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  if (numGrade === null || numGrade === undefined || isNaN(numGrade)) {
    return 'text-gray-600';
  }
  if (numGrade >= 90) return 'text-green-600';
  if (numGrade >= 75) return 'text-yellow-600';
  return 'text-red-600';
};

/**
 * Gets the background color class for a grade based on its value
 * @param grade - The grade number or string
 * @returns CSS background color class
 */
export const getGradeBackground = (grade: number | string | null | undefined): string => {
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  if (numGrade === null || numGrade === undefined || isNaN(numGrade)) {
    return 'bg-gray-50 border-gray-200';
  }
  if (numGrade >= 90) return 'bg-green-50 border-green-200';
  if (numGrade >= 75) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
};

/**
 * Validates if a grade is within acceptable range
 * @param grade - The grade number or string to validate
 * @returns True if grade is valid (0-100)
 */
export const isValidGrade = (grade: number | string | null | undefined): boolean => {
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  return numGrade !== null && numGrade !== undefined && !isNaN(numGrade) && numGrade >= 0 && numGrade <= 100;
};

/**
 * Safely converts a grade to a number
 * @param grade - The grade number or string to convert
 * @returns The grade as a number, or 0 if invalid
 */
export const toNumber = (grade: number | string | null | undefined): number => {
  if (grade === null || grade === undefined) {
    return 0;
  }
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  return isNaN(numGrade) ? 0 : numGrade;
}; 