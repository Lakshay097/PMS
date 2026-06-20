import { useState } from 'react';
import { Task } from '../types';

export function useAppModals() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isConfigureNotificationsModalOpen, setIsConfigureNotificationsModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [preSelectedAssignee, setPreSelectedAssignee] = useState<string | undefined>(undefined);

  return {
    selectedTask,
    setSelectedTask,
    isDrawerOpen,
    setIsDrawerOpen,
    isTaskModalOpen,
    setIsTaskModalOpen,
    isReportModalOpen,
    setIsReportModalOpen,
    isFollowUpModalOpen,
    setIsFollowUpModalOpen,
    expandedTaskId,
    setExpandedTaskId,
    isEditProfileModalOpen,
    setIsEditProfileModalOpen,
    isChangePasswordModalOpen,
    setIsChangePasswordModalOpen,
    isConfigureNotificationsModalOpen,
    setIsConfigureNotificationsModalOpen,
    isAddUserModalOpen,
    setIsAddUserModalOpen,
    isAddTeamModalOpen,
    setIsAddTeamModalOpen,
    preSelectedAssignee,
    setPreSelectedAssignee,
  };
}
