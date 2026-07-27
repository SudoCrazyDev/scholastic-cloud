<?php

namespace App\Http\Controllers;

use App\Models\AssessmentQuestion;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Services\AssessmentV2Service;
use App\Support\GradingPeriods;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SubjectEcrItemController extends Controller
{
    public function __construct(protected AssessmentV2Service $v2) {}

    /**
     * Response shape for a single item. For v2, resolved question rows (with stable ids) are
     * folded back into content->questions so the client reads questions the same way as v1.
     */
    private function present(SubjectEcrItem $item): array
    {
        $data = $item->toArray();
        if ($item->isV2()) {
            $content = is_array($item->content) ? $item->content : [];
            $content['questions'] = $item->resolvedQuestions();
            $data['content'] = $content;
        }

        return $data;
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = Validator::make($request->all(), [
            'subject_id' => ['nullable', 'uuid', 'exists:subjects,id'],
            // Accepts subject_ecr_id as string or array (same behavior as before)
            'subject_ecr_id' => ['nullable'],
            'type' => ['nullable', 'string', Rule::in(['quiz', 'assignment', 'activity', 'project', 'exam', 'other'])],
            'status' => ['nullable', 'string', Rule::in(['draft', 'published'])],
            'quarter' => ['nullable', 'string', Rule::in(GradingPeriods::anyValues())],
            'scheduled_date' => ['nullable', 'date_format:Y-m-d'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
        ])->validate();

        // If subject_id is used, enforce institution access similar to other controllers.
        if (! empty($validated['subject_id'])) {
            $authenticatedUser = $request->user();
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (! $defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user',
                ], 403);
            }

            $subject = Subject::where('id', $validated['subject_id'])
                ->where('institution_id', $defaultInstitution->institution_id)
                ->first();

            if (! $subject) {
                return response()->json([
                    'success' => false,
                    'message' => 'Subject not found or access denied',
                ], 404);
            }
        }

        $query = SubjectEcrItem::query()->with('subjectEcr');

        if (! empty($validated['subject_id'])) {
            $query->whereHas('subjectEcr', function ($q) use ($validated) {
                $q->where('subject_id', $validated['subject_id']);
            });
        }

        if (! empty($validated['subject_ecr_id'])) {
            $subjectEcrIds = $request->query('subject_ecr_id');
            if (is_array($subjectEcrIds)) {
                $query->whereIn('subject_ecr_id', $subjectEcrIds);
            } else {
                $query->where('subject_ecr_id', $subjectEcrIds);
            }
        }

        if (! empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['quarter'])) {
            $query->where('quarter', $validated['quarter']);
        }

        if (! empty($validated['scheduled_date'])) {
            $query->whereDate('scheduled_date', $validated['scheduled_date']);
        }

        if (! empty($validated['date_from'])) {
            $query->whereDate('scheduled_date', '>=', $validated['date_from']);
        }
        if (! empty($validated['date_to'])) {
            $query->whereDate('scheduled_date', '<=', $validated['date_to']);
        }

        $items = $query->with('questions')
            ->orderByRaw('scheduled_date IS NULL, scheduled_date ASC')
            ->orderBy('created_at', 'desc')
            ->get();

        $data = $items->map(fn (SubjectEcrItem $item) => $this->present($item));

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validatedData = $request->validate([
                'subject_ecr_id' => 'required|uuid',
                'type' => 'nullable|string|max:255',
                'status' => ['nullable', 'string', Rule::in(['draft', 'published'])],
                'title' => 'required|string|max:255',
                'description' => 'nullable|string',
                'content' => 'nullable|array',
                'content_version' => 'nullable|integer|in:1,2',
                'settings' => 'nullable|array',
                'settings.max_attempts' => 'nullable|integer|min:1|max:50',
                'settings.time_limit_minutes' => 'nullable|integer|min:1|max:1440',
                'settings.pass_mark' => 'nullable|numeric|min:0|max:100',
                'settings.randomize_questions' => 'nullable|boolean',
                'content.questions' => 'nullable|array',
                'content.questions.*.id' => 'nullable|string',
                'content.questions.*.type' => ['required_with:content.questions', 'string', Rule::in(['true_false', 'single_choice', 'multiple_choice', 'fill_in_the_blanks', 'short_answer', 'essay', 'image_upload', 'video_upload', 'matching', 'drag_picture'])],
                'content.questions.*.question' => 'required_with:content.questions|string',
                'content.questions.*.choices' => 'nullable|array',
                'content.questions.*.choices.*' => 'nullable|string', // text may be empty when the choice is image-only
                'content.questions.*.choiceImages' => 'nullable|array', // optional image URL per choice, aligned with choices
                'content.questions.*.choiceImages.*' => 'nullable|string',
                'content.questions.*.allow_multiple' => 'nullable|boolean',
                'content.questions.*.answer' => 'nullable', // string or array for multiple_choice
                'content.questions.*.instructions' => 'nullable|string', // for image_upload / video_upload
                'content.questions.*.blanks' => 'nullable|array', // for fill_in_the_blanks: correct answers in order
                'content.questions.*.blanks.*' => 'string',
                // matching: left/right pairs (right is the answer key)
                'content.questions.*.pairs' => 'nullable|array',
                'content.questions.*.pairs.*.left' => 'nullable|string',
                'content.questions.*.pairs.*.right' => 'nullable|string',
                // drag_picture: labeled drop targets + picture cards (targetId is the answer key)
                'content.questions.*.targets' => 'nullable|array',
                'content.questions.*.targets.*.id' => 'nullable|string',
                'content.questions.*.targets.*.label' => 'nullable|string',
                'content.questions.*.cards' => 'nullable|array',
                'content.questions.*.cards.*.id' => 'nullable|string',
                'content.questions.*.cards.*.imageUrl' => 'nullable|string',
                'content.questions.*.cards.*.label' => 'nullable|string',
                'content.questions.*.cards.*.targetId' => 'nullable|string',
                'content.questions.*.points' => 'nullable|numeric|min:0',
                'quarter' => 'nullable|string',
                'scheduled_date' => 'nullable|date_format:Y-m-d',
                'open_at' => 'nullable|date',
                'close_at' => 'nullable|date|after_or_equal:open_at',
                'due_at' => 'nullable|date',
                'allow_late_submission' => 'nullable|boolean',
                'score' => 'nullable|numeric|min:0|max:999999.99',
            ]);

            $isV2 = (int) ($validatedData['content_version'] ?? 1) === 2;
            $questions = $isV2 ? ($validatedData['content']['questions'] ?? []) : null;
            if ($isV2 && isset($validatedData['content']['questions'])) {
                // v2 stores questions as rows, not inside the content JSON.
                unset($validatedData['content']['questions']);
            }

            $item = DB::transaction(function () use ($validatedData, $isV2, $questions) {
                $item = SubjectEcrItem::create($validatedData);
                if ($isV2) {
                    $this->v2->syncQuestions($item, $questions ?? []);
                    $item->refresh()->load('questions');
                }

                return $item;
            });

            return response()->json([
                'success' => true,
                'data' => $this->present($item),
                'message' => 'Subject ECR item created successfully',
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create subject ECR item',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id): JsonResponse
    {
        try {
            $item = SubjectEcrItem::findOrFail($id);
            if ($item->isV2()) {
                $item->load('questions');
            }

            return response()->json([
                'success' => true,
                'data' => $this->present($item),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Subject ECR item not found',
            ], 404);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        try {
            $item = SubjectEcrItem::findOrFail($id);

            $validatedData = $request->validate([
                'subject_ecr_id' => 'sometimes|required|uuid',
                'type' => 'nullable|string|max:255',
                'status' => ['nullable', 'string', Rule::in(['draft', 'published'])],
                'title' => 'sometimes|required|string|max:255',
                'description' => 'nullable|string',
                'content' => 'nullable|array',
                'content_version' => 'nullable|integer|in:1,2',
                'settings' => 'nullable|array',
                'settings.max_attempts' => 'nullable|integer|min:1|max:50',
                'settings.time_limit_minutes' => 'nullable|integer|min:1|max:1440',
                'settings.pass_mark' => 'nullable|numeric|min:0|max:100',
                'settings.randomize_questions' => 'nullable|boolean',
                'content.questions' => 'nullable|array',
                'content.questions.*.id' => 'nullable|string',
                'content.questions.*.type' => ['required_with:content.questions', 'string', Rule::in(['true_false', 'single_choice', 'multiple_choice', 'fill_in_the_blanks', 'short_answer', 'essay', 'image_upload', 'video_upload', 'matching', 'drag_picture'])],
                'content.questions.*.question' => 'required_with:content.questions|string',
                'content.questions.*.choices' => 'nullable|array',
                'content.questions.*.choices.*' => 'nullable|string', // text may be empty when the choice is image-only
                'content.questions.*.choiceImages' => 'nullable|array', // optional image URL per choice, aligned with choices
                'content.questions.*.choiceImages.*' => 'nullable|string',
                'content.questions.*.allow_multiple' => 'nullable|boolean',
                'content.questions.*.answer' => 'nullable',
                'content.questions.*.instructions' => 'nullable|string',
                'content.questions.*.blanks' => 'nullable|array',
                'content.questions.*.blanks.*' => 'string',
                'content.questions.*.pairs' => 'nullable|array',
                'content.questions.*.pairs.*.left' => 'nullable|string',
                'content.questions.*.pairs.*.right' => 'nullable|string',
                'content.questions.*.targets' => 'nullable|array',
                'content.questions.*.targets.*.id' => 'nullable|string',
                'content.questions.*.targets.*.label' => 'nullable|string',
                'content.questions.*.cards' => 'nullable|array',
                'content.questions.*.cards.*.id' => 'nullable|string',
                'content.questions.*.cards.*.imageUrl' => 'nullable|string',
                'content.questions.*.cards.*.label' => 'nullable|string',
                'content.questions.*.cards.*.targetId' => 'nullable|string',
                'content.questions.*.points' => 'nullable|numeric|min:0',
                'quarter' => 'nullable|string',
                'academic_year' => 'nullable|string',
                'scheduled_date' => 'nullable|date_format:Y-m-d',
                'open_at' => 'nullable|date',
                'close_at' => 'nullable|date|after_or_equal:open_at',
                'due_at' => 'nullable|date',
                'allow_late_submission' => 'nullable|boolean',
                'score' => 'nullable|numeric|min:0|max:999999.99',
            ]);

            // v2 is sticky: an item already on v2 stays v2 even if the client omits the flag.
            $isV2 = $item->isV2() || (int) ($validatedData['content_version'] ?? 0) === 2;
            $questionsProvided = array_key_exists('questions', $validatedData['content'] ?? []);
            $questions = $isV2 && $questionsProvided ? $validatedData['content']['questions'] : null;
            if ($isV2 && isset($validatedData['content']['questions'])) {
                unset($validatedData['content']['questions']);
            }

            DB::transaction(function () use ($item, $validatedData, $isV2, $questions, $questionsProvided) {
                $item->update($validatedData);
                // Only touch question rows when the client actually sent a questions array,
                // so a metadata-only PATCH (e.g. status/dates) never disturbs them.
                if ($isV2 && $questionsProvided) {
                    $this->v2->syncQuestions($item, $questions ?? []);
                }
                $item->refresh();
                if ($isV2) {
                    $item->load('questions');
                }
            });

            return response()->json([
                'success' => true,
                'data' => $this->present($item),
                'message' => 'Subject ECR item updated successfully',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update subject ECR item',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        try {
            $item = SubjectEcrItem::findOrFail($id);

            // v2 answers reference questions with a restrict FK; block deleting an assessment
            // that already has submissions rather than hitting a raw DB error (and to avoid
            // silently destroying student work).
            if ($item->isV2() && $item->assessmentAttempts()->whereNotNull('submitted_at')->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'This assessment has student submissions and cannot be deleted.',
                ], 422);
            }

            $item->delete();

            return response()->json([
                'success' => true,
                'message' => 'Subject ECR item deleted successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete subject ECR item',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Upload an image used inside an assessment question (question prompts,
     * multiple-choice options, Drag The Picture cards).
     *
     * Returns a permanent URL the builder stores in the question content. When
     * the caller passes the image it is replacing (`previous_url`/`previous_path`),
     * that object is removed from R2 so re-uploads don't accumulate orphans.
     */
    public function uploadImage(Request $request): JsonResponse
    {
        $authenticatedUser = $request->user();
        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (! $defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        $request->validate([
            'file' => 'required|file|mimes:png,jpg,jpeg,webp,gif|max:10240',
            'previous_url' => 'nullable|string',
            'previous_path' => 'nullable|string',
        ]);

        $file = $request->file('file');
        $extension = $file->getClientOriginalExtension() ?: 'png';
        $fileName = Str::uuid().'.'.$extension;
        $prefix = $defaultInstitution->institution_id.'/assessments/images/';
        $r2Path = $prefix.$fileName;

        Storage::disk('r2')->put($r2Path, file_get_contents($file->getRealPath()));

        $this->deleteReplacedUpload(
            $request->input('previous_path') ?: $request->input('previous_url'),
            $prefix
        );

        return response()->json([
            'success' => true,
            'data' => [
                'url' => MediaUrl::for($r2Path),
                'path' => $r2Path,
            ],
        ], 201);
    }

    /**
     * Duplicate this assessment method into one or more other subjects — the
     * usual case being the same quiz across every section a teacher handles.
     *
     * Copies land as drafts so schedules and visibility are reviewed per
     * section before students see them.
     *
     * Images are shared with the original rather than duplicated — uploads are
     * immutable (every upload writes a new object), so a copy only diverges
     * when someone actually replaces a picture, and that replacement creates
     * its own object. Storage therefore grows with real edits, not with copies.
     * The flip side is that deletion has to be reference-aware; see
     * deleteReplacedUpload().
     */
    public function copyToSubjects(Request $request, string $id): JsonResponse
    {
        $defaultInstitution = $request->user()->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (! $defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        $validated = $request->validate([
            'target_subject_ids' => 'required|array|min:1',
            'target_subject_ids.*' => 'uuid|exists:subjects,id',
        ]);

        $source = SubjectEcrItem::with(['subjectEcr.subject', 'questions'])->find($id);
        if (! $source || $source->subjectEcr?->subject?->institution_id !== $defaultInstitution->institution_id) {
            return response()->json([
                'success' => false,
                'message' => 'Assessment method not found or access denied',
            ], 404);
        }

        $sourceEcrTitle = $source->subjectEcr?->title;
        $copied = 0;
        $skipped = [];

        foreach (array_unique($validated['target_subject_ids']) as $targetSubjectId) {
            $target = Subject::where('id', $targetSubjectId)
                ->where('institution_id', $defaultInstitution->institution_id)
                ->first();

            if (! $target) {
                $skipped[] = [
                    'subject_id' => $targetSubjectId,
                    'subject_title' => '',
                    'reason' => 'Subject not found in your institution.',
                ];

                continue;
            }

            if ($target->id === $source->subjectEcr?->subject_id) {
                $skipped[] = [
                    'subject_id' => $target->id,
                    'subject_title' => $target->title,
                    'reason' => 'This is the subject the assessment already belongs to.',
                ];

                continue;
            }

            // Prefer the component with the same name (e.g. "Written Works"),
            // so a copied quiz keeps weighting under the equivalent component.
            $targetEcr = SubjectEcr::where('subject_id', $target->id)
                ->when($sourceEcrTitle, fn ($q) => $q->orderByRaw('title = ? DESC', [$sourceEcrTitle]))
                ->orderBy('created_at')
                ->first();

            if (! $targetEcr) {
                $skipped[] = [
                    'subject_id' => $target->id,
                    'subject_title' => $target->title,
                    'reason' => 'No Components of Summative Assessment set up yet.',
                ];

                continue;
            }

            DB::transaction(function () use ($source, $targetEcr) {
                $copy = $source->replicate([
                    'created_at',
                    'updated_at',
                ]);
                $copy->subject_ecr_id = $targetEcr->id;
                // Dates belong to the section the assessment was built for.
                $copy->status = 'draft';
                $copy->scheduled_date = null;
                $copy->open_at = null;
                $copy->close_at = null;
                $copy->due_at = null;
                $copy->save();

                if ($source->isV2()) {
                    foreach ($source->questions as $question) {
                        $questionCopy = $question->replicate(['created_at', 'updated_at', 'deleted_at']);
                        $questionCopy->subject_ecr_item_id = $copy->id;
                        $questionCopy->save();
                    }
                }
            });

            $copied++;
        }

        return response()->json([
            'success' => true,
            'data' => ['copied' => $copied, 'skipped' => $skipped],
            'message' => $copied === 1
                ? 'Assessment method copied to 1 subject as a draft.'
                : "Assessment method copied to {$copied} subjects as drafts.",
        ]);
    }

    /**
     * Delete an assessment image the teacher removed from a question.
     */
    public function deleteImage(Request $request): JsonResponse
    {
        $authenticatedUser = $request->user();
        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (! $defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        $request->validate([
            'url' => 'required_without:path|nullable|string',
            'path' => 'required_without:url|nullable|string',
        ]);

        $this->deleteReplacedUpload(
            $request->input('path') ?: $request->input('url'),
            $defaultInstitution->institution_id.'/assessments/images/'
        );

        return response()->json(['success' => true]);
    }

    /**
     * Drop the object a re-upload just replaced. Scoped to the caller's own
     * institution/assessment prefix so a crafted `previous_url` can't be used
     * to delete somebody else's file.
     */
    private function deleteReplacedUpload(?string $previous, string $allowedPrefix): void
    {
        $path = MediaUrl::pathFrom($previous);
        if (! $path || ! str_starts_with($path, $allowedPrefix)) {
            return;
        }

        // Copies share their images with the original, so an object is only
        // really dead once nothing else points at it. The assessment being
        // edited still holds the old URL here — its save comes after the upload —
        // so exactly one referencing assessment is the "nobody else needs it"
        // case. Two or more means a copy still shows this picture, and deleting
        // it would blank the image out of that other section's quiz.
        if ($this->imageReferenceCount($path) > 1) {
            return;
        }

        MediaUrl::deleteByPath($path);
    }

    /**
     * How many distinct assessments reference this image object, counting both
     * the content JSON and v2 question rows.
     */
    private function imageReferenceCount(string $path): int
    {
        // Match on the file name, not the full key: signed URLs percent-encode
        // the path and the JSON cast escapes slashes, so the raw key never
        // appears verbatim in storage. Names are UUIDs, so this is unambiguous.
        $needle = '%'.basename($path).'%';

        $viaContent = SubjectEcrItem::where('content', 'like', $needle)->pluck('id');
        $viaQuestions = AssessmentQuestion::where(
            fn ($query) => $query->where('question', 'like', $needle)->orWhere('config', 'like', $needle)
        )->pluck('subject_ecr_item_id');

        return $viaContent->merge($viaQuestions)->unique()->count();
    }
}
