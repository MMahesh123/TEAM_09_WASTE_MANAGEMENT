-- Sprint 2 schema (Louis): disposal sites, payments, complaints.
-- Assumes existing `users(user_id, username, email, password_hash, role)`.

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

-- Likely owned by the collection-logs feature; included so payments can run standalone.
CREATE TABLE IF NOT EXISTS collection_logs (
  log_id       INT AUTO_INCREMENT PRIMARY KEY,
  worker_id    INT NOT NULL,
  waste_tons   DECIMAL(10,2) NOT NULL CHECK (waste_tons >= 0),
  collected_at DATE NOT NULL,
  FOREIGN KEY (worker_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id    INT AUTO_INCREMENT PRIMARY KEY,
  worker_id     INT NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  total_tons    DECIMAL(10,2) NOT NULL,
  rate_per_ton  DECIMAL(10,2) NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  status        ENUM('Simulated','Paid') NOT NULL DEFAULT 'Simulated',
  reference_no  VARCHAR(40) NOT NULL UNIQUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
