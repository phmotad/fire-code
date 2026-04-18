# Architecture Notes

## Auth Flow
- All password operations go through `crypto.ts` — never implement hashing directly.
- Email validation is centralized in `auth.ts::validateEmail`.
- Token generation uses `generateToken()` from `crypto.ts`.

## Database Layer
- `db.users.*` — user CRUD. Always use `findByEmail` before creating a user to prevent duplicates.
- `db.tokens.*` — reset/session tokens. `save`, `find`, `delete`.

## Design Decisions
- Passwords are hashed with SHA-256 + salt. Do not use MD5.
- Tokens expire after 1 hour. Expiry is enforced at the application layer.
- Email sending is fire-and-forget — never await email delivery in the critical path.

## Module Responsibilities
| Module     | Responsibility                        |
|------------|---------------------------------------|
| auth.ts    | Validation + login/register/change    |
| crypto.ts  | Hashing + token generation            |
| db.ts      | All database access                   |
| email.ts   | Email sending + template building     |
| types.ts   | Shared TypeScript interfaces          |
