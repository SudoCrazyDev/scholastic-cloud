/**
 * The marketing breakdown of what the platform does.
 *
 * One list, two consumers: the Features mega menu in the navbar and the
 * Features section further down the page. They must not drift, so neither
 * writes its own copy — mirroring how the app itself serves one module
 * catalog to the sidebar, the role builder and the API middleware.
 *
 * Each group's `id` becomes the anchor `#features-<id>`, which is what the
 * mega menu links to. Adding a group here adds it to both surfaces.
 *
 * Kept honest against `api/config/modules.php`. If a module ships, name it
 * here in the words a principal would use, not the module key.
 */

export interface FeatureItem {
	name: string;
	blurb: string;
}

export interface FeatureGroup {
	/** Anchor id, without the `features-` prefix. */
	id: string;
	label: string;
	/** One line for the mega menu card. Keep it under ~70 characters. */
	tagline: string;
	/** Heroicons v1 outline paths — matches the icon style already on the page. */
	icon: string[];
	/**
	 * Tint classes for the icon tile — background, glyph colour, hairline ring.
	 * Each area owns one hue so the reader can navigate by colour; all of them
	 * are 50/700 pairs so no area shouts louder than another.
	 */
	tint: string;
	items: FeatureItem[];
}

export const featureGroups: FeatureGroup[] = [
	{
		id: 'academics',
		label: 'Academics',
		tagline: 'Sections, subjects, timetable, report cards',
		tint: 'bg-pine-50 text-pine-700 ring-pine-200/70',
		icon: [
			'M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5',
		],
		items: [
			{ name: 'Class sections', blurb: 'Advisers and rosters per academic year, with student transfers that keep the record intact.' },
			{ name: 'Subjects & templates', blurb: 'Parent and child subjects, teacher assignment, and templates applied to a grade level in one action.' },
			{ name: 'Timetable', blurb: 'Scheduling across every section, with conflicts caught before a slot is saved.' },
			{ name: 'Grading scales', blurb: 'Your own transmutation tables and grade bands.' },
			{ name: 'Consolidated grades', blurb: 'Section-wide grade sheets a teacher submits and a principal signs off.' },
			{ name: 'SF9 report cards', blurb: 'Generated per academic year, ready for the registrar.' },
			{ name: 'Proficiency & core values', blurb: 'Marked by section alongside the numeric grade.' },
			{ name: 'School calendar', blurb: 'Which days count toward attendance, set for a whole term at once.' },
			{ name: 'Tracks & strands', blurb: 'Senior high tracks and the strands under them.' },
		],
	},
	{
		id: 'teaching',
		label: 'Teaching & assessment',
		tagline: 'Class record, online exams, lesson plans',
		tint: 'bg-teal-50 text-teal-700 ring-teal-200/70',
		icon: [
			'M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75',
		],
		items: [
			{ name: 'Electronic class record', blurb: 'Weighted components — written work, performance task, quarterly — with graded items filed underneath by quarter.' },
			{ name: 'Ten question types', blurb: 'Multiple choice, matching, fill in the blanks, essay, drag-and-drop pictures, image and video upload, and more.' },
			{ name: 'Scheduled assessments', blurb: 'Open, close and due times per item, with late submission allowed or not.' },
			{ name: 'Marking & re-check', blurb: 'Mark one attempt or re-check a whole item at once.' },
			{ name: 'Answers are never lost', blurb: 'Removing a question soft-deletes it, so submitted work survives an edit.' },
			{ name: 'Lesson planning', blurb: 'Quarter plans, an ordered topic outline with uploads, and lesson plans against it.' },
			{ name: 'Running grades', blurb: 'Computed through the quarter, with spreadsheet download and upload for offline entry.' },
		],
	},
	{
		id: 'students',
		label: 'Student records',
		tagline: 'Enrolment, the student file, attendance, gate',
		tint: 'bg-sky-50 text-sky-700 ring-sky-200/70',
		icon: [
			'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
		],
		items: [
			{ name: 'The student file', blurb: 'Tabbed by subject matter rather than kept as one long form.' },
			{ name: 'Family & guardians', blurb: 'Guardians, emergency contacts, and sibling groups finance later discounts against.' },
			{ name: 'Health records', blurb: 'Held with the rest of the file, not in a separate binder.' },
			{ name: 'Documents', blurb: 'Uploads with a cross-check step against the record on file.' },
			{ name: 'Online admission', blurb: 'A public form you lay out yourself; accept a submission and the student record is created from it.' },
			{ name: 'Attendance', blurb: 'Daily and per-subject, entered by the teacher and approved above them.' },
			{ name: 'Gate entries', blurb: 'RFID scans at the gate, a live arrival board, and a text to the guardian.' },
		],
	},
	{
		id: 'finance',
		label: 'Finance',
		tagline: 'Cashiering, ledgers, discounts, collections',
		tint: 'bg-marigold-50 text-marigold-700 ring-marigold-200/70',
		icon: [
			'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
		],
		items: [
			{ name: 'Cashiering', blurb: 'A point-of-sale window with receipts printed off a template you design.' },
			{ name: 'Ledgers & assessment notices', blurb: 'Every charge, payment and balance per student, in one view.' },
			{ name: 'Fees & defaults', blurb: 'Fee structures with per-grade-level amounts, applied across everyone enrolled in one action.' },
			{ name: 'Three kinds of discount', blurb: 'Default, per grade level, and sibling — each voidable with a note.' },
			{ name: 'Payment plans', blurb: 'Installment schedules, and a trail of every request to move between them.' },
			{ name: 'Online payments', blurb: 'Students pay from the portal through Maya; the payment posts itself.' },
			{ name: 'Proof-of-payment approvals', blurb: 'A student uploads a deposit slip; finance approves or rejects it.' },
			{ name: 'Voids as a queue', blurb: 'One role raises a void request, another approves it, and only a named few may skip the queue.' },
			{ name: 'Disbursements', blurb: 'Money going out, with its own types, receipts and reporting.' },
			{ name: 'Collections reporting', blurb: 'A dashboard and a printable report over the whole year.' },
		],
	},
	{
		id: 'hr',
		label: 'HR & payroll',
		tagline: 'Staff records, schedules, payroll, payslips',
		tint: 'bg-rose-50 text-rose-700 ring-rose-200/70',
		icon: [
			'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z',
		],
		items: [
			{ name: 'Staff records', blurb: 'Employment details plus the full personal data sheet — education, eligibility, work history, family.' },
			{ name: 'Schedules', blurb: 'Reusable shift templates with weekly hours, lunch and a per-day grace period.' },
			{ name: 'Attendance logs', blurb: 'Biometric punches as they arrive, and a timesheet every staff member can see for themselves.' },
			{ name: 'Exceptions that change pay', blurb: 'Suspensions, half-days, early-out and missed-punch requests — approved, then reflected in the payslip.' },
			{ name: 'Payroll periods', blurb: 'Generated from schedules and punches, finalised, and reopened if something was wrong.' },
			{ name: 'Deductions', blurb: 'Deduction types with bracket tables for statutory contributions.' },
			{ name: 'Staff loans', blurb: 'Quote before committing, approve, then amortise into installments that come off payroll.' },
			{ name: 'Payslips', blurb: 'A per-day breakdown behind each slip, released to staff and printed from a layout you design.' },
		],
	},
	{
		id: 'communication',
		label: 'Communication',
		tagline: 'Announcements, group chat, SMS to guardians',
		tint: 'bg-violet-50 text-violet-700 ring-violet-200/70',
		icon: [
			'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155',
		],
		items: [
			{ name: 'Targeted announcements', blurb: 'Post to the whole school, to grade levels, or to named sections — not to everyone by default.' },
			{ name: 'Read tracking', blurb: 'You can see who has read it, and an unread badge tells them there is something new.' },
			{ name: 'Attachments & scheduling', blurb: 'Files ride along, and a post can be written now and published later.' },
			{ name: 'Group chat', blurb: 'A group for each advisory section and each subject, with membership derived from enrolment — nothing to set up.' },
			{ name: 'SMS to guardians', blurb: 'Sent over your own prepaid SIMs from a small box on campus, with templates, triggers and a do-not-text list.' },
			{ name: 'Finance announcements', blurb: 'The finance office gets its own channel to every student.' },
		],
	},
	{
		id: 'ai',
		label: 'AI assistance',
		tagline: 'A teaching assistant, on your school’s own key',
		tint: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200/70',
		icon: [
			'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z',
		],
		items: [
			{ name: 'Tala, for teachers', blurb: 'A chat assistant that can read a teacher’s own subjects, lessons and assessments — and nothing else.' },
			{ name: 'Granted teacher by teacher', blurb: 'An administrator decides who may use it and caps how much each of them may send.' },
			{ name: 'Your key, your choice of model', blurb: 'Runs on the school’s own API key against Claude or OpenAI. Teachers have no setup step at all.' },
			{ name: 'It drafts; you approve', blurb: 'Tala proposes a quiz or exam. Nothing is written until the teacher accepts it — the model has no write access.' },
			{ name: 'Curriculum generation', blurb: 'Draft a quarter’s topics, lesson plans and assessments, then edit what you keep.' },
			{ name: 'Document reading', blurb: 'Pulls text out of an uploaded PDF or photograph.' },
		],
	},
	{
		id: 'devices',
		label: 'Devices on campus',
		tagline: 'Biometrics, SMS box, gate terminals',
		tint: 'bg-stone-100 text-stone-600 ring-stone-300/70',
		icon: [
			'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z',
		],
		items: [
			{ name: 'Biometric terminals', blurb: 'ZKTeco fingerprint devices paired from the portal — fetch users, pull attendance, enrol a finger remotely.' },
			{ name: 'SMS box', blurb: 'A Raspberry Pi or spare PC with a USB modem and your prepaid SIM, sending on the school’s behalf.' },
			{ name: 'Gate terminals', blurb: 'A screen that boots straight into the scanner and puts itself back if it ever exits.' },
			{ name: 'No inbound port', blurb: 'Every device pairs with a one-time code, then pulls its work. Nothing on campus has to be reachable from outside.' },
			{ name: 'Health at a glance', blurb: 'Heartbeats, signal strength and device logs, read from the portal rather than a keyboard on site.' },
		],
	},
	{
		id: 'administration',
		label: 'Administration',
		tagline: 'Roles, multi-campus, and the layout builders',
		tint: 'bg-slate-100 text-slate-600 ring-slate-300/70',
		icon: [
			'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
		],
		items: [
			{ name: 'Roles you build yourself', blurb: 'Every screen carries View and Manage; approvals are named separately, so a role can approve without editing.' },
			{ name: 'One list, everywhere', blurb: 'The sidebar, the role builder and the server all read the same catalog — a permission cannot mean two things.' },
			{ name: 'Multi-campus', blurb: 'One login can belong to more than one school, with a different role in each.' },
			{ name: 'Departments', blurb: 'Departments and their heads, who see the whole school’s subject list.' },
			{ name: 'Branding', blurb: 'Academic year, logo, theme and institution profile, set per school.' },
			{ name: 'Certificate builder', blurb: 'Design award and certificate layouts.' },
			{ name: 'Form builder', blurb: 'Lay out the admission form and any custom form.' },
			{ name: 'ID card builder', blurb: 'Card templates with your own artwork, printed in batches from the student list.' },
			{ name: 'Receipt & payslip layouts', blurb: 'What comes out of the printer is yours to design.' },
		],
	},
];

/** Column split for the mega menu — three columns of three. */
export const megaMenuColumns: FeatureGroup[][] = [
	featureGroups.slice(0, 3),
	featureGroups.slice(3, 6),
	featureGroups.slice(6, 9),
];

/**
 * The photographed scenes in the "On campus" band.
 *
 * Each one has to earn its place by showing a moment the platform is actually
 * in — a tap, a receipt, a class record, a punch — rather than decorating the
 * page with a stock classroom. The caption says what the software does with
 * that moment, so the photograph carries information rather than atmosphere.
 */
export interface CampusScene {
	src: string;
	/** Describes the photograph for a screen reader, not the caption again. */
	alt: string;
	label: string;
	caption: string;
}

export const campusScenes: CampusScene[] = [
	{
		src: '/images/scene-gate.webp',
		alt: 'A student in school uniform holding an ID card to a card reader beside a turnstile, a guard standing behind.',
		label: 'A tap at the gate',
		caption: 'The scan reaches the arrival board, and a text reaches the guardian.',
	},
	{
		src: '/images/scene-cashier.webp',
		alt: 'A school cashier passing a printed receipt through a service window to a parent.',
		label: 'The cashier’s window',
		caption: 'Printed from a template the school designed. The ledger settles as it prints.',
	},
	{
		src: '/images/scene-classroom.webp',
		alt: 'A teacher at a desk beside a laptop, writing in a paper class record, with students working behind her.',
		label: 'The class record',
		caption: 'Entered once, then carried into the report card and the SF9.',
	},
	{
		src: '/images/scene-biometric.webp',
		alt: 'A staff member pressing a finger onto a wall-mounted biometric time clock in a school corridor.',
		label: 'Time in',
		caption: 'Punches become a timesheet, and the timesheet becomes a payslip.',
	},
];
