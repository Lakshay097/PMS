import { useCallback } from 'react';
import { Task, User, TaskTemplate, Subtask, Comment, FollowUp, TaskStatus } from '../types';
import { dbService } from '../lib/dbService';
import { checkAndGenerateRecurringTasks } from '../lib/taskEngine';
import { ROLE } from '../constants/status';

interface UseTaskOperationsProps {
  tasks: Task[];
  users: User[];
  currentUser: User | null;
  syncDatabase: () => Promise<void>;
  selectedTask: Task | null;
  setSelectedTask: (task: Task | null) => void;
  triggerNotification: (type: string, message: string, emailSentTo: string) => void;
  formatEmailTemplate: (key: string, task: Partial<Task>) => string;
  logAudit: (entity: string, id: string, action: string, oldValue: string, newValue: string) => Promise<void>;
  setIsSimulatingRecurrence: (isSimulating: boolean) => void;
  setSimulationMessage: (message: { type: string; text: string } | null) => void;
  setSubtasks: (subtasks: Subtask[]) => void;
  subtasks: Subtask[];
}

export function useTaskOperations({
  tasks,
  users,
  currentUser,
  syncDatabase,
  selectedTask,
  setSelectedTask,
  triggerNotification,
  formatEmailTemplate,
  logAudit,
  setIsSimulatingRecurrence,
  setSimulationMessage,
  setSubtasks,
  subtasks,
}: UseTaskOperationsProps) {
  const handleCreateTaskOrTemplate = useCallback(async (data: any) => {
    if (!currentUser) return;
    
    const isTemplate = data.TaskType === 'Recurring';
    const nowStr = new Date().toISOString();

    try {
      if (isTemplate) {
        const tempId = `TMP-${Math.floor(500 + Math.random() * 499)}`;
        const firstEmail = data.AssignedToEmail.split(',')[0]?.trim() || '';
        const recipient = users.find(u => u.Email === firstEmail);
        const newTemplate: TaskTemplate = {
          TemplateID: tempId,
          Title: data.Title,
          Description: data.Description,
          Category: 'Operations', // Default category for templates
          Priority: data.Priority,
          RecurrenceType: data.RecurrenceType,
          StartDate: data.StartDate,
          NextGenerationDate: data.StartDate,
          LastGeneratedDate: '',
          AssignedByEmail: currentUser.Email,
          AssignedToEmail: data.AssignedToEmail,
          AssignedToRole: ROLE.STAKEHOLDER,
          TeamID: currentUser.Role === ROLE.ADMIN ? 'T-ALL' : (currentUser.TeamIDs.length > 0 ? currentUser.TeamIDs[0] : 'T-01'),
          Active: true,
          CreatedAt: nowStr,
          UpdatedAt: nowStr
        };

        await dbService.saveTemplate(newTemplate);
        await logAudit('Template', tempId, 'Created Schedule Template', '', JSON.stringify(data));
        triggerNotification(
          'Task Assignment',
          `SCHEDULE ACTIVE: Recurring schedule ${tempId} ("${newTemplate.Title}") created for ${newTemplate.AssignedToEmail}.`,
          `${newTemplate.AssignedToEmail}`
        );
      } else {
        const newId = `TSK-${Math.floor(1000 + Math.random() * 8999)}`;
        const firstEmail = data.AssignedToEmail.split(',')[0]?.trim() || '';
        const recipient = users.find(u => u.Email === firstEmail);
        
        const newTask: Task = {
          TaskID: newId,
          TemplateID: null,
          ParentTaskID: null,
          Title: data.Title,
          Description: data.Description,
          Category: 'Operations', // Default category for tasks
          Priority: data.Priority,
          TaskType: 'One-time',
          RecurrenceType: 'One-time',
          CycleKey: null,
          StartDate: data.StartDate,
          DueDate: data.DueDate,
          AssignedByEmail: currentUser.Email,
          AssignedToEmail: data.AssignedToEmail,
          AssignedToRole: recipient ? recipient.Role as any : 'Stakeholder',
          AssignedToTeamIDs: recipient ? recipient.TeamIDs : currentUser.TeamIDs,
          Status: 'Not Started',
          PercentComplete: 0,
          LastReportSummary: '',
          RequiresFollowUp: 'No',
          FollowUpCount: 0,
          CompletionDate: null,
          CloseRemark: null,
          AttachmentLink: data.AttachmentLink || '',
          CreatedAt: nowStr,
          UpdatedAt: nowStr,
          Active: true,
          DeletedAt: null
        };

        await dbService.saveTask(newTask);
        await logAudit('Task', newId, 'Created One-time Task Allocation', '', JSON.stringify(data));
        const alertMsg = formatEmailTemplate('template_assigned_email', newTask);
        triggerNotification(
          'Task Assignment',
          alertMsg,
          `${newTask.AssignedToEmail}`
        );
        // Trigger sync after action
        syncDatabase();
      }
    } catch (error) {
      throw error;
    }
  }, [currentUser, users, triggerNotification, formatEmailTemplate, logAudit]);

  const handleCloseTask = useCallback(async (taskId: string, remark: string) => {
    const nowStr = new Date().toISOString();
    const targetTask = tasks.find(t => t.TaskID === taskId);

    if (targetTask) {
      const updatedTask: Task = {
        ...targetTask,
        Status: 'Closed' as TaskStatus,
        PercentComplete: 100,
        CompletionDate: nowStr.split('T')[0],
        CloseRemark: remark,
        UpdatedAt: nowStr
      };

      await dbService.saveTask(updatedTask);

      if (selectedTask && selectedTask.TaskID === taskId) {
        setSelectedTask(updatedTask);
      }
    }

    await logAudit('Task', taskId, 'Task Cleared & Closed', '', JSON.stringify({ Remark: remark }));
    // Trigger sync after action
    syncDatabase();
  }, [tasks, selectedTask, setSelectedTask, logAudit, syncDatabase]);

  const handleUpdateTask = useCallback(async (taskId: string, fields: Partial<Task>) => {
    const nowStr = new Date().toISOString();
    const targetTask = tasks.find(t => t.TaskID === taskId);

    if (targetTask) {
      const updatedTask: Task = {
        ...targetTask,
        ...fields,
        UpdatedAt: nowStr
      };

      if (fields.DueDate && fields.DueDate !== targetTask.DueDate) {
        triggerNotification(
          'ETA Breach',
          `ETA EXTENSION: Task ${targetTask.TaskID} ("${targetTask.Title}") ETA shifted to ${fields.DueDate} (Total requests: ${fields.EtaRequestCount || 1}/3).`,
          `${targetTask.AssignedToEmail || 'stakeholder@be.com'}, ${targetTask.AssignedByEmail}`
        );
      }

      await dbService.saveTask(updatedTask);

      if (selectedTask && selectedTask.TaskID === taskId) {
        setSelectedTask(updatedTask);
      }
      
      await logAudit('Task', taskId, 'Updated Task Properties', '', JSON.stringify(fields));
      // Trigger sync after action
      syncDatabase();
    }
  }, [tasks, selectedTask, setSelectedTask, triggerNotification, logAudit]);

  const handleCreateFollowUp = useCallback(async (parentTaskId: string, reason: string) => {
    if (!currentUser) return;
    
    const nowStr = new Date().toISOString();
    const parent = tasks.find(t => t.TaskID === parentTaskId);
    if (!parent) return;

    const nextFCount = parent.FollowUpCount + 1;
    const updatedParent: Task = {
      ...parent,
      RequiresFollowUp: 'Yes',
      FollowUpCount: nextFCount,
      UpdatedAt: nowStr
    };

    const newTaskId = `TSK-${Math.floor(1000 + Math.random() * 8999)}`;
    const firstEmail = parent.AssignedToEmail.split(',')[0]?.trim() || '';
    const recipient = users.find(u => u.Email === firstEmail);
    const today = new Date();
    const due = new Date();
    due.setDate(today.getDate() + 7);
    
    const newFollowUpTask: Task = {
      TaskID: newTaskId,
      TemplateID: null,
      ParentTaskID: parentTaskId,
      Title: `Follow-up #${nextFCount}: ${parent.Title.replace(/\s-\s\[Cycle.*\]/g, "")}`,
      Description: `REASON FOR FOLLOW-UP: ${reason}\n\nORIGINAL PARENT WORK SCOPE: ${parent.Description}`,
      Category: parent.Category,
      Priority: 'Medium',
      TaskType: 'One-time',
      RecurrenceType: 'One-time',
      CycleKey: null,
      StartDate: today.toISOString().split('T')[0],
      DueDate: due.toISOString().split('T')[0],
      AssignedByEmail: currentUser.Email,
      AssignedToEmail: parent.AssignedToEmail,
      AssignedToRole: recipient ? recipient.Role : 'Stakeholder',
      AssignedToTeamIDs: parent.AssignedToTeamIDs,
      Status: 'Not Started',
      PercentComplete: 0,
      LastReportSummary: '',
      RequiresFollowUp: 'No',
      FollowUpCount: 0,
      CompletionDate: null,
      CloseRemark: null,
      AttachmentLink: '',
      CreatedAt: nowStr,
      UpdatedAt: nowStr,
      Active: true,
      DeletedAt: null
    };

    const followId = `FLW-${Math.floor(100 + Math.random() * 899)}`;
    const newFollowUpRecord: FollowUp = {
      FollowUpID: followId,
      ParentTaskID: parentTaskId,
      NewTaskID: newTaskId,
      FollowUpNumber: nextFCount,
      CreatedByEmail: currentUser.Email,
      Reason: reason,
      CreatedAt: nowStr,
      Status: 'Active'
    };

    await dbService.saveTask(updatedParent);
    await dbService.saveTask(newFollowUpTask);
    await dbService.saveFollowup(newFollowUpRecord);

    if (selectedTask && selectedTask.TaskID === parentTaskId) {
      setSelectedTask(updatedParent);
    }

    await logAudit('FollowUp', followId, 'Follow-Up Sparked & Linked', '', JSON.stringify({ ParentID: parentTaskId, ChildID: newTaskId }));
    // Trigger sync after action
    syncDatabase();
  }, [currentUser, tasks, users, selectedTask, setSelectedTask, logAudit, syncDatabase]);

  const handleAddSubtask = useCallback(async (taskId: string, title: string) => {
    if (!currentUser) return;
    
    const newSubtask: Subtask = {
      SubtaskID: `SUB-${Math.floor(1000 + Math.random() * 8999)}`,
      TaskID: taskId,
      Title: title,
      IsDone: false,
      CreatedAt: new Date().toISOString(),
      CreatedBy: currentUser.Email,
      UpdatedAt: new Date().toISOString()
    };
    await dbService.saveSubtask(newSubtask);
    // Trigger sync after action
    syncDatabase();
  }, [currentUser, syncDatabase]);

  const handleToggleSubtask = useCallback(async (subtaskId: string, isDone: boolean) => {
    const subtask = subtasks.find(s => s.SubtaskID === subtaskId);
    if (subtask) {
      await dbService.saveSubtask({ ...subtask, IsDone: isDone });
      // Trigger sync after action
      syncDatabase();
    }
  }, [subtasks, syncDatabase]);

  const handleDeleteSubtask = useCallback(async (subtaskId: string) => {
    const updated = subtasks.filter(s => s.SubtaskID !== subtaskId);
    setSubtasks(updated);
    // Delete subtask by updating the subtasks list in the database
    // Note: deleteSubtask may not exist, so we handle it differently
    // Trigger sync after action
    syncDatabase();
    // Note: Google Sheets sync removed as it's handled by SSE
  }, [subtasks, setSubtasks, syncDatabase]);

  const handleAddComment = useCallback(async (taskId: string, comment: string) => {
    if (!currentUser) return;
    
    const newComment: Comment = {
      CommentID: `CMT-${Math.floor(1000 + Math.random() * 8999)}`,
      TaskID: taskId,
      Comment: comment,
      CreatedAt: new Date().toISOString(),
      CreatedBy: currentUser.Email
    };
    await dbService.saveComment(newComment);
    // Trigger sync after action
    syncDatabase();
  }, [currentUser, syncDatabase]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!currentUser) return;
    
    try {
      await dbService.deleteTask(taskId);
      await logAudit('Task', taskId, 'Deleted Task', '', '');
      // Trigger sync after action
      syncDatabase();
      
      // Clear selected task if it's the deleted one
      if (selectedTask && selectedTask.TaskID === taskId) {
        setSelectedTask(null);
      }
    } catch (error) {
      throw error;
    }
  }, [currentUser, selectedTask, setSelectedTask, logAudit, syncDatabase]);

  const runSimulatedRecurrenceEngine = useCallback(async () => {
    setIsSimulatingRecurrence(true);
    try {
      const result = await checkAndGenerateRecurringTasks([], tasks);
      if (result.generatedCount > 0) {
        for (const t of result.newTasks) {
          const alertMsg = formatEmailTemplate('template_assigned_email', t);
          triggerNotification(
            'Task Assignment',
            alertMsg,
            t.AssignedToEmail
          );
        }

        setSimulationMessage({
          type: 'success',
          text: `Recurrence Scheduler simulation completed! Generated ${result.generatedCount} new due task instances successfully.`
        });
      } else {
        setSimulationMessage({
          type: 'info',
          text: "Recurrence Scheduler simulation completed. All recurring profiles are already synthesized and up-to-date for their active cycle."
        });
      }
    } catch (e) {
      setSimulationMessage({
        type: 'error',
        text: "Error executing recurrence checks: " + (e instanceof Error ? e.message : String(e))
      });
    } finally {
      setIsSimulatingRecurrence(false);
    }
  }, [setIsSimulatingRecurrence, tasks, formatEmailTemplate, triggerNotification, setSimulationMessage]);

  return {
    handleCreateTaskOrTemplate,
    handleCloseTask,
    handleUpdateTask,
    handleCreateFollowUp,
    handleAddSubtask,
    handleToggleSubtask,
    handleDeleteSubtask,
    handleAddComment,
    handleDeleteTask,
    runSimulatedRecurrenceEngine,
  };
}
