# Disposal Site & Payment Simulator API Contract

Owner: Louis Alan. All endpoints need `Authorization: Bearer <JWT>`. Errors use `{ "code": <status>, "message": "<text>" }`;
database details are never included in a response. Weights are tons with at most 2 decimals.

## Disposal Site Endpoints (`/api/disposal`)

| Method and path | Roles | Purpose |
| --- | --- | --- |
| `GET /api/disposal` | Any authenticated user | List sites with `utilization_pct`. Optional `search` (name or location, max 100 chars), `has_capacity=true\|false`, `limit` (1-200) and `offset`. Without `limit` the whole list is returned. |
| `GET /api/disposal/summary` | Admin, Supervisor | Network totals: `sites`, `full_sites`, `total_capacity_tons`, `total_load_tons`, `available_tons`, `utilization_pct`. |
| `GET /api/disposal/:id` | Any authenticated user | One site. |
| `GET /api/disposal/:id/history` | Admin, Supervisor | Load changes of a site, newest first. `limit` (default 50, max 200) and `offset`. |
| `POST /api/disposal` | Admin | Create a site: `name` (unique, max 100), `location` (max 255), `max_capacity_tons > 0`. |
| `PUT /api/disposal/:id` | Admin | Update a site. Capacity cannot be lowered below the current load (`400`); duplicate name gives `409`. |
| `DELETE /api/disposal/:id` | Admin | Delete a site. Blocked with `409` while it still holds load. Its history is deleted with it. |
| `POST /api/disposal/:id/load` | Admin, Supervisor | Body `{ "tons": 5, "action": "add" \| "remove" }`. |

### How load changes stay correct
- The capacity check is part of the `UPDATE` statement, so two simultaneous requests can never overshoot capacity or drop below zero.
- The update and its `disposal_log` row are committed in one transaction. Rejected changes (`400`) write nothing.
- Each history row stores `action`, `tons`, `load_after`, `user_id` and `created_at`.

## Payment Simulator Endpoints (`/api/payments`)

No real money moves. A payment is a record of what a worker would be paid for the unpaid collection logs of a period.

| Method and path | Roles | Purpose |
| --- | --- | --- |
| `POST /api/payments/calculate` | Admin, Supervisor | Preview the amount for `{ worker_id, period_start, period_end, rate_per_ton? }`. Nothing is stored. |
| `POST /api/payments/simulate` | Admin, Supervisor | Same body; stores a `Simulated` payment (`201`) and links the unpaid logs to it. |
| `GET /api/payments/summary` | Admin, Supervisor | Count, tons and amount per status, plus an `active` total that excludes `Cancelled`. Optional `worker_id`, `from`, `to` (`YYYY-MM-DD`). |
| `GET /api/payments` | Admin, Supervisor, Worker | List payments. Optional `worker_id` (staff only), `status`, `limit` (default 50, max 200), `offset`. Workers only ever see their own. |
| `GET /api/payments/:id` | Admin, Supervisor, Worker | One payment. A worker asking for someone else's gets `403`. |
| `PATCH /api/payments/:id/status` | Admin | Body `{ "status": "Paid" }`. Only a `Simulated` payment can be marked paid (`409` otherwise). |
| `POST /api/payments/:id/cancel` | Admin | Cancel a `Simulated` payment and release its logs so the period can be paid again. Response includes `released_log_count`. |

### Rules
- `period_start` and `period_end` are an inclusive date range (at most 366 days), matched against `collection_logs.collected_at`.
- `worker_id` must belong to a user with the Worker role. `rate_per_ton` defaults to `WAGE_RATE_PER_TON` from `.env` (500).
- Only logs that are not already paid are included. If every log in the period is already paid the request fails with `409`.
- `UNIQUE(payment_items.log_id)` makes double payment impossible even if two requests race; the loser gets `409`.
- Status flow: `Simulated` -> `Paid` (manual marker) or `Simulated` -> `Cancelled`. `Paid` and `Cancelled` are final.

### Example: simulate and cancel
```http
POST /api/payments/simulate
{ "worker_id": 5, "period_start": "2026-10-01", "period_end": "2026-10-31" }

201 { "code": 201, "message": "Payment simulated",
      "data": { "payment_id": 12, "reference_no": "...", "status": "Simulated",
                "worker_id": 5, "total_tons": 14.5, "rate_per_ton": 500, "amount": 7250 } }

POST /api/payments/12/cancel
200 { "code": 200, "message": "Payment cancelled", "released_log_count": 9, "data": { "status": "Cancelled", ... } }
```

### Status codes used
`200` ok, `201` created, `400` validation, `401` missing or invalid token, `403` role not allowed, `404` not found,
`409` conflict (duplicate, wrong status, deadlock retry), `500` generic server error.

## Database
- `disposal_sites`, `disposal_log` (`database/modules/disposal.sql`); `payments`, `payment_items` (`database/modules/payments.sql`).
- Existing databases: run `database/migrations/001_payments_cancelled_status.sql` and `002_disposal_log.sql`.
