import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { taskRelationshipTypesApi } from '@/lib/api';
import { showRelationshipTypeEdit } from '@/lib/modals';

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

export function RelationshipTypeManager() {
  const { t } = useTranslation('settings');
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taskRelationshipTypesApi.list();
      setTypes(data as RelationshipType[]);
    } catch (err) {
      console.error('Failed to fetch relationship types:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  const handleOpenDialog = useCallback(
    async (type?: RelationshipType) => {
      try {
        const result = await showRelationshipTypeEdit({
          type: type || null,
        });

        if (result === 'saved') {
          await fetchTypes();
        }
      } catch (error) {
        // User cancelled - do nothing
      }
    },
    [fetchTypes]
  );

  const handleDelete = useCallback(
    async (type: RelationshipType) => {
      if (type.is_system) {
        alert(
          t('settings.relationshipTypes.manager.cannotDeleteSystem', {
            defaultValue: 'Cannot delete system relationship types',
          })
        );
        return;
      }

      if (
        !confirm(
          t('settings.relationshipTypes.manager.deleteConfirm', {
            typeName: type.display_name,
            defaultValue: `Are you sure you want to delete "${type.display_name}"?`,
          })
        )
      ) {
        return;
      }

      try {
        await taskRelationshipTypesApi.delete(type.id);
        await fetchTypes();
      } catch (err) {
        console.error('Failed to delete relationship type:', err);
        alert(
          t('settings.relationshipTypes.manager.deleteError', {
            defaultValue: 'Failed to delete relationship type',
          })
        );
      }
    },
    [fetchTypes, t]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {t('settings.relationshipTypes.manager.title', {
            defaultValue: 'Relationship Types',
          })}
        </h3>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t('settings.relationshipTypes.manager.addType', {
            defaultValue: 'Add Type',
          })}
        </Button>
      </div>

      {types.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('settings.relationshipTypes.manager.noTypes', {
            defaultValue: 'No relationship types',
          })}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full">
              <thead className="border-b bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 text-sm font-medium">
                    {t('settings.relationshipTypes.manager.table.displayName', {
                      defaultValue: 'Display Name',
                    })}
                  </th>
                  <th className="text-left p-2 text-sm font-medium">
                    {t('settings.relationshipTypes.manager.table.typeName', {
                      defaultValue: 'Type Name',
                    })}
                  </th>
                  <th className="text-left p-2 text-sm font-medium">
                    {t('settings.relationshipTypes.manager.table.directional', {
                      defaultValue: 'Directional',
                    })}
                  </th>
                  <th className="text-left p-2 text-sm font-medium">
                    {t('settings.relationshipTypes.manager.table.blocking', {
                      defaultValue: 'Blocking',
                    })}
                  </th>
                  <th className="text-right p-2 text-sm font-medium">
                    {t('settings.relationshipTypes.manager.table.actions', {
                      defaultValue: 'Actions',
                    })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr
                    key={type.id}
                    className="border-b hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-2 text-sm font-medium">
                      <div className="flex items-center gap-2">
                        {type.display_name}
                        {type.is_system && (
                          <AlertCircle className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-sm text-muted-foreground">
                      {type.type_name}
                    </td>
                    <td className="p-2 text-sm">
                      {type.is_directional ? (
                        <span className="text-muted-foreground">
                          {type.forward_label} / {type.reverse_label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-sm">
                      {type.enforces_blocking ? (
                        <span className="text-destructive">Yes</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleOpenDialog(type)}
                          title={t(
                            'settings.relationshipTypes.manager.actions.editType',
                            { defaultValue: 'Edit Type' }
                          )}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(type)}
                          disabled={type.is_system}
                          title={
                            type.is_system
                              ? t(
                                  'settings.relationshipTypes.manager.actions.cannotDelete',
                                  { defaultValue: 'Cannot delete system type' }
                                )
                              : t(
                                  'settings.relationshipTypes.manager.actions.deleteType',
                                  { defaultValue: 'Delete Type' }
                                )
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

