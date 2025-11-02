import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { taskRelationshipTypesApi } from '@/lib/api';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { Badge } from '@/components/ui/badge';

interface RelationshipType {
  id: string;
  type_name: string;
  display_name: string;
  description?: string | null;
  is_system: boolean;
  is_directional: boolean;
  forward_label?: string | null;
  reverse_label?: string | null;
  enforces_blocking: boolean;
  blocking_disabled_statuses?: string[];
  blocking_source_statuses?: string[];
}

export interface RelationshipTypeEditDialogProps {
  type?: RelationshipType | null; // null for create mode
}

export type RelationshipTypeEditResult = 'saved' | 'canceled';

const TASK_STATUSES = ['todo', 'inprogress', 'inreview', 'done', 'cancelled'];

export const RelationshipTypeEditDialog = NiceModal.create<
  RelationshipTypeEditDialogProps
>(({ type }) => {
  const modal = useModal();
  const { t } = useTranslation('settings');
  const [formData, setFormData] = useState({
    type_name: '',
    display_name: '',
    description: '',
    is_directional: false,
    forward_label: '',
    reverse_label: '',
    enforces_blocking: false,
    blocking_disabled_statuses: [] as string[],
    blocking_source_statuses: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeNameError, setTypeNameError] = useState<string | null>(null);

  const isEditMode = Boolean(type);
  const isSystemType = type?.is_system || false;

  useEffect(() => {
    if (type) {
      setFormData({
        type_name: type.type_name,
        display_name: type.display_name,
        description: type.description || '',
        is_directional: type.is_directional,
        forward_label: type.forward_label || '',
        reverse_label: type.reverse_label || '',
        enforces_blocking: type.enforces_blocking,
        blocking_disabled_statuses: type.blocking_disabled_statuses || [],
        blocking_source_statuses: type.blocking_source_statuses || [],
      });
    } else {
      // Default blocking statuses
      setFormData({
        type_name: '',
        display_name: '',
        description: '',
        is_directional: false,
        forward_label: '',
        reverse_label: '',
        enforces_blocking: false,
        blocking_disabled_statuses: ['todo', 'inreview', 'done', 'cancelled'],
        blocking_source_statuses: ['todo', 'inprogress', 'inreview'],
      });
    }
    setError(null);
    setTypeNameError(null);
  }, [type]);

  const handleSave = async () => {
    if (!formData.type_name.trim()) {
      setError(t('settings.relationshipTypes.dialog.errors.nameRequired', {
        defaultValue: 'Type name is required',
      }));
      return;
    }

    if (!formData.display_name.trim()) {
      setError(t('settings.relationshipTypes.dialog.errors.displayNameRequired', {
        defaultValue: 'Display name is required',
      }));
      return;
    }

    if (formData.type_name.includes(' ')) {
      setTypeNameError(
        t('settings.relationshipTypes.dialog.errors.noSpaces', {
          defaultValue: 'Type name cannot contain spaces',
        })
      );
      return;
    }

    if (formData.is_directional) {
      if (!formData.forward_label.trim() || !formData.reverse_label.trim()) {
        setError(
          t('settings.relationshipTypes.dialog.errors.labelsRequired', {
            defaultValue: 'Both forward and reverse labels are required for directional relationships',
          })
        );
        return;
      }
    }

    if (formData.enforces_blocking) {
      if (
        formData.blocking_disabled_statuses.length === 0 ||
        formData.blocking_source_statuses.length === 0
      ) {
        setError(
          t('settings.relationshipTypes.dialog.errors.blockingStatusesRequired', {
            defaultValue: 'Blocking statuses must be configured when blocking is enabled',
          })
        );
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditMode && type) {
        const updateData = {
          type_name: formData.type_name,
          display_name: formData.display_name,
          description: formData.description.trim() || null,
          is_directional: formData.is_directional,
          forward_label: formData.is_directional ? formData.forward_label : null,
          reverse_label: formData.is_directional ? formData.reverse_label : null,
          enforces_blocking: formData.enforces_blocking,
          blocking_disabled_statuses: formData.enforces_blocking
            ? formData.blocking_disabled_statuses
            : null,
          blocking_source_statuses: formData.enforces_blocking
            ? formData.blocking_source_statuses
            : null,
        };
        await taskRelationshipTypesApi.update(type.id, updateData);
      } else {
        const createData = {
          type_name: formData.type_name,
          display_name: formData.display_name,
          description: formData.description.trim() || null,
          is_directional: formData.is_directional,
          forward_label: formData.is_directional ? formData.forward_label : null,
          reverse_label: formData.is_directional ? formData.reverse_label : null,
          enforces_blocking: formData.enforces_blocking,
          blocking_disabled_statuses: formData.enforces_blocking
            ? formData.blocking_disabled_statuses
            : undefined,
          blocking_source_statuses: formData.enforces_blocking
            ? formData.blocking_source_statuses
            : undefined,
        };
        await taskRelationshipTypesApi.create(createData);
      }

      modal.resolve('saved' as RelationshipTypeEditResult);
      modal.hide();
    } catch (err: any) {
      setError(
        err.message ||
          t('settings.relationshipTypes.dialog.errors.saveFailed', {
            defaultValue: 'Failed to save relationship type',
          })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    modal.resolve('canceled' as RelationshipTypeEditResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  const toggleStatus = (
    status: string,
    field: 'blocking_disabled_statuses' | 'blocking_source_statuses'
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(status)
        ? prev[field].filter((s) => s !== status)
        : [...prev[field], status],
    }));
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? t('settings.relationshipTypes.dialog.editTitle', {
                  defaultValue: 'Edit Relationship Type',
                })
              : t('settings.relationshipTypes.dialog.createTitle', {
                  defaultValue: 'Create Relationship Type',
                })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="type-name">
              {t('settings.relationshipTypes.dialog.typeName.label', {
                defaultValue: 'Type Name',
              })}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              {t('settings.relationshipTypes.dialog.typeName.hint', {
                defaultValue: 'Unique identifier (no spaces, lowercase recommended)',
              })}
            </p>
            <Input
              id="type-name"
              value={formData.type_name}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({ ...formData, type_name: value });

                if (value.includes(' ')) {
                  setTypeNameError(
                    t('settings.relationshipTypes.dialog.typeName.error', {
                      defaultValue: 'Type name cannot contain spaces',
                    })
                  );
                } else {
                  setTypeNameError(null);
                }
              }}
              placeholder="e.g., blocked, context"
              disabled={saving || isSystemType}
              autoFocus
              aria-invalid={!!typeNameError}
              className={typeNameError ? 'border-destructive' : undefined}
            />
            {typeNameError && (
              <p className="text-sm text-destructive">{typeNameError}</p>
            )}
          </div>

          <div>
            <Label htmlFor="display-name">
              {t('settings.relationshipTypes.dialog.displayName.label', {
                defaultValue: 'Display Name',
              })}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="display-name"
              value={formData.display_name}
              onChange={(e) =>
                setFormData({ ...formData, display_name: e.target.value })
              }
              placeholder="e.g., Blocked Tickets"
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="description">
              {t('settings.relationshipTypes.dialog.description.label', {
                defaultValue: 'Description',
              })}
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Optional description..."
              rows={2}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_directional"
                checked={formData.is_directional}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_directional: checked === true })
                }
                disabled={saving}
              />
              <Label htmlFor="is_directional" className="cursor-pointer">
                {t('settings.relationshipTypes.dialog.isDirectional', {
                  defaultValue: 'Is Directional',
                })}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.relationshipTypes.dialog.isDirectionalHint', {
                defaultValue:
                  'Directional relationships have forward and reverse labels (e.g., "blocks" / "blocked by")',
              })}
            </p>
          </div>

          {formData.is_directional && (
            <div className="space-y-4 p-4 border rounded-md bg-muted/30">
              <div>
                <h4 className="text-sm font-medium mb-2">
                  {t('settings.relationshipTypes.dialog.directionalExample', {
                    defaultValue: 'How Directional Relationships Work',
                  })}
                </h4>
                <div className="text-xs text-muted-foreground space-y-1 mb-3">
                  <p>
                    {t('settings.relationshipTypes.dialog.directionalExampleText', {
                      defaultValue:
                        'When Task A is related to Task B:',
                    })}
                  </p>
                  <p className="font-medium">
                    Forward: Task A [forward_label] Task B
                  </p>
                  <p className="font-medium">
                    Reverse: Task B [reverse_label] Task A
                  </p>
                  <p className="mt-2">
                    {t('settings.relationshipTypes.dialog.directionalHint', {
                      defaultValue:
                        'The forward label describes the relationship from source to target. The reverse label describes the relationship from target to source.',
                    })}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="forward-label">
                  {t('settings.relationshipTypes.dialog.forwardLabel', {
                    defaultValue: 'Forward Label',
                  })}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="forward-label"
                  value={formData.forward_label}
                  onChange={(e) =>
                    setFormData({ ...formData, forward_label: e.target.value })
                  }
                  placeholder="e.g., blocks"
                  disabled={saving}
                />
              </div>

              <div>
                <Label htmlFor="reverse-label">
                  {t('settings.relationshipTypes.dialog.reverseLabel', {
                    defaultValue: 'Reverse Label',
                  })}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reverse-label"
                  value={formData.reverse_label}
                  onChange={(e) =>
                    setFormData({ ...formData, reverse_label: e.target.value })
                  }
                  placeholder="e.g., blocked by"
                  disabled={saving}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enforces_blocking"
                checked={formData.enforces_blocking}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, enforces_blocking: checked === true })
                }
                disabled={saving}
              />
              <Label htmlFor="enforces_blocking" className="cursor-pointer">
                {t('settings.relationshipTypes.dialog.enforcesBlocking', {
                  defaultValue: 'Enforces Blocking Rules',
                })}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.relationshipTypes.dialog.enforcesBlockingHint', {
                defaultValue:
                  'When enabled, tasks cannot transition to "Blocked Statuses" if they have blocking relationships where the source task is in any "Blocking Source Status"',
              })}
            </p>
          </div>

          {formData.enforces_blocking && (
            <div className="space-y-4 p-4 border rounded-md bg-muted/30">
              <div>
                <Label>
                  {t('settings.relationshipTypes.dialog.blockedStatuses', {
                    defaultValue: 'Blocked Statuses',
                  })}
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {t('settings.relationshipTypes.dialog.blockedStatusesHint', {
                    defaultValue:
                      'Statuses that cannot be set if task is blocked',
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {TASK_STATUSES.map((status) => (
                    <div key={status} className="flex items-center space-x-2">
                      <Checkbox
                        id={`blocked-${status}`}
                        checked={formData.blocking_disabled_statuses.includes(status)}
                        onCheckedChange={() =>
                          toggleStatus(status, 'blocking_disabled_statuses')
                        }
                        disabled={saving}
                      />
                      <Label htmlFor={`blocked-${status}`} className="cursor-pointer">
                        {status}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>
                  {t('settings.relationshipTypes.dialog.blockingSourceStatuses', {
                    defaultValue: 'Blocking Source Statuses',
                  })}
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {t('settings.relationshipTypes.dialog.blockingSourceStatusesHint', {
                    defaultValue:
                      'Statuses that cause blocking when source task is in these statuses',
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {TASK_STATUSES.map((status) => (
                    <div key={status} className="flex items-center space-x-2">
                      <Checkbox
                        id={`source-${status}`}
                        checked={formData.blocking_source_statuses.includes(status)}
                        onCheckedChange={() =>
                          toggleStatus(status, 'blocking_source_statuses')
                        }
                        disabled={saving}
                      />
                      <Label htmlFor={`source-${status}`} className="cursor-pointer">
                        {status}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && <Alert variant="destructive">{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            {t('settings.relationshipTypes.dialog.buttons.cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button onClick={handleSave} disabled={saving || !!typeNameError}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditMode
              ? t('settings.relationshipTypes.dialog.buttons.update', {
                  defaultValue: 'Update',
                })
              : t('settings.relationshipTypes.dialog.buttons.create', {
                  defaultValue: 'Create',
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

