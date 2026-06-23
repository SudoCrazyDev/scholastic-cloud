<?php

namespace App\Support;

use App\Models\Student;

/**
 * Maps an admission form submission payload (stored as JSON) into the
 * normalized, queryable student-owned tables: profile, guardians,
 * emergency contacts, and health record.
 *
 * Idempotent: re-running for the same student refreshes the data
 * (1:1 sections are upserted; 1:many sections are replaced).
 */
class AdmissionPayloadMapper
{
    /**
     * Fan a submission payload out into the student's normalized records.
     * Must be called inside a DB transaction by the caller.
     *
     * @param  array<string,mixed>  $payload
     */
    public static function syncToStudent(Student $student, array $payload): void
    {
        self::syncProfile($student, $payload);
        self::syncGuardians($student, $payload);
        self::syncEmergencyContacts($student, $payload);
        self::syncHealthRecord($student, $payload);
    }

    /** @param array<string,mixed> $payload */
    protected static function syncProfile(Student $student, array $payload): void
    {
        $gi = $payload['general_information'] ?? [];
        $siblings = $payload['family_information']['siblings'] ?? [];

        $student->profile()->updateOrCreate(
            ['student_id' => $student->id],
            [
                'complete_address'     => $gi['complete_address'] ?? null,
                'mobile_number'        => $gi['mobile_number'] ?? null,
                'place_of_birth'       => $gi['place_of_birth'] ?? null,
                'mother_tongue'        => $gi['mother_tongue'] ?? null,
                'last_school_attended' => $gi['last_school_attended'] ?? null,
                'school_year'          => $gi['school_year'] ?? null,
                'school_address'       => $gi['school_address'] ?? null,
                'brothers_count'       => self::intOrNull($siblings['brothers'] ?? null),
                'sisters_count'        => self::intOrNull($siblings['sisters'] ?? null),
            ]
        );
    }

    /** @param array<string,mixed> $payload */
    protected static function syncGuardians(Student $student, array $payload): void
    {
        $family = $payload['family_information'] ?? [];

        // Replace existing guardian rows so edits/re-accepts stay consistent.
        $student->guardians()->delete();

        foreach (['father', 'mother'] as $relation) {
            $person = $family[$relation] ?? null;
            if (! is_array($person)) {
                continue;
            }
            // Skip entirely empty entries.
            if (empty($person['name']) && empty($person['age']) && empty($person['occupation'])) {
                continue;
            }
            $student->guardians()->create([
                'relation'   => $relation,
                'name'       => $person['name'] ?? null,
                'age'        => self::intOrNull($person['age'] ?? null),
                'occupation' => $person['occupation'] ?? null,
            ]);
        }
    }

    /** @param array<string,mixed> $payload */
    protected static function syncEmergencyContacts(Student $student, array $payload): void
    {
        $contact = $payload['emergency_contact'] ?? null;

        $student->emergencyContacts()->delete();

        if (! is_array($contact)) {
            return;
        }
        if (empty($contact['name']) && empty($contact['contact_number'])) {
            return;
        }
        $student->emergencyContacts()->create([
            'name'           => $contact['name'] ?? null,
            'address'        => $contact['address'] ?? null,
            'relationship'   => $contact['relationship'] ?? null,
            'age'            => self::intOrNull($contact['age'] ?? null),
            'contact_number' => $contact['contact_number'] ?? null,
        ]);
    }

    /** @param array<string,mixed> $payload */
    protected static function syncHealthRecord(Student $student, array $payload): void
    {
        $health = $payload['health_information'] ?? [];

        $student->healthRecord()->updateOrCreate(
            ['student_id' => $student->id],
            [
                'had_chicken_pox'                => self::answer($health, 'had_chicken_pox'),
                'had_chicken_pox_note'           => self::note($health, 'had_chicken_pox'),
                'had_chicken_pox_vaccine'        => self::answer($health, 'had_chicken_pox_vaccine'),
                'had_chicken_pox_vaccine_note'   => self::note($health, 'had_chicken_pox_vaccine'),
                'hospitalization_past_year'      => self::answer($health, 'hospitalization_past_year'),
                'hospitalization_past_year_note' => self::note($health, 'hospitalization_past_year'),
                'chronic_condition'              => self::answer($health, 'chronic_condition'),
                'chronic_condition_note'         => self::note($health, 'chronic_condition'),
                'allergies'                      => self::answer($health, 'allergies'),
                'allergies_note'                 => self::note($health, 'allergies'),
                'other_medical_problems'         => self::answer($health, 'other_medical_problems'),
                'other_medical_problems_note'    => self::note($health, 'other_medical_problems'),
            ]
        );
    }

    /** @param array<string,mixed> $health */
    protected static function answer(array $health, string $key): bool
    {
        return (bool) ($health[$key]['answer'] ?? false);
    }

    /**
     * Collapse the form's "when" / "details" into a single note column.
     *
     * @param array<string,mixed> $health
     */
    protected static function note(array $health, string $key): ?string
    {
        $block = $health[$key] ?? [];
        $value = $block['details'] ?? $block['when'] ?? null;
        $value = is_string($value) ? trim($value) : $value;

        return $value === '' ? null : $value;
    }

    protected static function intOrNull(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        return is_numeric($value) ? (int) $value : null;
    }
}
