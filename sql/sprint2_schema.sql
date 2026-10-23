-- PENDING (do not run yet).
-- Disposal and payments tables live in database/modules/disposal.sql and payments.sql.
-- The payments API reads a collection log table that the collection module owner (Pranav)
-- has not published yet. This placeholder shows the columns payments currently expects:
--   worker_id (FK users.user_id), waste_tons (tons collected), collected_at (date).
-- Delete this file once modules/collection.sql defines the real table.
USE TEAM_09_WASTE_MANAGEMENT;

CREATE TABLE IF NOT EXISTS collection_logs (
  log_id       INT AUTO_INCREMENT PRIMARY KEY,
  worker_id    INT NOT NULL,
  waste_tons   DECIMAL(10,2) NOT NULL CHECK (waste_tons >= 0),
  collected_at DATE NOT NULL,
  FOREIGN KEY (worker_id) REFERENCES users(user_id)
);
