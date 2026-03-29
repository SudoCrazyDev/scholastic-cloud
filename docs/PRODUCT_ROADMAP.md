# ScholasticCloud — Product Roadmap & Feature Guide

> Last updated: March 28, 2026

---

## Table of Contents

1. [What We Have Now](#1-what-we-have-now)
2. [Features to Build Next](#2-features-to-build-next)
3. [Future AI Features](#3-future-ai-features)

---

## 1. What We Have Now

### Platform Overview

ScholasticCloud is a cloud-based School Management System (SaaS) built for Philippine K-12 institutions. It supports DepEd curriculum standards (ECR grading, SF9 report cards) and handles the full academic lifecycle from admission to graduation.

**Tech Stack**
- Frontend: React 19 + TypeScript + Vite + TailwindCSS
- Backend: Laravel 11 (PHP) — REST API
- Database: PostgreSQL 15
- Payments: Maya (online), with a dedicated payment microservice
- Document Processing: Cloudflare Workers
- Desktop Sync: Offline-first capability via Electron app

---

### Current Features

#### Authentication & Access Control
- Dual login system: Staff/Admin portal and Student portal (separate credentials)
- Role-based access control (Principal, Teacher, Administrator, Cashier, etc.)
- Multi-institution support — one user can belong to multiple schools
- Token-based authentication with expiry

#### Institution & Subscription Management
- Multi-tenant architecture — full data isolation per institution
- Subscription tier management
- Institution profile and settings

#### Student Management
- Student records with profile photos
- Enrollment and re-enrollment workflows
- Student-to-section and student-to-subject assignment
- Admission form (public-facing, per-institution URL)
- Document uploads (birth certificate, report cards, etc.)
- Document verification and cross-checking

#### Academic Setup
- Grade levels and class sections
- Subjects and subject templates (reusable)
- Academic tracks and strands (STEM, ABM, TVL, etc.)
- Department management
- School calendar / school days configuration
- Teacher-to-subject assignment

#### Grading System
- Quarterly grades with running calculations
- ECR (Essential Competency Rating) — DepEd competency-based grading
- Formative and summative assessments
- Grade consolidation by section and quarter
- Proficiency level tracking
- Final grade auto-calculations with parent-subject propagation
- Core value / character markings per student

#### Assessment & LMS
- Online quiz/assignment/exam creation
- Student assessment taking interface with attempt tracking
- Lesson planning with topic management
- Topic completion tracking
- AI-assisted topic, lesson plan, and assessment generation (async task queue)

#### Report Cards & Forms
- SF9 Report Card generation (DepEd-compliant)
- Consolidated grade reports by section and quarter
- Proficiency reports
- Student ranking by section

#### Certificate & Document Builder
- Visual certificate template builder (canvas-based, drag-and-drop)
- Element customization (text, images, shapes, positioning)
- Template publishing and version control
- Custom form builder (for school-specific data collection)

#### Attendance
- Manual student attendance recording per class
- School day management
- RFID-based gate entry/exit (kiosk mode)
- Real-time attendance monitoring
- Teacher attendance tracking
- Bulk attendance operations

#### Finance
- School fee configuration (multiple fee types)
- Student payment recording and history
- Discount system (individual and grade-level)
- Additional/miscellaneous fees per student
- Maya online payment integration with webhook confirmation
- Payment receipt customization (receipt builder)
- Finance dashboard with collection summaries
- Monthly/quarterly collection reports
- Student ledger view
- Notice of Account (NOA) generation

#### RFID Integration
- RFID tag assignment to students
- Gate kiosk (entry/exit scanning)
- Scan log recording with timestamps
- Real-time gate status display

#### Offline / Desktop App
- Running grades download and upload sync
- Class section and student data sync
- ECR data sync
- Operates without internet; syncs when connected

---

## 2. Features to Build Next

### Student & Parent Experience

#### Parent Portal
A separate login for parents to monitor their child without going through the school office.
- View grades per subject and quarter
- View attendance records with absent/tardy flags
- See payment status and outstanding balances
- Receive announcements from the school
- **Why:** High demand in Philippine schools; reduces admin phone calls significantly

#### Push & Email Notifications
Automated alerts tied to existing system events.
- Grade posted → notify student and parent
- Payment due in X days → notify parent
- Student marked absent → notify parent same day
- Online payment confirmed → receipt via email
- **Why:** Most of the triggers already exist; this is a notification layer on top

#### Digital Student ID (QR/Barcode)
A QR code-based digital student ID accessible from the student portal.
- Usable for cashless canteen purchases
- Library borrowing/return scanning
- Event attendance check-in
- Complements existing RFID integration

#### Gradebook Teacher Remarks
Allow teachers to leave written remarks per student per quarter alongside the grade.
- Visible in the student portal and on the SF9
- Required/optional toggle per institution

---

### Academic Features

#### Enrollment Workflow
A structured, step-by-step enrollment process per school year.
- Requirements checklist (documents submitted or pending)
- Automatic fee computation based on grade level and discounts
- Section assignment
- ID/form printing at end of workflow
- **Why:** Currently enrollment is fragmented across students, sections, and finance modules

#### Section Timetable / Schedule Builder
Visual drag-and-drop class schedule per section.
- Time slots per day per subject
- Teacher conflict detection
- Printable schedule for students and teachers

#### Substitute Teacher System
- Mark a teacher absent for the day
- Assign a substitute for specific class periods
- Reflect in attendance and gradebook records

#### Curriculum Mapping
Visualize how subjects, competencies, and strands connect across grade levels.
- Useful for academic coordinators during planning
- Identify gaps or overlaps in the curriculum

---

### Finance Features

#### Installment Plan Management
Define payment schedules per student and track compliance.
- Monthly, quarterly, or custom payment schedules
- Flag overdue installments
- Auto-generate payment reminders
- **Why:** Most private schools in PH operate on installment; currently only full payments are tracked cleanly

#### GCash Integration
Add GCash as a second online payment channel alongside Maya.
- Biggest mobile wallet in the Philippines
- Same webhook-based confirmation flow as Maya

#### Financial Aid & Scholarship Tracking
- Record scholarship sources (government, private, school-funded)
- Track coverage amounts and apply them to fee computation
- Scholarship certificates and renewal tracking

#### Overdue Fee Flags
- Flag students with outstanding balances
- Block report card or certificate release until cleared (with override permission)
- Auto-generate overdue notices

---

### Administrative Features

#### Audit Log
Track every significant action in the system with a who/what/when trail.
- Grade edits (who changed whose grade, from what to what)
- Payment voids and adjustments
- Enrollment changes
- User login history
- **Why:** Critical for accountability in schools handling public funds

#### Announcement Board
School-wide or section-specific announcements.
- Posted by admin or principal
- Visible in staff, student, and parent portals
- Pinnable, with expiry dates

#### Document Request System
Students formally request documents through the portal.
- Request types: transcript, certificate, good moral, diploma
- Approval workflow (registrar reviews and approves)
- Status tracking (pending → processing → ready for pickup)
- Release confirmation

#### Multi-Campus Support
If an institution operates multiple campuses, unify them under one account.
- Campus-level data isolation with shared institution-level settings
- Cross-campus reporting for principals/owners

---

### Reporting & Compliance

#### SF10 (Form 10 / Permanent School Record)
Complement the existing SF9 with the cumulative student academic history.
- Tracks all years and quarters in one form
- Required for transferring students

#### DepEd Enrollment Reports (EBEIS-Ready)
Export enrollment data in the format required for government submission.
- EBEIS-compatible CSV/Excel export
- Auto-populated from existing student and enrollment data

#### Teacher Performance Dashboard
For academic coordinators and principals.
- Grade submission rate per teacher
- Lesson plan submission tracking
- Attendance recording compliance

---

## 3. Future AI Features

### Already Built
- AI lesson plan generation
- AI topic generation per quarter
- AI assessment/quiz generation
- Async task queue for long-running AI jobs

---

### AI Grade Analyst

After grades are encoded, AI surfaces insights automatically.

**What it does:**
- Identifies at-risk students before the quarter ends based on formative scores
- Highlights which competencies (ECR items) a section is struggling with
- Ranks sections and flags outliers for academic review

**Example output:**
> "5 students in Grade 8-Rizal are at risk of failing Science this quarter. Their ECR scores for competency 'Analyzing Ecosystems' are averaging 60%. Recommend remediation before the summative assessment."

**Integration point:** Runs after each batch of ECR scores is saved; results appear in a dashboard card for the teacher and section adviser.

---

### AI Report Card Narrative Generator

SF9 has a remarks/narrative section. AI generates a personalized paragraph per student.

**What it does:**
- Reads the student's quarterly grades, attendance, and core value markings
- Generates a 2-4 sentence narrative appropriate for the grade level
- Teacher reviews and edits before finalizing

**Example output:**
> "Maria demonstrated exceptional performance in Mathematics and Science this quarter, consistently achieving Outstanding marks. Her attendance was perfect and she showed strong leadership in class activities. Continued encouragement in English composition is recommended for next quarter."

**Integration point:** Button inside SF9 generation flow — "Generate AI Remarks" per student or for the whole section in bulk.

---

### AI Admission Screener

When an admission form is submitted, AI pre-screens it before admin review.

**What it does:**
- Checks completeness (all required fields and documents present)
- Flags inconsistencies (e.g., age doesn't match grade level, mismatched dates)
- Scores the application on completeness (0–100%)
- Drafts a follow-up or acceptance message for admin to review and send

**Integration point:** Admission form submissions list — each submission shows an AI score badge and a draft response the admin can edit and send.

---

### AI Chatbot for Student & Parent Portal

A conversational interface where students and parents can ask questions about their own data.

**What it does:**
- "What is my grade in Math this quarter?" → pulls from StudentRunningGrade
- "How much do I still owe?" → pulls from StudentPayment and SchoolFee
- "Am I enrolled in Science?" → pulls from StudentSubject
- "When is the next payment due?" → pulls from installment schedule

**Integration point:** Floating chat widget in the student and parent portals. Scoped strictly to the authenticated student's data — no cross-student access.

---

### AI Fee Computation Assistant (Admin Tool)

Admin describes a student's situation in plain text, AI computes the correct fee breakdown.

**What it does:**
- Input: "Grade 11 STEM, has a sibling discount, partial scholarship from DOST, pays monthly"
- Output: Computed fee table with all deductions applied, ready to confirm and save
- Generates a draft Notice of Account

**Integration point:** Finance cashiering or enrollment workflow — "Use AI to compute fees" shortcut.

---

### AI Attendance Anomaly Detection

Proactive attendance monitoring with pattern recognition.

**What it does:**
- Flags students whose attendance is declining week over week
- Detects chronic absenteeism early (before it hits the 20% threshold that affects grades)
- Suggests a parent communication template based on the student's pattern

**Example alert:**
> "Juan dela Cruz has been absent 4 out of the last 7 school days. This puts him at risk of dropping below the required attendance rate. Suggested action: Send a parent notice."

**Integration point:** Attendance dashboard — weekly AI digest card for the class adviser.

---

### AI Certificate Content Generator

In the certificate builder, AI drafts the certificate body text.

**What it does:**
- Input: Award type (honor roll, sports, leadership), student name, school name, date
- Output: Formal certificate language appropriate for the award
- Teacher/admin edits and applies to the template

**Integration point:** Certificate builder — "Generate Text with AI" button for the main body element.

---

### AI Subject Prerequisite & Curriculum Advisor

For academic coordinators building or reviewing the curriculum.

**What it does:**
- Reviews the full subject list across grade levels
- Suggests prerequisite relationships between subjects
- Flags potential curriculum gaps (e.g., a competency introduced in Grade 9 but never built on)
- Recommends subject sequencing improvements

**Integration point:** Curriculum mapping feature (to be built) or the existing subjects/grade levels pages.

---

### AI-Powered Lesson Plan Quality Reviewer

Before a teacher submits a lesson plan, AI reviews it.

**What it does:**
- Checks alignment between objectives, activities, and assessments
- Flags vague learning objectives
- Suggests improvements inline
- Scores the plan on DepEd lesson plan rubric criteria

**Integration point:** Lesson plan editor — "Review with AI" button that returns inline suggestions before saving.

---

### AI Enrollment Demand Forecaster

For school administrators planning the next school year.

**What it does:**
- Based on historical enrollment data (students per grade level per year), forecasts how many students to expect next year
- Suggests how many sections to open per grade level
- Flags grade levels where capacity may be exceeded

**Integration point:** Admin dashboard or school settings — "Enrollment Forecast" section visible to Principal role.

---

## Priority Summary

### Build Next (Highest ROI)

| Feature | Reason |
|---|---|
| Parent Portal | Massive demand; reduces admin workload |
| Enrollment Workflow | Closes a major gap in the student lifecycle |
| Installment Plan Tracking | Finance is already built; this completes it |
| Push/Email Notifications | Low effort; high perceived value |
| Audit Log | Required for accountability in school finance |

### AI Quick Wins (Lowest Integration Cost)

| AI Feature | Why It's Quick |
|---|---|
| SF9 Narrative Generator | Grading data is already there; just needs a prompt + UI button |
| Attendance Anomaly Detection | Attendance data is already tracked; pattern detection is straightforward |
| Certificate Content Generator | Certificate builder already exists; add an AI text button |
| Admission Screener | Form data is already submitted; AI pre-screen is a background job |

### AI Big Bets (Highest Long-term Value)

| AI Feature | Why It Matters |
|---|---|
| Student/Parent Chatbot | Transforms the portal from read-only to conversational |
| Grade Analyst | Shifts teachers from reactive to proactive intervention |
| Enrollment Demand Forecaster | Helps school owners plan capacity and staffing |
