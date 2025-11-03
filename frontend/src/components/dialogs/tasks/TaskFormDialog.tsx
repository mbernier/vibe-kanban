import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings2, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ImageUploadSection,
  type ImageUploadSectionHandle,
} from '@/components/ui/ImageUploadSection';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { imagesApi, projectsApi, attemptsApi, taskRelationshipsApi } from '@/lib/api';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useUserSystem } from '@/components/config-provider';
import { ExecutorProfileSelector } from '@/components/settings';
import BranchSelector from '@/components/tasks/BranchSelector';
import { TaskSearchAutocomplete } from '@/components/tasks/TaskSearchAutocomplete';
import { RelationshipTypeSelect } from '@/components/tasks/RelationshipTypeSelect';
import { Textarea } from '@/components/ui/textarea';
import { Trash2 } from 'lucide-react';
import type {
  TaskStatus,
  ImageResponse,
  GitBranch,
  ExecutorProfileId,
  Task,
} from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useKeySubmitTask, useKeySubmitTaskAlt, Scope } from '@/keyboard';

export interface TaskFormDialogProps {
  task?: Task | null; // Optional for create mode
  projectId?: string; // For file search and tag functionality
  initialTask?: Task | null; // For duplicating an existing task
  initialBaseBranch?: string; // For pre-selecting base branch in spinoff
  parentTaskAttemptId?: string; // For linking to parent task attempt
}

export const TaskFormDialog = NiceModal.create<TaskFormDialogProps>(
  ({
    task,
    projectId,
    initialTask,
    initialBaseBranch,
    parentTaskAttemptId,
  }) => {
    const modal = useModal();
    const { createTask, createAndStart, updateTask } =
      useTaskMutations(projectId);
    const { system, profiles } = useUserSystem();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<TaskStatus>('todo');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmittingAndStart, setIsSubmittingAndStart] = useState(false);
    const [showDiscardWarning, setShowDiscardWarning] = useState(false);
    const [images, setImages] = useState<ImageResponse[]>([]);
    const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<
      string[]
    >([]);
    const [branches, setBranches] = useState<GitBranch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [selectedExecutorProfile, setSelectedExecutorProfile] =
      useState<ExecutorProfileId | null>(null);
    const [quickstartExpanded, setQuickstartExpanded] =
      useState<boolean>(false);
    const imageUploadRef = useRef<ImageUploadSectionHandle>(null);
    const [isTextareaFocused, setIsTextareaFocused] = useState(false);
    
    // Relationship creation state (only for create mode)
    const [relationshipsToCreate, setRelationshipsToCreate] = useState<
      Array<{
        relationshipType: string;
        targetTask: Task;
        note: string;
      }>
    >([]);
    const [isAddingRelationship, setIsAddingRelationship] = useState(false);
    const [currentRelationshipType, setCurrentRelationshipType] = useState<string>('');
    const [currentRelationshipTask, setCurrentRelationshipTask] = useState<Task | null>(null);
    const [currentRelationshipNote, setCurrentRelationshipNote] = useState<string>('');
    const [currentRelationshipSearchValue, setCurrentRelationshipSearchValue] = useState<string>('');

    const isEditMode = Boolean(task);

    // Check if there's any content that would be lost
    const hasUnsavedChanges = useCallback(() => {
      if (!isEditMode) {
        // Create mode - warn when there's content
        return (
          title.trim() !== '' ||
          description.trim() !== '' ||
          relationshipsToCreate.length > 0
        );
      } else if (task) {
        // Edit mode - warn when current values differ from original task
        const titleChanged = title.trim() !== task.title.trim();
        const descriptionChanged =
          (description || '').trim() !== (task.description || '').trim();
        const statusChanged = status !== task.status;
        return titleChanged || descriptionChanged || statusChanged;
      }
      return false;
    }, [title, description, status, isEditMode, task, relationshipsToCreate]);

    // Warn on browser/tab close if there are unsaved changes
    useEffect(() => {
      if (!modal.visible) return; // dialog closed → nothing to do

      // always re-evaluate latest fields via hasUnsavedChanges()
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (hasUnsavedChanges()) {
          e.preventDefault();
          // Chrome / Edge still require returnValue to be set
          e.returnValue = '';
          return '';
        }
        // nothing returned → no prompt
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () =>
        window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [modal.visible, hasUnsavedChanges]); // hasUnsavedChanges is memoised with title/descr deps

    useEffect(() => {
      if (task) {
        // Edit mode - populate with existing task data
        setTitle(task.title);
        setDescription(task.description || '');
        setStatus(task.status);

        // Load existing images for the task
        if (modal.visible) {
          imagesApi
            .getTaskImages(task.id)
            .then((taskImages) => setImages(taskImages))
            .catch((err) => {
              console.error('Failed to load task images:', err);
              setImages([]);
            });
        }
      } else if (initialTask) {
        // Duplicate mode - pre-fill from existing task but reset status to 'todo' and no images
        setTitle(initialTask.title);
        setDescription(initialTask.description || '');
        setStatus('todo'); // Always start duplicated tasks as 'todo'
        setImages([]);
        setNewlyUploadedImageIds([]);
      } else {
        // Create mode - reset to defaults
        setTitle('');
        setDescription('');
        setStatus('todo');
        setImages([]);
        setNewlyUploadedImageIds([]);
        setSelectedBranch('');
        setSelectedExecutorProfile(system.config?.executor_profile || null);
        setQuickstartExpanded(false);
        setRelationshipsToCreate([]);
        setIsAddingRelationship(false);
        setCurrentRelationshipType('');
        setCurrentRelationshipTask(null);
        setCurrentRelationshipSearchValue('');
        setCurrentRelationshipNote('');
      }
    }, [task, initialTask, modal.visible, system.config?.executor_profile]);

    // Fetch branches when dialog opens in create mode
    useEffect(() => {
      if (modal.visible && !isEditMode && projectId) {
        projectsApi
          .getBranches(projectId)
          .then((projectBranches) => {
            // Set branches and default to initialBaseBranch if provided, otherwise current branch
            setBranches(projectBranches);

            if (
              initialBaseBranch &&
              projectBranches.some((b) => b.name === initialBaseBranch)
            ) {
              // Use initialBaseBranch if it exists in the project branches (for spinoff)
              setSelectedBranch(initialBaseBranch);
            } else {
              // Default behavior: use current branch or first available
              const currentBranch = projectBranches.find((b) => b.is_current);
              const defaultBranch = currentBranch || projectBranches[0];
              if (defaultBranch) {
                setSelectedBranch(defaultBranch.name);
              }
            }
          })
          .catch(console.error);
      }
    }, [modal.visible, isEditMode, projectId, initialBaseBranch]);

    // Fetch parent base branch when parentTaskAttemptId is provided
    useEffect(() => {
      if (
        modal.visible &&
        !isEditMode &&
        parentTaskAttemptId &&
        !initialBaseBranch &&
        branches.length > 0
      ) {
        attemptsApi
          .get(parentTaskAttemptId)
          .then((attempt) => {
            const parentBranch = attempt.branch || attempt.target_branch;
            if (parentBranch && branches.some((b) => b.name === parentBranch)) {
              setSelectedBranch(parentBranch);
            }
          })
          .catch(() => {
            // Silently fail, will use current branch fallback
          });
      }
    }, [
      modal.visible,
      isEditMode,
      parentTaskAttemptId,
      initialBaseBranch,
      branches,
    ]);

    // Set default executor from config (following TaskDetailsToolbar pattern)
    useEffect(() => {
      if (system.config?.executor_profile) {
        setSelectedExecutorProfile(system.config.executor_profile);
      }
    }, [system.config?.executor_profile]);

    // Set default executor from config (following TaskDetailsToolbar pattern)
    useEffect(() => {
      if (system.config?.executor_profile) {
        setSelectedExecutorProfile(system.config.executor_profile);
      }
    }, [system.config?.executor_profile]);

    // Handle image upload success by inserting markdown into description
    const handleImageUploaded = useCallback((image: ImageResponse) => {
      const markdownText = `![${image.original_name}](${image.file_path})`;
      setDescription((prev) => {
        if (prev.trim() === '') {
          return markdownText;
        } else {
          return prev + ' ' + markdownText;
        }
      });

      setImages((prev) => [...prev, image]);
      // Track as newly uploaded for backend association
      setNewlyUploadedImageIds((prev) => [...prev, image.id]);
    }, []);

    const handleImagesChange = useCallback((updatedImages: ImageResponse[]) => {
      setImages(updatedImages);
      // Also update newlyUploadedImageIds to remove any deleted image IDs
      setNewlyUploadedImageIds((prev) =>
        prev.filter((id) => updatedImages.some((img) => img.id === id))
      );
    }, []);

    const handlePasteImages = useCallback((files: File[]) => {
      if (files.length === 0) return;
      void imageUploadRef.current?.addFiles(files);
    }, []);

    const handleSubmit = useCallback(async () => {
      if (!title.trim() || !projectId || isSubmitting || isSubmittingAndStart) {
        return;
      }

      setIsSubmitting(true);
      try {
        let imageIds: string[] | undefined;

        if (isEditMode) {
          // In edit mode, send all current image IDs (existing + newly uploaded)
          imageIds =
            images.length > 0 ? images.map((img) => img.id) : undefined;
        } else {
          // In create mode, only send newly uploaded image IDs
          imageIds =
            newlyUploadedImageIds.length > 0
              ? newlyUploadedImageIds
              : undefined;
        }

        if (isEditMode && task) {
          await updateTask.mutateAsync(
            {
              taskId: task.id,
              data: {
                title,
                description: description,
                status,
                parent_task_attempt: parentTaskAttemptId || null,
                image_ids: imageIds || null,
              },
            },
            {
              onSuccess: () => {
                modal.hide();
              },
            }
          );
        } else {
          const createdTask = await createTask.mutateAsync(
            {
              project_id: projectId,
              title,
              description: description,
              parent_task_attempt: parentTaskAttemptId || null,
              image_ids: imageIds || null,
            }
          );

          // Create relationships if any were added
          if (relationshipsToCreate.length > 0 && createdTask?.id) {
            try {
              await Promise.all(
                relationshipsToCreate.map((rel) =>
                  taskRelationshipsApi.create(createdTask.id, {
                    target_task_id: rel.targetTask.id,
                    relationship_type: rel.relationshipType,
                    note: rel.note.trim() || null,
                  })
                )
              );
            } catch (error) {
              console.error('Failed to create relationships:', error);
              // Don't block the modal from closing, but log the error
            }
          }

          modal.hide();
        }
      } catch (error) {
        // Error already handled by mutation onError
      } finally {
        setIsSubmitting(false);
      }
    }, [
      title,
      description,
      status,
      isEditMode,
      projectId,
      task,
      modal,
      newlyUploadedImageIds,
      images,
      createTask,
      updateTask,
      isSubmitting,
      isSubmittingAndStart,
      parentTaskAttemptId,
      relationshipsToCreate,
    ]);

    const handleCreateAndStart = useCallback(async () => {
      if (
        !title.trim() ||
        !projectId ||
        isEditMode ||
        isSubmitting ||
        isSubmittingAndStart
      ) {
        return;
      }

      setIsSubmittingAndStart(true);
      try {
        const imageIds =
          newlyUploadedImageIds.length > 0 ? newlyUploadedImageIds : undefined;

        // Use selected executor profile or fallback to config default
        const finalExecutorProfile =
          selectedExecutorProfile || system.config?.executor_profile;
        if (!finalExecutorProfile || !selectedBranch) {
          console.warn(
            `Missing ${
              !finalExecutorProfile ? 'executor profile' : 'branch'
            } for Create & Start`
          );
          return;
        }

        const createdTask = await createAndStart.mutateAsync(
          {
            task: {
              project_id: projectId,
              title,
              description: description,
              parent_task_attempt: parentTaskAttemptId || null,
              image_ids: imageIds || null,
            },
            executor_profile_id: finalExecutorProfile,
            base_branch: selectedBranch,
          }
        );

        // Create relationships if any were added
        if (relationshipsToCreate.length > 0 && createdTask?.id) {
          try {
            await Promise.all(
              relationshipsToCreate.map((rel) =>
                taskRelationshipsApi.create(createdTask.id, {
                  target_task_id: rel.targetTask.id,
                  relationship_type: rel.relationshipType,
                  note: rel.note.trim() || null,
                })
              )
            );
          } catch (error) {
            console.error('Failed to create relationships:', error);
            // Don't block the modal from closing, but log the error
          }
        }

        modal.hide();
      } catch (error) {
        // Error already handled by mutation onError
      } finally {
        setIsSubmittingAndStart(false);
      }
    }, [
      title,
      description,
      isEditMode,
      projectId,
      modal,
      newlyUploadedImageIds,
      createAndStart,
      selectedExecutorProfile,
      selectedBranch,
      system.config?.executor_profile,
      isSubmitting,
      isSubmittingAndStart,
      parentTaskAttemptId,
      relationshipsToCreate,
    ]);

    const handleCancel = useCallback(() => {
      // Check for unsaved changes before closing
      if (hasUnsavedChanges()) {
        setShowDiscardWarning(true);
      } else {
        modal.hide();
      }
    }, [modal, hasUnsavedChanges]);

    const handleDiscardChanges = useCallback(() => {
      // Close both dialogs
      setShowDiscardWarning(false);
      modal.hide();
    }, [modal]);

    // Keyboard shortcut handlers
    const handlePrimarySubmit = useCallback(
      (e?: KeyboardEvent) => {
        e?.preventDefault();
        if (isEditMode) {
          handleSubmit();
        } else {
          handleCreateAndStart();
        }
      },
      [isEditMode, handleSubmit, handleCreateAndStart]
    );

    const handleAlternativeSubmit = useCallback(
      (e?: KeyboardEvent) => {
        e?.preventDefault();
        handleSubmit();
      },
      [handleSubmit]
    );

    // Register keyboard shortcuts
    const canSubmit =
      title.trim() !== '' && !isSubmitting && !isSubmittingAndStart;

    useKeySubmitTask(handlePrimarySubmit, {
      scope: Scope.DIALOG,
      enableOnFormTags: ['textarea', 'TEXTAREA'],
      when: canSubmit && isTextareaFocused,
      preventDefault: true,
    });

    useKeySubmitTaskAlt(handleAlternativeSubmit, {
      scope: Scope.DIALOG,
      enableOnFormTags: ['textarea', 'TEXTAREA'],
      when: canSubmit && isTextareaFocused,
      preventDefault: true,
    });

    // Handle dialog close attempt
    const handleDialogOpenChange = (open: boolean) => {
      if (!open && hasUnsavedChanges()) {
        // Trying to close with unsaved changes
        setShowDiscardWarning(true);
      } else if (!open) {
        modal.hide();
      }
    };

    return (
      <>
        <Dialog open={modal.visible} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>
                {isEditMode ? 'Edit Task' : 'Create New Task'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="task-title" className="text-sm font-medium">
                  Title
                </Label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="mt-1.5"
                  disabled={isSubmitting || isSubmittingAndStart}
                  autoFocus
                  onCommandEnter={
                    isEditMode ? handleSubmit : handleCreateAndStart
                  }
                  onCommandShiftEnter={handleSubmit}
                />
              </div>

              <div>
                <Label
                  htmlFor="task-description"
                  className="text-sm font-medium"
                >
                  Description
                </Label>
                <FileSearchTextarea
                  value={description}
                  onChange={setDescription}
                  rows={3}
                  maxRows={8}
                  placeholder="Add more details (optional). Type @ to insert tags or search files."
                  className="mt-1.5"
                  disabled={isSubmitting || isSubmittingAndStart}
                  projectId={projectId}
                  onPasteFiles={handlePasteImages}
                  onFocus={() => setIsTextareaFocused(true)}
                  onBlur={() => setIsTextareaFocused(false)}
                />
              </div>

              <ImageUploadSection
                ref={imageUploadRef}
                images={images}
                onImagesChange={handleImagesChange}
                onUpload={imagesApi.upload}
                onDelete={imagesApi.delete}
                onImageUploaded={handleImageUploaded}
                disabled={isSubmitting || isSubmittingAndStart}
                readOnly={isEditMode}
                collapsible={true}
                defaultExpanded={false}
              />

              {!isEditMode && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">
                      Relationships (optional)
                    </Label>
                    {!isAddingRelationship && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsAddingRelationship(true)}
                        disabled={isSubmitting || isSubmittingAndStart}
                        className="h-7"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Relationship
                      </Button>
                    )}
                  </div>

                  {relationshipsToCreate.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {relationshipsToCreate.map((rel, index) => (
                        <div
                          key={index}
                          className="flex items-start justify-between gap-2 p-2 rounded border bg-muted/30"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">
                              {rel.targetTask.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {rel.relationshipType}
                            </div>
                            {rel.note && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {rel.note}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => {
                              setRelationshipsToCreate((prev) =>
                                prev.filter((_, i) => i !== index)
                              );
                            }}
                            disabled={isSubmitting || isSubmittingAndStart}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {isAddingRelationship && (
                    <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                      <div className="space-y-2">
                        <Label htmlFor="relationship-type">
                          Relationship Type
                        </Label>
                        <RelationshipTypeSelect
                          value={currentRelationshipType}
                          onValueChange={setCurrentRelationshipType}
                          disabled={isSubmitting || isSubmittingAndStart}
                        />
                      </div>

                      {currentRelationshipType && projectId && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="target-task">Target Task</Label>
                            <TaskSearchAutocomplete
                              value={currentRelationshipSearchValue}
                              onChange={setCurrentRelationshipSearchValue}
                              onSelect={(task) => {
                                setCurrentRelationshipTask(task);
                                setCurrentRelationshipSearchValue(''); // Clear search after selection
                              }}
                              projectId={projectId}
                              disabled={isSubmitting || isSubmittingAndStart}
                            />
                            {currentRelationshipTask && (
                              <div className="text-xs text-muted-foreground">
                                Selected: {currentRelationshipTask.title}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="relationship-note">
                              Note (optional)
                            </Label>
                            <Textarea
                              id="relationship-note"
                              value={currentRelationshipNote}
                              onChange={(e) =>
                                setCurrentRelationshipNote(e.target.value)
                              }
                              rows={2}
                              placeholder="Add a note about this relationship..."
                              disabled={isSubmitting || isSubmittingAndStart}
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                if (
                                  currentRelationshipType &&
                                  currentRelationshipTask
                                ) {
                                  setRelationshipsToCreate((prev) => [
                                    ...prev,
                                    {
                                      relationshipType: currentRelationshipType,
                                      targetTask: currentRelationshipTask,
                                      note: currentRelationshipNote,
                                    },
                                  ]);
                                  setCurrentRelationshipType('');
                                  setCurrentRelationshipTask(null);
                                  setCurrentRelationshipNote('');
                                  setCurrentRelationshipSearchValue('');
                                  setIsAddingRelationship(false);
                                }
                              }}
                              disabled={
                                !currentRelationshipTask ||
                                isSubmitting ||
                                isSubmittingAndStart
                              }
                            >
                              Add
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setIsAddingRelationship(false);
                                setCurrentRelationshipType('');
                                setCurrentRelationshipTask(null);
                                setCurrentRelationshipNote('');
                                setCurrentRelationshipSearchValue('');
                              }}
                              disabled={isSubmitting || isSubmittingAndStart}
                            >
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isEditMode && (
                <div className="pt-2">
                  <Label htmlFor="task-status" className="text-sm font-medium">
                    Status
                  </Label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as TaskStatus)}
                    disabled={isSubmitting || isSubmittingAndStart}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="inprogress">In Progress</SelectItem>
                      <SelectItem value="inreview">In Review</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!isEditMode &&
                (() => {
                  const quickstartSection = (
                    <div className="pt-2">
                      <details
                        className="group"
                        open={quickstartExpanded}
                        onToggle={(e) =>
                          setQuickstartExpanded(
                            (e.target as HTMLDetailsElement).open
                          )
                        }
                      >
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-2">
                          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                          <Settings2 className="h-3 w-3" />
                          Quickstart
                        </summary>
                        <div className="mt-3 space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Configuration for "Create & Start" workflow
                          </p>

                          {/* Executor Profile Selector */}
                          {profiles && selectedExecutorProfile && (
                            <ExecutorProfileSelector
                              profiles={profiles}
                              selectedProfile={selectedExecutorProfile}
                              onProfileSelect={setSelectedExecutorProfile}
                              disabled={isSubmitting || isSubmittingAndStart}
                            />
                          )}

                          {/* Branch Selector */}
                          {branches.length > 0 && (
                            <div>
                              <Label
                                htmlFor="base-branch"
                                className="text-sm font-medium"
                              >
                                Branch
                              </Label>
                              <div className="mt-1.5">
                                <BranchSelector
                                  branches={branches}
                                  selectedBranch={selectedBranch}
                                  onBranchSelect={setSelectedBranch}
                                  placeholder="Select branch"
                                  className={
                                    isSubmitting || isSubmittingAndStart
                                      ? 'opacity-50 cursor-not-allowed'
                                      : ''
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>
                  );
                  return quickstartSection;
                })()}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting || isSubmittingAndStart}
                >
                  Cancel
                </Button>
                {isEditMode ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !title.trim()}
                  >
                    {isSubmitting ? 'Updating...' : 'Update Task'}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleSubmit}
                      disabled={
                        isSubmitting || isSubmittingAndStart || !title.trim()
                      }
                    >
                      {isSubmitting ? 'Creating...' : 'Create Task'}
                    </Button>
                    <Button
                      onClick={handleCreateAndStart}
                      disabled={
                        isSubmitting || isSubmittingAndStart || !title.trim()
                      }
                      className={'font-medium'}
                    >
                      {isSubmittingAndStart
                        ? 'Creating & Starting...'
                        : 'Create & Start'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Discard Warning Dialog */}
        <Dialog open={showDiscardWarning} onOpenChange={setShowDiscardWarning}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Discard unsaved changes?</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                You have unsaved changes. Are you sure you want to discard them?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDiscardWarning(false)}
              >
                Continue Editing
              </Button>
              <Button variant="destructive" onClick={handleDiscardChanges}>
                Discard Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);
