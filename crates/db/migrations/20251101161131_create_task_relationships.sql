PRAGMA foreign_keys = ON;

CREATE TABLE task_relationships (
    id                  BLOB PRIMARY KEY,
    source_task_id      BLOB NOT NULL,
    target_task_id      BLOB NOT NULL,
    relationship_type_id BLOB NOT NULL,
    data                TEXT,
    note                TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (source_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (target_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (relationship_type_id) REFERENCES task_relationship_types(id) ON DELETE CASCADE,
    CHECK (source_task_id != target_task_id),
    UNIQUE(source_task_id, target_task_id, relationship_type_id)
);

CREATE INDEX idx_task_relationships_source_type ON task_relationships(source_task_id, relationship_type_id);
CREATE INDEX idx_task_relationships_target_type ON task_relationships(target_task_id, relationship_type_id);
CREATE INDEX idx_task_relationships_type_id ON task_relationships(relationship_type_id);

