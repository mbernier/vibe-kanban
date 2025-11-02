import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { taskRelationshipTypesApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

interface RelationshipTypeSelectProps {
  value?: string; // type_name
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
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
}

export function RelationshipTypeSelect({
  value,
  onValueChange,
  placeholder = 'Select relationship type...',
  disabled = false,
  className,
}: RelationshipTypeSelectProps) {
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTypes = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await taskRelationshipTypesApi.list();
        setTypes(data as RelationshipType[]);
      } catch (err) {
        console.error('Failed to fetch relationship types:', err);
        setError('Failed to load relationship types');
      } finally {
        setLoading(false);
      }
    };

    fetchTypes();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading types...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">{error}</div>
    );
  }

  return (
    <Select
      value={value || ''}
      onValueChange={onValueChange}
      disabled={disabled || types.length === 0}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {types.map((type) => (
          <SelectItem key={type.id} value={type.type_name}>
            {type.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

