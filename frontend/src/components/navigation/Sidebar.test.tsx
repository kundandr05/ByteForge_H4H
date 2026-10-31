import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

describe('Sidebar Navigation Component', () => {
  it('renders brand header "DispatchGrid"', () => {
    render(
      <MemoryRouter>
        <Sidebar isOpen={true} />
      </MemoryRouter>
    );

    expect(screen.getByText('DispatchGrid')).toBeDefined();
    expect(screen.getByText('PRO')).toBeDefined();
  });

  it('renders core navigation items', () => {
    render(
      <MemoryRouter>
        <Sidebar isOpen={true} />
      </MemoryRouter>
    );

    expect(screen.getByText('Overview')).toBeDefined();
    expect(screen.getByText('Jobs')).toBeDefined();
    expect(screen.getByText('Technicians')).toBeDefined();
    expect(screen.getByText('Scheduling Board')).toBeDefined();
    expect(screen.getByText('Optimization Center')).toBeDefined();
    expect(screen.getByText('Disruption Simulator')).toBeDefined();
    expect(screen.getByText('Recovery History')).toBeDefined();
    expect(screen.getByText('Audit Logs')).toBeDefined();
    expect(screen.getByText('Settings & Health')).toBeDefined();
  });

  it('triggers onClose when clicking mobile backdrop', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <Sidebar isOpen={true} onClose={handleClose} />
      </MemoryRouter>
    );

    const backdrop = container.querySelector('.fixed.inset-0.z-40');
    expect(backdrop).toBeDefined();
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    }
  });
});
