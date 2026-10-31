import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/prisma';

describe('Automated Allocation, Live Cascade & Technician Features', () => {
  let nearestTech: any;
  let secondNearestTech: any;
  let testJob: any;

  beforeAll(async () => {
    await prisma.$connect();

    // Create 2 test technicians in Zone North with HVAC skill at known distances
    // Origin job will be at lat: 37.7749, lon: -122.4194 (San Francisco)
    // Nearest tech at lat: 37.7760, lon: -122.4180 (~0.18 km away)
    // Second nearest tech at lat: 37.7900, lon: -122.4000 (~2.3 km away)
    nearestTech = await prisma.technician.create({
      data: {
        name: 'Alex Rivera (Nearest HVAC)',
        email: `alex.rivera.${Date.now()}@example.com`,
        phone: '+1-555-0199',
        skills: JSON.stringify(['HVAC', 'ELECTRICAL']),
        serviceZones: JSON.stringify(['ZONE_NORTH']),
        latitude: 37.7760,
        longitude: -122.4180,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      },
    });

    secondNearestTech = await prisma.technician.create({
      data: {
        name: 'Jordan Lee (Second Nearest HVAC)',
        email: `jordan.lee.${Date.now()}@example.com`,
        phone: '+1-555-0299',
        skills: JSON.stringify(['HVAC']),
        serviceZones: JSON.stringify(['ZONE_NORTH']),
        latitude: 37.7900,
        longitude: -122.4000,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        availabilityStatus: 'AVAILABLE',
      },
    });

    // Create a pending job requiring HVAC
    testJob = await prisma.job.create({
      data: {
        customerName: 'Marcus Bennett',
        description: 'AC Cooling Coil Leaking Water in Server Room',
        requiredSkills: JSON.stringify(['HVAC']),
        priority: 'HIGH',
        estimatedDuration: 45,
        latitude: 37.7749,
        longitude: -122.4194,
        serviceZone: 'ZONE_NORTH',
        earliestStart: new Date(),
        latestEnd: new Date(Date.now() + 86400000),
        slaDeadline: new Date(Date.now() + 86400000),
        status: 'PENDING',
      },
    });
  });

  describe('Technician Discover, Earnings & Online Status', () => {
    it('GET /api/dispatch/technicians/discover returns company offers and bonuses', async () => {
      const res = await request(app).get('/api/dispatch/technicians/discover');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.announcements.length).toBeGreaterThan(0);
      expect(res.body.data.announcements[0].title).toBeDefined();
      expect(res.body.data.companyPerks.length).toBeGreaterThan(0);
      expect(res.body.data.highDemandZones.length).toBeGreaterThan(0);
    });

    it('PATCH /api/dispatch/technicians/:id/online-status toggles status to offline and back to online', async () => {
      // Toggle to offline
      const offRes = await request(app)
        .patch(`/api/dispatch/technicians/${nearestTech.id}/online-status`)
        .send({ isOnline: false });

      expect(offRes.status).toBe(200);
      expect(offRes.body.data.isOnline).toBe(false);
      expect(offRes.body.data.availabilityStatus).toBe('OFF_DUTY');

      // Toggle back to online
      const onRes = await request(app)
        .patch(`/api/dispatch/technicians/${nearestTech.id}/online-status`)
        .send({ isOnline: true });

      expect(onRes.status).toBe(200);
      expect(onRes.body.data.isOnline).toBe(true);
      expect(onRes.body.data.availabilityStatus).toBe('AVAILABLE');
    });

    it('GET /api/dispatch/technicians/:id/earnings returns working hours and revenue breakdown', async () => {
      const res = await request(app).get(`/api/dispatch/technicians/${nearestTech.id}/earnings`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.grossEarnings).toBeGreaterThan(0);
      expect(res.body.data.totalHoursWorked).toBeDefined();
      expect(res.body.data.hourlyEffectiveRate).toBeGreaterThan(0);
    });
  });

  describe('Automated Allocation & Live Rejection Cascading', () => {
    it('POST /api/dispatch/auto-allocate/:jobId dispatches first to nearest technician', async () => {
      const res = await request(app).post(`/api/dispatch/auto-allocate/${testJob.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OFFERED');
      // Nearest candidate must be Alex Rivera
      expect(res.body.data.currentOffer.technicianId).toBe(nearestTech.id);
      expect(res.body.data.candidates[0].rank).toBe(1);
    });

    it('GET /api/dispatch/technician/:id/active-offer returns active offer for nearest technician', async () => {
      // Nearest tech checks their active offer
      const res = await request(app).get(`/api/dispatch/technician/${nearestTech.id}/active-offer`);

      expect(res.status).toBe(200);
      expect(res.body.data.offer).toBeDefined();
      expect(res.body.data.offer.job.id).toBe(testJob.id);
      expect(res.body.data.offer.technicianId).toBe(nearestTech.id);
      expect(res.body.data.offer.estimatedPayout).toBeGreaterThan(0);

      // Second nearest tech should NOT have an active offer yet
      const secondRes = await request(app).get(`/api/dispatch/technician/${secondNearestTech.id}/active-offer`);
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.offer).toBeNull();
    });

    it('POST /api/dispatch/offers/:jobId/reject cascades offer to second closest technician', async () => {
      // Nearest tech rejects the offer
      const rejectRes = await request(app)
        .post(`/api/dispatch/offers/${testJob.id}/reject`)
        .send({
          technicianId: nearestTech.id,
          reason: 'Currently attending high-priority emergency off-site',
        });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('CASCADED_TO_NEXT');
      expect(rejectRes.body.data.nextCandidate.technicianId).toBe(secondNearestTech.id);

      // Now second nearest tech receives the active offer
      const secondOfferRes = await request(app).get(`/api/dispatch/technician/${secondNearestTech.id}/active-offer`);
      expect(secondOfferRes.status).toBe(200);
      expect(secondOfferRes.body.data.offer).toBeDefined();
      expect(secondOfferRes.body.data.offer.technicianId).toBe(secondNearestTech.id);
      expect(secondOfferRes.body.data.offer.job.id).toBe(testJob.id);

      // First tech no longer has active offer
      const firstOfferRes = await request(app).get(`/api/dispatch/technician/${nearestTech.id}/active-offer`);
      expect(firstOfferRes.body.data.offer).toBeNull();
    });

    it('POST /api/dispatch/offers/:jobId/accept accepts and assigns job to second technician', async () => {
      const acceptRes = await request(app)
        .post(`/api/dispatch/offers/${testJob.id}/accept`)
        .send({
          technicianId: secondNearestTech.id,
        });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.success).toBe(true);
      expect(acceptRes.body.data.assignment).toBeDefined();
      expect(acceptRes.body.data.assignment.technicianId).toBe(secondNearestTech.id);

      // Verify database state: Job is now ASSIGNED
      const updatedJob = await prisma.job.findUnique({
        where: { id: testJob.id },
      });
      expect(updatedJob?.status).toBe('ASSIGNED');
    });

    it('POST /api/dispatch/auto-schedule-all schedules unassigned jobs onto timeline', async () => {
      // Create test unassigned job
      const extraJob = await prisma.job.create({
        data: {
          customerName: 'Elena Rostova',
          description: 'Emergency HVAC compressor fault in server room',
          requiredSkills: JSON.stringify(['HVAC']),
          priority: 'CRITICAL',
          estimatedDuration: 45,
          latitude: 37.7750,
          longitude: -122.4190,
          serviceZone: 'ZONE_NORTH',
          earliestStart: new Date(),
          latestEnd: new Date(Date.now() + 86400000),
          slaDeadline: new Date(Date.now() + 86400000),
          status: 'UNASSIGNED',
        },
      });

      const res = await request(app)
        .post('/api/dispatch/auto-schedule-all')
        .send({ referenceDate: '2026-11-02' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const scheduledJob = await prisma.job.findUnique({
        where: { id: extraJob.id },
      });
      expect(scheduledJob?.status).toBe('ASSIGNED');

      // Re-create an unassigned job so other suites that look for unassigned jobs will find one
      await prisma.job.create({
        data: {
          customerName: 'Unassigned Test Case',
          description: 'Job awaiting future dispatch',
          requiredSkills: JSON.stringify(['HVAC']),
          priority: 'LOW',
          estimatedDuration: 45,
          latitude: 37.7750,
          longitude: -122.4190,
          serviceZone: 'ZONE_NORTH',
          earliestStart: new Date(),
          latestEnd: new Date(Date.now() + 86400000),
          slaDeadline: new Date(Date.now() + 86400000),
          status: 'UNASSIGNED',
        },
      });
    });

    it('POST /api/dispatch/simulate/:jobId allows admin to simulate live specialist decline and accept', async () => {
      const demoJob = await prisma.job.create({
        data: {
          customerName: 'Demo Client',
          description: 'Emergency Electrical Breaker Sparking',
          requiredSkills: JSON.stringify(['ELECTRICAL']),
          priority: 'CRITICAL',
          estimatedDuration: 30,
          latitude: 37.7760,
          longitude: -122.4180,
          serviceZone: 'ZONE_NORTH',
          earliestStart: new Date(),
          latestEnd: new Date(Date.now() + 86400000),
          slaDeadline: new Date(Date.now() + 86400000),
          status: 'PENDING',
        },
      });

      // Start allocation
      await request(app).post(`/api/dispatch/auto-allocate/${demoJob.id}`);

      // Simulate reject
      const rejectSim = await request(app)
        .post(`/api/dispatch/simulate/${demoJob.id}`)
        .send({ action: 'REJECT', reason: 'Engaged with existing work order' });

      expect(rejectSim.status).toBe(200);

      // Simulate accept
      const acceptSim = await request(app)
        .post(`/api/dispatch/simulate/${demoJob.id}`)
        .send({ action: 'ACCEPT' });

      expect(acceptSim.status).toBe(200);
      expect(acceptSim.body.success).toBe(true);

      const verifiedJob = await prisma.job.findUnique({
        where: { id: demoJob.id },
      });
      expect(verifiedJob?.status).toBe('ASSIGNED');
    });
  });
});
