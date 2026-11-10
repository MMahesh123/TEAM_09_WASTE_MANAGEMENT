-- Waste Collection Logging & Validation (WMS-F-007 / WMS-F-008). Owner: Pranav.
-- Depends on: users (database/schema.sql) and assignments (modules/assignments.sql).
-- Run order: schema.sql -> assignments.sql -> collection.sql -> disposal.sql -> payments.sql
--
-- The payments module (Louis) reads collection_logs(worker_id, waste_tons, collected_at),
-- so those three column names are part of the shared contract. Coordinate before renaming them.
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

    CONSTRAINT chk_collection_tons_non_negative CHECK (waste_tons >= 0),
    CONSTRAINT fk_collection_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    CONSTRAINT fk_collection_worker     FOREIGN KEY (worker_id)     REFERENCES users(user_id),

    INDEX idx_collection_worker_date (worker_id, collected_at),
    INDEX idx_collection_assignment (assignment_id)
);
