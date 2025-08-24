<?php

namespace App\Http\Controllers;

use App\Models\Certificate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CertificateController extends Controller
{
    public function index()
    {
        return Certificate::orderByDesc('updated_at')->paginate(20);
    }

    public function show($id)
    {
        return Certificate::findOrFail($id);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'design_json' => 'required|array',
        ]);
        $certificate = Certificate::create([
            'title' => $validated['title'],
            'design_json' => $validated['design_json'],
            'created_by' => Auth::id(),
            'updated_by' => Auth::id(),
        ]);
        return response()->json($certificate, 201);
    }

    public function update(Request $request, $id)
    {
        $certificate = Certificate::findOrFail($id);
        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'design_json' => 'sometimes|required|array',
        ]);
        $certificate->fill($validated);
        $certificate->updated_by = Auth::id();
        $certificate->save();
        return response()->json($certificate);
    }

    public function destroy($id)
    {
        $certificate = Certificate::findOrFail($id);
        $certificate->delete();
        return response()->json(['message' => 'Deleted']);
    }
}