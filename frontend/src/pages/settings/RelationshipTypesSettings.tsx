import { RelationshipTypeManager } from '@/components/RelationshipTypeManager';
import { useTranslation } from 'react-i18next';

export function RelationshipTypesSettings() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          {t('settings.relationshipTypes.title', {
            defaultValue: 'Relationship Types',
          })}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('settings.relationshipTypes.description', {
            defaultValue:
              'Manage relationship types that define how tasks can be linked together.',
          })}
        </p>
      </div>

      <RelationshipTypeManager />
    </div>
  );
}

