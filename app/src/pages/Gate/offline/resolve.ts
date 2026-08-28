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
 * The UID comparison is **case-folded**, and has to be: `rfid_uid` is a
 * `utf8mb4_unicode_ci` column, so the server matches a card regardless of case
 * whether it means to or not. It was exact here once, on the reasoning that the
 * server does no folding — true of the query, false of the collation — and the
 * result was a card that resolved online and not off, showing a name from the
 * server's reply above an empty face. See `normalizeUid` for what is folded and
 * what deliberately is not.
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

  // The QR fallback: the scanned value is the student's own id. Lowercased for
  // the same reason as the UID — `students.id` is a `_ci` column too, so the
  // server resolves an upper-case UUID and a byte-exact keyPath lookup does not.
  if (!student && UUID_PATTERN.test(value)) {
    student = await findStudentById(value.toLowerCase())
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
