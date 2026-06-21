import { useMemo } from 'react';
import { Task, FollowUp } from '../types';
import { getVisibleTasks, getOverdueAndSoonTasks } from '../utils/taskUtils';
import { ROLE } from '../constants/status';

interface UseTaskMetricsProps {
  tasks: Task[];
  followUps: FollowUp[];
  filters: any;
  currentView: string;
  activeUser: any;
}

export function useTaskMetrics({
  tasks,
  followUps,
  filters,
  currentView,
  activeUser,
}: UseTaskMetricsProps) {
  const visibleTasks = useMemo(() => {
    return getVisibleTasks(tasks, activeUser, currentView, filters);
  }, [tasks, activeUser, currentView, filters]);

  const { overdue, soon } = useMemo(() => {
    return getOverdueAndSoonTasks(tasks, activeUser);
  }, [tasks, activeUser]);

  const metricActiveTasks = useMemo(() => {
    return (visibleTasks || []).filter(t => t.Status !== 'Closed' && t.Status !== 'Reviewed').length;
  }, [visibleTasks]);

  const metricOverdue = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return (visibleTasks || []).filter(t => {
      if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
      if (!t.DueDate) return false;
      return t.DueDate < today;
    }).length;
  }, [visibleTasks]);

  const metricDueToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return (visibleTasks || []).filter(t => {
      if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
      if (!t.DueDate) return false;
      return t.DueDate === today;
    }).length;
  }, [visibleTasks]);

  const metricCompletedThisWeek = useMemo(() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return (visibleTasks || []).filter(t => {
      if (t.Status !== 'Closed' && t.Status !== 'Reviewed') return false;
      if (!t.CompletionDate) return false;
      const completionDate = new Date(t.CompletionDate);
      return completionDate >= oneWeekAgo;
    }).length;
  }, [visibleTasks]);

  const metricFollowUps = useMemo(() => {
    return (followUps || []).filter(f => {
      if (f.Status !== 'Active' && f.Status !== 'Pending') return false;
      if (activeUser.Role === ROLE.ADMIN) return true;
      return f.CreatedByEmail === activeUser.Email;
    }).length;
  }, [followUps, activeUser]);

  return {
    visibleTasks,
    overdue,
    soon,
    metricActiveTasks,
    metricOverdue,
    metricDueToday,
    metricCompletedThisWeek,
    metricFollowUps,
  };
}
