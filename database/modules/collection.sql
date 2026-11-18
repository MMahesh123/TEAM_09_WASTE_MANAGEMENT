
-- Waste Collection Logging & Validation (WMS-F-007 / WMS-F-008).
-- Owner: Pranav.
-- Depends on: users (database/schema.sql) and assignments (modules/assignments.sql).
-- Run order: schema.sql -> assignments.sql -> collection.sql -> disposal.sql -> payments.sql
--
-- Shared payment contract:
-- worker_id, waste_tons, collected_at, log_id
--
-- Payment eligibility:
-- Only Supervisor-approved collection logs are eligible.
-- accepted_tons is the approved quantity used for payment calculations.

USE TEAM_09_WASTE_MANAGEMENT;

CREATE TABLE IF NOT EXISTS collection_logs (
    log_id        INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,
    worker_id     INT NOT NULL,
    waste_type    ENUM('Wet', 'Dry', 'Mixed', 'Hazardous', 'E-waste') NOT NULL,
    waste_tons    DECIMAL(10,2) NOT NULL,
    collected_at  DATE NOT NULL,
    notes         VARCHAR(255) NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Supervisor verification
    verification_status ENUM('Pending', 'Approved', 'Rejected')
        NOT NULL DEFAULT 'Pending',
    accepted_tons DECIMAL(10,2) DEFAULT NULL,
    verified_by INT DEFAULT NULL,
    verified_at TIMESTAMP NULL DEFAULT NULL,
    verification_reason VARCHAR(1000) DEFAULT NULL,

    CONSTRAINT chk_collection_tons_non_negative
        CHECK (waste_tons >= 0),

    CONSTRAINT fk_collection_assignment
        FOREIGN KEY (assignment_id) REFERENCES assignments(id),

    CONSTRAINT fk_collection_worker
        FOREIGN KEY (worker_id) REFERENCES users(user_id),

    CONSTRAINT fk_collection_verified_by
        FOREIGN KEY (verified_by) REFERENCES users(user_id)
        ON DELETE SET NULL,

    INDEX idx_collection_worker_date (worker_id, collected_at),
    INDEX idx_collection_assignment (assignment_id),
    INDEX fk_collection_verified_by (verified_by)
);
