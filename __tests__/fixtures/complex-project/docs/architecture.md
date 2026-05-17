# Architecture Notes

## Module Responsibilities

| Module                        | Responsibility                                      |
|-------------------------------|-----------------------------------------------------|
| src/utils/validators.ts       | Email, password, URL, UUID, phone, credit-card validation |
| src/utils/crypto.ts           | Hashing (SHA-256, SHA-512), password hash+salt, token generation |
| src/utils/logger.ts           | ConsoleLogger, createLogger factory                 |
| src/auth/authService.ts       | Login credentials, registration validation, password hash/verify, session tokens |
| src/auth/authMiddleware.ts    | requireAuth, requireRole, rateLimitMiddleware, corsMiddleware |
| src/core/cache.ts             | MemoryCache with TTL, buildCacheKey, withCache      |
| src/core/database.ts          | QueryBuilder, buildInsert, buildUpdate              |
| src/core/logger.ts            | StructuredLogger, createAppLogger                   |
| src/jobs/emailJob.ts          | All email payloads: welcome, order, payment, password-reset, refund |
| src/models/Order.ts           | calculateTotal, isCancellable, isShipped, applyDiscount |
| src/models/Payment.ts         | isRefundable, calculateFee, formatAmount, toMinorUnits |
| src/models/Session.ts         | isExpired, isValid, canRefresh, expiresInSeconds    |
| src/models/User.ts            | isAdmin, isModerator, isActive, hasPermission       |
| src/orders/orderService.ts    | OrderService: create, cancel, ship, refund          |
| src/payments/paymentService.ts | PaymentService: charge, refund, listByUser          |
| src/payments/paymentProcessor.ts | Provider configs, normalizeAmount, maskCardNumber |
| src/users/userService.ts      | UserService: create, findById, findByEmail, update, suspend |
| src/users/userRepository.ts   | SqlUserRepository: SQL-level CRUD                   |
| src/config/appConfig.ts       | loadAppConfig, validateConfig                       |

## Design Decisions

- **Passwords**: Always use `hashPassword(password, salt)` + `generateSalt()` from `utils/crypto.ts`. Never use MD5 or implement custom hashing.
- **Tokens**: Use `generateToken(bytes)` from `utils/crypto.ts` for all session/reset tokens.
- **Email**: All email templates live in `jobs/emailJob.ts` — `buildPasswordResetEmail`, `buildWelcomeEmail`, `buildRefundNoticeEmail`, etc. Never construct email bodies inline.
- **Validation**: `validateEmail`, `validatePassword`, `validateUUID` from `utils/validators.ts` are the canonical validators. Do not re-implement these.
- **Session lifecycle**: Session models and state checks (`isExpired`, `isValid`, `canRefresh`) are in `models/Session.ts`. Session token creation uses `generateSessionTokens()` + `buildSessionExpiry()` from `auth/authService.ts`.
- **Payments**: Fee calculation via `calculateFee(amount, provider)`, refundability check via `isRefundable(payment)`, amount formatting via `formatAmount(amount, currency)` — all in `models/Payment.ts`.
- **Cache**: Use `withCache(cache, key, fn, options)` for all cacheable operations. Keys built with `buildCacheKey(...parts)`.

## Auth Flow

1. Validate credentials with `validateLoginCredentials` / `validateRegistration` (authService.ts)
2. Password verification: `verifyPassword(password, storedHash, salt)` (authService.ts)
3. Password hashing: `hashUserPassword(password)` returns `{ hash, salt }` (authService.ts)
4. Session creation: `generateSessionTokens()` → `buildSessionExpiry(tokens)` (authService.ts)
5. Token parsing: `parseAuthHeader(header)` → `requireAuth` middleware validates

## Password Reset Flow

1. Validate email → `validateEmail()` (utils/validators.ts)
2. Generate reset token → `generateToken()` (utils/crypto.ts)
3. Hash token for storage → `hashPassword(token, salt)` (utils/crypto.ts)
4. Build email → `buildPasswordResetEmail(email, token, expiresInMinutes)` (jobs/emailJob.ts)
5. On reset: `validatePassword()` → `hashUserPassword()` → update DB → delete token
