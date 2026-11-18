# Test Plan and Security Verification: Disposal Sites and Payment Simulator

Scope: the `/api/disposal` and `/api/payments` modules (issue #22: system testing, security verification and bug fixes).

## How to run

| Command | What it runs | Needs a database? |
| --- | --- | --- |
| `npm test` | Unit and route tests with the database and (where noted) JWT mocked | No |
| `npm run test:db` | Real-database integration tests in a scratch database `wms_test_louis`, built from the project's own SQL files | Yes (MySQL or MariaDB) |

## Test layers

| Layer | Files | What it proves |
| --- | --- | --- |
| Unit and route | `tests/disposal.test.js`, `tests/payments.test.js` | Validation, status codes, role rules, SQL shape (capacity check inside the `UPDATE`, bound parameters), rollback and release of connections, no leaking of database errors |
| Auth with real JWTs | `tests/routeAuth.test.js` | Every protected route rejects missing and forged tokens and enforces roles with genuinely signed tokens |
| Security hardening | `tests/security.test.js` | Forged, expired, unsigned and tampered tokens give 401 on all 14 endpoints without touching the database; role claims and aliases; injection-style input; generic error bodies |
| Real database | `tests/integration/disposalPayments.int.test.js` | Constraints and concurrency on a real engine (below) |

## Real-database scenarios
- 10 simultaneous `add` requests never exceed capacity; simultaneous `remove` requests never go below zero.
- Decimal arithmetic stays exact (ten additions of 0.1 give exactly 1).
- Capacity cannot be lowered below the current load; a loaded site cannot be deleted.
- Two simultaneous simulations for the same worker and period create exactly one payment (the other gets 409).
- `UNIQUE(payment_items.log_id)` blocks double payment at database level (checked by removing the key and seeing the test fail).
- Cancelling releases logs so the period can be paid again; ten simultaneous cancels give exactly one 200.
- Load history rows match accepted changes only, stay consistent under concurrency and are removed with the site.
- Summary and filter endpoints agree with direct SQL totals; a literal `%` or `' OR 1=1 --` in `search` matches nothing.

## Security checklist

| Area | Check | Result |
| --- | --- | --- |
| Authentication | Missing, malformed, wrong-scheme, empty, expired, not-yet-valid, wrong-secret, `alg: none` and payload-swapped tokens all return 401 | Pass (126 cases) |
| Authorisation | Citizen and unknown roles blocked from payments; Workers see only their own payments; Supervisors cannot mark paid, cancel or delete sites; Admin-only routes reject everyone else | Pass |
| Role claims | Non-string, empty and unsupported roles give 403; aliases normalise to canonical roles | Pass |
| SQL injection | All SQL uses bound parameters; ids are validated as positive integers before any query; `LIKE` patterns escape `%`, `_` and `\` | Pass |
| Input validation | Tons and amounts limited to 2 decimals and `DECIMAL` range; dates must be real calendar dates; periods capped at 366 days; paging limits capped at 200 | Pass |
| Information disclosure | Database errors, hostnames and stack traces never appear in responses | Pass |
| Integrity | No double payment, no over-capacity load, no negative load, atomic multi-step changes | Pass (real database) |
| Secrets | `JWT_SECRET` and database credentials come from `.env`; the server refuses to verify tokens without a secret | Pass |

## Known limits
- Payments are simulated. `Paid` is a manual marker and no money moves.
- There is no rate limiting or token revocation in this module; those belong to the authentication module.
- The integration suite is opt-in so that `npm test` still passes on machines without a database server.
