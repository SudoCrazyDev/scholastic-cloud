<?php

namespace App\Console\Commands;

use App\Models\AssessmentQuestion;
use App\Models\SubjectEcrItem;
use App\Models\Topic;
use App\Support\MediaUrl;
use Illuminate\Console\Command;

/**
 * Repoints upload links baked into stored content at the URL the app hands out
 * today. Two kinds go stale:
 *
 *  - presigned (expiring) R2 links, from before uploads switched to permanent
 *    URLs;
 *  - our own `media.show` links minted for a different origin — content carried
 *    over from a previous domain, or written while `APP_URL` was wrong. The
 *    object key survives inside the link, so it can be re-signed for the
 *    current origin.
 *
 * Lesson file blocks keep a `path` and are already re-derived on read, but
 * assessment content stores only the URL — question prompt HTML, per-choice
 * images and Drag The Picture cards — so those rows have to be rewritten in
 * place or the images stay broken.
 *
 * Run this after any change to `APP_URL`, `APP_KEY` or the API's domain.
 */
class RepairExpiringMediaUrls extends Command
{
    protected $signature = 'media:repair-urls {--dry-run : Report what would change without writing}';

    protected $description = 'Repoint stale upload URLs in stored content (expired presigned links, links from a previous domain)';

    private bool $dryRun = false;

    private int $rewritten = 0;

    public function handle(): int
    {
        $this->dryRun = (bool) $this->option('dry-run');

        $this->repairAssessmentItems();
        $this->repairAssessmentQuestions();
        $this->repairTopics();

        $this->info(($this->dryRun ? 'Would rewrite ' : 'Rewrote ').$this->rewritten.' URL(s).');

        return self::SUCCESS;
    }

    private function repairAssessmentItems(): void
    {
        SubjectEcrItem::query()->chunkById(200, function ($items) {
            foreach ($items as $item) {
                $content = $item->content;
                if (! is_array($content)) {
                    continue;
                }
                $fixed = $this->walk($content);
                if ($fixed !== $content) {
                    $this->line("  subject_ecr_items#{$item->id}");
                    if (! $this->dryRun) {
                        $item->forceFill(['content' => $fixed])->saveQuietly();
                    }
                }
            }
        });
    }

    private function repairAssessmentQuestions(): void
    {
        AssessmentQuestion::query()->chunkById(200, function ($questions) {
            foreach ($questions as $question) {
                $config = is_array($question->config) ? $question->config : [];
                $fixedConfig = $this->walk($config);
                $fixedPrompt = $this->rewriteHtml((string) $question->question);

                if ($fixedConfig !== $config || $fixedPrompt !== $question->question) {
                    $this->line("  assessment_questions#{$question->id}");
                    if (! $this->dryRun) {
                        $question->forceFill([
                            'config' => $fixedConfig,
                            'question' => $fixedPrompt,
                        ])->saveQuietly();
                    }
                }
            }
        });
    }

    private function repairTopics(): void
    {
        Topic::query()->chunkById(200, function ($topics) {
            foreach ($topics as $topic) {
                $content = $topic->content;
                if (! is_array($content)) {
                    continue;
                }
                $fixed = $this->walk($content);
                if ($fixed !== $content) {
                    $this->line("  topics#{$topic->id}");
                    if (! $this->dryRun) {
                        $topic->forceFill(['content' => $fixed])->saveQuietly();
                    }
                }
            }
        });
    }

    /**
     * Recursively rewrite every string in a content tree.
     */
    private function walk(mixed $value): mixed
    {
        if (is_array($value)) {
            return array_map(fn ($child) => $this->walk($child), $value);
        }

        return is_string($value) ? $this->rewriteString($value) : $value;
    }

    /**
     * A bare URL value (choiceImages entries, card imageUrl, file block url).
     */
    private function rewriteString(string $value): string
    {
        if (str_contains($value, '<')) {
            return $this->rewriteHtml($value);
        }

        return $this->rewriteUrl($value) ?? $value;
    }

    /**
     * Image sources embedded in rich-text prompts.
     */
    private function rewriteHtml(string $html): string
    {
        if (! str_contains($html, 'http')) {
            return $html;
        }

        return preg_replace_callback(
            '#(src=["\'])([^"\']+)(["\'])#i',
            function (array $match): string {
                $fixed = $this->rewriteUrl($match[2]);

                return $fixed === null ? $match[0] : $match[1].e($fixed).$match[3];
            },
            $html
        ) ?? $html;
    }

    /**
     * Returns the permanent replacement for a stale URL, or null when the value
     * needs no repair (already current, or a third-party link).
     */
    private function rewriteUrl(string $url): ?string
    {
        $decoded = html_entity_decode($url);

        // Presigned links always carry the signature query parameters; our own
        // links go stale instead by naming an origin we no longer serve.
        $expiring = str_contains($decoded, 'X-Amz-Signature') || str_contains($decoded, 'X-Amz-Expires');

        if (! $expiring && ! MediaUrl::isStaleMediaUrl($decoded)) {
            return null;
        }

        $path = MediaUrl::pathFrom($decoded);
        if ($path === null) {
            return null;
        }

        $permanent = MediaUrl::for($path);
        if ($permanent === null || $permanent === $url) {
            return null;
        }

        $this->rewritten++;

        return $permanent;
    }
}
