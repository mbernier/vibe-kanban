-- Create task_template_groups table
CREATE TABLE task_template_groups (
    id            BLOB PRIMARY KEY,
    name          TEXT NOT NULL CHECK(name != ''),
    parent_group_id BLOB REFERENCES task_template_groups(id) ON DELETE RESTRICT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Create indexes for task_template_groups
CREATE INDEX idx_task_template_groups_parent_id ON task_template_groups(parent_group_id);

