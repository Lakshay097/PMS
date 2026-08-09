import React, { useState } from 'react';
import { Task, User as UserType } from '../../../types';
import TaskCard from './TaskCard';

interface TaskCardListProps {
  tasks: Task[];
  users?: UserType[];
  onTaskClick?: (task: Task) => void;
  emptyMessage?: string;
  initialVisible?: number;
}

/**
 * Renders a list of TaskCards with progressive reveal.
 * Shows `initialVisible` (default 10) cards, with a "Show X more"
 * button at the bottom to reveal the rest.
 */
export default function TaskCardList({
  tasks,
  users = [],
  onTaskClick,
  emptyMessage = 'No tasks found',
  initialVisible = 10,
}: TaskCardListProps) {
  const [visibleCount, setVisibleCount] = useState(initialVisible);

  // Reset visible count when the task list changes (e.g. filter applied)
  React.useEffect(() => {
    setVisibleCount(initialVisible);
  }, [tasks, initialVisible]);

  const visibleTasks = tasks.slice(0, visibleCount);
  const remaining = tasks.length - visibleCount;

  return (
    <div className="space-y-3">
      {visibleTasks.map((task) => (
        <TaskCard
          key={task.TaskID}
          task={task}
          users={users}
          onTaskClick={onTaskClick}
        />
      ))}

      {tasks.length === 0 && (
        <div className="text-center py-8 text-muted text-sm">
          {emptyMessage}
        </div>
      )}

      {remaining > 0 && (
        <button
          onClick={() => setVisibleCount(prev => prev + initialVisible)}
          className="w-full py-2.5 text-sm font-medium text-primary border border-token rounded-lg hover-surface transition-colors"
        >
          Show {remaining} more
        </button>
      )}
    </div>
  );
}

