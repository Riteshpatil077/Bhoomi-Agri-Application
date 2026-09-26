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

_Next: Prompt 4 — RBAC, permission grants, and Super Admin bootstrap_
