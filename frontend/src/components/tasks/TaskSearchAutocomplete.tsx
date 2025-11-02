import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { taskRelationshipsApi } from '@/lib/api';
import type { Task } from 'shared/types';
import { cn } from '@/lib/utils';

interface TaskSearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (task: Task) => void;
  projectId?: string;
  excludeTaskId?: string; // Exclude current task from results
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TaskSearchAutocomplete({
  value,
  onChange,
  onSelect,
  projectId,
  excludeTaskId,
  placeholder = 'Search tasks by ID or title...',
  className,
  disabled = false,
}: TaskSearchAutocompleteProps) {
  const [searchResults, setSearchResults] = useState<Task[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounced search
  useEffect(() => {
    if (!value.trim() || !projectId || !isFocused) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const searchTasks = async () => {
      setIsLoading(true);

      try {
        const results = await taskRelationshipsApi.searchTasks(value, projectId);
        
        // Filter out excluded task
        const filtered = excludeTaskId
          ? results.filter((task) => task.id !== excludeTaskId)
          : results;

        if (!abortController.signal.aborted) {
          setSearchResults(filtered);
          setShowDropdown(filtered.length > 0 && isFocused);
          setSelectedIndex(-1);
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error('Failed to search tasks:', error);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    const debounceTimer = setTimeout(searchTasks, 300);
    return () => {
      clearTimeout(debounceTimer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [value, projectId, excludeTaskId, isFocused]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown || searchResults.length === 0) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < searchResults.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
            const selectedTask = searchResults[selectedIndex];
            onSelect(selectedTask);
            onChange('');
            setShowDropdown(false);
            setSelectedIndex(-1);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowDropdown(false);
          setSelectedIndex(-1);
          break;
      }
    },
    [showDropdown, searchResults, selectedIndex, onSelect, onChange]
  );

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleTaskSelect = (task: Task) => {
    onSelect(task);
    onChange('');
    setShowDropdown(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  const formatTaskTitle = (task: Task) => {
    const shortId = task.id.substring(0, 8);
    return `${shortId} - ${task.title}`;
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-8"
        />
        {isLoading && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && searchResults.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[300px] overflow-auto"
        >
          {searchResults.map((task, index) => (
            <div
              key={task.id}
              onClick={() => handleTaskSelect(task)}
              className={cn(
                'px-3 py-2 cursor-pointer hover:bg-accent transition-colors',
                index === selectedIndex && 'bg-accent'
              )}
            >
              <div className="text-sm font-medium">{task.title}</div>
              <div className="text-xs text-muted-foreground">
                ID: {task.id.substring(0, 8)}...
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

