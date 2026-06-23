import React from 'react';
import { Trash2 } from 'lucide-react';
import { Task, User as UserType } from '../../../types';
import { ROLE } from '../../../constants/status';

interface TaskListProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  isDarkMode: boolean;
  getPriorityColor: (priority: string) => string;
  getStatusColor: (status: string) => string;
  emptyMessage?: string;
  currentUser?: UserType;
  taskSubView?: 'my-tasks' | 'team-tasks';
  onDeleteTask?: (taskId: string) => void;
}

export default function TaskList({
  tasks,
  onTaskClick,
  isDarkMode,
  getPriorityColor,
  getStatusColor,
  emptyMessage = 'No tasks found',
  currentUser,
  taskSubView = 'my-tasks',
  onDeleteTask,
}: TaskListProps) {
  return (
    <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
      <div className={`divide-y ${isDarkMode ? 'divide-[#1E293B]' : 'divide-slate-200'}`}>
        {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
        {tasks.map((task) => {
          const taskIsSubStakeholder = currentUser && currentUser.Role === 'Stakeholder' && taskSubView === 'team-tasks' && 
            !task.AssignedToEmail?.toLowerCase().includes(currentUser.Email.toLowerCase()) &&
            !task.AssignedByEmail?.toLowerCase().includes(currentUser.Email.toLowerCase());
          
          return (
            <div
              key={task.TaskID}
              onClick={(e) => { e.preventDefault(); !taskIsSubStakeholder && onTaskClick(task); }}
              className={`p-6 transition-colors ${!taskIsSubStakeholder ? 'cursor-pointer' : 'cursor-default'} ${isDarkMode ? 'hover:bg-[#1E293B]/30' : 'hover:bg-slate-50'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`text-xs font-bold px-2 py-1 rounded border ${getPriorityColor(task.Priority)}`}>
                      {task.Priority}
                    </span>
                    <span className={`text-xs font-bold px-2 py-1 rounded border ${getStatusColor(task.Status)}`}>
                      {task.Status}
                    </span>
                    {taskIsSubStakeholder && (
                      <span className="text-xs font-bold px-2 py-1 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">
                        Sub-stakeholder Task
                      </span>
                    )}
                  </div>
                  {!taskIsSubStakeholder ? (
                    <>
                      <h4 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{task.Title}</h4>
                      <div className={`flex items-center space-x-4 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        <span>Due: {task.DueDate}</span>
                        <span>Assigned to: {task.AssignedToEmail.split('@')[0]}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <h4 className={`font-medium mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{task.Title}</h4>
                      <div className={`flex items-center space-x-4 text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        <span>Due: {task.DueDate}</span>
                        <span>Assigned to: {task.AssignedToEmail.split('@')[0]}</span>
                        <span className="text-xs italic">(Status only view)</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center space-x-3">
                  {currentUser?.Role === ROLE.ADMIN && onDeleteTask && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete task ${task.TaskID}?`)) {
                          onDeleteTask(task.TaskID);
                        }
                      }}
                      className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300' : 'hover:bg-red-50 text-red-500 hover:text-red-600'}`}
                      title="Delete task"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <div className="text-right">
                    <p className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{task.TaskID}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
