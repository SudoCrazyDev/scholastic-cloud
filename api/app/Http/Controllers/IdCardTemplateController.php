<?php

namespace App\Http\Controllers;

use App\Models\IdCardTemplate;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class IdCardTemplateController extends Controller
{
    /**
     * Resolve the acting user's default (or main) institution id.
     */
    private function resolveInstitutionId(): ?string
    {
        /** @var User $user */
        $user = Auth::user();

        $defaultInstitution = $user->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (!$defaultInstitution) {
            $defaultInstitution = $user->userInstitutions()
                ->where('is_main', true)
                ->first();
        }

        return $defaultInstitution?->institution_id;
    }

    public function index()
    {
        $institutionId = $this->resolveInstitutionId();

        if (!$institutionId) {
            return response()->json(['data' => [], 'meta' => ['total' => 0]]);
        }

        return IdCardTemplate::where('institution_id', $institutionId)
            ->orderByDesc('updated_at')
            ->paginate(20);
    }

    public function show($id)
    {
        $institutionId = $this->resolveInstitutionId();

        if (!$institutionId) {
            return response()->json(['message' => 'No institution found'], 404);
        }

        $template = IdCardTemplate::where('id', $id)
            ->where('institution_id', $institutionId)
            ->first();

        if (!$template) {
            return response()->json(['message' => 'ID card template not found'], 404);
        }

        return response()->json($template);
    }

    public function store(Request $request)
    {
        $institutionId = $this->resolveInstitutionId();

        if (!$institutionId) {
            return response()->json(['message' => 'No institution found'], 400);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'design_json' => 'required|array',
        ]);

        $template = IdCardTemplate::create([
            'title' => $validated['title'],
            'design_json' => $validated['design_json'],
            'institution_id' => $institutionId,
            'created_by' => Auth::id(),
            'updated_by' => Auth::id(),
        ]);

        return response()->json($template, 201);
    }

    public function update(Request $request, $id)
    {
        $institutionId = $this->resolveInstitutionId();

        if (!$institutionId) {
            return response()->json(['message' => 'No institution found'], 400);
        }

        $template = IdCardTemplate::where('id', $id)
            ->where('institution_id', $institutionId)
            ->first();

        if (!$template) {
            return response()->json(['message' => 'ID card template not found'], 404);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'design_json' => 'sometimes|required|array',
        ]);

        $template->fill($validated);
        $template->updated_by = Auth::id();
        $template->save();

        return response()->json($template);
    }

    public function destroy($id)
    {
        $institutionId = $this->resolveInstitutionId();

        if (!$institutionId) {
            return response()->json(['message' => 'No institution found'], 400);
        }

        $template = IdCardTemplate::where('id', $id)
            ->where('institution_id', $institutionId)
            ->first();

        if (!$template) {
            return response()->json(['message' => 'ID card template not found'], 404);
        }

        $template->delete();
        return response()->json(['message' => 'Deleted']);
    }

    /**
     * Upload a design asset (template background, logo, custom image) to Cloudflare R2
     * and return its public URL for embedding in the design JSON.
     */
    public function uploadAsset(Request $request)
    {
        $institutionId = $this->resolveInstitutionId();

        if (!$institutionId) {
            return response()->json(['message' => 'No institution found'], 400);
        }

        $request->validate([
            'file' => 'required|file|mimes:png,jpg,jpeg,webp,svg|max:10240',
        ]);

        $file = $request->file('file');
        $extension = $file->getClientOriginalExtension() ?: 'png';
        $fileName = Str::uuid() . '.' . $extension;
        $r2Path = $institutionId . '/id-cards/assets/' . $fileName;

        Storage::disk('r2')->put($r2Path, file_get_contents($file->getRealPath()));

        // Build a public URL the same way the Student profile_picture accessor does.
        $r2Url = config('filesystems.disks.r2.url');
        if ($r2Url) {
            $url = rtrim($r2Url, '/') . '/' . ltrim($r2Path, '/');
        } else {
            $url = Storage::disk('r2')->temporaryUrl($r2Path, now()->addHours(24));
        }

        return response()->json([
            'url' => $url,
            'path' => $r2Path,
        ], 201);
    }
}
