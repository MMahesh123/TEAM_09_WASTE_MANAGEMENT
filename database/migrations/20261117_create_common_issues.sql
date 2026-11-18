
USE TEAM_09_WASTE_MANAGEMENT;

CREATE TABLE IF NOT EXISTS issues (
    issue_id INT NOT NULL AUTO_INCREMENT,
    ward VARCHAR(100) NOT NULL,
    normalized_type VARCHAR(100) NOT NULL,
    display_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (issue_id),
    UNIQUE KEY uq_issue_ward_type (ward, normalized_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS complaint_issue_links (
    link_id INT NOT NULL AUTO_INCREMENT,
    complaint_id INT NOT NULL,
    issue_id INT NOT NULL,

    grouping_method ENUM('Automatic', 'Supervisor')
        NOT NULL DEFAULT 'Automatic',

    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (link_id),
    UNIQUE KEY uq_complaint_issue (complaint_id),
    KEY idx_issue_links_issue (issue_id),

    CONSTRAINT fk_cil_complaint
        FOREIGN KEY (complaint_id)
        REFERENCES complaints(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_cil_issue
        FOREIGN KEY (issue_id)
        REFERENCES issues(issue_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_cil_reviewer
        FOREIGN KEY (reviewed_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
