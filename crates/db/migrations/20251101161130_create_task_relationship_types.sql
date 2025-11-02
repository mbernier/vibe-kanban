PRAGMA foreign_keys = ON;

CREATE TABLE task_relationship_types (
    id                          BLOB PRIMARY KEY,
    type_name                   TEXT NOT NULL UNIQUE,
    display_name                TEXT NOT NULL,
    description                 TEXT,
    is_system                   INTEGER NOT NULL DEFAULT 0,
    is_directional              INTEGER NOT NULL DEFAULT 0,
    forward_label               TEXT,
    reverse_label               TEXT,
    enforces_blocking            INTEGER NOT NULL DEFAULT 0,
    blocking_disabled_statuses   TEXT,
    blocking_source_statuses     TEXT,
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at                  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    CHECK (
        (is_directional = 0) OR 
        (is_directional = 1 AND forward_label IS NOT NULL AND reverse_label IS NOT NULL)
    ),
    CHECK (
        (enforces_blocking = 0) OR 
        (enforces_blocking = 1 AND blocking_disabled_statuses IS NOT NULL AND blocking_source_statuses IS NOT NULL)
    )
);

CREATE INDEX idx_task_relationship_types_type_name ON task_relationship_types(type_name);

