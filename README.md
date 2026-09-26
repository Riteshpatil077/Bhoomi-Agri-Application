# Bhoomi 🌱 — Full-Stack Agriculture Platform

> Helping farmers manage land, track crop cycles, access verified weather advisories, and connect with the agricultural ecosystem — built with production-grade security and a modern agriculture skeuomorphism UI.

## Stack

| Layer | Technology |
|---|---|
| Backend | Flask 3.x, SQLAlchemy 2.x, Flask-JWT-Extended, Celery |
| Frontend | React 18 + TypeScript + Vite |
| Database | PostgreSQL 16 |
| Cache / Broker | Redis 7 |
| Auth | JWT httpOnly cookies, CSRF double-submit, refresh rotation |
| Storage | AWS S3 (two buckets — public media + private verification docs) |

## Quick Start (Development)

### Prerequisites
- Docker + Docker Compose
- Node 20+
- Python 3.12+

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
flask db upgrade
flask run
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Full stack with Docker Compose
```bash
cd infra
docker-compose up --build
```

## Project Structure

```
bhoomi/
├── backend/          # Flask application (see §13 of blueprint)
├── frontend/         # React + TypeScript + Vite SPA
├── infra/            # Docker Compose, Terraform (Stage 2)
├── docs/             # Architecture and API documentation
├── PROGRESS.md       # Build progress log (updated after every module)
└── .github/          # CI/CD workflows
```

## Build Progress

See [PROGRESS.md](./PROGRESS.md) for module-by-module build status.

## License

Private — Bhoomi Platform.
