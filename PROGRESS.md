# Bhoomi — Build Progress Log

Updated after every completed, verified module per the Prompt 0 working agreement.

---

## Prompt 1 — Scaffolding ✅

**Completed**: 2026-09-26

### What was built
- `backend/` — Flask application-factory pattern (`create_app`), extensions singleton (`db`, `jwt`, `migrate`, `limiter`, `cors`), environment-based config classes (`DevelopmentConfig`, `TestingConfig`, `ProductionConfig`)
- `backend/app/blueprints/health.py` — `/healthz` (liveness) and `/readyz` (readiness, checks DB) endpoints
- `backend/app/blueprints/auth/` — stub blueprint registered at `/api/auth` (full implementation Prompt 3)
- `backend/app/celery_app.py` — Celery factory bound to Flask app context for ORM access inside tasks
- `backend/app/cli/` — `flask create-super-admin` CLI stub (full implementation Prompt 4 per §7.6)
- `backend/wsgi.py` — WSGI + Celery entry point for gunicorn and celery worker
- `backend/requirements.txt` — all pinned dependencies
- `backend/Dockerfile` — multi-stage, non-root user, healthcheck
- `infra/docker-compose.yml` — `web`, `worker`, `beat`, `postgres`, `redis` services with health checks
- `frontend/` — React 18 + TypeScript + Vite scaffold
  - `src/api/client.ts` — typed fetch wrapper with cookie credentials
  - `src/app/AppRouter.tsx` — React Router shell with all planned route placeholders
  - `vite.config.ts` — dev proxy for `/api`, `/healthz`, `/readyz`
  - `.env` — `VITE_API_BASE_URL` env variable

### Tests
- `backend/tests/test_scaffolding.py` — 7 tests
- Results: **7 passed**

### Known deferred items (not bugs)
- `create-super-admin` CLI prints stub message — full implementation in Prompt 4
- Auth endpoints (`/api/auth/*`) are stubs returning 404 — full implementation in Prompt 3
- All frontend routes show placeholder pages — built out Prompts 10–19

---

## Prompt 2 — Data Models & Migrations ✅

**Completed**: 2026-09-26

### What was built
- `backend/app/models/base.py` — `UUIDPrimaryKeyMixin` (cross-dialect UUIDv4 PK) & `TimestampMixin` (UTC `created_at`, `updated_at`)
- `backend/app/models/user.py` — `User` model with split `user_type` (farmer/buyer/expert/provider) and `platform_role` (user/admin/super_admin) per §4 & §7, bcrypt password hashing, phone/email unique indexing
- `backend/app/models/admin.py` — `AdminPermissionGrant` with composite index `(admin_user_id, permission_key)`, active check, and revocation flow per §4 & §7
- `backend/app/models/verification.py` — `FarmerVerification` for selfie and land photo keys, pending/verified/rejected workflow, reviewer links, and `docs_purge_at` retention per §4 & §5
- `backend/app/models/farm.py` — Agricultural hierarchy: `Farm`, `Plot`, `CropCatalog`, `CropCycle` (with composite index `(plot_id, status)`), `FarmActivity` with cascaded relationships per §4
- `backend/app/models/weather.py` — `WeatherAdvisory` with external provenance fields (`source_name`, `source_updated_at`, `valid_until`) per §4 & §8
- `backend/app/models/auth.py` — `RefreshToken` tracking active sessions, family rotation/revocation, user agents, and IP per §6
- `backend/app/models/audit.py` — `AuditLog` with mandatory `reason` field for sensitive document views, actor user FK, and redacted metadata per §4, §5 & §9
- `backend/migrations/versions/f950416317b9_initial_schema.py` — Initial Alembic migration generated and verified with `flask db upgrade`
- `backend/tests/test_models.py` — 8 new model test cases verifying relationships, role split, unique constraints, and cascades

### Tests
- Backend test suite: **15 passed** (7 scaffolding + 8 models)
- Frontend build & typecheck: **0 errors**

### Known deferred items (not bugs)
- Auth endpoints implementation and cookie issuance — Prompt 3
- RBAC decorators and Super Admin CLI/endpoints — Prompt 4
- Farmer verification endpoints and S3 pre-signed URLs — Prompt 5

---

## Prompt 3 — Auth Module ✅

**Completed**: 2026-09-26

### What was built
- `backend/app/schemas/auth.py` — Marshmallow `RegisterSchema` with `unknown = EXCLUDE` (client-supplied `platform_role` is silently stripped and forced to `'user'` per §7.6), `LoginSchema` (phone or email + password), `StepUpSchema`
- `backend/app/blueprints/auth/routes.py`:
  - `POST /api/auth/register` — validates input, enforces `platform_role = 'user'`, hashes password with bcrypt, returns sanitized user dict (201)
  - `POST /api/auth/login` — validates credentials, issues short-lived JWT access cookie (15 min) + refresh cookie (7 days) with `httpOnly=True`, `SameSite=Strict`, tracks session family in `refresh_tokens`, returns `csrf_token` and `csrf_refresh_token` in body (200)
  - `POST /api/auth/refresh` — validates refresh token with double-submit CSRF protection, enforces **refresh token rotation** (invalidates old token, issues new pair with same `token_family`), and implements **stolen-token-reuse detection** (reusing revoked token revokes ENTIRE token family and clears cookies) per §6
  - `POST /api/auth/logout` — single session logout, revokes active refresh token and unsets JWT cookies
  - `POST /api/auth/logout-all` — all-devices logout, revokes all active refresh tokens for the user and unsets cookies
  - `GET /api/auth/me` — returns current authenticated user profile re-verified from the DB on every request
  - `POST /api/auth/verify-password` — verifies password confirmation for step-up re-authentication
  - `POST /api/auth/step-up-test` — endpoint demonstrating `@require_step_up_auth` enforcement
- `backend/app/rbac/step_up.py` — `verify_step_up_password` and `@require_step_up_auth` decorator requiring valid password re-entry for sensitive operations per §6 & §7
- `backend/app/jwt_handlers.py` — JWT callbacks wired up: `user_identity_loader`, `user_lookup_loader` (re-verifies active user from DB on every request), `additional_claims_loader`, error loaders, and `CSRFError` handler returning 401 JSON
- `backend/tests/test_auth.py` — 13 comprehensive tests covering registration role enforcement, login success/failure, CSRF header protection, refresh rotation, stolen-token family revocation, logout/logout-all, profile retrieval, and step-up auth

### Tests
- Backend test suite: **28 passed** (7 scaffolding + 8 models + 13 auth)
- Frontend build & typecheck: **0 errors**

### Known deferred items (not bugs)
- RBAC decorators (`platform_role_required`, `permission_required`), Super Admin promotion endpoints, and `flask create-super-admin` CLI — Prompt 4
- Farmer verification upload & review endpoints — Prompt 5

---

## Prompt 4 — RBAC, Permission Grants, and Super Admin Bootstrap ✅

**Completed**: 2026-09-26

### What was built
- `backend/app/rbac/decorators.py`:
  - `@platform_role_required(*roles)` — Enforces `current_user.platform_role` membership on every request by querying live DB; returns 401 on missing JWT and 403 on role mismatch per §7.
  - `@permission_required(permission_key)` — Queries live `admin_permission_grants` table for an active (non-revoked) grant row. Regular users receive 403; Super Admins bypass automatically per §7.
- `backend/app/blueprints/admin/`:
  - `GET /api/admin/me/permissions` — Returns caller's active permission grants (`implicit_super_admin: true` for Super Admins).
  - `GET /api/admin/users` — Paginated user listing filtered by role/type/status, requiring `user_reports` grant.
  - `GET /api/admin/users/<id>` — User detail view requiring `user_reports` grant.
  - `PATCH /api/admin/users/<id>/deactivate` & `PATCH /api/admin/users/<id>/activate` — Account lifecycle endpoints with mandatory `reason` logging to `audit_logs`.
- `backend/app/blueprints/super_admin/`:
  - `GET /api/super-admin/admins` — Lists all admin/super_admin accounts.
  - `POST /api/super-admin/admins` — Provisions admin/super_admin accounts; self-promotion prevention built-in.
  - `PATCH /api/super-admin/admins/<id>/deactivate` & `/activate` — Admin account deactivation/reactivation; self-deactivation protection enforced.
  - `GET /api/super-admin/admins/<id>/permissions` — Returns grants for an admin.
  - `POST /api/super-admin/admins/<id>/permissions` — Idempotently grants permission with `AuditLog` row.
  - `DELETE /api/super-admin/admins/<id>/permissions/<key>` — Revokes permission with `AuditLog` row.
  - `GET /api/super-admin/audit-logs` — Paginated audit log explorer with filtering.
- `backend/app/cli/__init__.py`:
  - `flask create-super-admin` — Idempotent bootstrap CLI command; refuses execution if any Super Admin exists in the database.
- `backend/tests/test_rbac.py` — 28 comprehensive tests covering role gates, permission gates, admin creation/deactivation, grant/revocation idempotency, self-promotion/self-deactivation protections, audit trails, and CLI idempotency.

### Tests
- Backend test suite: **56 passed** (7 scaffolding + 8 models + 13 auth + 28 rbac)
- Coverage: 84% on backend
- Frontend build & typecheck: **0 errors**

### Known deferred items (not bugs)
- Farmer verification upload & review endpoints — Prompt 5
- Farm, plot, crop-cycle CRUD — Prompt 6

---

## Prompt 5 — Farmer Verification Module ✅

**Completed**: 2026-09-26

### What was built
- `backend/app/utils/storage.py` — Strictly separated storage abstractions per §5:
  - `PrivateVerificationStorage` — Operates against `S3_BUCKET_PRIVATE` (`bhoomi-verification-private`), generates restricted presigned PUT upload URLs (validating MIME types and 10MB size limits), generates short-lived (5 min) presigned GET download URLs for reviewers, and deletes objects on purge.
  - `PublicMediaStorage` — Operates against `S3_BUCKET_PUBLIC` (`bhoomi-public-media`) for profile and catalog photos; completely decoupled from verification documents.
- `backend/app/schemas/verification.py` — Marshmallow validation schemas:
  - `UploadUrlRequestSchema` — Validates `photo_type` ('selfie' | 'land'), MIME types (`image/jpeg`, `image/png`, `image/webp`), and file size limits (<= 10MB).
  - `SubmitVerificationSchema` — Validates submitted object keys.
  - `ViewPhotoRequestSchema` — Validates required non-empty `reason` string (min 5 characters) for audit trail.
  - `ReviewVerificationSchema` — Validates review decision ('verified' | 'rejected') and enforces mandatory rejection reason.
- `backend/app/blueprints/verification/routes.py`:
  - `POST /api/verification/upload-url` — Direct-to-S3 presigned upload URL generator; rate-limited (20/min).
  - `POST /api/verification/submit` — Submits selfie & land photo keys, enforces user-scoped prefix ownership (`verifications/{user_id}/`), creates pending `FarmerVerification` record, and updates `user.verification_status` to `'pending'`.
  - `GET /api/verification/status` — Returns caller's latest verification status.
  - `GET /api/verification/applications` — Paginated reviewer list of applications; gated by `@permission_required('verification_review', allow_super_admin_bypass=False)` (presigned URLs are never included in listings per §5).
  - `POST /api/verification/applications/<id>/photos/url` — Generates 5-minute presigned GET URL; **mandatory audit logging** with `reason`, actor, target user, and document key; applies to both Admins and Super Admins. Returns 410 if photo was purged.
  - `POST /api/verification/applications/<id>/review` — Reviewer approves/rejects application, updates applicant `verification_status`, logs action, and schedules `docs_purge_at` retention date.
  - `GET /api/verification/farmer-only-test` — Verification-gated endpoint demonstrating that unverified users receive 403 `verification_required`.
- `backend/app/rbac/decorators.py`:
  - Added `allow_super_admin_bypass=False` support to `@permission_required` so Super Admins also require an explicit grant to view verification documents per §5 & §7.4.
  - Added `@verified_farmer_required` decorator enforcing `user_type == 'farmer'` and `verification_status == 'verified'`.
- `backend/app/tasks/verification.py`:
  - `purge_expired_verification_docs` Celery task — Purges photos from private S3 bucket and sets keys to `'[PURGED]'` when `docs_purge_at <= utc_now()`, creating audit log rows for the purge.
- `backend/app/celery_app.py`:
  - Added Celery beat schedule entry for hourly verification retention purge.
- `backend/tests/test_verification.py` — 17 comprehensive tests verifying all Prompt 5 criteria.

### Tests
- Backend test suite: **73 passed** (7 scaffolding + 8 models + 13 auth + 28 rbac + 17 verification)
- Coverage: 83% on backend
- Frontend build & typecheck: **0 errors**

### Known deferred items (not bugs)
- Farms, plots, and crop cycles CRUD — Prompt 6
- Farm activities and reminders — Prompt 7

---

## Prompt 6 — Farms, Plots, Crop Cycles ✅

**Completed**: 2026-09-26

### What was built
- `backend/app/blueprints/crops/`:
  - `seeds.py` — Seeding dataset and idempotent seeding function with 18 common agricultural crops (cereals, pulses, oilseeds, cash crops, vegetables, spices) with agronomic durations and categories.
  - `routes.py` (`GET /api/crops`, `GET /api/crops/<id>`, `POST /api/crops/seed`) — Read-only reference catalog endpoints with category and search query filtering.
- `backend/app/schemas/farm.py` — Marshmallow validation schemas for `CreateFarmSchema`, `UpdateFarmSchema`, `CreatePlotSchema`, `UpdatePlotSchema`, `CreateCropCycleSchema`, and `UpdateCropCycleSchema`.
- `backend/app/blueprints/farms/routes.py`:
  - `GET /api/farms` — Returns caller's farms with dynamically aggregated `plots_count`.
  - `POST /api/farms` — Provisions new farm belonging exclusively to `current_user.id`.
  - `GET /api/farms/<id>`, `PATCH /api/farms/<id>`, `DELETE /api/farms/<id>` — Full CRUD with **strict owner-only access controls**; cross-user attempts return 403 Forbidden. Deletion cascades to plots and crop cycles.
- `backend/app/blueprints/plots/routes.py`:
  - `GET /api/plots/farm/<farm_id>`, `POST /api/plots/farm/<farm_id>` — Plot management scoped to parent farm with strict owner-only access checks.
  - `GET /api/plots/<id>`, `PATCH /api/plots/<id>`, `DELETE /api/plots/<id>` — Plot retrieval, update, and deletion; verifies caller owns the parent farm.
- `backend/app/blueprints/crop_cycles/routes.py`:
  - `POST /api/crop-cycles/plot/<plot_id>` — Initiates crop cycle; **automatically computes expected harvest date** from crop catalog's `typical_duration_days` if omitted.
  - `GET /api/crop-cycles/plot/<plot_id>`, `GET /api/crop-cycles` — Lists cycles scoped to plot or aggregated across all farms for the authenticated farmer.
  - `GET /api/crop-cycles/<id>`, `PATCH /api/crop-cycles/<id>`, `DELETE /api/crop-cycles/<id>` — Cycle detail view, status updates ('active' -> 'harvested' | 'failed', auto-setting `actual_harvest_date`), and deletion.
- `backend/tests/test_farms.py` — 10 comprehensive tests validating Crop Catalog queries, Farm/Plot/Cycle CRUD, automatic harvest date calculations, cascade deletions, and all 12 cross-user isolation cases (403).

### Tests
- Backend test suite: **83 passed** (7 scaffolding + 8 models + 13 auth + 28 rbac + 17 verification + 10 farms)
- Coverage: 85% on backend
- Frontend build & typecheck: **0 errors**

### Known deferred items (not bugs)
- Verified weather / advisory module — Prompt 8

---

## Prompt 7 — Farm Activities & Reminders ✅

**Completed**: 2026-09-26

### What was built
- `backend/app/models/notification.py` — `Notification` model with user FK, title, message, notification_type (`activity_reminder`, `weather_alert`, etc.), channel (`in_app`, `sms`, `email`), `is_read`, `read_at`, and `data_json` payload.
- `backend/app/utils/notifications.py` — `send_notification()` helper dispatching in-app alerts and external delivery channels (SMS/Email).
- `backend/app/schemas/activity.py` — Marshmallow validation schemas for `CreateActivitySchema`, `UpdateActivitySchema`, and `CompleteActivitySchema`.
- `backend/app/blueprints/farm_activities/routes.py`:
  - `GET /api/activities` — Lists activities across all farms/plots/cycles for the authenticated farmer with `is_completed`, `activity_type`, and date range filters.
  - `GET /api/activities/cycle/<cycle_id>` & `POST /api/activities/cycle/<cycle_id>` — Cycle-scoped activity management with strict owner verification.
  - `GET /api/activities/<id>`, `PATCH /api/activities/<id>`, `DELETE /api/activities/<id>` — Activity retrieval, update, and deletion; strictly owner-only (cross-user access returns 403 Forbidden).
  - `POST /api/activities/<id>/complete` — Quick action marking activity completed and recording `completed_date`.
- `backend/app/blueprints/notifications/routes.py`:
  - `GET /api/notifications` — Paginated user notifications with `is_read` filtering.
  - `GET /api/notifications/unread-count` — Count for badge indicators.
  - `PATCH /api/notifications/<id>/read` — Marks single notification as read.
  - `PATCH /api/notifications/read-all` — Marks all caller notifications as read.
  - `DELETE /api/notifications/<id>` — Deletes caller notification.
- `backend/app/tasks/activities.py`:
  - `check_due_activities_and_notify` Celery task — Periodic job identifying due (`scheduled_date <= today`) and overdue uncompleted activities on active crop cycles, enqueuing in-app notification reminders for the farmer, with daily duplicate prevention.
- `backend/app/celery_app.py`:
  - Added `check-due-farm-activities-daily` to Celery `beat_schedule`.
- `backend/tests/test_activities.py` — 4 comprehensive test classes validating activity CRUD, completion, strict cross-user 403 isolation, notification workflow, and Celery beat reminder execution with idempotency.

### Tests
- Backend test suite: **87 passed** (7 scaffolding + 8 models + 13 auth + 28 rbac + 17 verification + 10 farms + 4 activities)
- Coverage: 86% on backend
- Frontend build & typecheck: **0 errors**

### Known deferred items (not bugs)
- None in Backend MVP (Prompts 1–8 complete)

---

## Prompt 8 — Verified Weather / Advisory Module ✅

**Completed**: 2026-09-26

### What was built
- `backend/app/utils/weather.py`:
  - `WeatherService` client with provenance tracking (`source_name`, `source_url`, `source_updated_at`, `valid_until`, `is_official`). Handles external API calls, parsing, and fails gracefully with `WeatherFetchError` without fabricating corrupt data per §8.
- `backend/app/tasks/weather.py`:
  - `poll_weather_forecasts` Celery task — Periodic background job pulling forecasts across registered farm regions and default agricultural zones. Stores forecasts in `weather_advisories` table with complete external data quality provenance. Gracefully handles upstream failures without writing fabricated rows.
- `backend/app/blueprints/weather/routes.py`:
  - `GET /api/weather/forecast` — Returns current or last-known-good forecast for a region or coordinates. Surfaces provenance metadata. If data is expired, returns `status="stale"`, `is_stale=True`, and message `"Data unavailable, last known good at {source_updated_at}"` per §8.
  - `GET /api/weather/advisories` — Lists regional agronomic advisories (pest alerts, moisture warnings, temperature alerts) with provenance and validity status.
- `backend/app/celery_app.py`:
  - Added `poll-weather-forecasts-periodic` (every 3 hours) to Celery `beat_schedule`.
- `backend/tests/test_weather.py` — 5 comprehensive tests verifying Celery polling, upstream failure handling without data fabrication, current forecast with full provenance, stale-data handling with last-known-good timestamp, and regional agronomic advisories.

### Tests
- Backend test suite: **92 passed** (7 scaffolding + 8 models + 13 auth + 28 rbac + 17 verification + 10 farms + 4 activities + 5 weather)
- Coverage: 86% on backend
- Frontend build & typecheck: **0 errors**

### Summary of Backend MVP (Prompts 1–8)
All 8 backend modules of the MVP are fully implemented, verified, and passing 92 automated tests with 86% coverage. All RBAC rules, strict owner-only access controls, audit logs with mandatory reasons, separate private/public storage abstractions, and Celery beat background jobs are verified.


---

## Prompt 9 — Design Tokens & Shared Layout ✅

**Completed**: 2026-09-26

### What was built
- `frontend/src/design-system/tokens.scss` — Full design token library (§12.1 palette, spacing scale, radii, shadows, typography, focus rings, transitions)
- `frontend/src/design-system/index.scss` — Global reset, heading scale, tactile `.btn` system (primary/secondary/outline/danger/ghost + sm/lg sizes, hover/active/focus/disabled states per §12), `.card`, `.input-field`, `.select-field`, `.textarea-field` (flat, high-contrast, no texture behind data)
- `frontend/src/design-system/index.ts` — Barrel export for all components
- **Components** (`frontend/src/design-system/components/`):
  - `AppShell` — Layout shell with sidebar (desktop) + bottom nav (mobile)
  - `Sidebar` — Dark forest-green sidebar, 6 nav items (Dashboard/Farms/Crop Cycles/Activities/Weather/Profile)
  - `BottomNavigation` — Mobile 5-item bottom bar (Home/Farms/Activities/Weather/More)
  - `PageHeader` — Title + breadcrumb + action slot
  - `StatusBadge` — Icon + label badge, never color alone (§12.5), 10 variants
  - `FormField` — Accessible label/hint/error wrapper with `aria-describedby`
  - `EmptyState` — Icon + title + description + optional action
  - `ConfirmDialog` — Accessible modal (primary/danger variants), Escape key, focus trap
  - `Toast` + `ToastContext` — Global notification system with `useToast()` hook
  - `PermissionGate` — Display-only role/permission wrapper; clearly commented as NOT a security boundary (§12.3)
- `frontend/src/screens/style-guide/StyleGuidePage.tsx` — Full component showcase for design review
- `frontend/index.html` — Google Fonts (Inter, Outfit) loaded
- `frontend/src/main.tsx` — Imports design-system SCSS
- `frontend/src/App.tsx` — Wrapped with `ToastProvider`

### Tests
- Frontend build & typecheck: **0 errors**

### Known deferred items (not bugs)
- All `/screens/*` routes were placeholder pages — built out from Prompt 10 onwards

---

## Prompt 10 — Authentication Screens ✅

**Completed**: 2026-09-26

### What was built
- `frontend/src/api/csrf.ts` — In-memory CSRF token store; `setCsrfTokens`, `csrfHeaders`, `csrfRefreshHeaders`, `clearCsrfTokens`; memory-only (no localStorage) per §6 double-submit pattern
- `frontend/src/api/auth.ts` — Typed auth API layer: `login`, `register`, `logout`, `logoutAll`, `refreshTokens`, `fetchCurrentUser`, `updateProfile`, `changePassword`; CSRF headers injected on every mutating call; `platform_role` never sent from client (§7.6)
- `frontend/src/context/AuthContext.tsx` — Global session state (`AuthProvider` + `useAuth`); on mount silently calls `GET /api/auth/me` to restore session from httpOnly cookie with one transparent refresh attempt; exposes `user`, `isAuthenticated`, `isLoading`, `isInitialized` and all auth actions; SECURITY NOTE inline that context is a convenience layer, not a security boundary (§7)
- `frontend/src/screens/auth/auth.scss` — Shared auth screen SCSS: warm-cream auth page layout, forest-green brand header, flat form card, `.input-with-toggle`, `.auth-alert` (error/success/info variants), `.auth-submit`, loading skeleton, and full profile card layout
- `frontend/src/screens/auth/LoginScreen.tsx` — Login: phone/email + password, show/hide toggle, language selector (7 languages: English/Hindi/Marathi/Punjabi/Telugu/Tamil/Bengali), all 7 UI states:
  1. Loading — spinner on button, inputs disabled
  2. Empty — clean form
  3. Success — navigate to /dashboard
  4. Validation — inline required/format errors
  5. API error — credentials-failed banner
  6. Permission denied — deactivated account (403) message with ShieldX icon
  7. Unavailable — network error with WifiOff icon + Retry button
- `frontend/src/screens/auth/RegisterScreen.tsx` — Register: full name, phone, email, password + confirm, optional user_type (farmer/buyer/expert/provider), language; `platform_role` never collected (§7.6); all 7 UI states including success banner + "Sign in" link
- `frontend/src/screens/auth/ProfileScreen.tsx` — Profile: avatar initials, account info rows, inline edit form, password change form, session management (logout/logout-all with `ConfirmDialog`); `StatusBadge` for verification status (never color alone, §12.5); all 7 UI states including loading skeleton, session-expired redirect to login
- `frontend/src/app/AppRouter.tsx` — Updated with `ProtectedRoute` (redirects to /login if not authenticated, shows loading spinner while session restores) and `PublicRoute` (redirects authenticated users away from /login and /register)
- `frontend/src/App.tsx` — Wrapped with `AuthProvider` (inside `ToastProvider`)

### Tests
- Frontend build & typecheck: **0 errors, 0 warnings**
- All 7 required UI states (§12.4) verified present on all three auth screens

### Known deferred items (not bugs)
- `PATCH /auth/me` endpoint — backend not yet implemented (backend was not planned in Prompt 3; update via `updateProfile` call will return 404 until a profile-update endpoint is added in a future backend pass)
- `POST /auth/change-password` endpoint — similarly requires a backend route (frontend wired, API call will 404 until backend adds the endpoint)

---

## Prompt 11 — Verification Flow ✅

**Completed**: 2026-09-26

### What was built
- `frontend/src/api/verification.ts` — Typed verification API client:
  - `fetchVerificationStatus()` — Calls `GET /api/verification/status`
  - `requestUploadUrl(payload)` — Calls `POST /api/verification/upload-url` with CSRF headers for presigned S3 upload URLs
  - `uploadToPresignedUrl(uploadUrl, file, fields)` — Direct-to-S3 upload via presigned `PUT` with encryption headers; supports mock fallback for local dev
  - `submitVerification(payload)` — Calls `POST /api/verification/submit` with CSRF token and object keys
- `frontend/src/screens/verification/verification.scss` — Modern agriculture skeuomorphism styles:
  - Warm cream canvas, forest-green brand accents, tactile cards, and progress bar stepper
  - Interactive photo uploader dropzones with drag-over styling, camera icons, upload progress banners, and thumbnail overlays
  - Dedicated cards for all status variations (Verified celebratory card, Pending review card, and Rejection notice)
- `frontend/src/screens/verification/VerificationScreen.tsx` — Full 3-step stepper and status views:
  - **Step 1: Purpose & Privacy** — Explains verification benefits (verified badge, agronomic advisories, trusted produce selling) and plain-language §5 data protection commitments (no national IDs, SSE-KMS private storage, permission-gated access with mandatory audit reason, and automatic `docs_purge_at` retention purge).
  - **Step 2: Photos** — Live farmer selfie + land/plot photo upload dropzones with format validation (JPEG/PNG/WebP), size enforcement (<= 10MB), presigned S3 upload progress, per-photo error handling, retry buttons, and thumbnail management (change/remove).
  - **Step 3: Review & Submit** — Applicant summary, uploaded photo thumbnails, authenticity checkbox declaration, and `POST /api/verification/submit` submission with loading state.
  - **Status View**:
    - Verified Farmer card with `StatusBadge` variant="verified", green checkmark, and quick links to farms/dashboard.
    - Pending Review card with `StatusBadge` variant="pending", submission timestamp, and retention timeline reminder.
    - Rejected Notice with `StatusBadge` variant="rejected", reviewer reason feedback, and "Re-apply" action.
  - **Explicit Implementation of all 7 UI States (§12.4)**:
    1. Loading — Skeleton shimmer during status check; upload progress indicators and submit spinner.
    2. Empty — Unverified onboarding banner explaining benefits with "Begin Verification" CTA.
    3. Success — Verification submission confirmation toast and Verified status display card.
    4. Validation error — Inline checks for unsupported MIME types, files > 10MB, missing uploads, unconfirmed declaration.
    5. API/network error — Dedicated retry affordances on fetch failure, per-photo S3 upload retry, and submit retry.
    6. Permission denied — Honest 403 / role notice for non-farmer accounts (e.g. buyer/provider).
    7. Unavailable / stale external data — 503 / storage maintenance alert with retry button.
- `frontend/src/app/AppRouter.tsx` — Protected route `/verification` wired to `<VerificationScreen />`.

### Tests
- Frontend build & typecheck: **0 errors, 0 warnings** (`tsc -b && vite build` clean)
- Backend test suite: **92 passed** in 35.8s with 86% coverage
- All 7 required UI states (§12.4) verified present

### Known deferred items (not bugs)
- Admin verification review UI — Prompt 18

---

## Prompt 12 — Farm & Plot Screens ✅

**Completed**: 2026-09-26

### What was built
- `frontend/src/api/farms.ts` — Typed API layer for farms and plots:
  - `fetchFarms()`, `fetchFarm(id)`, `createFarm(payload)`, `updateFarm(id, payload)`, `deleteFarm(id)`
  - `fetchPlotsForFarm(farmId)`, `fetchPlot(plotId)`, `createPlot(farmId, payload)`, `updatePlot(plotId, payload)`, `deletePlot(plotId)`
  - CSRF header injection via `csrfHeaders()` on all mutations
- `frontend/src/design-system/components/FarmCard/` — Skeuomorphic farm card with soil-toned border, crop icon, location, acre badge, plots counter, and click navigation
- `frontend/src/design-system/components/PlotCard/` — Skeuomorphic plot card with plot name, acreage, active crop cycle indicators, and edit/delete actions
- `frontend/src/screens/farms/farms.scss` — Modern Agriculture Skeuomorphism styling (§12.1–§12.3) for farms screens, summary stat ribbons, plot grids, action dialogs, and modals
- `frontend/src/screens/farms/MyFarmsScreen.tsx` — Lists farmer's farms with stats summary strip, "Add Farm" modal, inline validation, and all 7 UI states per §12.4
- `frontend/src/screens/farms/FarmDetailsScreen.tsx` — Full farm view with plot management grid, "Add Plot" modal, edit/delete farm dialogs, and all 7 UI states per §12.4
- `frontend/src/screens/farms/PlotDetailsScreen.tsx` — Individual plot view with active/historical crop cycle summaries, plot editing, delete confirmation, and all 7 UI states per §12.4
- `frontend/src/app/AppRouter.tsx` — Wired `/farms`, `/farms/:farmId`, and `/farms/:farmId/plots/:plotId` to real screens

### Tests
- Frontend build & typecheck: **0 errors, 0 warnings** (`tsc -b && vite build` clean)
- Backend test suite: **92 passed**
- All 7 required UI states (§12.4) verified present across all farm and plot screens

---

## Prompt 13 — Crop-Cycle Screens ✅

**Completed**: 2026-09-26

### What was built
- `frontend/src/api/cropCycles.ts` — Typed crop catalog and crop cycle client:
  - `fetchCropCatalog()`, `fetchAllCropCycles()`, `fetchCropCyclesForPlot()`, `fetchCropCycle(cycleId)`, `createCropCycle()`, `updateCropCycle()`, `deleteCropCycle()`
- `frontend/src/design-system/components/CropCycleCard/` — Skeuomorphic card with crop category emoji/icon, status badge, sowing date, expected/actual harvest countdown, and quick-status actions (Active/Harvested/Failed)
- `frontend/src/screens/crop-cycles/CropCyclesScreen.tsx` — Master list of crop cycles with filter tabs (All / Active / Harvested / Failed), live search, summary stats strip, inline status transition, delete confirmation, and all 7 UI states (§12.4)
- `frontend/src/screens/crop-cycles/CropCycleDetailScreen.tsx` — Detail view for single crop cycle with crop profile, expected harvest date inline editor, activity log timeline, status controls, danger zone deletion, and all 7 UI states (§12.4)
- `frontend/src/screens/crop-cycles/CropCyclesScreen.scss` and `CropCycleDetailScreen.scss` — Skeuomorphic styles, responsive grids, countdown pills, and warning banners
- `frontend/src/app/AppRouter.tsx` — Wired `/crop-cycles` and `/crop-cycles/:cycleId` routes

### Tests
- Frontend build & typecheck: **0 errors, 0 warnings** (`tsc -b && vite build` clean)
- Backend test suite: **92 passed** in 2m 7s with 86% coverage
- All 7 required UI states (§12.4) verified present

## Prompt 14 — Activity Screens ✅

**Completed**: 2026-09-26

### What was built
- `frontend/src/api/activities.ts` — Typed farm activities API client:
  - `fetchActivities()`, `fetchActivitiesForCycle(cycleId)`, `fetchActivity(activityId)`, `createActivity(cycleId, payload)`, `updateActivity(activityId, payload)`, `completeActivity(activityId, payload)`, `deleteActivity(activityId)`
  - Automatic CSRF header injection via `csrfHeaders()` on all mutating operations
- `frontend/src/screens/activities/ActivitiesScreen.scss` — Skeuomorphic styling (§12.1–§12.3):
  - Warm cream canvas, forest-green accents, soil-toned borders, tactile cards
  - Distinct activity-type icon styling (💧 Irrigation, 🧪 Fertilizer, 🛡️ Pesticide, 📋 Other)
  - Date group timeline headers, filter chips, summary metric ribbon, and tactile modal layout
- `frontend/src/screens/activities/ActivitiesScreen.tsx` — Full activity log timeline and log-activity workflow:
  - Chronological timeline grouped by date headers ("Today", "Tomorrow", "Yesterday", and formatted dates)
  - Summary metric cards (Total Activities, Pending / Due, Completed)
  - Filtering by completion status tabs (All, Due/Pending, Completed) and activity type chips (All, Irrigation, Fertilizer, Pesticide, Other)
  - Interactive "Log Activity" modal with active crop-cycle selector, activity type selector cards, scheduled date picker, completion toggle with completion date picker, and notes textarea
  - "Edit Activity" modal and destructive delete confirmation dialog (`ConfirmDialog`)
  - 1-click Quick Complete button with instant loading feedback
  - **Explicit Implementation of all 7 UI States (§12.4)**:
    1. Loading — Skeleton shimmers for header and activity cards
    2. Empty — Encouraging empty state with Sprout/Filter icon and CTA to "Log First Activity"
    3. Success — Grouped timeline cards with status badges and action controls
    4. Validation error — Inline field-level validation on modal for missing cycle, invalid dates, and note limits
    5. API error — Inline retryable error banner
    6. Permission denied — 403 access restriction guard
    7. Unavailable / Stale — 503 / network offline banner with retry button
- `frontend/src/app/AppRouter.tsx` — Wired `/activities` route to `<ActivitiesScreen />`

### Tests
- Frontend build & typecheck: **0 errors, 0 warnings** (`tsc -b && vite build` clean, 1946 modules transformed)
- Backend test suite: **4/4 activity tests passed** (92/92 overall backend tests pass)
- All 7 required UI states (§12.4) verified present

## Prompt 15 — Weather & Agronomic Advisory Screens ✅

**Completed**: 2026-09-26

### What was built
- `frontend/src/api/weather.ts` — Typed weather & advisories API client:
  - `fetchForecast(params)`, `fetchAdvisories(params)`
  - Full data structures for `WeatherPayload`, `WeatherProvenance`, `ForecastResponse`, and `AdvisoriesResponse`
- `frontend/src/design-system/components/WeatherAdvisoryCard/` — Dedicated advisory card component (§8, §12.2, §12.5):
  - Labeled severity badge (High, Medium, Low — never color alone per §12.5) with severity icons
  - Title, recommended agronomic action box, source provenance attribution, validity timestamp, and active/expired state
  - Exported through `frontend/src/design-system/index.ts`
- `frontend/src/screens/weather/WeatherScreen.scss` — Skeuomorphic layout (§12.1–§12.3):
  - Gradient hero forecast card, 4-metric grid (humidity, precipitation, wind speed, UV index), tactile region preset chips, and agronomic advice banner
  - Provenance strip with Official IMD feed badge, update timestamps, and validity windows
  - Prominent amber stale-data warning banner per §8
- `frontend/src/screens/weather/WeatherScreen.tsx` — Weather & agronomic advisory screen:
  - Presets for major agricultural belts (Pune, Nashik, Nagpur, Chh. Sambhajinagar, Kolhapur, Solapur)
  - Hero current weather card with dynamic condition emoji and 4-metric grid
  - Hyperlocal agronomic advice box
  - Regional pest & crop alert list using `<WeatherAdvisoryCard />` with severity filter tabs
  - Manual feed refresh button with loading indicator
  - **Explicit Implementation of all 7 UI States (§12.4)**:
    1. Loading — Skeleton shimmers for hero card and advisory cards
    2. Empty — EmptyState with Cloud icon when no regional alerts are active
    3. Success — Verified weather forecast with provenance metadata and advisory cards
    4. Validation error — Preset and region query validation
    5. API error — Inline retry banner with retry button
    6. Permission denied — 403 access restriction guard
    7. Unavailable / Stale external data (**MANDATORY per §8 & §12.4**) — Prominent alert: *"Data unavailable, last known good at [timestamp]. Bhoomi never fabricates synthetic weather data during upstream provider downtime."* with STALE DATA pill on hero card and retry affordance
- `frontend/src/app/AppRouter.tsx` — Wired `/weather` route to `<WeatherScreen />`

### Tests
- Frontend build & typecheck: **0 errors, 0 warnings** (`tsc -b && vite build` clean, 1951 modules transformed)
- Backend test suite: **5/5 weather tests passed** (92/92 overall backend tests pass)
- All 7 required UI states (§12.4) verified present

---

_Next: Prompt 16 — Farmer dashboard (`/dashboard` — Assembled per §12.2 hierarchy with no invented crop counts, weather, or stats; all 7 states per §12.4 implemented across every section independently)_

