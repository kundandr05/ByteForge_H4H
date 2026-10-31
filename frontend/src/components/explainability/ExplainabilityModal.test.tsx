import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ExplainabilityModal } from './ExplainabilityModal';
import { explainabilityApi } from '../../services/dispatchApi';

describe('ExplainabilityModal Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state when fetching decision rationale', async () => {
    vi.spyOn(explainabilityApi, 'explainJob').mockImplementation(
      () => new Promise(() => {}) // Pending promise
    );

    render(
      <ExplainabilityModal
        jobId="job-uuid-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Intelligent Dispatch Explainability')).toBeDefined();
    expect(
      screen.getByText(/Evaluating multi-objective constraint scorecard & alternatives/i)
    ).toBeDefined();
  });

  it('renders error message when API call fails', async () => {
    vi.spyOn(explainabilityApi, 'explainJob').mockRejectedValue(
      new Error('Failed to reach explainability service')
    );

    render(
      <ExplainabilityModal
        jobId="job-uuid-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to reach explainability service')).toBeDefined();
    });
  });

  it('renders complete decision explanation when API returns success', async () => {
    const mockExplanation: any = {
      jobId: 'job-uuid-12345678',
      job: {
        customerName: 'St. Jude Children Hospital',
        description: 'Primary oxygen flow manifold electrical sensor failure',
        priority: 'CRITICAL',
        status: 'ASSIGNED',
        serviceZone: 'ZONE_CENTRAL',
        estimatedDuration: 90,
        slaDeadline: '2026-11-02T16:00:00.000Z',
      },
      decision: {
        isAssigned: true,
        selectedTechnician: {
          id: 'tech-alpha-123',
          name: 'Elena Rostova',
        },
        selectionRationale: 'Selected Elena Rostova due to optimal skill match and shortest travel buffer.',
        explanation: 'Selected Elena Rostova due to optimal skill match and shortest travel buffer.',
        scores: {
          assignmentScore: 94.8,
          slaUrgencyScore: 95,
          travelScore: 92,
          priorityScore: 90,
          workloadScore: 88,
        },
        constraintsEvaluated: [
          { constraint: 'SKILL_MATCH', passed: true, details: 'All required skills matched' },
          { constraint: 'SERVICE_ZONE', passed: true, details: 'Inside ZONE_CENTRAL' },
          { constraint: 'SHIFT_HOURS', passed: true, details: 'Finishes 2 hrs before shift end' },
        ],
        failureDetails: {
          candidatesEvaluated: [
            {
              technicianName: 'Bob Miller',
              eligible: false,
              rejectionReason: 'Lacks required ELECTRICAL certification',
            },
          ],
        },
      },
    };

    vi.spyOn(explainabilityApi, 'explainJob').mockResolvedValue({
      status: 'success',
      data: mockExplanation,
    } as any);

    render(
      <ExplainabilityModal
        jobId="job-uuid-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('St. Jude Children Hospital')).toBeDefined();
    });

    expect(screen.getByText('Assigned to Elena Rostova')).toBeDefined();
    expect(screen.getByText(/Selected Elena Rostova due to optimal skill match/i)).toBeDefined();
    expect(screen.getByText('SKILL MATCH')).toBeDefined();
    expect(screen.getByText('SERVICE ZONE')).toBeDefined();
    expect(screen.getByText('Bob Miller')).toBeDefined();
    expect(screen.getByText(/Lacks required ELECTRICAL certification/i)).toBeDefined();
  });
});
