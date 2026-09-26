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

_Next: Prompt 9 — Design Tokens & Shared Layout (Modern Agriculture Skeuomorphism Frontend)_





