# ScholasticCloud Frontend Audit Report

_Audited: 2026-04-13_
_Scope: `/app` — Vite + React 19 + TypeScript SPA_

## Executive Summary

The ScholasticCloud frontend is a mature Vite + React 19 + TypeScript application with 326 TypeScript files. It's a feature-rich educational management system supporting multi-role access (admin, teacher, student, staff), complex workflows (grades, attendance, finance, admissions), and PDF generation. The codebase has a **solid foundation with clean architecture**, but exhibits several **technical debt patterns and areas for improvement** in code quality, type safety, security, and testing.

---

## 1. Tech Stack & Dependencies

### Framework & Build
- **React**: 19.1.0 (latest)
- **TypeScript**: ~5.8.3
- **Vite**: 7.0.0
- **Tailwind CSS**: 4.1.11
- **React Router DOM**: 7.6.3

### Key Libraries

| Category | Package | Version | Notes |
|----------|---------|---------|-------|
| State/Queries | @tanstack/react-query | 5.81.5 | Excellent; 5min stale time reasonable |
| Forms | formik, yup | 2.4.5, 1.3.3 | Used in 14 files |
| Auth | @supabase/supabase-js | 2.50.4 | Loaded but likely unused |
| UI | @headlessui/react | 2.2.4 | Accessible select/combobox |
| Icons | @heroicons/react, lucide-react | 2.2.0, 0.525.0 | **Duplication** |
| Animations | framer-motion | 11.0.0 | OK |
| PDF Export | @react-pdf/renderer, react-pdf, jspdf, html2canvas | Mixed | **3 libs — consolidate** |
| Data Grid | Homebrew DataTable | Custom (16KB) | No external grid |
| HTTP | axios | 1.6.2 | Outdated (1.7.x available) |
| Drag-drop | @dnd-kit/* | ^6-10 | OK |
| Excel | xlsx | 0.18.5 | OK |
| Toast | react-hot-toast | 2.5.2 | OK |
| QR | qrcode.react | 4.2.0 | OK |

### DevDependencies
- ESLint 9.29.0 with typescript-eslint, react-hooks plugins
- React SWC 3.10.2
- **No testing framework (0 tests)**

### Issues
1. **No testing framework or tests** — 0% coverage (HIGH)
2. **Axios 1.6.2 outdated** (MEDIUM)
3. **Supabase loaded but likely unused** (MEDIUM)
4. **Icon library duplication** (LOW)
5. **PDF library bloat**: 3 separate PDF libraries (MEDIUM)
6. **No state management lib** — Context + React Query (acceptable)

---

## 2. Project Structure

```
src/
├── api/              # Axios instance + interceptors
├── components/       # 40+ UI components
│   ├── layouts/      # Private/Public/Dashboard layouts
│   ├── select.tsx    # Headless UI select (shared)
│   ├── DataTable.tsx # Custom 16KB table
│   └── ...
├── hooks/            # 37 custom hooks
├── pages/            # 148 page/modal files
├── services/         # 51 API service modules
├── types/            # 1300+ lines of type definitions
├── utils/            # 5 utility files
├── providers/        # Auth, Query providers
└── main.tsx, App.tsx
```

### Strengths
- Clear separation of concerns
- Path aliases configured (vite.config.ts + tsconfig.app.json)
- Domain-driven service organization
- Custom hooks extracted for reusability

### Weaknesses
1. 148 page/route files — modals should be co-located (MEDIUM)
2. Some thin single-use hooks (LOW)
3. 51 service modules — mostly thin axios wrappers (LOW)
4. Deep nesting in pages/ (MEDIUM)
5. No barrel exports (LOW)

---

## 3. Code Quality

### TypeScript Strictness (tsconfig.app.json)
- `strict: true` ✓
- `noUnusedLocals: true` ✓
- `noUnusedParameters: true` ✓
- `noFallthroughCasesInSwitch: true` ✓
- `noUncheckedSideEffectImports: true` ✓

### Type Safety Issues
- **249 instances of `: any`** across 91 files
  - `useAuth.ts` lines 35, 42: `user: any | null`
  - `hooks/useClassSections.ts` — multiple
  - `pages/Students/components/StudentFinanceTab.tsx` — multiple
  - Many service responses typed as `any`

### Code Quality Metrics
- **111 console.log statements** across production hooks/services
- **6 TODO comments** in `useAttendance.ts`
- **Largest files (monster components)**:
  - `Finance.tsx`: **1,769 lines**
  - `ClassSectionModal.tsx`: **1,647 lines**
  - `AssessmentBuilderTab.tsx`: **1,469 lines**
  - `StudentFinanceTab.tsx`: 952 lines
  - `PublicAdmissionForm.tsx`: 859 lines

### ESLint
- Modern flat config; covers TS, React hooks, React refresh
- No custom rules (could add `no-console`, import order)

### Consistency
- Formik in 14 files — some inconsistency in validation patterns
- Mix of `React.FC<>` (77 files) and direct exports
- No enforced import order

---

## 4. State Management & Data Fetching

- **React Query 5.81.5** for server state ✓
- **Context API** for auth state
- **localStorage** for tokens (`auth_token`, `auth_user`, `token_expiry`, impersonation)
- `sessionStorage` used once in `StudentFinanceTab.tsx`

### QueryProvider Config
```ts
staleTime: 5 * 60 * 1000  // 5 min
retry: 1
ReactQueryDevtools enabled  // should be gated by NODE_ENV
```

### Auth State (`hooks/useAuth.ts`)
- Simple Context hook
- Token stored in localStorage (XSS-vulnerable)
- User state typed as `any` (lines 35, 42)
- No automatic token refresh
- Impersonation state in localStorage

### API Client
- **Dual clients: `api/index.ts` and `lib/api.ts`** — DRY violation
- Request interceptor injects Bearer token
- 401 handler clears auth and redirects
- FormData uploads handled correctly
- No request timeout for long operations
- No request deduplication / cancellation

---

## 5. Routing & Auth

### Route Structure (`App.tsx`)
- Public: `/login`, `/gate-enter`, `/gate-exit`, `/admission/:id`
- Private: wrapped in `PrivateLayout`
- Special: `/set-new-password`
- **148 routes total**

### Protected Routes
- `PrivateLayout` checks auth ✓
- `StudentOnlyRoute` restricts to students ✓

### Role-Based Access
- Stored in `user.role.slug`
- **Permissions hardcoded in components** (e.g., `if (roleSlug === 'student')`) — ANTI-PATTERN
- No RBAC service
- No route-level role validation (only auth)
- Impersonation via `assumeUser` stores original token in localStorage

---

## 6. UI / Components

- Tailwind utility-first ✓
- Headless UI for accessible Select, Combobox, Dialog, Radio, Checkbox ✓
- No shadcn/ui or MUI — all custom
- ~40 UI components

### Select Compliance
- Per user memory, shared `Select` from `components/select` should always be used
- **Audit finding: NO raw `<select>` elements found** ✓

### Accessibility
- Headless UI components are a11y-compliant ✓
- ARIA labels used in modals
- No `dangerouslySetInnerHTML` ✓
- Color contrast not fully audited

### Component Issues
1. Monster components (Finance, ClassSectionModal, AssessmentBuilderTab) — HIGH
2. Modal proliferation (MEDIUM)
3. No Storybook (LOW)
4. Form library inconsistency — mix of Formik + raw state

### Design System Present
- `Button.tsx` — sizes, variants, loading states
- `Input.tsx` — with error states
- `Alert.tsx` — with type variants
- `Badge.tsx`, `Avatar.tsx`, `Pagination.tsx`

---

## 7. Security

### Current Practices
- Token-based auth with Bearer tokens ✓
- API interceptor injects token ✓
- 401 handling clears auth ✓

### Vulnerabilities

1. **Tokens in localStorage** — XSS RISK (HIGH)
   - `lib/api.ts`, `hooks/useAuth.ts`
   - Fix: HttpOnly cookies
2. **Auth user JSON in localStorage** — PII exposure (HIGH)
   - `hooks/useAuth.ts:71`
3. **Impersonation tokens in localStorage** (MEDIUM)
   - `hooks/useAuth.ts:118-120`
4. **No CSRF protection assumptions documented** (MEDIUM)
5. **No validation on API responses** (MEDIUM)
6. **No Content Security Policy configured** (MEDIUM)
7. **Password reset token in URL** — server must validate (MEDIUM)

### No Hardcoded Secrets
- No hardcoded secrets found ✓
- `VITE_API_URL` only (safe) ✓

### XSS Risks
- `ReceiptPrintModal.tsx:74` references `printRef.current.innerHTML` but doesn't assign (safe)
- No `dangerouslySetInnerHTML` ✓

---

## 8. Performance

### Bundle Analysis
- No bundle size analysis tool
- **Large deps**: recharts, @react-pdf/renderer, html2canvas, jspdf, xlsx

### Code Splitting
- **No dynamic imports** — all components in initial bundle
- Route-based splitting not implemented

### Re-render Issues
- Finance.tsx has 20+ useState calls
- `useMemo`/`useCallback` used inconsistently
- 14 files with Formik (good for form isolation)

### Optimizations in Place
- React Query caching (5 min stale)
- Vite + SWC (fast build)
- Tailwind v4 Vite plugin

### Missing
- Lazy route loading
- Image optimization
- Virtual scrolling in DataTable
- Production console-stripping

---

## 9. Testing

- **0 test files, 0 framework, 0% coverage**
- No Jest/Vitest/RTL setup
- No testing scripts in package.json
- No CI pipeline detected

---

## 10. Build / Tooling

### Vite Config
- Path aliases ✓
- React SWC ✓
- Tailwind v4 Vite plugin ✓
- No per-env builds

### TypeScript Config
- Good strictness; only `any` abuse is an issue

### Build Process
- `npm run build` → `tsc -b && vite build` ✓
- Standard scripts present

### Missing
- No CI/CD (no `.github/workflows/`)
- No pre-commit hooks (husky, lint-staged)
- No incremental build config
- No type-check step gating build (tsc in CI)

---

## 11. Documentation

- `README.md` — 112 lines; covers setup, env, structure, scripts
- Outdated project structure section
- No inline comments in complex files
- No service/API docs
- No architecture doc
- No deployment guide

---

## 12. Anti-Patterns Found

1. Dual API clients (DRY violation)
2. Hardcoded permissions in components
3. 249 `any` types
4. Monster components
5. No request deduplication
6. No optimistic updates
7. localStorage for sensitive auth
8. Impersonation state in localStorage

### Missing Best Practices
- No error boundaries
- No loading skeletons
- No request timeout handling
- No offline support / service worker
- No error monitoring (Sentry, LogRocket)

---

## What Needs To Be Done

### HIGH PRIORITY

1. **Consolidate duplicate API client** (~2h) — merge `api/index.ts` + `lib/api.ts`
2. **Migrate auth tokens to HttpOnly cookies** (~8h, requires backend)
3. **Install testing framework + critical-path tests** (~20h initial)
   - Vitest, @testing-library/react
   - Target: 30% coverage, 70% critical paths
4. **Implement RBAC service** (~6h) — `services/rbacService.ts`, replace hardcoded role checks
5. **Fix TypeScript `any` abuse** (~12h) — start with `useAuth.ts`, service responses
6. **Add request deduplication/cancellation via AbortController** (~4h)

### MEDIUM PRIORITY

7. **Break apart monster components** (~16h)
   - `Finance.tsx` (1,769) → Dashboard, SchoolFees, Cashiering, Ledger, Collections, Discounts, ReceiptBuilder
   - `ClassSectionModal.tsx` (1,647)
   - `AssessmentBuilderTab.tsx` (1,469)
8. **Remove/gate 111 console.log statements** (~2h)
9. **Add route-based code splitting** (~6h) — React.lazy + Suspense
10. **Update axios to latest** (~1h)
11. **Consolidate PDF libraries** (~4h)
12. **Secure impersonation flow** (~4h) — backend-stored original token
13. **Add error boundaries** (~3h)

### LOW PRIORITY

14. Consolidate icon libraries (~1h)
15. Add pre-commit hooks (husky + lint-staged) (~2h)
16. Set up GitHub Actions CI (~3h)
17. Add virtual scrolling to DataTable (~4h)
18. Storybook for design system (~6h)
19. Update README with architecture guide (~2h)
20. Environment-specific config files (~2h)

---

## Summary by Severity

| Severity | Count | Examples |
|----------|-------|----------|
| HIGH | 6 | Duplicate API client, localStorage auth, no tests, hardcoded RBAC, `any` abuse, no request dedup |
| MEDIUM | 7 | Monster components, console.logs, no code splitting, axios outdated, PDF bloat, impersonation, error boundaries |
| LOW | 7 | Icon dup, pre-commit, CI/CD, virtual scroll, Storybook, env configs, README |

### Estimated Effort
- **Critical (HIGH only):** ~52h
- **HIGH + MEDIUM:** ~100h
- **Full remediation:** ~150h

---

## Key File References

- [app/src/hooks/useAuth.ts](../app/src/hooks/useAuth.ts) — auth state (localStorage)
- [app/src/lib/api.ts](../app/src/lib/api.ts) — HTTP client
- [app/src/api/index.ts](../app/src/api/index.ts) — duplicate client
- [app/src/pages/Finance/Finance.tsx](../app/src/pages/Finance/Finance.tsx) — 1,769 lines
- [app/src/components/DataTable.tsx](../app/src/components/DataTable.tsx) — custom table
- [app/tsconfig.app.json](../app/tsconfig.app.json) — strict config
- [app/package.json](../app/package.json) — dependencies

---

## Conclusion

The frontend is a well-structured, feature-complete application with solid architectural foundations (clean separation, React Query, TypeScript strict mode). However, it suffers from critical security vulnerabilities (localStorage auth), zero test coverage, significant code quality debt (249 `any`s, monster components), and missing operational practices (no CI/CD, pre-commit hooks).

**Sequenced plan:**
1. **Immediate (this sprint):** Consolidate API client, migrate auth to HttpOnly cookies, strip console.logs
2. **Short-term (next 2 weeks):** Add test framework + critical-path tests, implement RBAC, fix type safety
3. **Medium-term (next month):** Split monster components, code splitting, set up CI/CD
4. **Long-term:** Monitoring, accessibility audit, performance profiling

The app is production-ready for its current feature set but needs **security and testing hardening** before scaling further.
