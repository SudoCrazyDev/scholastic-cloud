<?php

namespace App\Console\Commands;

use App\Models\AssessmentQuestion;
use App\Models\SubjectEcrItem;
use App\Models\Topic;
use App\Support\MediaUrl;
use Illuminate\Console\Command;

/**
 * Rewrites presigned (expiring) R2 links that were baked into stored content
 * before uploads switched to permanent URLs.
 *
 * Lesson file blocks keep a `path` and are already re-derived on read, but
 * assessment content stores only the URL — question prompt HTML, per-choice
 * images and Drag The Picture cards — so those rows have to be rewritten in
 * place or the images stay broken.
 */
class RepairExpiringMediaUrls extends Command
{
    protected $signature = 'media:repair-urls {--dry-run : Report what would change without writing}';

    protected $description = 'Replace expiring presigned upload URLs in stored content with permanent ones';

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
     * Returns the permanent replacement for an expiring URL, or null when the
     * value is not an expiring R2 link (already permanent, or third-party).
     */
    private function rewriteUrl(string $url): ?string
    {
        // Presigned links are the only ones that expire; they always carry the
        // signature query parameters.
        if (! str_contains($url, 'X-Amz-Signature') && ! str_contains($url, 'X-Amz-Expires')) {
            return null;
        }

        $path = MediaUrl::pathFrom(html_entity_decode($url));
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
