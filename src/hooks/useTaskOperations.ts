import { useCallback } from 'react';
import { Task, User, TaskTemplate, Subtask, Comment, FollowUp, TaskStatus, SubTeam } from '../types';
import { dbService } from '../lib/dbService';
import { checkAndGenerateRecurringTasks } from '../lib/taskEngine';
import { ROLE, isAdminLevel } from '../constants/status';
import { canAssignWithinTeam } from '../utils/subTeamUtils';
import { triggerTaskAssignmentEmail, triggerTaskClosureEmail } from '../api/emailTrigger';

interface UseTaskOperationsProps {
  tasks: Task[];
  users: User[];
  currentUser: User | null;
  subTeams: SubTeam[];
  syncDatabase: () => Promise<void>;
  silentSync: () => Promise<void>;
  selectedTask: Task | null;
  setSelectedTask: (task: Task | null) => void;
  triggerNotification: (type: string, message: string, emailSentTo: string) => void;
  formatEmailTemplate: (key: string, task: Partial<Task>) => string;
  logAudit: (entity: string, id: string, action: string, oldValue: string, newValue: string) => Promise<void>;
  setIsSimulatingRecurrence: (isSimulating: boolean) => void;
  setSimulationMessage: (message: { type: "error" | "success" | "info"; text: string } | null) => void;
  setSubtasks: (subtasks: Subtask[]) => void;
  subtasks: Subtask[];
}

export function useTaskOperations({
  tasks,
  users,
  currentUser,
  subTeams,
  syncDatabase,
  silentSync,
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

    // Belt-and-suspenders check: verify assignment eligibility
    const firstEmail = data.AssignedToEmail.split(',')[0]?.trim() || '';
    const assignee = users.find(u => u.Email === firstEmail);
    if (assignee && !canAssignWithinTeam(currentUser, assignee, subTeams, users)) {
      throw new Error('Cannot assign task outside your team scope.');
    }

    try {
      if (isTemplate) {
        const tempId = `TMP-${Math.floor(500 + Math.random() * 499)}`;
        const firstEmail = data.AssignedToEmail.split(',')[0]?.trim() || '';
        const recipient = users.find(u => u.Email === firstEmail);
        const newTemplate: TaskTemplate = {
          TemplateID: tempId,
          Title: data.Title,
          Description: data.Description,
          Priority: data.Priority,
          RecurrenceType: data.RecurrenceType,
          StartDate: data.StartDate,
          NextGenerationDate: data.StartDate,
          LastGeneratedDate: '',
          AssignedByEmail: currentUser.Email,
          AssignedToEmail: data.AssignedToEmail,
          AssignedToRole: ROLE.STAKEHOLDER,
          TeamID: isAdminLevel(currentUser.Role) ? 'T-ALL' : (currentUser.TeamIDs.length > 0 ? currentUser.TeamIDs[0] : 'T-01'),
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
        
        // Use provided team IDs or fallback to recipient's team IDs
        const assignedTeamIDs = data.AssignedToTeamIDs && data.AssignedToTeamIDs.length > 0 
          ? data.AssignedToTeamIDs 
          : (recipient ? recipient.TeamIDs : currentUser.TeamIDs);
        
        const newTask: Task = {
          TaskID: newId,
          TemplateID: null,
          ParentTaskID: null,
          Title: data.Title,
          Description: data.Description,
          Priority: data.Priority,
          TaskType: 'One-time',
          RecurrenceType: 'One-time',
          CycleKey: null,
          StartDate: data.StartDate,
          DueDate: data.DueDate,
          AssignedByEmail: currentUser.Email,
          AssignedToEmail: data.AssignedToEmail,
          AssignedToRole: recipient ? recipient.Role as any : 'Stakeholder',
          AssignedToTeamIDs: assignedTeamIDs,
          Status: 'Not Started',
          PercentComplete: 0,
          LastReportSummary: '',
          RequiresFollowUp: 'No',
          FollowUpCount: 0,
          CompletionDate: null,
          CloseRemark: null,
          ClosedInSubTeamIDs: null,
          AttachmentLink: data.AttachmentLink || '',
          CreatedAt: nowStr,
          UpdatedAt: nowStr,
          Active: true,
          DeletedAt: null
        };

        await dbService.saveTask(newTask);
        await logAudit('Task', newId, 'Created One-time Task Allocation', '', JSON.stringify(data));
        
        // Trigger email notification
        try {
          await triggerTaskAssignmentEmail({
            assignerEmail: currentUser.Email,
            assignedToEmail: newTask.AssignedToEmail,
            task: {
              TaskID: newTask.TaskID,
              Title: newTask.Title,
              Description: newTask.Description,
              DueDate: newTask.DueDate,
              Priority: newTask.Priority,
            },
          });
        } catch (emailError) {
          console.error('Failed to trigger task assignment email:', emailError);
        }
        
        const alertMsg = formatEmailTemplate('template_assigned_email', newTask);
        triggerNotification(
          'Task Assignment',
          alertMsg,
          `${newTask.AssignedToEmail}`
        );
        // Optimistic update handles UI refresh automatically
      }
    } catch (error) {
      throw error;
    }
  }, [currentUser, users, subTeams, triggerNotification, formatEmailTemplate, logAudit]);

  const handleCloseTask = useCallback(async (taskId: string, remark: string, attachmentLink?: string) => {
    const nowStr = new Date().toISOString();
    const targetTask = tasks.find(t => t.TaskID === taskId);

    if (targetTask) {
      let finalAttachment = targetTask.AttachmentLink;
      if (attachmentLink) {
        finalAttachment = targetTask.AttachmentLink
          ? `${targetTask.AttachmentLink}, ${attachmentLink}`
          : attachmentLink;
      }

      // Record task-owner's SubTeamIDs at closure time (not the approver's)
      const assigneeEmails = targetTask.AssignedToEmail
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);

      const closedInSubTeamIDs = assigneeEmails.length > 0
        ? assigneeEmails.flatMap(email => {
            const assignee = users.find(u => u.Email.toLowerCase() === email.toLowerCase());
            return assignee?.SubTeamIDs || [];
          })
        : null;

      const updatedTask: Task = {
        ...targetTask,
        Status: 'Closed' as TaskStatus,
        PercentComplete: 100,
        CompletionDate: nowStr.split('T')[0],
        CloseRemark: remark,
        ClosedInSubTeamIDs: closedInSubTeamIDs,
        AttachmentLink: finalAttachment,
        UpdatedAt: nowStr
      };

      await dbService.saveTask(updatedTask);

      if (selectedTask && selectedTask.TaskID === taskId) {
        setSelectedTask(updatedTask);
      }
      try {
        await triggerTaskClosureEmail({
          closedByEmail: currentUser.Email,
          assignedToEmail: targetTask.AssignedToEmail,
          task: updatedTask,
          closeRemark: remark,
        });
      } catch (err) {
        console.error('Failed to trigger closure email:', err);
      }
    }

    await logAudit('Task', taskId, 'Task Cleared & Closed', '', JSON.stringify({ Remark: remark }));
    // Optimistic update handles UI refresh automatically
  }, [tasks, selectedTask, setSelectedTask, logAudit, currentUser, users]);

  const handleUpdateTask = useCallback(async (taskId: string, fields: Partial<Task>) => {
    if (!currentUser) return;

    // Gate assignment changes with canAssignWithinTeam check
    if (fields.AssignedToEmail !== undefined || fields.AssignedToTeamIDs !== undefined) {
      // Validate AssignedToEmail if being updated
      if (fields.AssignedToEmail !== undefined) {
        const emails = fields.AssignedToEmail
          .split(',')
          .map(e => e.trim())
          .filter(Boolean);

        const invalidAssignee = emails.find(email => {
          const assignee = users.find(u => u.Email.toLowerCase() === email.toLowerCase());
          return !assignee || !canAssignWithinTeam(currentUser, assignee, subTeams, users);
        });

        if (invalidAssignee) {
          throw new Error(`Cannot assign task to ${invalidAssignee} outside your team scope.`);
        }
      }

      // Validate AssignedToTeamIDs if being updated (independently load-bearing)
      if (fields.AssignedToTeamIDs !== undefined) {
        const assignerTeams = new Set(currentUser.TeamIDs || []);
        const invalidTeamId = fields.AssignedToTeamIDs.find(teamId => {
          // Admin can assign to any team
          if (isAdminLevel(currentUser.Role)) return false;
          // Stakeholders can assign to their own teams
          return !assignerTeams.has(teamId);
        });

        if (invalidTeamId) {
          throw new Error(`Cannot assign task to team ${invalidTeamId} outside your team scope.`);
        }
      }
    }

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
      // Optimistic update handles UI refresh automatically
    }
  }, [tasks, selectedTask, setSelectedTask, triggerNotification, logAudit, currentUser, users, subTeams]);

  const handleCreateFollowUp = useCallback(async (parentTaskId: string, reason: string) => {
    if (!currentUser) return;

    const nowStr = new Date().toISOString();
    const parent = tasks.find(t => t.TaskID === parentTaskId);
    if (!parent) return;

    const nextFCount = parent.FollowUpCount + 1;

    // Calculate new due date — 7 days from today
    const newDue = new Date();
    newDue.setDate(newDue.getDate() + 7);
    const newDueStr = `${newDue.getFullYear()}-${String(newDue.getMonth() + 1).padStart(2, '0')}-${String(newDue.getDate()).padStart(2, '0')}`;

    // Update the original task in place — reopen it
    const updatedTask: Task = {
      ...parent,
      Status: 'Reopened',
      FollowUpCount: nextFCount,
      RequiresFollowUp: 'Yes',
      FollowUpReason: reason,           // store latest follow-up reason
      CompletionDate: '',               // clear completion date
      CloseRemark: '',                  // clear close remark
      ClosedInSubTeamIDs: null,          // clear closure sub-team IDs
      DueDate: newDueStr,               // reset due date
      OriginalDueDate: parent.OriginalDueDate || parent.DueDate,
      EtaRequestCount: 0,               // reset ETA count
      LastReportSummary: '',            // clear last report
      UpdatedAt: nowStr,
    };

    await dbService.saveTask(updatedTask);

    // Still create a FollowUp record for audit trail
    const followId = `FLW-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    const newFollowUpRecord: FollowUp = {
      FollowUpID: followId,
      ParentTaskID: parentTaskId,
      NewTaskID: parentTaskId,          // same task — no new task created
      FollowUpNumber: nextFCount,
      Reason: reason,
      CreatedAt: nowStr,
      CreatedByEmail: currentUser.Email,
      Status: 'Active'
    };

    await dbService.saveFollowup(newFollowUpRecord);

    if (selectedTask && selectedTask.TaskID === parentTaskId) {
      setSelectedTask(updatedTask);
    }

    await logAudit('FollowUp', followId, 'Follow-Up Applied In Place', '', JSON.stringify({
      TaskID: parentTaskId,
      FollowUpNumber: nextFCount,
      Reason: reason,
    }));
    // Optimistic update handles UI refresh automatically
  }, [tasks, currentUser, selectedTask, setSelectedTask, logAudit]);

  const handleAddSubtask = useCallback(async (taskId: string, data: { title: string; assignedTo?: string; dueDate?: string }) => {
    if (!currentUser) return;
    
    const newSubtask: Subtask = {
      SubtaskID: `SUB-${Math.floor(1000 + Math.random() * 8999)}`,
      TaskID: taskId,
      Title: data.title,
      AssignedTo: data.assignedTo,
      DueDate: data.dueDate,
      CreatedBy: currentUser.Email,
      LastReportSummary: '',
      Completed: false,
      CreatedAt: new Date().toISOString()
    };
    await dbService.saveSubtask(newSubtask);
    // Optimistic update handles UI refresh automatically
  }, [currentUser]);

  const handleToggleSubtask = useCallback(async (subtaskId: string, isDone: boolean) => {
    const subtask = subtasks.find(s => s.SubtaskID === subtaskId);
    if (subtask) {
      await dbService.saveSubtask({ ...subtask, Completed: isDone });
      // Optimistic update handles UI refresh automatically
    }
  }, [subtasks]);

  const handleDeleteSubtask = useCallback(async (subtaskId: string) => {
    const updated = subtasks.filter(s => s.SubtaskID !== subtaskId);
    setSubtasks(updated);
    // Optimistic update handles UI refresh automatically
  }, [subtasks, setSubtasks]);

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
    // Optimistic update handles UI refresh automatically
  }, [currentUser]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!currentUser) return;
    
    try {
      await dbService.deleteTask(taskId);
      await logAudit('Task', taskId, 'Deleted Task', '', '');
      // Optimistic update handles UI refresh automatically
      
      // Clear selected task if it's the deleted one
      if (selectedTask && selectedTask.TaskID === taskId) {
        setSelectedTask(null);
      }
    } catch (error) {
      throw error;
    }
  }, [currentUser, selectedTask, setSelectedTask, logAudit]);

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
