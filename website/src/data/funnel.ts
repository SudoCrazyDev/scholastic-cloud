/**
 * The lead funnel: what we ask, in what order, and how a submission is scored.
 *
 * Ordering is deliberate. The two low-friction steps — the school, then what it
 * needs — come before we ask who the visitor is. A person who has already told
 * us they run a 900-learner private school and need finance and payroll is much
 * more likely to hand over an email than one asked for it cold.
 *
 * The priority areas are the real feature areas from features.ts rather than a
 * separate marketing list, so what a lead ticks maps one-to-one onto modules
 * sales can actually demo.
 */
import { featureGroups } from './features';

export interface Choice {
	value: string;
	label: string;
	/** Contribution to the lead score. Absent means zero. */
	score?: number;
}

export const schoolTypes: Choice[] = [
	{ value: 'private-k12', label: 'Private K to 12', score: 2 },
	{ value: 'public', label: 'Public school', score: 1 },
	{ value: 'group', label: 'Multi-campus group', score: 3 },
	{ value: 'higher-ed', label: 'Higher education', score: 1 },
	{ value: 'other', label: 'Something else' },
];

export const learnerBands: Choice[] = [
	{ value: 'under-200', label: 'Under 200 learners', score: 1 },
	{ value: '200-500', label: '200 – 500', score: 2 },
	{ value: '500-1500', label: '500 – 1,500', score: 3 },
	{ value: '1500-5000', label: '1,500 – 5,000', score: 4 },
	{ value: 'over-5000', label: 'More than 5,000', score: 5 },
];

export const timelines: Choice[] = [
	{ value: 'this-year', label: 'This school year', score: 5 },
	{ value: 'next-enrolment', label: 'By next enrolment', score: 3 },
	{ value: 'exploring', label: 'Just exploring for now', score: 1 },
];

/*
 * Role weighting reflects who can actually sign in a Philippine school: the
 * owner or directress and the principal decide, the registrar and finance
 * office specify, everyone else influences.
 */
export const roles: Choice[] = [
	{ value: 'owner', label: 'Owner / Directress', score: 5 },
	{ value: 'principal', label: 'Principal / School Head', score: 4 },
	{ value: 'admin', label: 'Administrator / VP', score: 4 },
	{ value: 'registrar', label: 'Registrar', score: 3 },
	{ value: 'finance', label: 'Finance / Accounting', score: 3 },
	{ value: 'hr', label: 'HR', score: 2 },
	{ value: 'it', label: 'IT / MIS', score: 2 },
	{ value: 'teacher', label: 'Teacher', score: 1 },
	{ value: 'other', label: 'Other' },
];

/** Chips for step 2 — the nine areas the site documents, verbatim. */
export const priorityAreas = featureGroups.map((g) => ({ value: g.id, label: g.label }));

export const steps = [
	{ n: 1, title: 'Your school', hint: 'No contact details yet — just the shape of the school.' },
	{ n: 2, title: 'What you need', hint: 'So the walkthrough shows your work, not a generic tour.' },
	{ n: 3, title: 'Where to reach you', hint: 'One reply from a person, not an autoresponder sequence.' },
];

/**
 * A crude triage score, not a prediction.
 *
 * Sales gets the raw answers too — this only decides which pile a lead lands in
 * so a school ready to move this term is not sitting behind twenty browsers.
 * Max is 18: multi-campus group (3) + 5,000+ learners (5) + this school year (5)
 * + owner (5).
 */
export function scoreLead(input: { schoolType?: string; learners?: string; timeline?: string; role?: string }): {
	score: number;
	band: 'hot' | 'warm' | 'nurture';
} {
	const pick = (list: Choice[], v?: string) => list.find((c) => c.value === v)?.score ?? 0;
	const score =
		pick(schoolTypes, input.schoolType) +
		pick(learnerBands, input.learners) +
		pick(timelines, input.timeline) +
		pick(roles, input.role);

	const band = score >= 11 ? 'hot' : score >= 7 ? 'warm' : 'nurture';
	return { score, band };
}
