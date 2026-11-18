-- Migration 001 (payments): add the 'Cancelled' status and cancelled_at.
-- Only needed for databases that already ran an older database/modules/payments.sql.
-- Fresh installs get both from payments.sql and can skip this file.
-- Safe to run once; MySQL 8 / MariaDB 10.2+.
USE TEAM_09_WASTE_MANAGEMENT;

ALTER TABLE payments
  MODIFY COLUMN status ENUM('Simulated','Paid','Cancelled') NOT NULL DEFAULT 'Simulated',
  ADD COLUMN cancelled_at TIMESTAMP NULL DEFAULT NULL AFTER paid_at;
