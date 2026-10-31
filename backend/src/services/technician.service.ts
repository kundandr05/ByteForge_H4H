import { prisma } from '../config/prisma';
import { AppError } from '../utils/appError';
import {
  technicianCreateSchema,
  technicianUpdateSchema,
  TechnicianAvailabilityStatus,
} from '../validators/schemas';
import { TechnicianListQuery, PaginationMeta } from '../types';
import { z } from 'zod';

export interface FormattedTechnician {
  id: string;
  name: string;
  email: string;
  phone: string;
  skills: string[];
  serviceZones: string[];
  latitude: number;
  longitude: number;
  shiftStart: string;
  shiftEnd: string;
  availabilityStatus: string;
  createdAt: Date;
  updatedAt: Date;
  assignments?: unknown[];
  unavailabilities?: unknown[];
}

export class TechnicianService {
  /**
   * Helper to format Prisma technician record into typed structure with parsed JSON fields
   */
  public formatTechnician(tech: any): FormattedTechnician {
    let parsedSkills: string[] = [];
    let parsedZones: string[] = [];

    try {
      parsedSkills = typeof tech.skills === 'string' ? JSON.parse(tech.skills) : tech.skills || [];
    } catch {
      parsedSkills = [];
    }

    try {
      parsedZones = typeof tech.serviceZones === 'string' ? JSON.parse(tech.serviceZones) : tech.serviceZones || [];
    } catch {
      parsedZones = [];
    }

    return {
      ...tech,
      skills: parsedSkills,
      serviceZones: parsedZones,
    };
  }

  /**
   * Creates a new Technician with unique email check and transactional audit logging.
   */
  public async createTechnician(input: z.infer<typeof technicianCreateSchema>): Promise<FormattedTechnician> {
    const validated = technicianCreateSchema.parse(input);

    // Duplicate email check
    const existing = await prisma.technician.findUnique({
      where: { email: validated.email },
    });
    if (existing) {
      throw AppError.conflict(
        `Technician with email '${validated.email}' already exists.`,
        'DUPLICATE_EMAIL'
      );
    }

    return await prisma.$transaction(async (tx) => {
      const technician = await tx.technician.create({
        data: {
          name: validated.name,
          email: validated.email,
          phone: validated.phone,
          skills: JSON.stringify(validated.skills),
          serviceZones: JSON.stringify(validated.serviceZones),
          latitude: validated.latitude,
          longitude: validated.longitude,
          shiftStart: validated.shiftStart,
          shiftEnd: validated.shiftEnd,
          availabilityStatus: validated.availabilityStatus || 'AVAILABLE',
        },
      });

      // Transactional Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'TECHNICIAN',
          entityId: technician.id,
          action: 'CREATE',
          newValue: JSON.stringify(technician),
          description: `Created technician ${technician.name} (${technician.email})`,
        },
      });

      return this.formatTechnician(technician);
    });
  }

  /**
   * Retrieves paginated technicians with filtering, skill search, and sorting.
   */
  public async getTechnicians(query: TechnicianListQuery): Promise<{ technicians: FormattedTechnician[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(500, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Search by technician name
    if (query.search) {
      where.name = { contains: query.search };
    }

    // Filter by availability status
    if (query.availability) {
      where.availabilityStatus = query.availability;
    }

    // Filter by skill (JSON string contains)
    if (query.skill) {
      where.skills = { contains: query.skill };
    }

    // Filter by service zone (JSON string contains)
    if (query.serviceZone) {
      where.serviceZones = { contains: query.serviceZone };
    }

    // Sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const orderBy: any = { [sortBy]: sortOrder };

    const [total, rawTechs] = await Promise.all([
      prisma.technician.count({ where }),
      prisma.technician.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const technicians = rawTechs.map((t) => this.formatTechnician(t));

    return {
      technicians,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Retrieves a single technician by UUID with related assignments and unavailability windows.
   */
  public async getTechnicianById(id: string): Promise<FormattedTechnician> {
    const tech = await prisma.technician.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            job: {
              select: {
                id: true,
                customerName: true,
                priority: true,
                serviceZone: true,
                status: true,
              },
            },
          },
        },
        unavailabilities: true,
      },
    });

    if (!tech) {
      throw AppError.notFound(`Technician with ID '${id}' not found.`, 'TECHNICIAN_NOT_FOUND');
    }

    return this.formatTechnician(tech);
  }

  /**
   * Updates technician details with email uniqueness check and audit logging.
   */
  public async updateTechnician(id: string, input: z.infer<typeof technicianUpdateSchema>): Promise<FormattedTechnician> {
    const validated = technicianUpdateSchema.parse(input);

    const existingTech = await prisma.technician.findUnique({ where: { id } });
    if (!existingTech) {
      throw AppError.notFound(`Technician with ID '${id}' not found.`, 'TECHNICIAN_NOT_FOUND');
    }

    // Duplicate email check if email is being updated
    if (validated.email && validated.email !== existingTech.email) {
      const emailConflict = await prisma.technician.findUnique({
        where: { email: validated.email },
      });
      if (emailConflict) {
        throw AppError.conflict(
          `Technician with email '${validated.email}' already exists.`,
          'DUPLICATE_EMAIL'
        );
      }
    }

    // Shift start/end validation if either or both are being modified
    const effectiveStart = validated.shiftStart || existingTech.shiftStart;
    const effectiveEnd = validated.shiftEnd || existingTech.shiftEnd;
    if (effectiveStart === effectiveEnd) {
      throw AppError.badRequest('shiftStart and shiftEnd cannot be identical.', 'VALIDATION_ERROR');
    }

    return await prisma.$transaction(async (tx) => {
      const updateData: any = {};
      if (validated.name !== undefined) updateData.name = validated.name;
      if (validated.email !== undefined) updateData.email = validated.email;
      if (validated.phone !== undefined) updateData.phone = validated.phone;
      if (validated.skills !== undefined) updateData.skills = JSON.stringify(validated.skills);
      if (validated.serviceZones !== undefined) updateData.serviceZones = JSON.stringify(validated.serviceZones);
      if (validated.latitude !== undefined) updateData.latitude = validated.latitude;
      if (validated.longitude !== undefined) updateData.longitude = validated.longitude;
      if (validated.shiftStart !== undefined) updateData.shiftStart = validated.shiftStart;
      if (validated.shiftEnd !== undefined) updateData.shiftEnd = validated.shiftEnd;
      if (validated.availabilityStatus !== undefined) updateData.availabilityStatus = validated.availabilityStatus;

      const updatedTech = await tx.technician.update({
        where: { id },
        data: updateData,
      });

      // Transactional Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'TECHNICIAN',
          entityId: id,
          action: 'UPDATE',
          previousValue: JSON.stringify(existingTech),
          newValue: JSON.stringify(updatedTech),
          description: `Updated technician ${updatedTech.name} (${id})`,
        },
      });

      return this.formatTechnician(updatedTech);
    });
  }

  /**
   * Updates technician availability status with audit trail.
   */
  public async updateAvailability(id: string, newStatus: TechnicianAvailabilityStatus): Promise<FormattedTechnician> {
    const existingTech = await prisma.technician.findUnique({ where: { id } });
    if (!existingTech) {
      throw AppError.notFound(`Technician with ID '${id}' not found.`, 'TECHNICIAN_NOT_FOUND');
    }

    return await prisma.$transaction(async (tx) => {
      const updatedTech = await tx.technician.update({
        where: { id },
        data: { availabilityStatus: newStatus },
      });

      // Transactional Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'TECHNICIAN',
          entityId: id,
          action: 'AVAILABILITY_CHANGE',
          previousValue: JSON.stringify({ availabilityStatus: existingTech.availabilityStatus }),
          newValue: JSON.stringify({ availabilityStatus: newStatus }),
          description: `Technician ${existingTech.name} availability changed from ${existingTech.availabilityStatus} to ${newStatus}`,
        },
      });

      return this.formatTechnician(updatedTech);
    });
  }

  /**
   * Safely deletes or offboards a technician.
   * If force is true, active assignments are cancelled and jobs returned to PENDING.
   */
  public async deleteTechnician(id: string, force = false): Promise<{ id: string; name: string }> {
    const existingTech = await prisma.technician.findUnique({
      where: { id },
      include: {
        assignments: true,
      },
    });

    if (!existingTech) {
      throw AppError.notFound(`Technician with ID '${id}' not found.`, 'TECHNICIAN_NOT_FOUND');
    }

    // Safety check: Cannot delete technician with active scheduled assignments unless force is specified
    const activeAssignments = existingTech.assignments.filter(
      (a) => a.status === 'SCHEDULED' || a.status === 'EN_ROUTE' || a.status === 'IN_PROGRESS'
    );
    if (activeAssignments.length > 0 && !force) {
      throw AppError.badRequest(
        `Cannot delete technician with ${activeAssignments.length} active assignment(s). Reassign or cancel active assignments first, or use force removal.`,
        'UNSAFE_OPERATION'
      );
    }

    return await prisma.$transaction(async (tx) => {
      if (activeAssignments.length > 0) {
        const activeJobIds = activeAssignments.map((a) => a.jobId);
        // Revert active jobs back to PENDING so customer appointments aren't lost
        await tx.job.updateMany({
          where: { id: { in: activeJobIds } },
          data: { status: 'PENDING' },
        });

        // Remove active assignments
        await tx.assignment.deleteMany({
          where: { technicianId: id },
        });
      }

      // Remove unavailabilities
      await tx.technicianUnavailability.deleteMany({
        where: { technicianId: id },
      });

      // Transactional Audit Log prior to deletion
      await tx.auditLog.create({
        data: {
          entityType: 'TECHNICIAN',
          entityId: id,
          action: 'DELETE',
          previousValue: JSON.stringify(existingTech),
          description: force && activeAssignments.length > 0
            ? `Admin force-removed technician ${existingTech.name} (${id}) and released ${activeAssignments.length} jobs back to PENDING pool.`
            : `Deleted technician ${existingTech.name} (${id})`,
        },
      });

      await tx.technician.delete({ where: { id } });

      return { id, name: existingTech.name };
    });
  }
}

export const technicianService = new TechnicianService();
export default technicianService;
