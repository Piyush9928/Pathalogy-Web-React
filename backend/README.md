# LabSync Pro — Backend (Node.js + Express + PostgreSQL)

Rebuild of the original ASP.NET Core MVC "Pathalogy" project's backend, phased.
Phase 1 covers: Auth (JWT), RBAC (roles/permissions), Branches, Users, Company Settings,
Audit Logs, and the Dashboard stats API.

Phase 2 covers: Patient Management (registration with auto-generated UHID, search,
autocomplete, referral tracking) and Doctor Management (CRUD, referral commission %,
autocomplete for pickers used by later phases like Booking/Billing).

## Setup

1. Create a PostgreSQL database (default name `labsyncpro`, see `.env.example`).
2. Copy `.env.example` to `.env` and adjust credentials.
3. Install dependencies:
   ```
   npm install
   ```
4. Run migrations:
   ```
   npm run migrate
   ```
5. Seed demo data (hospital `CITYCARE`, 12 roles, 3 branches, 14 users, password `Test@123`):
   ```
   npm run seed
   ```
6. Start the dev server:
   ```
   npm run dev
   ```
   API available at `http://localhost:5000/api`.

## Demo login

- Hospital Code: `CITYCARE`
- Email: any seeded user, e.g. `anita@citycare.in` (Super Admin)
- Password: `Test@123`

## Architecture notes

- Single PostgreSQL database with a `hospital_id` column on every table (multi-tenant via
  tenant column), instead of the original's database-per-tenant design — simpler to operate
  while preserving the same tenant isolation model at the query level.
- Permissions are a static catalog (`src/config/permissions.js`), not DB rows. Each role
  stores a flat `text[]` of permission codes (`module.action`), mirroring `Role.Permissions`
  in the original `Entities/Role.cs`.
- JWT-based auth only (no session cookies) — the token carries `userId, hospitalId, role,
  permissions`, checked by `middleware/auth.js` (`requireAuth`, `requirePermission`,
  `requireRole`).
