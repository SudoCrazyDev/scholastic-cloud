<?php

namespace App\Services\Tala\Tools;

/**
 * What the tools have already done during the current turn.
 *
 * Exists for one specific reason. A teacher asking for "a quiz from my lesson
 * handout" wants questions grounded in the uploaded file, and the model can only
 * do that if it read the file **before** it wrote the questions — a tool call
 * happens after the model has decided what to say, so `propose_assessment`
 * cannot fetch the material on its own behalf. It can only check whether the
 * reading happened, and refuse if it did not.
 *
 * Why the same turn, and not "at some point in this conversation": lesson
 * attachments are never replayed. TalaConversation::historyForModel() sends only
 * user and assistant text, so on any later turn the model no longer sees the
 * handout — only its own earlier summary of it. Questions written from that are
 * questions written from a paraphrase, which is exactly the failure this module
 * has already had once.
 *
 * Deliberately per-turn and in-memory. Nothing here is persisted: it is a record
 * of what this request did, not a cache of what the model knows.
 */
class ToolMemory
{
    /** @var array<string, array<int, string>> Lesson id => filenames read. */
    private array $lessonMaterial = [];

    /**
     * @param  array<int, string>  $filenames
     */
    public function rememberLessonMaterial(string $lessonId, array $filenames): void
    {
        $this->lessonMaterial[$lessonId] = array_values(array_unique(array_merge(
            $this->lessonMaterial[$lessonId] ?? [],
            $filenames,
        )));
    }

    public function hasReadLessonMaterial(string $lessonId): bool
    {
        return ($this->lessonMaterial[$lessonId] ?? []) !== [];
    }

    /**
     * @return array<int, string>
     */
    public function lessonMaterialRead(string $lessonId): array
    {
        return $this->lessonMaterial[$lessonId] ?? [];
    }
}
