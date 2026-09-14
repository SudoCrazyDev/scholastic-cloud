<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesMatatagSection;
use App\Services\Matatag\WorkbookExport;
use Illuminate\Http\Request;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * DepEd's own e-class record, filled in and handed back.
 *
 * The PDFs are what a parent is given; this is what the division office asks
 * for, so it has to be DepEd's actual workbook rather than our rendering of
 * it. `WorkbookExport` explains why that means filling a committed template.
 *
 * `view`, like the report endpoints: producing a submission file is reading
 * what the grid already recorded, and an adviser who can print a card can
 * export the record behind it without also being able to change a mark.
 *
 * ## Why this one is synchronous
 *
 * It costs roughly eight seconds and ~200 MB, almost all of it inside
 * PhpSpreadsheet's load and save of a seventeen-sheet styled workbook. That is
 * slow for a web request and it is still the right shape: this is a
 * once-a-term submission for one section, and a download the teacher waits a
 * few seconds for beats a queue, a job table, a signed link and a polling UI
 * for something nobody triggers twice in a day. If whole-school export is ever
 * wanted, that is the point at which it should become a queued job.
 */
class MatatagWorkbookController extends Controller
{
    use ResolvesMatatagSection;

    /**
     * Enough headroom for one section, measured rather than guessed.
     *
     * Only ever raised, never lowered: a host that already allows more knows
     * something we do not.
     */
    private const MEMORY_LIMIT = 512 * 1024 * 1024;

    public function __construct(private readonly WorkbookExport $export) {}

    public function show(Request $request): BinaryFileResponse|\Illuminate\Http\JsonResponse
    {
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section)) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        // Checked before any work is done so an installation that cannot write
        // a spreadsheet at all says so immediately, and says which PHP
        // extension is missing rather than failing eight seconds later inside
        // the writer. The servers do not run composer - they receive a
        // prebuilt vendor/ - so this is the first place a missing ext-zip can
        // possibly surface.
        if ($reason = $this->export->unavailableReason()) {
            return response()->json([
                'success' => false,
                'message' => $reason,
                'code' => 'workbook_unavailable',
            ], 503);
        }

        $this->raiseMemoryLimit();

        try {
            $path = $this->export->forSection(
                $section,
                $pin,
                $academicYear,
                $this->sectionRoster($section, $academicYear),
            );
        } catch (RuntimeException $e) {
            // Every throw from the export is a statement about this section
            // that the teacher can act on - too many learners for DepEd's
            // form, or a catalog the bundled template was not built from.
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'code' => 'workbook_not_exportable',
            ], 422);
        }

        return response()
            ->download($path, $this->export->filenameFor($section, $academicYear), [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])
            ->deleteFileAfterSend(true);
    }

    /**
     * Give this one request the headroom the writer needs.
     *
     * Scoped to the request rather than set in php.ini because nothing else in
     * the API needs it, and a platform-wide raise would hide a genuine leak
     * somewhere else.
     */
    private function raiseMemoryLimit(): void
    {
        $current = $this->currentMemoryLimit();

        if ($current !== -1 && $current < self::MEMORY_LIMIT) {
            @ini_set('memory_limit', (string) self::MEMORY_LIMIT);
        }
    }

    /** Bytes, or -1 for no limit. */
    private function currentMemoryLimit(): int
    {
        $value = trim((string) ini_get('memory_limit'));

        if ($value === '' || $value === '-1') {
            return -1;
        }

        $unit = strtolower(substr($value, -1));
        $number = (int) $value;

        return match ($unit) {
            'g' => $number * 1024 * 1024 * 1024,
            'm' => $number * 1024 * 1024,
            'k' => $number * 1024,
            default => $number,
        };
    }
}
