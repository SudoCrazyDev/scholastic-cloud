<?php

namespace App\Support;

/**
 * The SMS kiosk agent source this API hands out — as the portal's installer
 * download, and to kiosks updating themselves over their gateway token.
 */
class SmsAgentBundle
{
    /**
     * Vendored snapshot (present on API-only deploys) preferred; fall back to
     * the sibling sms_gateway/ folder in a full monorepo checkout.
     */
    public static function path(): ?string
    {
        $path = is_dir(resource_path('sms-agent'))
            ? resource_path('sms-agent')
            : base_path('..'.DIRECTORY_SEPARATOR.'sms_gateway');

        return is_dir($path) ? $path : null;
    }

    /** The agent version in the bundle's package.json, or null when there is no bundle. */
    public static function version(): ?string
    {
        $root = self::path();
        if (! $root || ! is_file($root.DIRECTORY_SEPARATOR.'package.json')) {
            return null;
        }

        $package = json_decode((string) file_get_contents($root.DIRECTORY_SEPARATOR.'package.json'), true);

        return is_array($package) && is_string($package['version'] ?? null) ? $package['version'] : null;
    }

    /**
     * Relative => absolute paths of the agent source, excluding build/runtime
     * artifacts (so the sibling-folder fallback doesn't drag in node_modules)
     * and anything holding a kiosk's own config.
     *
     * @return array<string,string>
     */
    public static function files(): array
    {
        $root = self::path();
        if (! $root) {
            return [];
        }

        $excludeDirs = ['node_modules', 'dist', '.git'];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveCallbackFilterIterator(
                new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
                function (\SplFileInfo $current) use ($excludeDirs) {
                    if ($current->isDir()) {
                        return ! in_array($current->getFilename(), $excludeDirs, true);
                    }

                    return ! in_array($current->getFilename(), ['.env', 'sms-gateway.env'], true)
                        && ! str_ends_with($current->getFilename(), '.log');
                }
            )
        );

        $files = [];
        foreach ($iterator as $file) {
            /** @var \SplFileInfo $file */
            if ($file->isFile()) {
                $relative = ltrim(str_replace($root, '', $file->getPathname()), '/\\');
                $files[str_replace('\\', '/', $relative)] = $file->getPathname();
            }
        }
        ksort($files);

        return $files;
    }
}
