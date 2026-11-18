
CREATE TABLE disposal_logs (
    delivery_id INT NOT NULL AUTO_INCREMENT,
    collection_log_id INT NOT NULL,
    site_id INT NOT NULL,
    worker_id INT NOT NULL,

    delivered_tons DECIMAL(10,2) NOT NULL,

    verification_status
        ENUM('Pending', 'Approved', 'Rejected')
        NOT NULL DEFAULT 'Pending',

    accepted_tons DECIMAL(10,2) DEFAULT NULL,

    verified_by INT DEFAULT NULL,
    verified_at TIMESTAMP NULL DEFAULT NULL,

    verification_reason VARCHAR(1000) DEFAULT NULL,
    notes VARCHAR(255) DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (delivery_id),

    INDEX idx_disposal_collection (collection_log_id),
    INDEX idx_disposal_site (site_id),
    INDEX idx_disposal_worker (worker_id),
    INDEX idx_disposal_status (verification_status),

    CONSTRAINT fk_disposal_collection
        FOREIGN KEY (collection_log_id)
        REFERENCES collection_logs(log_id),

    CONSTRAINT fk_disposal_site
        FOREIGN KEY (site_id)
        REFERENCES disposal_sites(site_id),

    CONSTRAINT fk_disposal_worker
        FOREIGN KEY (worker_id)
        REFERENCES users(user_id),

    CONSTRAINT fk_disposal_verifier
        FOREIGN KEY (verified_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL,

    CONSTRAINT chk_disposal_delivered
        CHECK (delivered_tons > 0),

    CONSTRAINT chk_disposal_accepted
        CHECK (
            accepted_tons IS NULL
            OR (
                accepted_tons >= 0
                AND accepted_tons <= delivered_tons
            )
        )
);
