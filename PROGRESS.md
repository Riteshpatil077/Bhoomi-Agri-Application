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

_Next: Prompt 3 — Auth module_
