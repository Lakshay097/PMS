import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  position?: 'left' | 'right';
}

/**
 * Fixes vs previous version:
 * - BUG: `md:${sizeClasses[size]}` builds class names at runtime
 *   ("md:w-[560px]") that Tailwind's JIT never sees in source, so they are
 *   never generated → the drawer had NO width constraint on desktop and
 *   fell back to w-screen. Class strings are now complete literals.
 * - BUG: `${position}-0` had the same problem ("right-0" built at runtime).
 * - Mobile: full width with dvh height; content scrolls, header pinned.
 * - Spring animation replaced with a short tween (mobile jank fix).
 * - Escape closes; overlay uses theme overlay token.
 */
export default function Drawer({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  position = 'right',
}: DrawerProps) {
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

  // Full literal strings so Tailwind JIT generates them.
  const sizeClasses: Record<NonNullable<DrawerProps['size']>, string> = {
    sm: 'sm:w-[480px]',
    md: 'sm:w-[560px]',
    lg: 'sm:w-[640px]',
  };
  const positionClasses = position === 'right' ? 'right-0' : 'left-0';

  const drawerContent = (
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
          <motion.div
            initial={{ x: position === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: position === 'right' ? '100%' : '-100%' }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`fixed top-0 ${positionClasses} h-dvh z-50 bg-surface shadow-modal
              w-full sm:max-w-[92vw] ${sizeClasses[size]} will-change-transform`}
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-token shrink-0">
                <h2 className="text-base sm:text-lg font-semibold text-primary truncate">
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 -mr-2 rounded-md text-muted hover-surface shrink-0"
                  aria-label="Close panel"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(drawerContent, document.body);
  }
  return drawerContent;
}