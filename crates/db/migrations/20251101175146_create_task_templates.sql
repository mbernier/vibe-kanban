-- Create task_templates table
CREATE TABLE task_templates (
    id                  BLOB PRIMARY KEY,
    group_id            BLOB REFERENCES task_template_groups(id) ON DELETE SET NULL,
    template_name       TEXT NOT NULL UNIQUE CHECK(template_name != ''),
    template_title      TEXT NOT NULL CHECK(template_title != ''),
    ticket_title        TEXT NOT NULL CHECK(ticket_title != ''),
    ticket_description  TEXT NOT NULL CHECK(ticket_description != ''),
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Create indexes for task_templates
CREATE INDEX idx_task_templates_group_id ON task_templates(group_id);
CREATE INDEX idx_task_templates_name ON task_templates(template_name);

