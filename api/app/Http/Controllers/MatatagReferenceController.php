<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Support\MatatagTerms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The module's fixed vocabulary: three terms, five descriptors, four macro
 * skills.
 *
 * Served rather than duplicated in a frontend constant, and that is the point.
 * DepEd has already reworded the descriptors once. When it happens again the
 * change is one edit to `config/matatag.php`, not a hunt for the same five
 * strings in a PDF component, a legend component and a `<Select>`.
 *
 * Zero queries — it is a few hundred bytes of config.
 */
class MatatagReferenceController extends Controller
{
    use AuthorizesModuleAccess;

    public function index(Request $request): JsonResponse
    {
        if ($deny = $this->denyUnlessStaff($request)) {
            return $deny;
        }

        return response()->json([
            'success' => true,
            'data' => MatatagTerms::config(),
        ]);
    }
}
