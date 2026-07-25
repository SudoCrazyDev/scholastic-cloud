<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * Vendors a snapshot of the sms_gateway/ agent source into api/resources/sms-agent
 * so the installer download works on API-only deploys (where the sibling
 * sms_gateway/ folder isn't present). Re-run whenever the agent changes.
 *
 *   php artisan sms:bundle-agent
 */
class BundleSmsAgent extends Command
{
    protected $signature = 'sms:bundle-agent {--source= : Path to the sms_gateway source (defaults to ../sms_gateway)}';

    protected $description = 'Snapshot the SMS gateway agent into resources/sms-agent for the installer download.';

    /** Directories/files never included in the bundle. */
    private const EXCLUDE_DIRS = ['node_modules', 'dist', '.git'];

    private const EXCLUDE_FILES = ['.env'];

    public function handle(): int
    {
        $source = $this->option('source') ?: base_path('..'.DIRECTORY_SEPARATOR.'sms_gateway');
        $source = rtrim($source, '/\\');

        if (! is_dir($source)) {
            $this->error("Agent source not found: {$source}");
            $this->line('Run this from a checkout that contains the sms_gateway/ folder, or pass --source=.');

            return self::FAILURE;
        }

        $dest = resource_path('sms-agent');
        File::deleteDirectory($dest);
        File::ensureDirectoryExists($dest);

        $copied = 0;
        foreach ($this->files($source) as $relative) {
            $target = $dest.DIRECTORY_SEPARATOR.$relative;
            File::ensureDirectoryExists(dirname($target));
            File::copy($source.DIRECTORY_SEPARATOR.$relative, $target);
            $copied++;
        }

        $this->info("Bundled {$copied} file(s) into {$dest}");

        return self::SUCCESS;
    }

    /** @return iterable<string> relative paths under $source, excluding build/runtime artifacts */
    private function files(string $source): iterable
    {
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveCallbackFilterIterator(
                new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS),
                function (\SplFileInfo $current) {
                    if ($current->isDir()) {
                        return ! in_array($current->getFilename(), self::EXCLUDE_DIRS, true);
                    }

                    return ! in_array($current->getFilename(), self::EXCLUDE_FILES, true)
                        && ! str_ends_with($current->getFilename(), '.log');
                }
            )
        );

        foreach ($iterator as $file) {
            /** @var \SplFileInfo $file */
            if ($file->isFile()) {
                yield ltrim(str_replace($source, '', $file->getPathname()), '/\\');
            }
        }
    }
}
