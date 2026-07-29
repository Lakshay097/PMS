import React from 'react';
import { Search } from 'lucide-react';

/**
 * Shared form primitives.
 *
 * Exports BOTH a default (FormField) and named members, because existing
 * files import it as `import FormField from '../shared/FormField'` while
 * new code uses `import { Input, Select } from '...'`.
 */

export const fieldClasses =
  'w-full rounded-md border border-token-strong bg-surface text-primary ' +
  'placeholder:text-muted px-3 py-2.5 text-sm transition-colors ' +
  'focus:border-[var(--color-primary)] focus:outline-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  /** Alias for `hint` — some call sites use helperText. */
  helperText?: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, required, hint, helperText, error, children }: FormFieldProps) {
  const hintText = hint ?? helperText;
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-primary">
        {label}
        {required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
      </label>
      {children}
      {hintText && !error && <p className="text-xs text-muted">{hintText}</p>}
      {error && <p className="text-xs text-[var(--color-danger-fg)]">{error}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${fieldClasses} ${className}`} {...props} />;
  }
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...props }, ref) {
    return (
      <select ref={ref} className={`${fieldClasses} appearance-none pr-8 ${className}`} {...props}>
        {children}
      </select>
    );
  }
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={`${fieldClasses} min-h-[120px] resize-y font-mono text-[13px] leading-relaxed ${className}`}
        {...props}
      />
    );
  }
);

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}

// Keep existing `import FormField from '...'` working.
export default FormField;