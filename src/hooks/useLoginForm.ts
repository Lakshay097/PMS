import { useState, FormEvent } from 'react';

interface UseLoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function useLoginForm({ onSubmit }: UseLoginFormProps) {
  const [fields, setFields] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

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

    if (!fields.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!fields.password) {
      newErrors.password = 'Password is required';
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
      await onSubmit(fields.email.trim().toLowerCase(), fields.password);
      return true;
    } catch (error: any) {
      console.error('Error submitting login:', error);
      setErrors({ submit: error.message || 'Login failed. Please try again.' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setFields({
      email: '',
      password: '',
    });
    setErrors({});
    setServerError(null);
  };

  return {
    fields,
    errors,
    handleChange,
    handleSubmit,
    isSubmitting,
    serverError,
    reset,
  };
}
