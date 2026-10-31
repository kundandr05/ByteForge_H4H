import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from './api';
import {
  jobsApi,
  techniciansApi,
  schedulingApi,
  optimizationApi,
  disruptionsApi,
  auditApi,
  explainabilityApi,
  healthApi,
} from './dispatchApi';

describe('Centralized Frontend API Client & Service Layer', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('apiClient core behavior', () => {
    it('executes successful GET request and parses JSON response', async () => {
      const mockPayload = { status: 'success', data: { id: 'job-123', customerName: 'Acme Corp' } };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      } as Response);

      const res = await apiClient<typeof mockPayload>('/jobs/job-123');
      expect(res).toEqual(mockPayload);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/jobs/job-123'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'application/json',
          }),
        })
      );
    });

    it('injects Idempotency-Key header when idempotencyKey option is provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      } as Response);

      await apiClient('/scheduling/generate', {
        method: 'POST',
        idempotencyKey: 'idemp-test-999',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/scheduling/generate'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': 'idemp-test-999',
          }),
        })
      );
    });

    it('throws ApiError with server error code and message on 400 Bad Request', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          success: false,
          message: 'Invalid service zone specified',
          code: 'VALIDATION_ERROR',
        }),
      } as Response);

      await expect(apiClient('/jobs', { method: 'POST', body: '{}' })).rejects.toThrow(
        ApiError
      );

      try {
        await apiClient('/jobs', { method: 'POST', body: '{}' });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(400);
        expect(apiErr.code).toBe('VALIDATION_ERROR');
        expect(apiErr.message).toBe('Invalid service zone specified');
      }
    });

    it('handles network / connection failure by throwing 503 SERVICE_UNAVAILABLE', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      try {
        await apiClient('/health');
        expect.fail('Should have thrown ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(503);
        expect(apiErr.code).toBe('SERVICE_UNAVAILABLE');
        expect(apiErr.message).toContain('Backend service unreachable');
      }
    });

    it('handles request abortion with 408 REQUEST_TIMEOUT', async () => {
      const controller = new AbortController();
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const domErr = new DOMException('The user aborted a request.', 'AbortError');
              reject(domErr);
            });
          }
        });
      });

      const promise = apiClient('/jobs', { signal: controller.signal, timeoutMs: 50 });
      controller.abort();

      await expect(promise).rejects.toThrow(ApiError);
    });
  });

  describe('Typed Service Methods', () => {
    it('jobsApi.list formats query parameters correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
      } as Response);

      await jobsApi.list({
        page: 2,
        limit: 15,
        priority: 'CRITICAL',
        status: 'PENDING',
        serviceZone: 'ZONE_CENTRAL',
        search: 'Hospital',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/jobs\?page=2&limit=15&search=Hospital&priority=CRITICAL&status=PENDING&serviceZone=ZONE_CENTRAL/
        ),
        expect.anything()
      );
    });

    it('techniciansApi.list handles availability and availabilityStatus', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
      } as Response);

      await techniciansApi.list({
        availabilityStatus: 'AVAILABLE',
        skill: 'ELECTRICAL',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/availability=AVAILABLE.*availabilityStatus=AVAILABLE.*skill=ELECTRICAL/),
        expect.anything()
      );
    });

    it('schedulingApi.generate triggers schedule generation with payload', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { runId: 'run-1', assignedJobs: 50 } }),
      } as Response);

      const res = await schedulingApi.generate({
        runType: 'INITIAL',
        idempotencyKey: 'idemp-sched-1',
        weights: { slaUrgency: 0.3 },
      });

      expect(res.data.runId).toBe('run-1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/scheduling/generate'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            runType: 'INITIAL',
            idempotencyKey: 'idemp-sched-1',
            weights: { slaUrgency: 0.3 },
          }),
        })
      );
    });

    it('optimizationApi.preview triggers preview without mutation', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { baselineScore: 60, optimizedScore: 65 } }),
      } as Response);

      const res = await optimizationApi.preview({ maxIterations: 20 });
      expect(res.data.baselineScore).toBe(60);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/optimization/preview'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('disruptionsApi.create registers disruption scenario', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 'dis-1', eventType: 'TECHNICIAN_UNAVAILABLE' } }),
      } as Response);

      const res = await disruptionsApi.create({
        eventType: 'TECHNICIAN_UNAVAILABLE',
        technicianId: 'tech-1',
        description: 'Illness',
      });

      expect(res.data.id).toBe('dis-1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/disruptions'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('disruptionsApi.recover triggers autonomous replanning', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { recoveryStatus: 'RESOLVED', metrics: { recoveredJobsCount: 3 } } }),
      } as Response);

      const res = await disruptionsApi.recover('dis-1', { idempotencyKey: 'recov-1' });
      expect(res.data.recoveryStatus).toBe('RESOLVED');
    });

    it('auditApi.list formats query parameters properly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [], pagination: { total: 0 } }),
      } as Response);

      await auditApi.list({ entityType: 'JOB', action: 'CREATE' });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/audit\?entityType=JOB&action=CREATE/),
        expect.anything()
      );
    });

    it('explainabilityApi.explainJob calls correct endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { job: { id: 'job-1' }, decision: { isAssigned: true } } }),
      } as Response);

      const res = await explainabilityApi.explainJob('job-1');
      expect(res.data.decision.isAssigned).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/explanations/jobs/job-1'),
        expect.anything()
      );
    });

    it('healthApi queries runtime and database diagnostics', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'UP', database: { status: 'CONNECTED' } }),
      } as Response);

      const health = await healthApi.getHealth();
      expect(health.status).toBe('UP');
    });
  });
});
