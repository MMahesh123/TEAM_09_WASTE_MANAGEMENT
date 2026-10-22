-- PENDING TEAM DECISION (do not run yet).
-- Disposal and payments tables now live in database/modules/disposal.sql and payments.sql.
-- The two tables below overlap with other modules and need to be agreed first:
--   * complaints: core schema already has `complaints(id, ward, type, description, status)`.
--   * collection_logs: owned by the collection module (Pranav, modules/collection.sql).
USE TEAM_09_WASTE_MANAGEMENT;

CREATE TABLE IF NOT EXISTS collection_logs (
  log_id       INT AUTO_INCREMENT PRIMARY KEY,
  worker_id    INT NOT NULL,
  waste_tons   DECIMAL(10,2) NOT NULL CHECK (waste_tons >= 0),
  collected_at DATE NOT NULL,
  FOREIGN KEY (worker_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS complaints (
  complaint_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  type         ENUM('Uncollected Waste','Overflow','Other') NOT NULL,
  description  VARCHAR(1000) NOT NULL,
  location     VARCHAR(255) NOT NULL,
  status       ENUM('Open','In-Progress','Resolved') NOT NULL DEFAULT 'Open',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at  TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
