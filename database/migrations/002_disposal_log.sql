-- Adds the disposal load history table to an existing database (safe to run more than once).
USE TEAM_09_WASTE_MANAGEMENT;

CREATE TABLE IF NOT EXISTS disposal_log (
  log_id     INT AUTO_INCREMENT PRIMARY KEY,
  site_id    INT NOT NULL,
  action     ENUM('add','remove') NOT NULL,
  tons       DECIMAL(10,2) NOT NULL CHECK (tons > 0),
  load_after DECIMAL(10,2) NOT NULL CHECK (load_after >= 0),
  user_id    INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_disposal_log_site FOREIGN KEY (site_id) REFERENCES disposal_sites(site_id) ON DELETE CASCADE,
  INDEX idx_disposal_log_site_time (site_id, created_at)
);
