import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { taskTemplateGroupsApi } from '@/lib/api';
import type { TaskTemplateGroup, CreateTaskTemplateGroup, UpdateTaskTemplateGroup, TaskTemplateGroupWithChildren } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface TaskTemplateGroupEditDialogProps {
  group?: TaskTemplateGroup | null;
  parentId?: string | null;
}

export type TaskTemplateGroupEditResult = 'saved' | 'canceled';

export const TaskTemplateGroupEditDialog = NiceModal.create<TaskTemplateGroupEditDialogProps>(({ group, parentId }) => {
  const modal = useModal();
  const { t } = useTranslation('settings');
  const [formData, setFormData] = useState({
    name: '',
    parent_group_id: null as string | null,
  });
  const [groups, setGroups] = useState<TaskTemplateGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = Boolean(group);

  useEffect(() => {
    // Load groups (excluding current group if editing)
    const loadGroups = async () => {
      setLoadingGroups(true);
      try {
        const allGroups = await taskTemplateGroupsApi.list({ hierarchical: true });
        // Flatten hierarchical structure
        const flattenGroups = (groups: TaskTemplateGroupWithChildren[], excludeId?: string): TaskTemplateGroup[] => {
          const result: TaskTemplateGroup[] = [];
          const traverse = (group: TaskTemplateGroupWithChildren, depth = 0) => {
            if (group.id !== excludeId && depth < 3) {
              const { children, ...groupData } = group;
              result.push(groupData);
              group.children.forEach((child) => traverse(child, depth + 1));
            }
          };
          groups.forEach(g => traverse(g));
          return result;
        };
        setGroups(flattenGroups(allGroups, group?.id));
      } catch (err) {
        console.error('Failed to load groups:', err);
      } finally {
        setLoadingGroups(false);
      }
    };
    loadGroups();
  }, [group]);

  useEffect(() => {
    if (group) {
      setFormData({
        name: group.name,
        parent_group_id: group.parent_group_id,
      });
    } else {
      setFormData({
        name: '',
        parent_group_id: parentId || null,
      });
    }
    setError(null);
  }, [group, parentId]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError(t('settings.taskTemplates.groupDialog.errors.nameRequired', {
        defaultValue: 'Group name is required',
      }));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditMode && group) {
        const updateData: UpdateTaskTemplateGroup = {
          name: formData.name,
          parent_group_id: formData.parent_group_id || null,
        };
        await taskTemplateGroupsApi.update(group.id, updateData);
      } else {
        const createData: CreateTaskTemplateGroup = {
          name: formData.name,
          parent_group_id: formData.parent_group_id || null,
        };
        await taskTemplateGroupsApi.create(createData);
      }

      modal.resolve('saved' as TaskTemplateGroupEditResult);
      modal.hide();
    } catch (err: any) {
      setError(
        err.message || t('settings.taskTemplates.groupDialog.errors.saveFailed', {
          defaultValue: 'Failed to save group',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    modal.resolve('canceled' as TaskTemplateGroupEditResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? t('settings.taskTemplates.groupDialog.editTitle', {
                  defaultValue: 'Edit Group',
                })
              : t('settings.taskTemplates.groupDialog.createTitle', {
                  defaultValue: 'Create Group',
                })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="group-name">
              {t('settings.taskTemplates.groupDialog.name.label', {
                defaultValue: 'Group Name',
              })}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="group-name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
              }}
              placeholder={t('settings.taskTemplates.groupDialog.name.placeholder', {
                defaultValue: 'e.g., Bug Reports, Test Plans',
              })}
              disabled={saving}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="parent-group">
              {t('settings.taskTemplates.groupDialog.parentGroup.label', {
                defaultValue: 'Parent Group',
              })}
            </Label>
            <Select
              value={formData.parent_group_id || '__none__'}
              onValueChange={(value) => {
                setFormData({ ...formData, parent_group_id: value === '__none__' ? null : value });
              }}
              disabled={saving || loadingGroups}
            >
              <SelectTrigger id="parent-group">
                <SelectValue placeholder={t('settings.taskTemplates.groupDialog.parentGroup.placeholder', {
                  defaultValue: 'No parent (top level)',
                })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('settings.taskTemplates.groupDialog.parentGroup.none', {
                  defaultValue: 'No parent',
                })}</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.taskTemplates.groupDialog.parentGroup.hint', {
                defaultValue: 'Maximum depth is 3 levels',
              })}
            </p>
          </div>

          {error && <Alert variant="destructive">{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            {t('settings.taskTemplates.groupDialog.buttons.cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !formData.name.trim()}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditMode
              ? t('settings.taskTemplates.groupDialog.buttons.update', {
                  defaultValue: 'Update',
                })
              : t('settings.taskTemplates.groupDialog.buttons.create', {
                  defaultValue: 'Create',
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

