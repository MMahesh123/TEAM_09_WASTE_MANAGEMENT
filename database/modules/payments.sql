-- Payment simulator (WMS-F-012/013). Owner: Louis.
-- Depends on: users (core schema) and the collection log table in modules/collection.sql
-- (the payments API currently reads collection_logs(worker_id, waste_tons, collected_at);
-- the column names must be agreed with the collection module owner).
USE TEAM_09_WASTE_MANAGEMENT;

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
