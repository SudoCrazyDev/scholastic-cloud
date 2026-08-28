<?php

namespace App\Console\Commands;

use App\Models\GateDevice;
use App\Models\Student;
use App\Services\GatePhotoThumbnail;
use App\Services\GateRosterSnapshot;
use App\Support\ZipStreamWriter;
use Illuminate\Console\Command;

/**
 * Build the USB seed bundle for a gate kiosk: the whole roster plus every
 * thumbnail, in one zip a technician copies to the device.
 *
 * This is the primary provisioning path at 3,000+ students, not a convenience.
 * That roster is ~200 KB but its photos are ~90 MB, and the schools that need
 * offline mode are exactly the ones whose link cannot deliver 90 MB in an
 * afternoon. Seeding from a stick turns a two-day install into a two-hour one
 * and leaves the network to do nothing but deltas afterwards.
 *
 *   php artisan gate:seed-snapshot <device-id> [--out=path/to/file.zip]
 *
 * Running it also warms the server-side thumbnail cache, so the first kiosk to
 * sync a campus over the network pays for resizing once — every later device
 * reads the cached JPEGs.
 */
class BuildGateSeedSnapshot extends Command
{
    protected $signature = 'gate:seed-snapshot
                            {device : The gate device id (see the Kiosk devices card on Gate Entries)}
                            {--out= : Where to write the zip (default: storage/app/gate-seeds/)}';

    protected $description = 'Build a USB seed bundle (roster + photos) for a gate kiosk';

    public function handle(GateRosterSnapshot $snapshot, GatePhotoThumbnail $photos): int
    {
        $device = GateDevice::find($this->argument('device'));

        if (! $device) {
            $this->error('No gate device with that id.');

            return self::FAILURE;
        }

        $this->info("Building seed for \"{$device->name}\" ({$device->gate_type} gate)…");

        $students = $snapshot->all($device);

        if ($students === []) {
            $this->warn('That institution has no active students, so there is nothing to seed.');

            return self::FAILURE;
        }

        $this->line(count($students).' students in the roster.');

        $path = $this->outputPath($device);
        $zip = new ZipStreamWriter($path);

        $zip->addFile('roster.json', (string) json_encode([
            'device' => [
                'id' => $device->id,
                'name' => $device->name,
                'gate_type' => $device->gate_type,
                'institution_id' => $device->institution_id,
            ],
            // The kiosk uses this as its first `since`, so a device seeded from
            // a stick asks only for what changed after the bundle was built.
            // Floored to the second to match what /gate/roster hands out, since
            // that is the precision the delta comparison actually works at.
            'synced_at' => now()->startOfSecond()->toISOString(),
            'students' => $students,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        $withPhoto = array_values(array_filter($students, fn (array $s) => $s['photo_hash'] !== null));
        $bar = $this->output->createProgressBar(count($withPhoto));
        $bar->start();

        $written = 0;
        $missing = 0;
        $unresized = 0;
        // Photos are named by hash, and two students cannot share one, but a
        // guard costs nothing and a duplicate entry would confuse an unzipper.
        $seen = [];

        foreach ($withPhoto as $row) {
            $bar->advance();

            if (isset($seen[$row['photo_hash']])) {
                continue;
            }

            // One student at a time, streamed straight out — the whole point of
            // ZipStreamWriter is that this loop never holds the bundle.
            $student = Student::find($row['id']);
            $photo = $student ? $photos->bytesFor($student) : null;

            if ($photo === null) {
                $missing++;

                continue;
            }

            if (! $photo['resized']) {
                $unresized++;
            }

            $zip->addFile("photos/{$photo['hash']}.jpg", $photo['bytes']);
            $seen[$photo['hash']] = true;
            $written++;
        }

        $bar->finish();
        $this->newLine(2);

        $bytes = $zip->close();

        $this->info("Wrote {$path}");
        $this->line(sprintf('%d photos, %.1f MB total.', $written, $bytes / 1048576));

        if ($missing > 0) {
            $this->warn("{$missing} students have a photo on record that is not in the bucket.");
        }

        if ($unresized > 0) {
            // Worth saying loudly: this is the difference between a 90 MB bundle
            // and a 2 GB one.
            $this->warn(
                "{$unresized} photos were bundled at full size because GD is not available in this PHP build. "
                .'Enable the gd extension and re-run to get thumbnails.'
            );
        }

        return self::SUCCESS;
    }

    private function outputPath(GateDevice $device): string
    {
        $out = (string) $this->option('out');

        if ($out !== '') {
            $directory = dirname($out);
            if (! is_dir($directory)) {
                mkdir($directory, 0755, true);
            }

            return $out;
        }

        $directory = storage_path('app/gate-seeds');
        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $slug = preg_replace('/[^a-z0-9]+/i', '-', strtolower($device->name)) ?: 'gate';

        return $directory.DIRECTORY_SEPARATOR.trim($slug, '-').'-seed.zip';
    }
}
