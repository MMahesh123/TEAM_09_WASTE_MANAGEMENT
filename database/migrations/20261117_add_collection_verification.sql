
-- Adds Supervisor verification support to collection_logs.
-- Apply ONLY to databases where these columns do not already exist.
--
-- Existing databases that already have these fields must skip this migration.

USE TEAM_09_WASTE_MANAGEMENT;

ALTER TABLE collection_logs
    ADD COLUMN verification_status
        ENUM('Pending', 'Approved', 'Rejected')
        NOT NULL DEFAULT 'Pending'
        AFTER created_at,

    ADD COLUMN accepted_tons
        DECIMAL(10,2) DEFAULT NULL
        AFTER verification_status,

    ADD COLUMN verified_by
        INT DEFAULT NULL
        AFTER accepted_tons,

    ADD COLUMN verified_at
        TIMESTAMP NULL DEFAULT NULL
        AFTER verified_by,

    ADD COLUMN verification_reason
        VARCHAR(1000) DEFAULT NULL
        AFTER verified_at,

    ADD INDEX fk_collection_verified_by (verified_by),

    ADD CONSTRAINT fk_collection_verified_by
        FOREIGN KEY (verified_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL;
