import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  type?: ToastType;
  duration?: number;
}

const toastConfig = {
  success: { icon: CheckCircle, color: 'text-[var(--color-success)]', bgColor: 'bg-green-50' },
  error: { icon: AlertCircle, color: 'text-[var(--color-danger)]', bgColor: 'bg-red-50' },
  warning: { icon: AlertTriangle, color: 'text-[var(--color-warning)]', bgColor: 'bg-amber-50' },
  info: { icon: Info, color: 'text-[var(--color-accent)]', bgColor: 'bg-blue-50' },
};

export default function Toast({ isOpen, onClose, message, type = 'info', duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (isOpen && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, duration, onClose]);

  const config = toastConfig[type];
  const Icon = config.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 20, x: '-50%' }}
          className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 ${config.bgColor}`}
        >
          <Icon size={18} className={config.color} />
          <span className="text-sm text-[#0f172a]">{message}</span>
          <button
            onClick={onClose}
            className="p-1 hover:bg-black/5 rounded transition-colors"
          >
            <X size={16} className="text-muted" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
