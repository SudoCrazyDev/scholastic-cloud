import { findStudentById, findStudentByUid, getPhoto, type CachedStudent } from './db'

/**
 * Turning a tap into a face, without the network.
 *
 * Both paths the server uses are reproduced here, and they must stay
 * reproduced: `kioskScan` matches an active RFID tag UID, and falls back to
 * treating the scanned value as a raw student UUID from a QR code. Implement
 * only the first and QR users silently stop being recognised at a gate that
 * otherwise looks fine.
 *
 * The UID comparison is **exact**, deliberately. The server does no case
 * folding or trimming beyond the outer trim, so normalising here would resolve
 * cards locally that the server then rejects at ingest — which is precisely the
 * mismatch this whole feature is built to avoid.
 */

/** A tap the kiosk can draw straight away. */
export interface ResolvedStudent {
  id: string
  name: string
  gradeAndSection: string | null
  photo: Blob | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function resolveLocally(scanned: string): Promise<ResolvedStudent | null> {
  const value = scanned.trim()
  if (value === '') return null

  let student = await findStudentByUid(value)

  // The QR fallback: the scanned value is the student's own id.
  if (!student && UUID_PATTERN.test(value)) {
    student = await findStudentById(value)
  }

  if (!student) return null

  return {
    id: student.id,
    name: fullName(student),
    gradeAndSection: gradeAndSection(student),
    photo: student.photo_hash ? await getPhoto(student.photo_hash) : null,
  }
}

export function fullName(student: CachedStudent): string {
  return [student.first_name, student.middle_name, student.last_name, student.ext_name]
    .filter(Boolean)
    .join(' ')
}

export function gradeAndSection(student: CachedStudent): string | null {
  if (!student.grade_level && !student.section) return null
  if (student.grade_level && student.section) return `${student.grade_level} — ${student.section}`

  return student.grade_level || student.section
}
