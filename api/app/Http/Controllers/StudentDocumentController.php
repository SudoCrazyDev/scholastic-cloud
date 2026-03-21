<?php

namespace App\Http\Controllers;

use App\Models\StudentDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class StudentDocumentController extends Controller
{
    /**
     * List all documents for a student.
     */
    public function index(Request $request, string $studentId): JsonResponse
    {
        $documents = StudentDocument::where('student_id', $studentId)
            ->orderBy('document_type')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $documents,
        ]);
    }

    /**
     * Upload a document for a student.
     */
    public function store(Request $request, string $studentId): JsonResponse
    {
        $request->validate([
            'document_type' => 'required|string|max:100',
            'file' => 'required|file|mimes:pdf,png,jpg,jpeg,webp|max:10240',
        ]);

        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        if (!$institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            $institutionId = $firstUserInstitution?->institution_id;
        }

        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'error' => 'User does not have any institution assigned',
            ], 400);
        }

        // Delete any existing document of the same type for this student
        $existing = StudentDocument::where('student_id', $studentId)
            ->where('document_type', $request->document_type)
            ->first();

        if ($existing) {
            try {
                Storage::disk('r2')->delete($existing->file_path);
            } catch (\Throwable) {
                // Continue even if R2 delete fails
            }
            $existing->delete();
        }

        $file = $request->file('file');
        $extension = $file->getClientOriginalExtension() ?: 'pdf';
        $fileName = Str::uuid() . '.' . $extension;
        $r2Path = $institutionId . '/student/' . $studentId . '/documents/' . $fileName;

        Storage::disk('r2')->put($r2Path, file_get_contents($file->getRealPath()));

        $document = StudentDocument::create([
            'student_id'    => $studentId,
            'institution_id' => $institutionId,
            'document_type' => $request->document_type,
            'file_path'     => $r2Path,
            'file_name'     => $file->getClientOriginalName(),
            'mime_type'     => $file->getMimeType() ?? $file->getClientMimeType(),
            'uploaded_by'   => $user->id,
        ]);

        return response()->json([
            'success' => true,
            'data' => $document,
        ], 201);
    }

    /**
     * Cross-check: extract text from a document via the document-reader worker.
     */
    public function crossCheck(string $studentId, string $documentId): JsonResponse
    {
        $readerUrl = rtrim(config('services.document_reader.url', env('DOCUMENT_READER_URL')), '/');

        if (!$readerUrl) {
            return response()->json([
                'success' => false,
                'error'   => 'Document reader service is not configured.',
            ], 503);
        }

        $document = StudentDocument::where('student_id', $studentId)
            ->where('id', $documentId)
            ->firstOrFail();

        try {
            $fileContents = Storage::disk('r2')->get($document->file_path);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => 'Could not retrieve file from storage.',
            ], 500);
        }

        try {
            $response = Http::timeout(60)
                ->attach('file', $fileContents, $document->file_name, ['Content-Type' => $document->mime_type])
                ->post($readerUrl . '/read');

            if ($response->failed()) {
                return response()->json([
                    'success' => false,
                    'error'   => 'Document reader returned an error: ' . $response->body(),
                ], 502);
            }

            return response()->json([
                'success' => true,
                'data'    => $response->json(),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => 'Failed to reach document reader service.',
            ], 502);
        }
    }

    /**
     * Delete a student document.
     */
    public function destroy(string $studentId, string $documentId): JsonResponse
    {
        $document = StudentDocument::where('student_id', $studentId)
            ->where('id', $documentId)
            ->firstOrFail();

        try {
            Storage::disk('r2')->delete($document->file_path);
        } catch (\Throwable) {
            // Continue even if R2 delete fails
        }

        $document->delete();

        return response()->json([
            'success' => true,
            'message' => 'Document deleted successfully.',
        ]);
    }
}
