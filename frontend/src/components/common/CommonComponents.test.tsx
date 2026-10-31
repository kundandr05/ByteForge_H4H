import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';
import { Card } from './Card';
import { EmptyState } from './EmptyState';

describe('Common UI Components', () => {
  describe('Button', () => {
    it('renders with children text and calls onClick when clicked', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Execute Dispatch</Button>);

      const btn = screen.getByRole('button', { name: /execute dispatch/i });
      expect(btn).toBeDefined();

      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('disables user interaction when disabled or isLoading', () => {
      const handleClick = vi.fn();
      render(
        <Button disabled onClick={handleClick}>
          Locked Action
        </Button>
      );

      const btn = screen.getByRole('button', { name: /locked action/i });
      expect(btn.hasAttribute('disabled')).toBe(true);

      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('renders danger variant with rose color styles', () => {
      render(<Button variant="danger">Cancel Work Order</Button>);
      const btn = screen.getByRole('button', { name: /cancel work order/i });
      expect(btn.className).toContain('bg-rose-600');
    });
  });

  describe('Card', () => {
    it('renders title, subtitle, and body content', () => {
      render(
        <Card
          title="Fleet Capacity"
          subtitle="Real-time technician utilization"
          action={<button>Refresh</button>}
        >
          <div data-testid="card-body">94.2% Active Utilization</div>
        </Card>
      );

      expect(screen.getByText('Fleet Capacity')).toBeDefined();
      expect(screen.getByText('Real-time technician utilization')).toBeDefined();
      expect(screen.getByRole('button', { name: /refresh/i })).toBeDefined();
      expect(screen.getByTestId('card-body').textContent).toBe('94.2% Active Utilization');
    });
  });

  describe('EmptyState', () => {
    it('renders title, description, and triggers action button', () => {
      const handleAction = vi.fn();
      render(
        <EmptyState
          title="No Active Disruptions"
          description="Workforce operations are operating within optimal constraint bounds."
          actionLabel="Simulate Disruption"
          onAction={handleAction}
        />
      );

      expect(screen.getByText('No Active Disruptions')).toBeDefined();
      expect(
        screen.getByText('Workforce operations are operating within optimal constraint bounds.')
      ).toBeDefined();

      const ctaBtn = screen.getByRole('button', { name: /simulate disruption/i });
      expect(ctaBtn).toBeDefined();

      fireEvent.click(ctaBtn);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });
});
