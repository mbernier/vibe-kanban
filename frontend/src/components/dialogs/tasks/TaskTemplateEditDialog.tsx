import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { taskTemplatesApi, taskTemplateGroupsApi } from '@/lib/api';
import type { TaskTemplate, CreateTaskTemplate, UpdateTaskTemplate, TaskTemplateGroup } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface TaskTemplateEditDialogProps {
  template?: TaskTemplate | null;
  groupId?: string | null;
}

export type TaskTemplateEditResult = 'saved' | 'canceled';

export const TaskTemplateEditDialog = NiceModal.create<TaskTemplateEditDialogProps>(({ template, groupId }) => {
  const modal = useModal();
  const { t } = useTranslation('settings');
  const [formData, setFormData] = useState({
    group_id: null as string | null,
    template_name: '',
    template_title: '',
    ticket_title: '',
    ticket_description: '',
  });
  const [groups, setGroups] = useState<TaskTemplateGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = Boolean(template);

  useEffect(() => {
    // Load groups
    const loadGroups = async () => {
      setLoadingGroups(true);
      try {
        const allGroups = await taskTemplateGroupsApi.list({ hierarchical: true });
        // Flatten hierarchical structure
        const flattenGroups = (groups: any[]): TaskTemplateGroup[] => {
          const result: TaskTemplateGroup[] = [];
          const traverse = (group: any, depth = 0) => {
            result.push({ ...group.group, children: [] });
            group.children.forEach((child: any) => traverse(child, depth + 1));
          };
          groups.forEach(g => traverse(g));
          return result;
        };
        setGroups(flattenGroups(allGroups));
      } catch (err) {
        console.error('Failed to load groups:', err);
      } finally {
        setLoadingGroups(false);
      }
    };
    loadGroups();
  }, []);

  useEffect(() => {
    if (template) {
      setFormData({
        group_id: template.group_id,
        template_name: template.template_name,
        template_title: template.template_title,
        ticket_title: template.ticket_title,
        ticket_description: template.ticket_description,
      });
    } else {
      setFormData({
        group_id: groupId || null,
        template_name: '',
        template_title: '',
        ticket_title: '',
        ticket_description: '',
      });
    }
    setError(null);
  }, [template, groupId]);

  const handleSave = async () => {
    if (!formData.template_name.trim()) {
      setError(t('settings.taskTemplates.dialog.errors.nameRequired', {
        defaultValue: 'Template name is required',
      }));
      return;
    }
    if (!formData.template_title.trim()) {
      setError(t('settings.taskTemplates.dialog.errors.titleRequired', {
        defaultValue: 'Template title is required',
      }));
      return;
    }
    if (!formData.ticket_title.trim()) {
      setError(t('settings.taskTemplates.dialog.errors.ticketTitleRequired', {
        defaultValue: 'Ticket title is required',
      }));
      return;
    }
    if (!formData.ticket_description.trim()) {
      setError(t('settings.taskTemplates.dialog.errors.ticketDescriptionRequired', {
        defaultValue: 'Ticket description is required',
      }));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditMode && template) {
        const updateData: UpdateTaskTemplate = {
          group_id: formData.group_id || null,
          template_name: formData.template_name,
          template_title: formData.template_title,
          ticket_title: formData.ticket_title,
          ticket_description: formData.ticket_description,
        };
        await taskTemplatesApi.update(template.id, updateData);
      } else {
        const createData: CreateTaskTemplate = {
          group_id: formData.group_id || null,
          template_name: formData.template_name,
          template_title: formData.template_title,
          ticket_title: formData.ticket_title,
          ticket_description: formData.ticket_description,
        };
        await taskTemplatesApi.create(createData);
      }

      modal.resolve('saved' as TaskTemplateEditResult);
      modal.hide();
    } catch (err: any) {
      setError(
        err.message || t('settings.taskTemplates.dialog.errors.saveFailed', {
          defaultValue: 'Failed to save template',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    modal.resolve('canceled' as TaskTemplateEditResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? t('settings.taskTemplates.dialog.editTitle', {
                  defaultValue: 'Edit Template',
                })
              : t('settings.taskTemplates.dialog.createTitle', {
                  defaultValue: 'Create Template',
                })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="template-group">
              {t('settings.taskTemplates.dialog.group.label', {
                defaultValue: 'Group',
              })}
            </Label>
            <Select
              value={formData.group_id || ''}
              onValueChange={(value) => {
                setFormData({ ...formData, group_id: value || null });
              }}
              disabled={saving || loadingGroups}
            >
              <SelectTrigger id="template-group">
                <SelectValue placeholder={t('settings.taskTemplates.dialog.group.placeholder', {
                  defaultValue: 'No group (top level)',
                })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('settings.taskTemplates.dialog.group.none', {
                  defaultValue: 'No group',
                })}</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="template-name">
              {t('settings.taskTemplates.dialog.templateName.label', {
                defaultValue: 'Template Name',
              })}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              {t('settings.taskTemplates.dialog.templateName.hint', {
                defaultValue: 'Use this name with ~template: in task descriptions: ~template:{{templateName}}',
                templateName: formData.template_name || 'template_name',
              })}
            </p>
            <Input
              id="template-name"
              value={formData.template_name}
              onChange={(e) => {
                const value = e.target.value.replace(/\s+/g, '_');
                setFormData({ ...formData, template_name: value });
              }}
              placeholder={t('settings.taskTemplates.dialog.templateName.placeholder', {
                defaultValue: 'e.g., bug_report, test_plan',
              })}
              disabled={saving || isEditMode}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="template-title">
              {t('settings.taskTemplates.dialog.templateTitle.label', {
                defaultValue: 'Template Title',
              })}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="template-title"
              value={formData.template_title}
              onChange={(e) => {
                setFormData({ ...formData, template_title: e.target.value });
              }}
              placeholder={t('settings.taskTemplates.dialog.templateTitle.placeholder', {
                defaultValue: 'e.g., Bug Report Template',
              })}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="ticket-title">
              {t('settings.taskTemplates.dialog.ticketTitle.label', {
                defaultValue: 'Ticket Title',
              })}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ticket-title"
              value={formData.ticket_title}
              onChange={(e) => {
                setFormData({ ...formData, ticket_title: e.target.value });
              }}
              placeholder={t('settings.taskTemplates.dialog.ticketTitle.placeholder', {
                defaultValue: 'Title for tickets created from this template',
              })}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="ticket-description">
              {t('settings.taskTemplates.dialog.ticketDescription.label', {
                defaultValue: 'Ticket Description',
              })}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="ticket-description"
              value={formData.ticket_description}
              onChange={(e) => {
                setFormData({ ...formData, ticket_description: e.target.value });
              }}
              placeholder={t('settings.taskTemplates.dialog.ticketDescription.placeholder', {
                defaultValue: 'Description for tickets created from this template',
              })}
              rows={8}
              disabled={saving}
            />
          </div>

          {error && <Alert variant="destructive">{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            {t('settings.taskTemplates.dialog.buttons.cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !formData.template_name.trim() ||
              !formData.template_title.trim() ||
              !formData.ticket_title.trim() ||
              !formData.ticket_description.trim()
            }
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditMode
              ? t('settings.taskTemplates.dialog.buttons.update', {
                  defaultValue: 'Update',
                })
              : t('settings.taskTemplates.dialog.buttons.create', {
                  defaultValue: 'Create',
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

