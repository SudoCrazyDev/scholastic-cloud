<?php

namespace App\Services\Tala\Tools;

/**
 * Reading the model's arguments.
 *
 * Tool input is whatever the model felt like sending — a number where a string
 * was asked for, a null, an array, the word "null". A schema makes that less
 * likely, not impossible, so every argument is coerced here and anything
 * unusable is treated as absent rather than handed to a query builder.
 *
 * These are filters only. Identity never comes through this class — see
 * ToolContext.
 */
class ToolInput
{
    /**
     * A usable, trimmed string, or null.
     *
     * @param  array<string, mixed>  $input
     */
    public static function text(array $input, string $key): ?string
    {
        $value = $input[$key] ?? null;

        if (is_int($value) || is_float($value)) {
            $value = (string) $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }

    /**
     * A boolean, defaulting when the argument is absent or unreadable.
     *
     * @param  array<string, mixed>  $input
     */
    public static function boolean(array $input, string $key, bool $default): bool
    {
        $value = $input[$key] ?? null;

        if (is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            $normalised = strtolower(trim($value));

            if (in_array($normalised, ['true', 'yes', '1'], true)) {
                return true;
            }

            if (in_array($normalised, ['false', 'no', '0'], true)) {
                return false;
            }
        }

        return $default;
    }

    /**
     * A grading period as the plain ordinal every table stores ('1'..'4').
     *
     * The model is told to send the ordinal, but it is talking to a teacher who
     * says "term 1" or "Q3", and it echoes them. Any single digit 1-4 found in
     * the argument is taken as the period; anything else is treated as absent,
     * which reports on every period rather than an arbitrary one.
     *
     * @param  array<string, mixed>  $input
     */
    public static function period(array $input, string $key): ?string
    {
        $value = static::text($input, $key);

        if ($value === null) {
            return null;
        }

        return preg_match('/[1-4]/', $value, $matches) === 1 ? $matches[0] : null;
    }
}
