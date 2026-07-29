import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
}

/**
 * Fixes vs previous version:
 * - BUG: className used `${sizeClasses}` (the whole object, which React
 *   stringified to "[object Object]") instead of `${sizeClasses[size]}`,
 *   so every modal ignored its size and relied on w-full → overflow on
 *   desktop and cramped layout on mobile. Fixed.
 * - Mobile: renders as a bottom sheet (full width, rounded top, slides up)
 *   instead of a floating card squeezed into p-4.
 * - Heights use dvh so the iOS URL bar doesn't hide the footer.
 * - Animation is a short fade+translate (no spring physics) — springs on a
 *   full-screen layer were part of the mobile jank.
 * - Escape key closes; rendered via portal so parent overflow/z-index
 *   can't clip it (removes the need for the old z-9999 !important hack).
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'var(--color-overlay)' }}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              onClick={(e) => e.stopPropagation()}
              className={`pointer-events-auto bg-surface shadow-modal w-full flex flex-col overflow-hidden
                rounded-t-2xl sm:rounded-xl
                max-h-[92dvh] sm:max-h-[85dvh]
                ${sizeClasses[size]}`}
            >
              {title && (
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-token shrink-0">
                  <h2 className="text-base sm:text-lg font-semibold text-primary truncate">
                    {title}
                  </h2>
                  {showCloseButton && (
                    <button
                      onClick={onClose}
                      className="p-2 -mr-2 rounded-md text-muted hover-surface shrink-0"
                      aria-label="Close dialog"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              )}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
}