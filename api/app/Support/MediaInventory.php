<?php

namespace App\Support;

/**
 * Which uploaded objects a piece of stored content actually references.
 *
 * Lessons keep their attachments as tidy `file` blocks with a `path`, so
 * `Topic::filePathsIn()` reads them straight off. Assessments do not: a picture
 * can arrive as a question's `imageUrl`, as one entry of `choiceImages`, as a
 * matching card's image, or as an `<img src>` inside a rich-text prompt, at
 * whatever depth the question type puts it. Enumerating those keys means a new
 * question type silently stops being counted, so this walks the tree instead
 * and asks `MediaUrl` about every string it finds.
 *
 * Keys come back de-duplicated, because the same object legitimately appears
 * twice — a copied assessment shares its images with the original, and a
 * question can show the same picture in two choices.
 */
class MediaInventory
{
    /**
     * R2 object keys referenced anywhere inside the given value.
     *
     * @return array<int, string>
     */
    public static function pathsIn(mixed $value): array
    {
        $found = [];
        self::walk($value, $found);

        return array_keys($found);
    }

    public static function countIn(mixed $value): int
    {
        return count(self::pathsIn($value));
    }

    /**
     * @param  array<string, true>  $found
     */
    private static function walk(mixed $value, array &$found, ?string $key = null): void
    {
        if (is_array($value)) {
            foreach ($value as $childKey => $child) {
                self::walk($child, $found, is_string($childKey) ? $childKey : null);
            }

            return;
        }

        if (! is_string($value) || $value === '') {
            return;
        }

        // A `path` holds the bare object key, which is not a URL and so is
        // invisible to isOurs(). This is how lesson file blocks store theirs.
        if ($key === 'path') {
            $clean = MediaUrl::clean($value);
            if ($clean !== null) {
                $found[$clean] = true;
            }

            return;
        }

        if (str_contains($value, '<')) {
            self::walkHtml($value, $found);

            return;
        }

        self::record($value, $found);
    }

    /**
     * Images embedded in a rich-text prompt or lesson block.
     *
     * @param  array<string, true>  $found
     */
    private static function walkHtml(string $html, array &$found): void
    {
        if (! str_contains($html, 'http')) {
            return;
        }

        preg_match_all('#src=["\']([^"\']+)["\']#i', $html, $matches);

        foreach ($matches[1] ?? [] as $src) {
            self::record(html_entity_decode($src), $found);
        }
    }

    /**
     * @param  array<string, true>  $found
     */
    private static function record(string $url, array &$found): void
    {
        // isOurs() first: pathFrom() is permissive enough to hand back a "key"
        // for a bare answer choice, and this walks every string in the tree.
        if (! MediaUrl::isOurs($url)) {
            return;
        }

        $path = MediaUrl::pathFrom($url);
        if ($path !== null) {
            $found[$path] = true;
        }
    }
}
