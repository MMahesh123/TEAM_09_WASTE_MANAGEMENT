# Waste Management System — Database Guide

## 1. Overview

This directory contains the database schema and setup instructions for the City Waste Management System.

The database is designed as a starting point for developers building waste management applications. The core schema supports user accounts, complaints, vehicles, and wards. Additional features can be introduced as separate modules when required.

## 2. Requirements

- MySQL Server
- Node.js and npm
- A MySQL client, such as MySQL Command Line Client or MySQL Workbench

## 3. Core Database Setup

### Step 1: Start MySQL

Start your local MySQL server and open a MySQL client.

### Step 2: Create the core database

From the project root, execute:

```bash
mysql -u root -p < database/schema.sql
```

Enter your local MySQL password when prompted.

Alternatively, open `database/schema.sql` in your preferred MySQL client and execute the script.

The schema creates the `TEAM_09_WASTE_MANAGEMENT` database and its core tables.

### Step 3: Configure environment variables

Create a `.env` file in the project root. Use your own local credentials:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_local_mysql_password
DB_NAME=TEAM_09_WASTE_MANAGEMENT
JWT_SECRET=replace_with_a_long_random_secret
```

Keep `.env` private. Never commit database passwords, JWT secrets, or other credentials to version control.

### Step 4: Install dependencies

```bash
npm install
```

### Step 5: Start the backend

```bash
npm start
```

Check `package.json` if your project uses a different startup script.

## 4. Core Tables

| Table | Purpose |
|---|---|
| `users` | Stores user accounts, password hashes, roles, and creation timestamps |
| `complaints` | Stores complaints and their statuses |
| `vehicles` | Stores vehicle registration numbers, capacities, and operational statuses |
| `wards` | Stores ward numbers, names, and zones |

These tables represent the current core schema. Refer to `schema.sql` for the exact column definitions and constraints.

## 5. Extending the Database

Developers can extend the core schema to support additional functionality. Possible future modules include:

- **Assignments:** Assign vehicles and staff to wards, dates, and shifts.
- **Waste collection:** Record collection events, waste types, and quantities.
- **Disposal management:** Store disposal facilities, capacity information, and disposal records.
- **Payments:** Track payment amounts and payment statuses.
- **Audit logging:** Record important system actions for traceability.
- **Reporting:** Add supporting tables or views when reporting needs require them.

These are extension ideas, not part of the current four-table schema. Each module should include its own SQL script, constraints, and documentation.

## 6. Suggested Directory Structure

As the project grows, optional modules can be organized separately:

```text
database/
├── schema.sql
├── README.md
└── modules/
    ├── assignments.sql
    ├── collection.sql
    ├── disposal.sql
    ├── payments.sql
    └── audit.sql
```

Create these module files when their implementations are ready. Do not execute a module script until its dependencies and compatibility with the core schema have been checked.

## 7. Development Guidelines

- Use primary keys to identify records.
- Use foreign keys when records depend on other records.
- Use `UNIQUE`, `NOT NULL`, and appropriate data types to enforce data integrity.
- Use parameterized SQL queries in application code.
- Validate user input in the backend; database constraints are an additional safeguard.
- Store password hashes rather than plaintext passwords.
- Keep credentials in environment variables.
- Test schema changes against a development database before applying them to a shared or production database.

## 8. Compatibility and Maintenance

The current backend depends on the existing table names and column names. Before renaming tables, changing columns, or introducing constraints, check the corresponding controllers, tests, and existing data.

When adding a module, document its purpose, required tables, relationships, setup order, and any application endpoints it depends on.

## 9. Current Scope

The current core schema provides the four tables listed above. It does not, by itself, implement every feature that a complete waste management system might require.

Optional modules should be added and tested as the application evolves.
