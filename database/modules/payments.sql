-- Payment simulator (WMS-F-012/013). Owner: Louis.
-- Run order: schema.sql -> assignments.sql -> collection.sql -> disposal.sql -> payments.sql
--
-- Depends on:
--   users            (database/schema.sql)
--   collection_logs  (database/modules/collection.sql, owner Pranav). The API reads the shared
--                    contract collection_logs(worker_id, waste_tons, collected_at DATE) and uses
--                    its primary key log_id to record which logs a payment covers.
--
-- Payment period: an inclusive range of calendar dates [period_start, period_end] compared with
-- collection_logs.collected_at (a DATE). A payment covers every UNPAID collection log of the worker
-- in that range. Nothing here moves real money: status 'Simulated' is a calculation record and
-- 'Paid' is a manual "settled outside this system" marker.
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
  reference_no  VARCHAR(40) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at       TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT uq_payments_reference UNIQUE (reference_no),
  CONSTRAINT chk_payment_period    CHECK (period_start <= period_end),
  CONSTRAINT chk_payment_amounts   CHECK (total_tons > 0 AND rate_per_ton > 0 AND amount >= 0),
  CONSTRAINT fk_payments_worker    FOREIGN KEY (worker_id) REFERENCES users(user_id),
  INDEX idx_payments_worker_period (worker_id, period_start, period_end)
);

-- Duplicate-payment protection: every collection log can appear in at most one payment.
-- The UNIQUE key on log_id is what makes a second (or concurrent) payment for the same
-- work fail inside the database, whatever the application code does.
CREATE TABLE IF NOT EXISTS payment_items (
  payment_id INT NOT NULL,
  log_id     INT NOT NULL,
  PRIMARY KEY (payment_id, log_id),
  CONSTRAINT uq_payment_item_log UNIQUE (log_id),
  CONSTRAINT fk_payment_items_payment FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_items_log     FOREIGN KEY (log_id)     REFERENCES collection_logs(log_id)
);
