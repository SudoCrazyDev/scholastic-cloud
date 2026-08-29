<?php

namespace App\Support;

/**
 * Reads config/payments.php and answers what the rest of the payments code asks
 * of it: which providers exist, what each needs to be configured with, and what
 * the admin screen should render.
 *
 * Mirrors what TalaProviders does for Tala and Modules does for the access
 * catalog — one file describes the options, and validation, the API and the UI
 * all read it rather than each keeping their own copy of the list.
 */
class PaymentProviders
{
    /**
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        $providers = [];

        foreach (config('payments.providers', []) as $key => $provider) {
            $providers[$key] = $provider + [
                'key' => $key,
                'label' => $key,
                'description' => '',
                'modes' => [],
                'products' => [],
                'default_product' => null,
                'currencies' => ['PHP'],
                'credentials' => [],
            ];
        }

        return $providers;
    }

    /**
     * @return array<string>
     */
    public static function keys(): array
    {
        return array_keys(static::all());
    }

    public static function exists(string $provider): bool
    {
        return array_key_exists($provider, static::all());
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function get(string $provider): ?array
    {
        return static::all()[$provider] ?? null;
    }

    public static function label(string $provider): string
    {
        return static::get($provider)['label'] ?? $provider;
    }

    /**
     * The class that knows how to talk to this provider, or null for a catalog
     * entry whose driver has not been written yet.
     *
     * @return class-string|null
     */
    public static function driver(string $provider): ?string
    {
        $driver = static::get($provider)['driver'] ?? null;

        return is_string($driver) && class_exists($driver) ? $driver : null;
    }

    /**
     * @return array<string>
     */
    public static function modes(string $provider): array
    {
        return array_keys(static::get($provider)['modes'] ?? []);
    }

    /**
     * The host a given mode talks to. Sandbox and live are different hosts and
     * a key issued for one is rejected by the other, which is what keeps a
     * school set up on sandbox from taking real money by accident.
     */
    public static function baseUrl(string $provider, string $mode): string
    {
        return rtrim((string) (static::get($provider)['modes'][$mode]['base_url'] ?? ''), '/');
    }

    /**
     * @return array<string>
     */
    public static function products(string $provider): array
    {
        return array_keys(static::get($provider)['products'] ?? []);
    }

    public static function defaultProduct(string $provider): ?string
    {
        return static::get($provider)['default_product'] ?? null;
    }

    /**
     * A stored product that has since left the catalog falls back to the
     * provider's default rather than being sent as-is.
     */
    public static function resolveProduct(string $provider, ?string $product): ?string
    {
        $products = static::products($provider);

        if ($product !== null && in_array($product, $products, true)) {
            return $product;
        }

        return static::defaultProduct($provider);
    }

    /**
     * @return array<string>
     */
    public static function currencies(string $provider): array
    {
        return static::get($provider)['currencies'] ?? ['PHP'];
    }

    /**
     * The credential fields this provider needs, each filled out with its key.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function credentialFields(string $provider): array
    {
        $fields = [];

        foreach (static::get($provider)['credentials'] ?? [] as $key => $field) {
            $fields[$key] = $field + [
                'key' => $key,
                'label' => $key,
                'hint' => null,
                'required' => true,
            ];
        }

        return $fields;
    }

    /**
     * @return array<string>
     */
    public static function requiredCredentialKeys(string $provider): array
    {
        return array_keys(array_filter(
            static::credentialFields($provider),
            fn (array $field) => (bool) $field['required'],
        ));
    }

    /**
     * The catalog as the admin screen wants it: a list rather than a map, with
     * every provider filled out and no secrets anywhere near it.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function forDisplay(): array
    {
        $providers = [];

        foreach (static::all() as $key => $provider) {
            $modes = [];
            foreach ($provider['modes'] as $modeKey => $mode) {
                $modes[] = [
                    'key' => $modeKey,
                    'label' => $mode['label'] ?? $modeKey,
                ];
            }

            $products = [];
            foreach ($provider['products'] as $productKey => $product) {
                $products[] = [
                    'key' => $productKey,
                    'label' => $product['label'] ?? $productKey,
                    'description' => $product['description'] ?? null,
                ];
            }

            $providers[] = [
                'key' => $key,
                'label' => $provider['label'],
                'description' => $provider['description'],
                'available' => static::driver($key) !== null,
                'modes' => $modes,
                'products' => $products,
                'default_product' => $provider['default_product'],
                'currencies' => $provider['currencies'],
                'credentials' => array_values(static::credentialFields($key)),
            ];
        }

        return $providers;
    }
}
