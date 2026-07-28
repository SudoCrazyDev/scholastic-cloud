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
    protected $signature = 'media:repair-urls
        {--dry-run : Report what would change without writing}
        {--origin= : API origin to write into links, e.g. https://api.example.com (defaults to APP_URL)}';

    protected $description = 'Repoint stale upload URLs in stored content (expired presigned links, links from a previous domain)';

    private bool $dryRun = false;

    private int $rewritten = 0;

    public function handle(): int
    {
        $this->dryRun = (bool) $this->option('dry-run');
        // Console commands are resolved once and reused, so a second invocation
        // in the same process would otherwise report the first run's total.
        $this->rewritten = 0;

        MediaUrl::forceOrigin($this->option('origin'));

        // There is no request to derive the origin from here, so it comes from
        // APP_URL — which is exactly the value that tends to be wrong. Say what
        // is about to be written into every row rather than let a bad origin be
        // discovered later as broken images.
        $target = MediaUrl::for('probe.png');
        $this->line('Writing links under: <options=bold>'.(string) $target.'</>');
        $this->line('If that is not the origin your API is reachable on, stop and pass --origin=');
        $this->newLine();

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

        if (! MediaUrl::isOurs($decoded)) {
            return null;
        }

        $path = MediaUrl::pathFrom($decoded);
        if ($path === null) {
            return null;
        }

        // A link repaired from a path-style presigned URL can carry a stale
        // bucket segment ahead of the key. Serving tolerates that, but leaving it
        // in the stored path means every future repair faithfully re-signs a key
        // that does not exist, so settle it here against the real bucket.
        $path = MediaUrl::resolveExisting($path) ?? $path;

        // Compare against the canonical form instead of testing for particular
        // kinds of staleness. A link goes bad for more reasons than are
        // practical to enumerate — it expired, it names an origin we no longer
        // serve, it was signed with a rotated APP_KEY, it predates relative
        // signatures, the bucket has since been made public — and every one of
        // them shows up as "differs from what we would hand out now". Comparing
        // the decoded value keeps it idempotent for URLs stored inside HTML,
        // which come back here escaped.
        $permanent = MediaUrl::for($path);
        if ($permanent === null || $permanent === $decoded) {
            return null;
        }

        $this->rewritten++;

        return $permanent;
    }
}
