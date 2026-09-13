<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesMatatagSection;
use App\Models\MatatagCurriculumVersion;
use App\Services\Matatag\CurriculumTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The whole competency tree for one catalog version.
 *
 * About a quarter of a megabyte that changes when DepEd publishes a revision —
 * roughly once a year — so it carries a strong `ETag` off the version's id and
 * `updated_at`. A client that already has it gets a 304 and no body.
 *
 * The catalog is global reference data, not tenant data: a competency is
 * DepEd's and identical in every school. There is one copy and no
 * `institution_id` anywhere in those tables. Reading it still requires the
 * module and the feature, because a school that has not been switched on has
 * no business with any of this.
 */
class MatatagCurriculumController extends Controller
{
    use ResolvesMatatagSection;

    public function __construct(private readonly CurriculumTree $tree) {}

    public function show(Request $request): JsonResponse|Response
    {
        if ($deny = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $deny;
        }

        if ($deny = $this->denyUnlessModule($request, self::MODULE, 'view', $institutionId)) {
            return $deny;
        }

        $version = $this->resolveVersion($request);

        if (! $version) {
            return response()->json([
                'success' => false,
                'message' => 'That curriculum version does not exist.',
            ], 404);
        }

        $etag = '"'.md5($version->id.'|'.$version->updated_at?->timestamp).'"';

        if (trim((string) $request->header('If-None-Match')) === $etag) {
            return response()->noContent(304)->header('ETag', $etag);
        }

        return response()
            ->json(['success' => true, 'data' => $this->tree->forVersion($version)])
            ->header('ETag', $etag)
            // Revalidate every time, but send no body when nothing moved. The
            // tree must never be served stale: a client holding last year's
            // competencies would show a teacher columns that no longer exist.
            ->header('Cache-Control', 'private, no-cache');
    }

    private function resolveVersion(Request $request): ?MatatagCurriculumVersion
    {
        $id = $request->input('curriculum_version_id');

        if (is_string($id) && $id !== '') {
            return MatatagCurriculumVersion::find($id);
        }

        $code = $request->input('code');

        if (is_string($code) && $code !== '') {
            return MatatagCurriculumVersion::where('code', $code)->first();
        }

        return null;
    }
}
