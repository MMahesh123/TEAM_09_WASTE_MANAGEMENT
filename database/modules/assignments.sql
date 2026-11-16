-- Vehicle & Staff Shift Assignment (WMS-F-006). Owner: Pranav.
-- Depends on: users, vehicles, wards (database/schema.sql).
-- Run order: schema.sql -> assignments.sql -> collection.sql -> disposal.sql -> payments.sql
USE TEAM_09_WASTE_MANAGEMENT;

CREATE TABLE IF NOT EXISTS assignments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_id  INT NOT NULL,
    worker_id   INT NOT NULL,
    ward_id     INT NOT NULL,
    shift_date  DATE NOT NULL,
    shift       ENUM('Morning', 'Afternoon', 'Night') NOT NULL,
    status      ENUM('Scheduled', 'In-Progress', 'Completed', 'Cancelled')
                    NOT NULL DEFAULT 'Scheduled',
    created_by  INT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- 1 for every assignment that still occupies its slot, NULL once cancelled.
    -- MySQL UNIQUE indexes allow repeated NULLs, so a cancelled slot can be reused
    -- while two live assignments for the same slot are rejected.
    active_slot TINYINT AS (IF(status = 'Cancelled', NULL, 1)) STORED,

    CONSTRAINT fk_assignments_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    CONSTRAINT fk_assignments_worker  FOREIGN KEY (worker_id)  REFERENCES users(user_id),
    CONSTRAINT fk_assignments_ward    FOREIGN KEY (ward_id)    REFERENCES wards(id),
    CONSTRAINT fk_assignments_creator FOREIGN KEY (created_by) REFERENCES users(user_id)
        ON DELETE SET NULL,

    -- A vehicle or a worker can only be on one live assignment per date and shift.
    UNIQUE KEY uq_vehicle_slot (vehicle_id, shift_date, shift, active_slot),
    UNIQUE KEY uq_worker_slot  (worker_id, shift_date, shift, active_slot),

    INDEX idx_assignments_date (shift_date),
    INDEX idx_assignments_ward (ward_id)
);
