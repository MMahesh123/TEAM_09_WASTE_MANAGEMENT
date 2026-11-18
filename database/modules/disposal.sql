-- Disposal sites and capacity tracking (WMS-F-009/010/011). Owner: Louis.
-- Depends on: nothing. Run after database/schema.sql.
USE TEAM_09_WASTE_MANAGEMENT;

CREATE TABLE IF NOT EXISTS disposal_sites (
  site_id           INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL UNIQUE,
  location          VARCHAR(255) NOT NULL,
  max_capacity_tons DECIMAL(10,2) NOT NULL CHECK (max_capacity_tons > 0),
  current_load_tons DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (current_load_tons >= 0),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_load_within_capacity CHECK (current_load_tons <= max_capacity_tons)
);

-- Audit trail of every load change on a site (add/remove), so capacity figures can be explained later.
-- user_id is not a foreign key on purpose: the history must survive the user account being removed.
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
