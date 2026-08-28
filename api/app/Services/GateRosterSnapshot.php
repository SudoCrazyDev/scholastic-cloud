<?php

namespace App\Services;

use App\Models\GateDevice;
use App\Models\Student;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The roster a gate kiosk holds locally, and the deltas that keep it current.
 *
 * ## The one rule
 *
 * This must return **exactly the set `RfidScanLogController::kioskScan` would
 * resolve** for the device's institution. A student the kiosk can resolve
 * locally but the server rejects at ingest is the single failure mode that loses
 * attendance silently — the gate says "welcome", the log never appears.
 *
 * So the predicate here is deliberately the same one: the student is active, and
 * has an active `student_institutions` row for this institution. Not
 * `institutions.current_academic_year`, not "has a tag" — a student with no RFID
 * tag still belongs in the roster, because the QR path resolves them by their
 * own UUID.
 *
 * One narrow divergence, worth knowing about: `kioskScan`'s tag lookup does not
 * check the institution at all, so a tag from a neighbouring school currently
 * resolves at any gate. This roster is institution-scoped (a kiosk has no
 * business holding another school's students), so such a tap is unknown locally
 * and is queued for the server to resolve at ingest instead. Behaviour is
 * preserved; only the moment of resolution moves.
 *
 * ## How the delta works
 *
 * Each row carries a `changed_at` that is the latest of everything the roster
 * renders — the student record, the enrolment, their tags, their section
 * assignment, and the section itself (so renaming a section reaches the kiosk).
 * `since` filters on that, and pagination is keyset on `(changed_at, id)`.
 *
 * Two limits that are deliberate rather than overlooked:
 *
 *  - **A hard-deleted row cannot be reported.** Nothing is left to carry a
 *    timestamp. `removed_ids` covers deactivation and unenrolment; a periodic
 *    full sync (omit `since`, which sets `full`) is what reconciles deletions,
 *    and the kiosk prunes anything absent from it.
 *  - **A row modified mid-pagination may be missed on that pass.** The device
 *    stores the `synced_at` from the *first* page, so anything that moved while
 *    it was paging is simply picked up next time.
 *  - **The boundary second is re-sent.** `updated_at` is second-precision, so
 *    `since` is floored to the second and compared inclusively. A sharper
 *    comparison would silently drop any edit made in the same second as a sync
 *    — permanently, because that row never looks newer again. Duplicates are
 *    the cheap direction to be wrong in.
 */
class GateRosterSnapshot
{
    public const DEFAULT_LIMIT = 500;

    public const MAX_LIMIT = 1000;

    public function __construct(private GatePhotoThumbnail $photos) {}

    /**
     * One page of roster changes for this device.
     *
     * @param  string|null  $since  ISO timestamp; null asks for a full snapshot
     * @param  string|null  $cursor  "<changed_at>|<id>" from a previous page
     * @return array<string, mixed>
     */
    public function page(GateDevice $device, ?string $since = null, ?string $cursor = null, int $limit = self::DEFAULT_LIMIT): array
    {
        $limit = max(1, min($limit, self::MAX_LIMIT));

        // Both ends are floored to the second, and the filter is inclusive. See
        // the class docblock: `updated_at` has no sub-second precision, so any
        // sharper comparison drops changes made in the same second as a sync.
        $sinceAt = $since === null ? null : Carbon::parse($since)->startOfSecond();
        $syncedAt = now()->startOfSecond();

        $rows = $this->query($device->institution_id, $sinceAt, $cursor, $limit + 1)->get();

        $hasMore = $rows->count() > $limit;
        $rows = $rows->take($limit);

        // A student is in the roster when they would resolve at ingest; anything
        // else that changed is reported as a removal so the kiosk drops it.
        [$present, $gone] = $rows->partition(
            fn ($row) => (bool) $row->student_active && (bool) $row->enrolment_active
        );

        $last = $rows->last();

        return [
            'full' => $sinceAt === null,
            // Stored by the device as the next `since` — see the class docblock
            // for why it takes this from the first page, not the last.
            'synced_at' => $syncedAt->toISOString(),
            'has_more' => $hasMore,
            'next_cursor' => $hasMore && $last ? $this->cursorFor($last) : null,
            'students' => $this->hydrate($present->values()),
            'removed_ids' => $gone->pluck('id')->values()->all(),
        ];
    }

    /**
     * Every student currently in the roster, in one array. Used by the seed
     * snapshot command, which is provisioning a device rather than syncing one.
     *
     * @return array<int, array<string, mixed>>
     */
    public function all(GateDevice $device): array
    {
        $students = [];
        $cursor = null;

        do {
            $page = $this->page($device, null, $cursor, self::MAX_LIMIT);
            $students = array_merge($students, $page['students']);
            $cursor = $page['next_cursor'];
        } while ($page['has_more'] && $cursor !== null);

        return $students;
    }

    /**
     * Students of this institution whose roster-visible state changed, newest
     * change last. Includes students who have *left* — the caller decides which
     * side of the line they fall on.
     */
    private function query(string $institutionId, ?CarbonInterface $since, ?string $cursor, int $limit)
    {
        // Correlated rather than joined: each is a MAX over an indexed
        // student_id, and joining them would multiply rows per student.
        $changedAt = <<<'SQL'
            GREATEST(
                s.updated_at,
                si.updated_at,
                COALESCE((SELECT MAX(t.updated_at) FROM student_rfid_tags t WHERE t.student_id = s.id), s.updated_at),
                COALESCE((SELECT MAX(ss.updated_at) FROM student_sections ss WHERE ss.student_id = s.id), s.updated_at),
                COALESCE((
                    SELECT MAX(cs.updated_at)
                    FROM student_sections ss2
                    JOIN class_sections cs ON cs.id = ss2.section_id
                    WHERE ss2.student_id = s.id
                ), s.updated_at)
            )
        SQL;

        $inner = DB::table('students as s')
            ->join('student_institutions as si', function ($join) use ($institutionId) {
                $join->on('si.student_id', '=', 's.id')
                    ->where('si.institution_id', '=', $institutionId);
            })
            ->selectRaw(
                's.id, s.first_name, s.middle_name, s.last_name, s.ext_name, s.profile_picture, '
                .'s.is_active as student_active, si.is_active as enrolment_active, '
                ."($changedAt) as changed_at"
            );

        $query = DB::query()->fromSub($inner, 'r');

        if ($since !== null) {
            // Inclusive, deliberately. `updated_at` is second-precision, so an
            // exclusive comparison against a timestamp inside that same second
            // loses the change for good — the row never looks "newer" again.
            // Erring inclusive re-sends a boundary second's rows at worst, and
            // the kiosk upserts, so a duplicate costs nothing.
            $query->where('changed_at', '>=', $since);
        }

        if ($cursor !== null) {
            [$cursorTime, $cursorId] = $this->parseCursor($cursor);
            if ($cursorTime !== null) {
                // Keyset, not offset: a roster that changes under a paging
                // device must not shift rows across page boundaries.
                $query->where(function ($where) use ($cursorTime, $cursorId) {
                    $where->where('changed_at', '>', $cursorTime)
                        ->orWhere(function ($tie) use ($cursorTime, $cursorId) {
                            $tie->where('changed_at', '=', $cursorTime)
                                ->where('id', '>', $cursorId);
                        });
                });
            }
        }

        return $query->orderBy('changed_at')->orderBy('id')->limit($limit);
    }

    /**
     * Attach the parts that need their own queries: active tags, and the section
     * the student is currently in.
     *
     * @param  \Illuminate\Support\Collection<int, object>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function hydrate($rows): array
    {
        $ids = $rows->pluck('id')->all();

        if ($ids === []) {
            return [];
        }

        $tags = DB::table('student_rfid_tags')
            ->whereIn('student_id', $ids)
            ->where('is_active', true)
            ->orderBy('created_at')
            ->get(['student_id', 'rfid_uid'])
            ->groupBy('student_id');

        // Mirrors kioskScan's `where(is_active)->latest()->first()`: ordering
        // ascending and letting later rows overwrite leaves the newest one.
        $sections = [];
        DB::table('student_sections as ss')
            ->join('class_sections as cs', 'cs.id', '=', 'ss.section_id')
            ->whereIn('ss.student_id', $ids)
            ->where('ss.is_active', true)
            ->orderBy('ss.created_at')
            ->get(['ss.student_id', 'cs.grade_level', 'cs.title'])
            ->each(function ($row) use (&$sections) {
                $sections[$row->student_id] = ['grade_level' => $row->grade_level, 'section' => $row->title];
            });

        return $rows->map(function ($row) use ($tags, $sections) {
            // The hash is derived from the stored key, so it costs no storage
            // round trip — which is the point of advertising it here.
            $student = new Student;
            $student->setRawAttributes(['profile_picture' => $row->profile_picture], true);

            return [
                'id' => $row->id,
                'first_name' => $row->first_name,
                'middle_name' => $row->middle_name,
                'last_name' => $row->last_name,
                'ext_name' => $row->ext_name,
                'grade_level' => $sections[$row->id]['grade_level'] ?? null,
                'section' => $sections[$row->id]['section'] ?? null,
                // A student with no tag still belongs here: the QR path resolves
                // them by this id.
                'rfid_uids' => ($tags[$row->id] ?? collect())->pluck('rfid_uid')->values()->all(),
                'photo_hash' => $this->photos->hashFor($student),
            ];
        })->all();
    }

    private function cursorFor(object $row): string
    {
        return $row->changed_at.'|'.$row->id;
    }

    /**
     * @return array{0: ?string, 1: string}
     */
    private function parseCursor(string $cursor): array
    {
        $parts = explode('|', $cursor, 2);

        if (count($parts) !== 2 || trim($parts[0]) === '') {
            return [null, ''];
        }

        return [$parts[0], $parts[1]];
    }
}
