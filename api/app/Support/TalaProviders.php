<?php

namespace App\Support;

/**
 * Reads config/tala.php and answers what the rest of Tala asks of it: which
 * providers exist, which models a tenant may point a key at, and what the
 * settings screen should render.
 *
 * Mirrors what Modules does for the access catalog — one file describes the
 * options, and validation, the API and the UI all read it rather than each
 * keeping their own copy of the list.
 */
class TalaProviders
{
    /**
     * @return array<string, array>
     */
    public static function all(): array
    {
        return config('tala.providers', []);
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

    public static function get(string $provider): ?array
    {
        return static::all()[$provider] ?? null;
    }

    public static function label(string $provider): string
    {
        return static::get($provider)['label'] ?? $provider;
    }

    public static function baseUrl(string $provider): string
    {
        return rtrim((string) (static::get($provider)['base_url'] ?? ''), '/');
    }

    public static function defaultProvider(): string
    {
        $configured = (string) config('tala.default_provider', 'anthropic');

        return static::exists($configured) ? $configured : (static::keys()[0] ?? 'anthropic');
    }

    /**
     * @return array<string>
     */
    public static function models(string $provider): array
    {
        return array_keys(static::get($provider)['models'] ?? []);
    }

    public static function supportsModel(string $provider, string $model): bool
    {
        return in_array($model, static::models($provider), true);
    }

    public static function defaultModel(string $provider): string
    {
        $configured = (string) (static::get($provider)['default_model'] ?? '');

        if ($configured !== '' && static::supportsModel($provider, $configured)) {
            return $configured;
        }

        return static::models($provider)[0] ?? $configured;
    }

    /**
     * The model to actually send: the stored one when it is still offered,
     * the provider's default when it is not.
     */
    public static function resolveModel(string $provider, ?string $model): string
    {
        if (is_string($model) && $model !== '' && static::supportsModel($provider, $model)) {
            return $model;
        }

        return static::defaultModel($provider);
    }

    /**
     * The catalog shaped for the settings UI — no credentials, safe to hand to
     * any staff member who can open the module.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function catalog(): array
    {
        $catalog = [];

        foreach (static::all() as $key => $provider) {
            $models = [];

            foreach ($provider['models'] ?? [] as $modelKey => $model) {
                $models[] = [
                    'key' => $modelKey,
                    'label' => $model['label'] ?? $modelKey,
                    'description' => $model['description'] ?? null,
                ];
            }

            $catalog[] = [
                'key' => $key,
                'label' => $provider['label'] ?? $key,
                'key_hint' => $provider['key_hint'] ?? null,
                'console_url' => $provider['console_url'] ?? null,
                'default_model' => static::defaultModel($key),
                'models' => $models,
            ];
        }

        return $catalog;
    }
}
