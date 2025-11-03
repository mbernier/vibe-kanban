import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Loader2, Folder, FolderOpen, FileText } from 'lucide-react';
import { taskTemplatesApi, taskTemplateGroupsApi } from '@/lib/api';
import { showTaskTemplateEdit, showTaskTemplateGroupEdit } from '@/lib/modals';
import type { TaskTemplate, TaskTemplateGroup, TaskTemplateGroupWithChildren } from 'shared/types';

export function TaskTemplateManager() {
  const { t } = useTranslation('settings');
  const [groups, setGroups] = useState<TaskTemplateGroupWithChildren[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [groupsData, templatesData] = await Promise.all([
        taskTemplateGroupsApi.list({ hierarchical: true }),
        taskTemplatesApi.list(),
      ]);
      setGroups(groupsData);
      setTemplates(templatesData);
    } catch (err) {
      console.error('Failed to fetch templates and groups:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleOpenTemplateDialog = useCallback(
    async (template?: TaskTemplate, groupId?: string | null) => {
      try {
        const result = await showTaskTemplateEdit({
          template: template || null,
          groupId: groupId || null,
        });

        if (result === 'saved') {
          await fetchData();
        }
      } catch (error) {
        // User cancelled - do nothing
      }
    },
    [fetchData]
  );

  const handleOpenGroupDialog = useCallback(
    async (group?: TaskTemplateGroup, parentId?: string | null) => {
      try {
        const result = await showTaskTemplateGroupEdit({
          group: group || null,
          parentId: parentId || null,
        });

        if (result === 'saved') {
          await fetchData();
        }
      } catch (error) {
        // User cancelled - do nothing
      }
    },
    [fetchData]
  );

  const handleDeleteTemplate = useCallback(
    async (template: TaskTemplate) => {
      if (
        !confirm(
          t('settings.taskTemplates.manager.deleteTemplateConfirm', {
            templateName: template.template_title,
            defaultValue: `Are you sure you want to delete "${template.template_title}"?`,
          })
        )
      ) {
        return;
      }

      try {
        await taskTemplatesApi.delete(template.id);
        await fetchData();
      } catch (err) {
        console.error('Failed to delete template:', err);
        alert(
          t('settings.taskTemplates.manager.deleteTemplateError', {
            defaultValue: 'Failed to delete template',
          })
        );
      }
    },
    [fetchData, t]
  );

  const handleDeleteGroup = useCallback(
    async (group: TaskTemplateGroup) => {
      if (
        !confirm(
          t('settings.taskTemplates.manager.deleteGroupConfirm', {
            groupName: group.name,
            defaultValue: `Are you sure you want to delete "${group.name}"?`,
          })
        )
      ) {
        return;
      }

      try {
        await taskTemplateGroupsApi.delete(group.id);
        await fetchData();
      } catch (err: any) {
        console.error('Failed to delete group:', err);
        alert(
          err.message ||
            t('settings.taskTemplates.manager.deleteGroupError', {
              defaultValue: 'Failed to delete group',
            })
        );
      }
    },
    [fetchData, t]
  );

  const renderGroupTree = (
    group: TaskTemplateGroupWithChildren,
    depth = 0
  ): JSX.Element => {
    const isExpanded = expandedGroups.has(group.id);
    const hasChildren = group.children.length > 0;
    const groupTemplates = templates.filter((t) => t.group_id === group.id);

    return (
      <div key={group.id} className="mb-2">
        <div
          className={`flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer ${
            selectedGroupId === group.id ? 'bg-muted' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {hasChildren && (
            <button
              onClick={() => toggleGroup(group.id)}
              className="p-1 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <FolderOpen className="h-4 w-4" />
              ) : (
                <Folder className="h-4 w-4" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-6" />}
          <span
            className="flex-1 text-sm font-medium"
            onClick={() => setSelectedGroupId(group.id)}
          >
            {group.name}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => handleOpenGroupDialog(group)}
              title={t('settings.taskTemplates.manager.editGroup', {
                defaultValue: 'Edit group',
              })}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => handleDeleteGroup(group)}
              title={t('settings.taskTemplates.manager.deleteGroup', {
                defaultValue: 'Delete group',
              })}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => handleOpenTemplateDialog(undefined, group.id)}
              title={t('settings.taskTemplates.manager.addTemplate', {
                defaultValue: 'Add template to group',
              })}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div className="ml-4">
            {group.children.map((child) => renderGroupTree(child, depth + 1))}
          </div>
        )}
        {selectedGroupId === group.id && groupTemplates.length > 0 && (
          <div className="ml-8 mt-2 space-y-1">
            {groupTemplates.map((template) => (
              <div
                key={template.id}
                className="flex items-center gap-2 p-2 rounded hover:bg-muted/30"
              >
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1 text-sm">{template.template_title}</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleOpenTemplateDialog(template)}
                    title={t('settings.taskTemplates.manager.editTemplate', {
                      defaultValue: 'Edit template',
                    })}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleDeleteTemplate(template)}
                    title={t('settings.taskTemplates.manager.deleteTemplate', {
                      defaultValue: 'Delete template',
                    })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const hasNoGroups = groups.length === 0;
  const hasNoTemplates = templates.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {t('settings.taskTemplates.manager.title', {
            defaultValue: 'Templates & Groups',
          })}
        </h3>
        <div className="flex gap-2">
          <Button onClick={() => handleOpenGroupDialog()} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t('settings.taskTemplates.manager.addGroup', {
              defaultValue: 'Add Group',
            })}
          </Button>
          <Button onClick={() => handleOpenTemplateDialog()} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t('settings.taskTemplates.manager.addTemplate', {
              defaultValue: 'Add Template',
            })}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Groups Tree */}
        <div className="border rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">
            {t('settings.taskTemplates.manager.groups', {
              defaultValue: 'Groups',
            })}
          </h4>
          {hasNoGroups ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t('settings.taskTemplates.manager.noGroups', {
                defaultValue: 'No groups yet. Create a group to organize templates.',
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {groups.map((group) => renderGroupTree(group))}
            </div>
          )}
        </div>

        {/* Templates List */}
        <div className="border rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">
            {t('settings.taskTemplates.manager.templates', {
              defaultValue: 'All Templates',
            })}
          </h4>
          {hasNoTemplates ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t('settings.taskTemplates.manager.noTemplates', {
                defaultValue:
                  'No templates yet. Create reusable ticket templates. Use ~template:name in task descriptions.',
              })}
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {templates.map((template) => {
                const group = groups
                  .flatMap((g) => [g, ...g.children])
                  .find((g) => g.id === template.group_id);
                return (
                  <div
                    key={template.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-muted/30"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {template.template_title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ~template:{template.template_name}
                        {group && ` • ${group.name}`}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenTemplateDialog(template)}
                        title={t('settings.taskTemplates.manager.editTemplate', {
                          defaultValue: 'Edit template',
                        })}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDeleteTemplate(template)}
                        title={t('settings.taskTemplates.manager.deleteTemplate', {
                          defaultValue: 'Delete template',
                        })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

