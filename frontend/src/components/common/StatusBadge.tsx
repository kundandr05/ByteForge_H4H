import React from 'react';
import { cn } from '../../utils/cn';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const getStyle = (st: string) => {
    switch (st.toUpperCase()) {
      case 'AVAILABLE':
      case 'COMPLETED':
      case 'SCHEDULED':
      case 'ASSIGNED':
      case 'RESOLVED':
      case 'SUCCESS':
      case 'SUCCESSFULLY_RECOVERED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'IN_PROGRESS':
      case 'ON_SHIFT':
      case 'PROCESSING':
      case 'PARTIALLY_RESOLVED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'PENDING':
      case 'EN_ROUTE':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'UNASSIGNED':
      case 'UNAVAILABLE':
      case 'FAILED':
      case 'OFF_DUTY':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'CANCELLED':
      case 'DISMISSED':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium tracking-wide uppercase',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        getStyle(status)
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status.replace(/_/g, ' ')}
    </span>
  );
};
