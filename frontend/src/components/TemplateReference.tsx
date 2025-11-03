import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { showTaskTemplateEdit } from '@/lib/modals';
import { taskTemplatesApi } from '@/lib/api';
import { useState } from 'react';

interface TemplateReferenceMetadata {
  type: string;
  template_id: string;
  template_name: string;
  template_title: string;
}

interface TemplateReferenceProps {
  metadata: TemplateReferenceMetadata;
  children: React.ReactNode;
}

function TemplateReference({ metadata, children }: TemplateReferenceProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);
    try {
      // Fetch the template by ID
      const template = await taskTemplatesApi.get(metadata.template_id);
      
      // Open the template edit dialog
      await showTaskTemplateEdit({
        template,
        groupId: template.group_id,
      });
    } catch (error) {
      console.error('Failed to load template:', error);
      // If that fails, navigate to settings
      navigate('/settings/task-templates');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950 inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
            onClick={handleClick}
            disabled={loading}
            title={`Template: ${metadata.template_title}`}
          >
            <FileText className="h-3 w-3" />
            <span>{children}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <div className="font-semibold">{metadata.template_title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {loading ? 'Loading...' : 'Click to view template details'}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default TemplateReference;

