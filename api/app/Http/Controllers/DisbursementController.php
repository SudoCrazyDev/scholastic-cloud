<?php

namespace App\Http\Controllers;

use App\Models\Disbursement;
use App\Models\DisbursementReceipt;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class DisbursementController extends Controller
{
    private function institutionId(Request $request): ?string
    {
        return $request->user()->userInstitutions()
            ->where('is_default', true)
            ->value('institution_id');
    }

    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $disbursements = Disbursement::with(['type', 'inCharge', 'receipts'])
            ->where('institution_id', $institutionId)
            ->orderBy('date_issued', 'desc')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn ($d) => $this->format($d));

        return response()->json(['success' => true, 'data' => $disbursements]);
    }

    public function store(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $validated = $this->validatePayload($request, $institutionId);

        $disbursement = Disbursement::create([
            'institution_id' => $institutionId,
            'disbursement_type_id' => $validated['disbursement_type_id'] ?? null,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'amount' => $validated['amount'],
            'date_issued' => $validated['date_issued'],
            'in_charge_user_id' => $validated['in_charge_user_id'] ?? null,
        ]);

        $this->storeReceiptFiles($disbursement, $request->file('receipts', []));

        return response()->json([
            'success' => true,
            'data' => $this->format($disbursement->load(['type', 'inCharge', 'receipts'])),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $disbursement = $this->findScoped($request, $id);
        if (! $disbursement) {
            return response()->json(['success' => false, 'message' => 'Disbursement not found'], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $this->format($disbursement->load(['type', 'inCharge', 'receipts'])),
        ]);
    }

    /**
     * Update via POST (multipart) because PHP cannot parse uploaded files on PUT.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $disbursement = $this->findScoped($request, $id);
        if (! $disbursement) {
            return response()->json(['success' => false, 'message' => 'Disbursement not found'], 404);
        }

        $validated = $this->validatePayload($request, $disbursement->institution_id);

        $disbursement->update([
            'disbursement_type_id' => $validated['disbursement_type_id'] ?? null,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'amount' => $validated['amount'],
            'date_issued' => $validated['date_issued'],
            'in_charge_user_id' => $validated['in_charge_user_id'] ?? null,
        ]);

        // Remove any receipts the user marked for deletion.
        $removeIds = $validated['remove_receipt_ids'] ?? [];
        if (! empty($removeIds)) {
            $toRemove = $disbursement->receipts()->whereIn('id', $removeIds)->get();
            foreach ($toRemove as $receipt) {
                $this->deleteReceiptFile($receipt->path);
                $receipt->delete();
            }
        }

        // Append any newly uploaded receipts.
        $this->storeReceiptFiles($disbursement, $request->file('receipts', []));

        return response()->json([
            'success' => true,
            'data' => $this->format($disbursement->fresh()->load(['type', 'inCharge', 'receipts'])),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $disbursement = $this->findScoped($request, $id);
        if (! $disbursement) {
            return response()->json(['success' => false, 'message' => 'Disbursement not found'], 404);
        }

        foreach ($disbursement->receipts as $receipt) {
            $this->deleteReceiptFile($receipt->path);
        }

        // Receipt rows cascade on delete; the R2 objects are cleaned up above.
        $disbursement->delete();

        return response()->json(['success' => true, 'message' => 'Disbursement deleted']);
    }

    private function validatePayload(Request $request, string $institutionId): array
    {
        return $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:5000',
            'amount' => 'required|numeric|min:0',
            'date_issued' => 'required|date',
            'disbursement_type_id' => [
                'nullable',
                Rule::exists('disbursement_types', 'id')->where('institution_id', $institutionId),
            ],
            'in_charge_user_id' => ['nullable', Rule::exists('users', 'id')],
            'receipts' => 'nullable|array',
            'receipts.*' => 'file|mimes:png,jpg,jpeg,webp,pdf|max:10240',
            'remove_receipt_ids' => 'nullable|array',
            'remove_receipt_ids.*' => 'string',
        ]);
    }

    /**
     * @param  UploadedFile[]  $files
     */
    private function storeReceiptFiles(Disbursement $disbursement, array $files): void
    {
        foreach ($files as $file) {
            if (! $file instanceof UploadedFile) {
                continue;
            }
            $extension = $file->getClientOriginalExtension() ?: 'jpg';
            $fileName = Str::uuid() . '.' . $extension;
            $r2Path = $disbursement->institution_id . '/disbursements/' . $fileName;

            Storage::disk('r2')->put($r2Path, file_get_contents($file->getRealPath()));

            $disbursement->receipts()->create([
                'path' => $r2Path,
                'name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
            ]);
        }
    }

    private function deleteReceiptFile(?string $path): void
    {
        if (! $path) {
            return;
        }

        try {
            Storage::disk('r2')->delete($path);
        } catch (\Throwable $e) {
            // Ignore storage errors on cleanup; the DB record is the source of truth.
        }
    }

    private function findScoped(Request $request, string $id): ?Disbursement
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return null;
        }

        return Disbursement::where('institution_id', $institutionId)->find($id);
    }

    private function format(Disbursement $d): array
    {
        return [
            'id' => $d->id,
            'institution_id' => $d->institution_id,
            'disbursement_type_id' => $d->disbursement_type_id,
            'type_name' => $d->type?->name,
            'title' => $d->title,
            'description' => $d->description,
            'amount' => $d->amount,
            'date_issued' => $d->date_issued?->toDateString(),
            'in_charge_user_id' => $d->in_charge_user_id,
            'in_charge_name' => $d->inCharge ? $this->userName($d->inCharge) : null,
            'receipts' => $d->receipts->map(fn ($r) => [
                'id' => $r->id,
                'url' => $r->url,
                'name' => $r->name,
                'mime' => $r->mime,
            ])->values(),
            'created_at' => $d->created_at?->toISOString(),
            'updated_at' => $d->updated_at?->toISOString(),
        ];
    }

    private function userName(User $user): string
    {
        return trim(implode(' ', array_filter([
            $user->first_name,
            $user->middle_name,
            $user->last_name,
            $user->ext_name,
        ])));
    }
}
