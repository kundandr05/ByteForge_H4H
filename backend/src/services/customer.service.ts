import prisma from '../config/prisma';

export interface CustomerSummary {
  name: string;
  totalAppointments: number;
  activeAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  serviceZones: string[];
  preferredSkills: string[];
  lastBookingDate: Date | null;
  lastStatus: string | null;
  recentJobs: Array<{
    id: string;
    description: string;
    status: string;
    priority: string;
    serviceZone: string;
    slaDeadline: Date;
    createdAt: Date;
    assignedTechnician?: {
      id: string;
      name: string;
      phone: string;
    } | null;
  }>;
}

export class CustomerService {
  /**
   * Aggregates and returns all customers and their booking details from the job roster.
   */
  public async getAllCustomers(): Promise<CustomerSummary[]> {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        assignments: {
          include: {
            technician: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    const customerMap = new Map<string, {
      name: string;
      totalAppointments: number;
      activeAppointments: number;
      completedAppointments: number;
      cancelledAppointments: number;
      serviceZones: Set<string>;
      skills: Set<string>;
      lastBookingDate: Date | null;
      lastStatus: string | null;
      recentJobs: CustomerSummary['recentJobs'];
    }>();

    for (const job of jobs) {
      const name = job.customerName.trim();
      if (!customerMap.has(name)) {
        customerMap.set(name, {
          name,
          totalAppointments: 0,
          activeAppointments: 0,
          completedAppointments: 0,
          cancelledAppointments: 0,
          serviceZones: new Set<string>(),
          skills: new Set<string>(),
          lastBookingDate: null,
          lastStatus: null,
          recentJobs: [],
        });
      }

      const record = customerMap.get(name)!;
      record.totalAppointments += 1;

      if (['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status)) {
        record.activeAppointments += 1;
      } else if (job.status === 'COMPLETED') {
        record.completedAppointments += 1;
      } else if (job.status === 'CANCELLED') {
        record.cancelledAppointments += 1;
      }

      record.serviceZones.add(job.serviceZone);

      try {
        const skills: string[] = JSON.parse(job.requiredSkills);
        skills.forEach((s) => record.skills.add(s));
      } catch {
        // ignore parse error
      }

      if (!record.lastBookingDate || job.createdAt > record.lastBookingDate) {
        record.lastBookingDate = job.createdAt;
        record.lastStatus = job.status;
      }

      const activeAssignment = job.assignments.find((a) =>
        ['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'].includes(a.status)
      );

      record.recentJobs.push({
        id: job.id,
        description: job.description,
        status: job.status,
        priority: job.priority,
        serviceZone: job.serviceZone,
        slaDeadline: job.slaDeadline,
        createdAt: job.createdAt,
        assignedTechnician: activeAssignment?.technician || null,
      });
    }

    return Array.from(customerMap.values()).map((c) => ({
      name: c.name,
      totalAppointments: c.totalAppointments,
      activeAppointments: c.activeAppointments,
      completedAppointments: c.completedAppointments,
      cancelledAppointments: c.cancelledAppointments,
      serviceZones: Array.from(c.serviceZones),
      preferredSkills: Array.from(c.skills),
      lastBookingDate: c.lastBookingDate,
      lastStatus: c.lastStatus,
      recentJobs: c.recentJobs.slice(0, 10),
    }));
  }

  /**
   * Gets a specific customer's profile and full booking history.
   */
  public async getCustomerByName(customerName: string): Promise<CustomerSummary | null> {
    const customers = await this.getAllCustomers();
    const found = customers.find(
      (c) => c.name.toLowerCase() === customerName.toLowerCase().trim()
    );
    return found || null;
  }
}

export const customerService = new CustomerService();
export default customerService;
