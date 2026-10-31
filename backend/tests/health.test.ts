import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('Health Endpoints', () => {
  it('GET /api/health should verify Express runtime is operational', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.service).toBe('dispatchgrid-backend');
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.data.system).toBeDefined();
    expect(res.body.data.system.nodeVersion).toBeDefined();
  });

  it('GET /api/health/database should verify database connectivity and table statistics', async () => {
    const res = await request(app).get('/api/health/database');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Database connection verified');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('connected');
    expect(res.body.data.provider).toBe('sqlite');
    expect(res.body.data.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.body.data.tableCounts).toBeDefined();
    expect(typeof res.body.data.tableCounts.technicians).toBe('number');
    expect(typeof res.body.data.tableCounts.jobs).toBe('number');
    expect(typeof res.body.data.tableCounts.assignments).toBe('number');
    expect(typeof res.body.data.tableCounts.schedulingRuns).toBe('number');
  });

  it('GET /api/non-existent-route should return 404 in standard error format', async () => {
    const res = await request(app).get('/api/non-existent-route');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.statusCode).toBe(404);
  });
});
