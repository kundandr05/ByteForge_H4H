import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriorityBadge } from './PriorityBadge';
import { StatusBadge } from './StatusBadge';

describe('Frontend Badge Components', () => {
  describe('PriorityBadge', () => {
    it('renders CRITICAL priority with red accent styling', () => {
      render(<PriorityBadge priority="CRITICAL" />);
      const badge = screen.getByText('CRITICAL');
      expect(badge).toBeDefined();
      expect(badge.className).toContain('text-red-700');
    });

    it('renders HIGH priority with amber accent styling', () => {
      render(<PriorityBadge priority="HIGH" />);
      const badge = screen.getByText('HIGH');
      expect(badge).toBeDefined();
      expect(badge.className).toContain('text-amber-700');
    });

    it('renders MEDIUM priority with sky blue styling', () => {
      render(<PriorityBadge priority="MEDIUM" />);
      const badge = screen.getByText('MEDIUM');
      expect(badge).toBeDefined();
      expect(badge.className).toContain('text-sky-700');
    });

    it('renders LOW priority with slate styling', () => {
      render(<PriorityBadge priority="LOW" />);
      const badge = screen.getByText('LOW');
      expect(badge).toBeDefined();
      expect(badge.className).toContain('text-slate-600');
    });
  });

  describe('StatusBadge', () => {
    it('renders SCHEDULED status with appropriate icon and label', () => {
      render(<StatusBadge status="SCHEDULED" />);
      expect(screen.getByText('SCHEDULED')).toBeDefined();
    });

    it('renders IN_PROGRESS status with appropriate pulse indicator', () => {
      render(<StatusBadge status="IN_PROGRESS" />);
      expect(screen.getByText('IN PROGRESS')).toBeDefined();
    });

    it('renders COMPLETED status with emerald checkmark badge', () => {
      render(<StatusBadge status="COMPLETED" />);
      expect(screen.getByText('COMPLETED')).toBeDefined();
    });

    it('renders CANCELLED status', () => {
      render(<StatusBadge status="CANCELLED" />);
      expect(screen.getByText('CANCELLED')).toBeDefined();
    });

    it('renders UNASSIGNED status with warning styling', () => {
      render(<StatusBadge status="UNASSIGNED" />);
      expect(screen.getByText('UNASSIGNED')).toBeDefined();
    });
  });
});
