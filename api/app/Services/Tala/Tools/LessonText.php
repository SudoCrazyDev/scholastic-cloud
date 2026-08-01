<?php

namespace App\Services\Tala\Tools;

/**
 * Turning a stored lesson into something a model can read.
 *
 * Lesson prose is HTML written in a rich-text editor, and lesson bodies are an
 * ordered list of blocks. Both are handed to the model as plain text: markup
 * costs tokens, and a model reading `<p>` tags tends to write them back out.
 *
 * One thing is deliberately dropped rather than converted. Attachment URLs are
 * signed links to private media, and this text is sent to Anthropic or OpenAI.
 * A file is reported by name and type so Tala can say what is attached; the link
 * to fetch it stays inside ScholasticCloud.
 */
class LessonText
{
    /** A block's own prose is capped before the whole body is. */
    private const MAX_BLOCK_CHARS = 4000;

    /**
     * HTML from the rich-text editor as readable plain text.
     */
    public static function plain(?string $html, ?int $limit = null): ?string
    {
        if ($html === null || trim($html) === '') {
            return null;
        }

        // Block-level tags become breaks first, or paragraphs run together into
        // one sentence once the tags are gone.
        $text = preg_replace('/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*[^>]*>/i', "\n", $html) ?? $html;
        $text = preg_replace('/<li[^>]*>/i', '- ', $text) ?? $text;
        $text = strip_tags($text);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // Collapse the whitespace the markup left behind, but keep paragraph
        // breaks: they are how a lesson's structure survives the conversion.
        $text = preg_replace('/[ \t]+/', ' ', $text) ?? $text;
        $text = preg_replace('/\n{3,}/', "\n\n", $text) ?? $text;
        $text = trim(preg_replace('/ *\n */', "\n", $text) ?? $text);

        if ($text === '') {
            return null;
        }

        return $limit === null ? $text : static::truncate($text, $limit);
    }

    public static function truncate(string $text, int $limit): string
    {
        if (mb_strlen($text) <= $limit) {
            return $text;
        }

        return rtrim(mb_substr($text, 0, $limit)).'… (truncated)';
    }

    /**
     * What a lesson body is made of, without the body itself.
     *
     * Used by the list tool so a teacher asking "what have I got for Term 1" is
     * told which lessons actually have material in them, without spending a
     * turn's context on every word of all of them.
     *
     * @param  array<int, mixed>|null  $blocks
     * @return array<string, int>
     */
    public static function blockCounts(?array $blocks): array
    {
        $counts = [];

        foreach (is_array($blocks) ? $blocks : [] as $block) {
            if (! is_array($block)) {
                continue;
            }

            $type = is_string($block['type'] ?? null) ? $block['type'] : 'unknown';
            $label = match ($type) {
                'rich_text' => 'reading',
                'video' => 'video',
                'file' => 'attachment',
                'assessment' => 'assessment',
                default => $type,
            };

            $counts[$label] = ($counts[$label] ?? 0) + 1;
        }

        return $counts;
    }

    /**
     * A lesson body as an ordered list of readable parts.
     *
     * @param  array<int, mixed>|null  $blocks
     * @return array<int, array<string, mixed>>
     */
    public static function blocks(?array $blocks): array
    {
        $rendered = [];

        foreach (is_array($blocks) ? $blocks : [] as $block) {
            if (! is_array($block)) {
                continue;
            }

            $part = match ($block['type'] ?? null) {
                'rich_text' => [
                    'type' => 'reading',
                    'text' => static::plain(
                        is_string($block['html'] ?? null) ? $block['html'] : null,
                        self::MAX_BLOCK_CHARS
                    ),
                ],
                'video' => [
                    'type' => 'video',
                    'title' => static::string($block, 'title'),
                    'url' => static::string($block, 'url'),
                ],
                'file' => [
                    'type' => 'attachment',
                    'name' => static::string($block, 'name'),
                    // Names only. The URL is a signed link to private media and
                    // does not leave the server.
                    'file_type' => static::string($block, 'mime'),
                ],
                'assessment' => [
                    'type' => 'assessment',
                    'assessment_type' => static::string($block, 'assessmentType'),
                    'title' => static::string($block, 'title'),
                ],
                default => null,
            };

            if ($part === null) {
                continue;
            }

            $part = array_filter($part, fn ($value) => $value !== null && $value !== '');

            // A reading block with no readable text is an empty editor, which
            // tells the model nothing worth a line of context.
            if (array_keys($part) === ['type']) {
                continue;
            }

            $rendered[] = $part;
        }

        return $rendered;
    }

    /**
     * @param  array<string, mixed>  $block
     */
    private static function string(array $block, string $key): ?string
    {
        $value = $block[$key] ?? null;

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
