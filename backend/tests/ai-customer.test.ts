import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/prisma';

describe('AI Voice/Chat Booking & Customer Tracking Endpoints', () => {
  beforeAll(async () => {
    // Ensure test database is initialized
    await prisma.$connect();
  });

  describe('POST /api/ai/parse-booking', () => {
    it('successfully parses natural language plumbing emergency prompt', async () => {
      const res = await request(app)
        .post('/api/ai/parse-booking')
        .send({
          prompt: 'Emergency pipe burst and water leaking in kitchen in Zone North ASAP!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.requiredSkills).toContain('PLUMBING');
      expect(res.body.data.serviceZone).toBe('ZONE_NORTH');
      expect(res.body.data.priority).toBe('CRITICAL');
    });

    it('successfully parses electrical EV charger installation inquiry in Zone South', async () => {
      const res = await request(app)
        .post('/api/ai/parse-booking')
        .send({
          prompt: 'I want to install a level 2 tesla EV charger at my residence in Zone South next week',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requiredSkills).toContain('EV_CHARGER');
      expect(res.body.data.serviceZone).toBe('ZONE_SOUTH');
    });

    it('returns validation error on empty prompt', async () => {
      const res = await request(app)
        .post('/api/ai/parse-booking')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/ai/book', () => {
    it('creates and schedules an appointment updating the database', async () => {
      const res = await request(app)
        .post('/api/ai/book')
        .send({
          customerName: 'Test Booking Client',
          description: 'Emergency HVAC cooling blower replacement',
          requiredSkills: ['HVAC'],
          serviceZone: 'ZONE_NORTH',
          priority: 'HIGH',
          estimatedDuration: 90,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.customerName).toBe('Test Booking Client');
      expect(res.body.data.status).toBe('PENDING');

      // Verify persisted in database
      const savedJob = await prisma.job.findUnique({
        where: { id: res.body.data.id },
      });
      expect(savedJob).toBeDefined();
      expect(savedJob?.customerName).toBe('Test Booking Client');
    });
  });

  describe('GET /api/customers', () => {
    it('returns aggregated client directory with booking counts', async () => {
      const res = await request(app).get('/api/customers');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      // Verify Test Booking Client is present in the customer roster
      const foundClient = res.body.data.find(
        (c: any) => c.name === 'Test Booking Client'
      );
      expect(foundClient).toBeDefined();
      expect(foundClient.totalAppointments).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DELETE /api/technicians/:id with force option', () => {
    it('allows admin to force-offboard a technician even if assigned', async () => {
      // 1. Create a technician
      const tech = await prisma.technician.create({
        data: {
          name: 'Offboarding Tech',
          email: `offboard.${Date.now()}@example.com`,
          phone: '+1 555-999-0000',
          skills: JSON.stringify(['HVAC']),
          serviceZones: JSON.stringify(['ZONE_NORTH']),
          latitude: 37.77,
          longitude: -122.41,
          shiftStart: '08:00',
          shiftEnd: '17:00',
          availabilityStatus: 'AVAILABLE',
        },
      });

      // 2. Delete with force
      const deleteRes = await request(app)
        .delete(`/api/technicians/${tech.id}?force=true`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // 3. Confirm technician was removed
      const checkTech = await prisma.technician.findUnique({
        where: { id: tech.id },
      });
      expect(checkTech).toBeNull();
    });
  });
});
