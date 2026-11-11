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

## Work in Progress

The following items are being developed or require integration and verification:

- **Disposal-site and capacity tracking:** introduced in Louis's Sprint 2 pull request.
- **Payment calculation and simulation:** depends on the agreed collection-log database schema.
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
