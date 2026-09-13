<?php

namespace App\Console\Commands;

use App\Services\Matatag\CatalogLoader;
use App\Services\Matatag\CatalogLoadException;
use App\Services\Matatag\CatalogLoadResult;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Loads a DepEd MATATAG catalog file into the curriculum tables.
 *
 * This exists so Grade 2 and Grade 3 can arrive without a deploy: extract the
 * workbook with `api/database/data/matatag/extract.py`, drop the JSON beside
 * it, run this. Grade 1 additionally ships as a data migration, because it has
 * to be present on every tenant the day the module is switched on.
 *
 * Usage:
 *   php artisan matatag:load-catalog database/data/matatag/grade-1.v1.json
 *   php artisan matatag:load-catalog database/data/matatag/grade-2.v1.json --default
 *   php artisan matatag:load-catalog ... --force     (a version a section is pinned to)
 *   php artisan matatag:load-catalog ... --dry-run   (load, report, roll back)
 */
class LoadMatatagCatalog extends Command
{
    protected $signature = 'matatag:load-catalog
        {file : Path to the catalog JSON, absolute or relative to the api directory}
        {--default : Also make this the default catalog for its grade level}
        {--force : Allow changing a version that a section is already pinned to}
        {--dry-run : Load inside a transaction, report, then roll everything back}';

    protected $description = 'Load a DepEd MATATAG Key Stage 1 curriculum catalog from a JSON file.';

    public function handle(CatalogLoader $loader): int
    {
        $path = $this->resolvePath($this->argument('file'));
        $dryRun = (bool) $this->option('dry-run');

        try {
            $payload = CatalogLoader::decodeFile($path);
        } catch (CatalogLoadException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $code = $payload['version']['code'] ?? '(no code)';
        $this->info(($dryRun ? '[DRY RUN] ' : '')."Loading '{$code}' from {$path}");

        try {
            $result = $dryRun
                ? $this->loadAndRollBack($loader, $payload)
                : $loader->load($payload, (bool) $this->option('default'), (bool) $this->option('force'));
        } catch (CatalogLoadException $e) {
            $this->newLine();
            $this->error($e->getMessage());
            $this->newLine();
            $this->line('Nothing was written.');

            return self::FAILURE;
        }

        $this->report($result, $dryRun);

        return self::SUCCESS;
    }

    private function resolvePath(string $path): string
    {
        $isAbsolute = str_starts_with($path, '/') || preg_match('/^[A-Za-z]:[\\\\\/]/', $path) === 1;

        return $isAbsolute ? $path : base_path($path);
    }

    /**
     * A dry run is a real load wrapped in a transaction that is always rolled
     * back. Validating without writing would exercise neither the unique
     * indexes nor the counts assertion, which is most of what there is to be
     * wrong about — so the dry run does the work and then discards it.
     *
     * `--force` is passed because there is nothing to protect: the write never
     * survives this method.
     */
    private function loadAndRollBack(CatalogLoader $loader, array $payload): CatalogLoadResult
    {
        DB::beginTransaction();

        try {
            return $loader->load($payload, makeDefault: false, force: true);
        } finally {
            DB::rollBack();
        }
    }

    private function report(CatalogLoadResult $result, bool $dryRun): void
    {
        $version = $result->version;

        $this->newLine();
        $this->line("  {$version->title}  ({$version->grade_level})");
        $this->line("  {$result->competencyCount} competencies, {$result->slotCount} slots");
        $this->newLine();

        if (! $result->changedAnything()) {
            $this->info('  Already loaded and unchanged - nothing to do.');
        } else {
            $rows = [];

            foreach ($result->changes as $table => $counts) {
                $rows[] = [
                    str_replace('matatag_', '', $table),
                    $counts['created'] ?: '-',
                    $counts['updated'] ?: '-',
                    $counts['deleted'] ?: '-',
                ];
            }

            $this->table(['Table', 'Created', 'Updated', 'Deleted'], $rows);
        }

        if ($result->madeDefault) {
            $this->info("  Set as the default catalog for {$version->grade_level}.");
        }

        if ($dryRun) {
            $this->newLine();
            $this->warn('  [DRY RUN] Rolled back. Nothing was written.');
        }
    }
}
