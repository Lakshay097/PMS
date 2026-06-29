import React from 'react';

interface KPICardProps {
  label: string;
  value: string | number;
  note?: string;
  trend?: {
    value: string;
    positive: boolean;
  };
  onClick?: () => void;
}

export default function KPICard({ label, value, note, trend, onClick }: KPICardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-lg p-4 border border-[var(--color-border)] hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-xl font-semibold text-[var(--color-text-primary)] mb-1">{value}</div>
      {note && <div className="text-xs text-muted">{note}</div>}
      {trend && (
        <div className={`text-xs mt-1 ${trend.positive ? 'text-success' : 'text-danger'}`}>
          {trend.value}
        </div>
      )}
    </div>
  );
}
