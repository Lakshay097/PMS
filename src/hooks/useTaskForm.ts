import { useState } from 'react';
import { Task } from '../types';

interface UseTaskFormProps {
  initialTask?: Task;
  onSubmit: (taskData: Partial<Task>) => Promise<void>;
}

export function useTaskForm({ initialTask, onSubmit }: UseTaskFormProps) {
  const [fields, setFields] = useState({
    title: initialTask?.Title || '',
    description: initialTask?.Description || '',
    priority: initialTask?.Priority || 'Medium',
    status: initialTask?.Status || 'Not Started',
    assignee: initialTask?.AssignedToEmail || '',
    dueDate: initialTask?.DueDate || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFields(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fields.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!fields.dueDate) {
      newErrors.dueDate = 'Due date is required';
    } else {
      const dueDate = new Date(fields.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dueDate < today) {
        newErrors.dueDate = 'Due date must be in the future';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: any) => {
    if (e) {
      e.preventDefault();
    }

    if (!validate()) {
      return false;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        Title: fields.title,
        Description: fields.description,
        Priority: fields.priority as 'Low' | 'Medium' | 'High' | 'Critical',
        Status: fields.status as 'Not Started' | 'In Progress' | 'Submitted' | 'Reviewed' | 'Closed' | 'Reopened' | 'Overdue',
        AssignedToEmail: fields.assignee,
        DueDate: fields.dueDate,
      });
      return true;
    } catch (error) {
      console.error('Error submitting task:', error);
      setErrors({ submit: 'Failed to submit task. Please try again.' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setFields({
      title: initialTask?.Title || '',
      description: initialTask?.Description || '',
      priority: initialTask?.Priority || 'Medium',
      status: initialTask?.Status || 'Not Started',
      assignee: initialTask?.AssignedToEmail || '',
      dueDate: initialTask?.DueDate || '',
    });
    setErrors({});
  };

  return {
    fields,
    errors,
    handleChange,
    handleSubmit,
    isSubmitting,
    reset,
  };
}
