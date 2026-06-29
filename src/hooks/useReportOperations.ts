import { useCallback } from 'react';
import { Task, TaskReport } from '../types';
import { dbService } from '../lib/dbService';
import { uploadFile } from '../api/upload';

interface UseReportOperationsProps {
  tasks: Task[];
  currentUser: any;
  syncDatabase: () => Promise<void>;
  silentSync: () => Promise<void>;
  logAudit: (entity: string, id: string, action: string, oldValue: string, newValue: string) => Promise<void>;
  triggerNotification: (type: string, message: string, emailSentTo: string) => void;
  selectedTask: Task | null;
  setSelectedTask: (task: Task | null) => void;
}

export function useReportOperations({
  tasks,
  currentUser,
  syncDatabase,
  silentSync,
  logAudit,
  triggerNotification,
  selectedTask,
  setSelectedTask,
}: UseReportOperationsProps) {
  const handleSubmitProgressReport = useCallback(async (data: any) => {
    const propId = `RP-${Math.floor(1000 + Math.random() * 8999)}`;
    const nowStr = new Date().toISOString();

    // Handle file uploads to Google Drive
    const uploadedFiles = data.UploadedFiles || [];
    const uploadedFileUrls: string[] = [];

    for (const file of uploadedFiles) {
      try {
        const uploadData = await uploadFile({
          fileName: file.name,
          fileData: file.data,
          mimeType: file.type,
          taskId: data.TaskID,
          reportId: propId
        });
        uploadedFileUrls.push(uploadData.webViewLink);
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    }

    const attachmentLinks = [...uploadedFileUrls];
    if (data.AttachmentLink) {
      attachmentLinks.push(data.AttachmentLink);
    }

    const newReport: TaskReport = {
      ReportID: propId,
      TaskID: data.TaskID,
      SubmittedByEmail: currentUser.Email,
      ReportDate: nowStr.split('T')[0],
      StatusUpdate: data.StatusUpdate,
      WorkSummary: data.WorkSummary,
      PercentComplete: data.PercentComplete,
      Blockers: data.Blockers,
      NextAction: data.NextAction,
      AttachmentLink: attachmentLinks.length > 0 ? attachmentLinks.join(', ') : '',
      CreatedAt: nowStr
    };

    const targetTask = tasks.find(t => t.TaskID === data.TaskID);
    if (targetTask) {
      const updatedTask: Task = {
        ...targetTask,
        Status: data.StatusUpdate,
        PercentComplete: Number(data.PercentComplete),
        LastReportSummary: data.WorkSummary,
        AttachmentLink: data.AttachmentLink || targetTask.AttachmentLink,
        UpdatedAt: nowStr
      };

      await dbService.saveReport(newReport);
      await dbService.saveTask(updatedTask);

      triggerNotification(
        'Progress Update',
        `PROGRESS REGISTERED: Task ${targetTask.TaskID} ("${targetTask.Title}") progress report submitted. Status: "${data.StatusUpdate}".`,
        `${targetTask.AssignedByEmail}, ${targetTask.AssignedToEmail}`
      );

      if (selectedTask && selectedTask.TaskID === data.TaskID) {
        setSelectedTask(updatedTask);
      }
    }

    await logAudit('Report', propId, 'Published Progress Report', '', JSON.stringify({ TaskID: data.TaskID, Status: data.StatusUpdate }));
    // Trigger sync after action
    silentSync();
  }, [tasks, currentUser, logAudit, triggerNotification, selectedTask, setSelectedTask, silentSync]);

  return {
    handleSubmitProgressReport,
  };
}
