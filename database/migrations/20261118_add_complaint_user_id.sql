
USE TEAM_09_WASTE_MANAGEMENT;

ALTER TABLE complaints
    ADD COLUMN user_id INT NULL AFTER id,
    ADD INDEX idx_complaints_user_id (user_id),
    ADD CONSTRAINT fk_complaints_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE SET NULL;
