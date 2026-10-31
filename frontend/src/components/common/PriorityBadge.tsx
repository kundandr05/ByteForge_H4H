import React from 'react';
import { cn } from '../../utils/cn';

interface PriorityBadgeProps {
  priority: string;
  size?: 'sm' | 'md';
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = 'sm' }) => {
  const getStyle = (p: string) => {
    switch (p.toUpperCase()) {
      case 'CRITICAL':
        return 'bg-red-50 text-red-700 border-red-300 font-semibold';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border-amber-300';
      case 'MEDIUM':
        return 'bg-sky-50 text-sky-700 border-sky-300';
      case 'LOW':
        return 'bg-slate-100 text-slate-600 border-slate-300';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border tracking-wider uppercase',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        getStyle(priority)
      )}
    >
      {priority}
    </span>
  );
};
