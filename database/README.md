# Database Setup

## Requirements
- MySQL Server

## Setup

1. Start your MySQL Server.
2. Open MySQL Command Prompt or your preferred MySQL client.
3. Execute the contents of `schema.sql` in the client. The script creates and selects the `TEAM_09_WASTE_MANAGEMENT` database and creates the four tables.
4. In the project root, create a local `.env` file with your MySQL connection settings:

   - `DB_HOST=localhost`
   - `DB_USER=root`
   - `DB_PASSWORD=your_local_mysql_password`
   - `DB_NAME=TEAM_09_WASTE_MANAGEMENT`

5. Install project dependencies with `npm install`.
6. Start the backend with `npm start`.

## Tables
The schema creates:
- `users`
- `complaints`
- `vehicles`
- `wards`

**Note:** This schema covers the tables used by the currently implemented controllers. It does not yet cover every entity in the full system design.