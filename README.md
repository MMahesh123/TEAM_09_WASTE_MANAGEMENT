# City Waste Management System

A backend system for managing city waste-management operations in Bangalore. The project provides APIs for authentication, role-based access, vehicle and ward management, citizen complaints, and dashboard summaries.

## Project Overview

The City Waste Management System aims to organize waste-management activities through a centralized backend. It supports different user roles and provides API endpoints for managing operational data.

## Technology Stack

- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **Database driver:** mysql2
- **Authentication:** JSON Web Tokens (JWT)
- **Testing:** Jest and Supertest
- **CI/CD:** GitHub Actions
- **Version control:** Git and GitHub

## Features Currently Available in `main`

### 1. Authentication and Authorization
- User authentication endpoints.
- JWT-based authentication middleware.
- Role-based access control for protected routes.

### 2. Vehicle Management
- Vehicle-related API routes.
- Vehicle CRUD and status-management functionality.

### 3. Ward Management
- Ward master management endpoints.
- Validation and duplicate checking for ward creation.

### 4. Dashboard
- Dashboard summary endpoints.
- Dashboard and complaint-related functionality.

### 5. Citizen Complaints
- Complaint management endpoints.
- Complaint-related controller and route structure.

> The features above describe the current shared branch. Individual endpoint behaviour and permissions should be verified against the implementation and tests.

## Project Structure

```text
TEAM_09_WASTE_MANAGEMENT/
├── .github/
│   └── workflows/
│       └── ci.yml
├── database/
│   └── schema.sql
├── frontend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── app.js
│   └── server.js
├── tests/
├── .env.example
├── package.json
└── README.md
```

Additional database modules and backend features may be introduced through ongoing development branches and pull requests.

## Prerequisites

Install the following before running the backend:

- Node.js and npm
- MySQL Server
- Git

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/MMahesh123/TEAM_09_WASTE_MANAGEMENT.git
cd TEAM_09_WASTE_MANAGEMENT
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local `.env` file using `.env.example` as a reference.

Configure the database connection and the authentication secrets required by the application. Use the variable names expected by the existing configuration files.

**Do not commit `.env` or any real credentials to GitHub.**

### 4. Configure the database

Create the project database in MySQL and execute the applicable schema from `database/schema.sql`.

Verify that the database credentials in `.env` match your local MySQL configuration.

### 5. Start the backend

```bash
npm start
```

The application entry point is `src/server.js`. Confirm the server's configured port and check the terminal for startup errors.

## Running Tests

Run the project's Jest test suite:

```bash
npm test -- --runInBand
```

The repository also contains a GitHub Actions workflow for automated checks. A successful test run should be confirmed before merging new features.

## Disposal Sites and Payment Simulator

Owner: Louis. Routes: `/api/disposal` and `/api/payments`. Source: `src/controllers/disposalController.js`,
`src/controllers/paymentController.js`, `database/modules/disposal.sql`, `database/modules/payments.sql`.

### Setup

1. Run the SQL in dependency order (each file starts with `USE TEAM_09_WASTE_MANAGEMENT;`):

   ```bash
   mysql -u root -p < database/schema.sql
   mysql -u root -p < database/modules/assignments.sql
   mysql -u root -p < database/modules/collection.sql
   mysql -u root -p < database/modules/disposal.sql
   mysql -u root -p < database/modules/payments.sql
   ```

   `sql/sprint2_schema.sql` is a **temporary placeholder** for the collection table. Do not run it
   once `database/modules/collection.sql` is merged; delete it at that point.
2. Environment variables (see `.env.example`): `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`,
   and optionally `WAGE_RATE_PER_TON` (default `500`, used when a request omits `rate_per_ton`).
3. Shared contract with the collection module: `collection_logs(log_id PK, worker_id, waste_tons, collected_at DATE)`.
   Payments read `worker_id`, `waste_tons`, `collected_at` and use `log_id` to record what a payment covered.
   Coordinate with the collection owner before renaming any of these.

### Disposal API

| Method and path | Roles | Purpose |
|---|---|---|
| `GET /api/disposal` | any logged-in user | List sites with load and `utilization_pct` |
| `GET /api/disposal/:id` | any logged-in user | One site |
| `POST /api/disposal` | Admin | Create `{ name, location, max_capacity_tons }` (409 on duplicate name) |
| `PUT /api/disposal/:id` | Admin | Update; capacity cannot go below the current load |
| `DELETE /api/disposal/:id` | Admin | Delete; 409 while the site still holds waste |
| `POST /api/disposal/:id/load` | Admin, Supervisor | `{ tons, action: "add" \| "remove" }`; 400 if it would exceed capacity or go below zero |

### Payment API

| Method and path | Roles | Purpose |
|---|---|---|
| `POST /api/payments/calculate` | Admin, Supervisor | Preview `{ worker_id, period_start, period_end, rate_per_ton? }`, stores nothing |
| `POST /api/payments/simulate` | Admin, Supervisor | Same input; records a `Simulated` payment (201) |
| `GET /api/payments` | Admin, Supervisor (all, `?worker_id=`), Worker (own only) | Optional `?status=Simulated\|Paid&limit=1-200&offset=` |
| `GET /api/payments/:id` | Admin, Supervisor, Worker (own only) | One payment with `log_count` |
| `PATCH /api/payments/:id/status` | Admin | `{ "status": "Paid" }`, allowed once from `Simulated` |

Citizens and unknown roles receive 403 on every payment route. All routes require a valid JWT.

### Rules and assumptions

- **Payment period:** an inclusive range of calendar dates `[period_start, period_end]` (valid `YYYY-MM-DD`, start not after end, at most 366 days), matched against `collection_logs.collected_at`.
- **What is paid:** every *unpaid* collection log of the worker in that range, at `tons x rate_per_ton`, rounded to 2 decimals. Totals are added in hundredths of a ton to avoid floating-point drift.
- **No double payment:** `payment_items.log_id` is UNIQUE, so a log can belong to only one payment. A repeated or overlapping request for already-paid logs returns 409; simultaneous requests are serialised and exactly one succeeds. If new logs arrive later for an already-paid period, a new simulation pays only those new logs.
- **Payee:** `worker_id` must be an existing user with the Worker role (404 / 400 otherwise), checked before any calculation.
- **No real money moves.** `Simulated` is a calculation record. `Paid` is a manual marker that the amount was settled outside this system; it cannot be undone through the API.
- **Limits:** tons, capacities and rates have at most 2 decimals and fit `DECIMAL(10,2)`; amounts fit `DECIMAL(12,2)`.
- **Disposal deletion:** a site that still holds waste cannot be deleted (the tonnage would vanish from the records).
- **Errors:** responses are `{ code, message }`; database errors are logged on the server and never returned to the client.

### Tests

```bash
npm test -- --runInBand                      # unit and route tests, database mocked
```

Real-database tests (concurrent loads and payments, constraints, JWT roles) are opt-in because they
need a MySQL/MariaDB server. They create and drop their own scratch database (`wms_test_louis`):

```bash
# macOS / Linux
RUN_DB_TESTS=1 DB_HOST=127.0.0.1 DB_USER=root DB_PASSWORD=yourpassword npm test -- --runInBand
# Windows PowerShell
$env:RUN_DB_TESTS=1; $env:DB_HOST='127.0.0.1'; $env:DB_USER='root'; $env:DB_PASSWORD='yourpassword'; npm test -- --runInBand
```

## Work in Progress

The following items are being developed or require integration and verification:

- **Disposal-site and capacity tracking, payment simulation:** implemented in Louis's Sprint 2 pull request (see the section above); waiting for the collection module schema to be merged.
- **Waste collection logging and staff shift assignment:** require coordination with the respective module owners.
- **Integration testing:** new modules must work with the shared authentication middleware, database schema, and existing routes.

Louis's disposal and payment pull request is separate from `main` until it has been reviewed, updated as needed, and merged.

## Development Workflow

1. Pull the latest changes from `main`.
2. Create a feature branch for your task.
3. Implement the feature and add appropriate tests.
4. Run the test suite locally.
5. Open a pull request against `main`.
6. Address review feedback and confirm CI checks pass before merging.

Avoid committing secrets, local environment files, generated dependencies, or unrelated changes.

## Team Collaboration

Each module owner is responsible for maintaining their feature, adding tests, documenting database dependencies, and resolving review feedback before integration.

When multiple modules depend on the same database tables or middleware, coordinate their interfaces with the other developers before merging.

## Project Status

The repository is under active development. This README documents the shared project structure and the current development direction; update it as new features are merged into `main`.
