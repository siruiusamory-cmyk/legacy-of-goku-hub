ALTER TABLE admin_sessions ADD COLUMN established_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_sessions ADD COLUMN authority_epoch INTEGER;
CREATE TABLE publication_authorities (
 epoch INTEGER PRIMARY KEY CHECK (epoch > 0),
 issuer TEXT NOT NULL, audience TEXT NOT NULL, subject TEXT NOT NULL, email TEXT NOT NULL CHECK (email = lower(email)),
 config_hash TEXT NOT NULL CHECK (length(config_hash) = 43),
 created_at INTEGER NOT NULL, operator_ref TEXT NOT NULL, authorization_ref TEXT NOT NULL
);
CREATE TRIGGER publication_authorities_no_update BEFORE UPDATE ON publication_authorities BEGIN SELECT RAISE(ABORT, 'publication_authorities is append-only'); END;
CREATE TRIGGER publication_authorities_no_delete BEFORE DELETE ON publication_authorities BEGIN SELECT RAISE(ABORT, 'publication_authorities is append-only'); END;
CREATE TABLE publication_control (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
 mode TEXT NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'authoritative')),
 authority_epoch INTEGER REFERENCES publication_authorities(epoch) ON DELETE RESTRICT,
 owner_config_hash TEXT CHECK (owner_config_hash IS NULL OR length(owner_config_hash) = 43),
 promoted_at INTEGER,
 updated_at INTEGER NOT NULL,
 CHECK ((authority_epoch IS NULL) = (owner_config_hash IS NULL)),
 CHECK (mode = 'shadow' OR (authority_epoch IS NOT NULL AND promoted_at IS NOT NULL))
);
INSERT INTO publication_control(id, schema_version, mode, updated_at) VALUES (1, 1, 'shadow', CAST(strftime('%s', 'now') AS INTEGER));
CREATE TRIGGER publication_control_no_delete BEFORE DELETE ON publication_control BEGIN SELECT RAISE(ABORT, 'publication_control row is permanent'); END;
