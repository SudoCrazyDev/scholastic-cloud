<?php

namespace App\Http\Controllers;

use App\Models\SubjectSummativeAssessment;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class SubjectSummativeAssessmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = SubjectSummativeAssessment::query();
        if ($request->has('subject_id')) {
            $query->where('subject_id', $request->input('subject_id'));
        }
        if ($request->has('academic_year')) {
            $query->where('academic_year', $request->input('academic_year'));
        }
        $assessments = $query->get();
        return response()->json(['success' => true, 'data' => $assessments]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'subject_id' => ['required', 'uuid', 'exists:subjects,id', 'unique:subject_summative_assessments,subject_id'],
            'summative_assessments' => ['required', 'array'],
            'academic_year' => ['required', 'string', 'max:32'],
        ]);
        $assessment = SubjectSummativeAssessment::create($validated);
        return response()->json(['success' => true, 'data' => $assessment], 201);
    }

    public function show($id): JsonResponse
    {
        $assessment = SubjectSummativeAssessment::find($id);
        if (!$assessment) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }
        return response()->json(['success' => true, 'data' => $assessment]);
    }

    public function update(Request $request, $id): JsonResponse
    {
        $assessment = SubjectSummativeAssessment::find($id);
        if (!$assessment) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }
        $validated = $request->validate([
            'subject_id' => ['sometimes', 'uuid', 'exists:subjects,id'],
            'summative_assessments' => ['sometimes', 'array'],
            'academic_year' => ['sometimes', 'string', 'max:32'],
        ]);
        $assessment->update($validated);
        return response()->json(['success' => true, 'data' => $assessment]);
    }

    public function destroy($id): JsonResponse
    {
        $assessment = SubjectSummativeAssessment::find($id);
        if (!$assessment) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }
        $assessment->delete();
        return response()->json(['success' => true]);
    }
} 