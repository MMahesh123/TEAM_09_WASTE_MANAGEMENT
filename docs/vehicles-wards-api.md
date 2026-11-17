# Vehicle & Ward Management API Contract

## Vehicle Endpoints (`/api/vehicles`)
- `GET /api/vehicles?status=<status>` — Authenticated users; filters by `Available`, `Assigned`, `Active`, `Maintenance`, or `Inactive`.
- `GET /api/vehicles/:id` — Authenticated users; returns a single vehicle by ID.
- `POST /api/vehicles` — `Admin`, `Supervisor`; creates a vehicle (`registration_number` max 30 chars, `capacity_tons > 0`).
- `PUT /api/vehicles/:id` — `Admin`, `Supervisor`; updates vehicle details while guarding active assignments.
- `PUT /api/vehicles/:id/status` — `Admin`, `Supervisor`; enforces valid assignment lifecycle transitions (`Available` -> `Assigned` -> `Active` -> `Available`).
- `DELETE /api/vehicles/:id` — `Admin` only; blocked (`409`) if `Assigned`, `Active`, or referenced by assignment records.

## Ward Endpoints (`/api/wards`)
- `GET /api/wards?zone=<zone>` — Authenticated users; optional zone filter.
- `GET /api/wards/:id` — Authenticated users; returns a single ward by ID.
- `POST /api/wards` — `Admin`, `Supervisor`; creates a ward (`ward_number` max 20 chars, `ward_name` and `zone` max 100 chars).
- `PUT /api/wards/:id` — `Admin`, `Supervisor`; updates ward metadata.
- `DELETE /api/wards/:id` — `Admin` only; blocked (`409`) if referenced by existing assignments.