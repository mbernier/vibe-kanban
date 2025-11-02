import { TaskTemplateManager } from '@/components/TaskTemplateManager';
import { useTranslation } from 'react-i18next';

export function TaskTemplatesSettings() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          {t('settings.taskTemplates.title', {
            defaultValue: 'Task Templates',
          })}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('settings.taskTemplates.description', {
            defaultValue:
              'Create reusable ticket templates organized in groups. Use ~template:name in task descriptions to reference templates.',
          })}
        </p>
      </div>

      <TaskTemplateManager />
    </div>
  );
}

