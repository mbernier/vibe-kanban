import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { taskRelationshipsApi, taskRelationshipTypesApi } from '@/lib/api';
import { TaskSearchAutocomplete } from './TaskSearchAutocomplete';
import { RelationshipTypeSelect } from './RelationshipTypeSelect';
import type { Task } from 'shared/types';
import { cn } from '@/lib/utils';

interface TaskRelationshipsSectionProps {
  task: Task;
  projectId: string;
  onNavigateToTask?: (taskId: string) => void;
}

interface RelationshipType {
  id: string;
  type_name: string;
  display_name: string;
  description?: string | null;
  is_directional: boolean;
  forward_label?: string | null;
  reverse_label?: string | null;
  enforces_blocking: boolean;
  blocking_disabled_statuses?: string[];
  blocking_source_statuses?: string[];
}

interface Relationship {
  id: string;
  source_task_id: string;
  target_task_id: string;
  relationship_type_id: string;
  relationship_type_name: string;
  note?: string | null;
  data?: Record<string, any> | null;
  source_task?: Task;
  target_task?: Task;
  relationship_type?: RelationshipType;
}

interface GroupedRelationships {
  forward: Relationship[];
  reverse: Relationship[];
  nonDirectional: Relationship[];
}

interface RelationshipsByType {
  [typeName: string]: {
    type: RelationshipType;
    relationships: GroupedRelationships;
  };
}

export function TaskRelationshipsSection({
  task,
  projectId,
  onNavigateToTask,
}: TaskRelationshipsSectionProps) {
  const { t } = useTranslation('tasks');
  const [relationships, setRelationships] = useState<RelationshipsByType>({});
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [note, setNote] = useState('');

  const fetchRelationships = useCallback(async () => {
    if (!task?.id) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch relationship types
      const relationshipTypes = await taskRelationshipTypesApi.list();
      setTypes(relationshipTypes as RelationshipType[]);

      // Fetch relationships for this task
      // API returns array of TaskRelationshipGrouped objects
      const relationshipsData = await taskRelationshipsApi.getByTask(task.id);

      // Group relationships by type
      const grouped: RelationshipsByType = {};

      if (Array.isArray(relationshipsData)) {
        // Backend returns array of TaskRelationshipGrouped objects
        relationshipsData.forEach((relGroup: any) => {
          const relType = relGroup.relationship_type;
          if (!relType || !relType.type_name) return;

          const typeName = relType.type_name;
          const type = relationshipTypes.find((t: any) => t.type_name === typeName);
          if (!type) return;

          // Process forward relationships (where this task is source)
          const forward: Relationship[] = (relGroup.forward || []).map((rel: any) => ({
            id: rel.relationship?.id || rel.id,
            source_task_id: rel.source_task?.id || rel.source_task_id,
            target_task_id: rel.target_task?.id || rel.target_task_id,
            relationship_type_id: rel.relationship_type?.id || rel.relationship_type_id,
            relationship_type_name: typeName,
            note: rel.relationship?.note || rel.note,
            data: rel.relationship?.data || rel.data,
            source_task: rel.source_task,
            target_task: rel.target_task,
            relationship_type: type as RelationshipType,
          }));

          // Process reverse relationships (where this task is target)
          const reverse: Relationship[] = (relGroup.reverse || []).map((rel: any) => ({
            id: rel.relationship?.id || rel.id,
            source_task_id: rel.source_task?.id || rel.source_task_id,
            target_task_id: rel.target_task?.id || rel.target_task_id,
            relationship_type_id: rel.relationship_type?.id || rel.relationship_type_id,
            relationship_type_name: typeName,
            note: rel.relationship?.note || rel.note,
            data: rel.relationship?.data || rel.data,
            source_task: rel.source_task,
            target_task: rel.target_task,
            relationship_type: type as RelationshipType,
          }));

          // For non-directional types, combine forward and reverse
          const nonDirectional: Relationship[] = type.is_directional ? [] : [...forward, ...reverse];

          grouped[typeName] = {
            type: type as RelationshipType,
            relationships: { forward, reverse, nonDirectional },
          };
        });
      }

      setRelationships(grouped);
    } catch (err: any) {
      console.error('Failed to fetch relationships:', err);
      setError(err.message || 'Failed to load relationships');
    } finally {
      setLoading(false);
    }
  }, [task?.id]);

  useEffect(() => {
    fetchRelationships();
  }, [fetchRelationships]);

  const handleAddRelationship = async () => {
    if (!selectedType || !selectedTask || !task?.id) {
      return;
    }

    try {
      await taskRelationshipsApi.create(task.id, {
        target_task_id: selectedTask.id,
        relationship_type: selectedType,
        note: note.trim() || null,
      });

      // Reset form
      setSelectedType('');
      setSelectedTask(null);
      setNote('');
      setIsAdding(false);

      // Refresh relationships
      await fetchRelationships();
    } catch (err: any) {
      console.error('Failed to create relationship:', err);
      setError(err.message || 'Failed to create relationship');
    }
  };

  const handleDeleteRelationship = async (
    relationshipId: string,
    typeName: string
  ) => {
    if (!task?.id) return;

    if (
      !confirm(
        t('taskRelationships.deleteConfirm', {
          defaultValue: 'Are you sure you want to delete this relationship?',
        })
      )
    ) {
      return;
    }

    try {
      await taskRelationshipsApi.delete(task.id, relationshipId);
      await fetchRelationships();
    } catch (err: any) {
      console.error('Failed to delete relationship:', err);
      setError(err.message || 'Failed to delete relationship');
    }
  };

  const checkIfBlocked = (type: RelationshipType): {
    isBlocked: boolean;
    blockingTasks: Relationship[];
  } => {
    if (!type.enforces_blocking) {
      return { isBlocked: false, blockingTasks: [] };
    }

    const reverseRels = relationships[type.type_name]?.relationships.reverse || [];
    const blockingSourceStatuses = type.blocking_source_statuses || [];

    const blockingTasks = reverseRels.filter((rel) => {
      if (!rel.source_task) return false;
      return blockingSourceStatuses.includes(rel.source_task.status);
    });

    return {
      isBlocked: blockingTasks.length > 0,
      blockingTasks,
    };
  };

  const renderRelationshipItem = (
    rel: Relationship,
    direction: 'forward' | 'reverse' | 'nonDirectional'
  ) => {
    const targetTask = direction === 'forward' ? rel.target_task : rel.source_task;
    if (!targetTask) return null;

    const handleClick = () => {
      if (onNavigateToTask) {
        onNavigateToTask(targetTask.id);
      }
    };

    return (
      <div
        key={rel.id}
        className={cn(
          'flex items-start justify-between gap-2 p-2 rounded border',
          'hover:bg-accent/50 transition-colors',
          onNavigateToTask && 'cursor-pointer'
        )}
        onClick={handleClick}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{targetTask.title}</div>
          {rel.note && (
            <div className="text-xs text-muted-foreground mt-1">{rel.note}</div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteRelationship(rel.id, rel.relationship_type_name);
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive p-2">{error}</div>
    );
  }

  const relationshipEntries = Object.entries(relationships).filter(
    ([_, data]) =>
      data.relationships.forward.length > 0 ||
      data.relationships.reverse.length > 0 ||
      data.relationships.nonDirectional.length > 0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t('taskRelationships.title', { defaultValue: 'Relationships' })}
        </h3>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="h-7"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('taskRelationships.add', { defaultValue: 'Add' })}
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="relationship-type">
              {t('taskRelationships.type', { defaultValue: 'Relationship Type' })}
            </Label>
            <RelationshipTypeSelect
              value={selectedType}
              onValueChange={setSelectedType}
            />
          </div>

          {selectedType && (
            <>
              <div className="space-y-2">
                <Label htmlFor="target-task">
                  {t('taskRelationships.targetTask', { defaultValue: 'Target Task' })}
                </Label>
                <TaskSearchAutocomplete
                  value=""
                  onChange={() => {}}
                  onSelect={setSelectedTask}
                  projectId={projectId}
                  excludeTaskId={task.id}
                />
                {selectedTask && (
                  <div className="text-xs text-muted-foreground">
                    Selected: {selectedTask.title}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="relationship-note">
                  {t('taskRelationships.note', { defaultValue: 'Note (optional)' })}
                </Label>
                <Textarea
                  id="relationship-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={t('taskRelationships.notePlaceholder', {
                    defaultValue: 'Add a note about this relationship...',
                  })}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddRelationship}
                  disabled={!selectedTask}
                >
                  {t('taskRelationships.create', { defaultValue: 'Create' })}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false);
                    setSelectedType('');
                    setSelectedTask(null);
                    setNote('');
                  }}
                >
                  {t('taskRelationships.cancel', { defaultValue: 'Cancel' })}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {relationshipEntries.length === 0 && !isAdding ? (
        <div className="text-sm text-muted-foreground py-2">
          {t('taskRelationships.noRelationships', {
            defaultValue: 'No relationships',
          })}
        </div>
      ) : (
        relationshipEntries.map(([typeName, { type, relationships: rels }]) => {
          const { isBlocked, blockingTasks } = checkIfBlocked(type);

          return (
            <div key={typeName} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">{type.display_name}</h4>
                {isBlocked && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {t('taskRelationships.blocked', { defaultValue: 'Blocked' })}
                  </Badge>
                )}
              </div>

              {type.description && (
                <p className="text-xs text-muted-foreground">{type.description}</p>
              )}

              {type.is_directional ? (
                <>
                  {rels.forward.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">
                        {type.forward_label || 'Forward'}
                      </div>
                      {rels.forward.map((rel) =>
                        renderRelationshipItem(rel, 'forward')
                      )}
                    </div>
                  )}

                  {rels.reverse.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">
                        {type.reverse_label || 'Reverse'}
                      </div>
                      {rels.reverse.map((rel) =>
                        renderRelationshipItem(rel, 'reverse')
                      )}
                    </div>
                  )}
                </>
              ) : (
                rels.nonDirectional.length > 0 && (
                  <div className="space-y-1">
                    {rels.nonDirectional.map((rel) =>
                      renderRelationshipItem(rel, 'nonDirectional')
                    )}
                  </div>
                )
              )}

              {isBlocked && blockingTasks.length > 0 && (
                <div className="text-xs text-destructive mt-2 p-2 bg-destructive/10 rounded">
                  {t('taskRelationships.blockedMessage', {
                    defaultValue:
                      'This task is blocked by tickets in certain statuses. Cannot transition to: {statuses}',
                    statuses: type.blocking_disabled_statuses?.join(', ') || '',
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

