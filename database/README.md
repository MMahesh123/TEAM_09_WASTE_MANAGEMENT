# Waste Management System — Database Guide

## 1. Overview

This directory contains the database schema and setup instructions for the City Waste Management System.

The database is designed as a reusable starting point for developers building waste management applications. The core schema supports user accounts, complaints, vehicles, and wards. Additional features can be introduced as optional modules when required.

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

The schema creates the `TEAM_09_WASTE_MANAGEMENT` database and its four core tables.

### Step 3: Configure environment variables

Create a `.env` file in the project root and enter your own local credentials:

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

Refer to `schema.sql` for the exact column definitions and constraints.

## 5. Optional Database Modules

The `modules/` directory contains SQL template files for additional features. These files are currently empty and do not create tables or implement functionality until SQL statements are added.

| File | Intended purpose |
|---|---|
| `assignments.sql` | Vehicle, staff, ward, date, and shift assignments |
| `collection.sql` | Waste collection records and quantities |
| `disposal.sql` | Disposal facilities and disposal records |
| `payments.sql` | Payment records and payment statuses |
| `audit.sql` | Audit logs and system activity history |

### How to use a module

1. Choose the SQL template for the feature you want to implement.
2. Add the required `CREATE TABLE` statements, constraints, and relationships.
3. Check dependencies on existing tables and other modules.
4. Test the SQL against a development database.
5. Update the corresponding backend controllers and tests if application support is required.

Only execute a module after adding and reviewing its SQL. Empty templates have no effect on the database.

## 6. Directory Structure

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

The core schema and optional modules are maintained separately so developers can extend the database without placing every feature in the initial setup script.

## 7. Development Guidelines

- Use primary keys to identify records.
- Use foreign keys when records depend on other records.
- Use `UNIQUE`, `NOT NULL`, and appropriate data types to enforce data integrity.
- Use parameterized SQL queries in application code.
- Validate user input in the backend; database constraints provide additional protection.
- Store password hashes rather than plaintext passwords.
- Keep credentials in environment variables.
- Test schema changes against a development database before applying them to a shared or production database.

## 8. Compatibility and Maintenance

The current backend depends on existing table and column names. Before renaming tables, changing columns, or introducing constraints, check the corresponding controllers, tests, and existing data.

When adding a module, document its purpose, required tables, relationships, setup order, and any application endpoints it depends on.

## 9. Current Scope

The core schema currently creates four tables: `users`, `complaints`, `vehicles`, and `wards`.

The optional module files are empty templates. They do not yet implement assignments, collection, disposal, payments, or audit logging. These features require SQL definitions and any necessary backend implementation and testing.
