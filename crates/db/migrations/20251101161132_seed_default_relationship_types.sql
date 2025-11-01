-- Seed default relationship types

-- Context relationship type
INSERT INTO task_relationship_types (
    id,
    type_name,
    display_name,
    description,
    is_system,
    is_directional,
    forward_label,
    reverse_label,
    enforces_blocking,
    created_at,
    updated_at
) VALUES (
    randomblob(16),
    'context',
    'Context Tickets',
    'Tickets that provide context',
    1,
    1,
    'provides context for',
    'uses context from',
    0,
    datetime('now', 'subsec'),
    datetime('now', 'subsec')
);

-- Blocked relationship type
INSERT INTO task_relationship_types (
    id,
    type_name,
    display_name,
    description,
    is_system,
    is_directional,
    forward_label,
    reverse_label,
    enforces_blocking,
    blocking_disabled_statuses,
    blocking_source_statuses,
    created_at,
    updated_at
) VALUES (
    randomblob(16),
    'blocked',
    'Blocked Tickets',
    'Tickets that must come before',
    1,
    1,
    'blocks',
    'blocked by',
    1,
    '["todo","inreview","done","cancelled"]',
    '["todo","inprogress","inreview"]',
    datetime('now', 'subsec'),
    datetime('now', 'subsec')
);

