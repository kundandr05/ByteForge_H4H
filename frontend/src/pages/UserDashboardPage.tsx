import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Wind,
  Refrigerator,
  Zap,
  Sparkles,
  Paintbrush,
  Bug,
  Wrench,
  Star,
  Clock,
  MapPin,
  CheckCircle2,
  Calendar,
  Phone,
  ArrowLeft,
  X,
  RefreshCw,
  Edit3,
  Trash2,
  XCircle,
} from 'lucide-react';
import { jobsApi, aiBookingApi } from '../services/dispatchApi';
import { Job } from '../types/dispatch';
import { useAuth } from '../context/AuthContext';
import { AiBookingChatModal } from '../components/chat/AiBookingChatModal';
import { ensureArray } from '../utils/formatters';
import { formatServiceZoneAddress, ZONE_ADDRESS_MAP } from '../utils/zoneAddress';

interface ServiceItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: string;
  durationMinutes: number;
  skill: string;
}

interface ServiceCategory {
  id: string;
  name: string;
  shortName: string;
  icon: React.ComponentType<{ className?: string }>;
  rating: string;
  totalBookings: string;
  badge?: string;
  color: string;
  services: ServiceItem[];
}

const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: 'ac',
    name: 'AC Service & Repair',
    shortName: 'AC Repair',
    icon: Wind,
    rating: '4.9',
    totalBookings: '2000+ bookings',
    badge: 'Popular',
    color: 'from-sky-500 to-blue-600',
    services: [
      {
        id: 'ac-split',
        name: 'Deep clean AC Service (Split)',
        description: 'Get 2x deeper dust removal with foamjet technology. Includes outdoor unit flush and airflow check.',
        category: 'ac',
        price: '$49',
        durationMinutes: 45,
        skill: 'HVAC',
      },
      {
        id: 'ac-window',
        name: 'Deep clean AC Service (Window)',
        description: 'Comprehensive window unit chemical wash, filter mesh sterilization, and drain tray flush.',
        category: 'ac',
        price: '$39',
        durationMinutes: 45,
        skill: 'HVAC',
      },
      {
        id: 'ac-anti-rust',
        name: 'Anti-rust Deep Clean AC Service',
        description: 'Prevent frequent gas leakages through unique anti-rust protective coating on cooling coils.',
        category: 'ac',
        price: '$59',
        durationMinutes: 60,
        skill: 'HVAC',
      },
      {
        id: 'ac-gas-leak',
        name: 'AC Gas Top-Up & Cooling Diagnostics',
        description: 'Nitrogen pressure leak detection, valve replacement, and eco-friendly refrigerant charge.',
        category: 'ac',
        price: '$45',
        durationMinutes: 45,
        skill: 'HVAC',
      },
    ],
  },
  {
    id: 'appliance',
    name: 'Appliance & Fridge Repair',
    shortName: 'Fridge Repair',
    icon: Refrigerator,
    rating: '4.8',
    totalBookings: '1800+ bookings',
    badge: 'Fast Dispatch',
    color: 'from-indigo-500 to-purple-600',
    services: [
      {
        id: 'fridge-cooling',
        name: 'Refrigerator Cooling & Compressor Diagnostics',
        description: 'Single/double door cooling failure inspection, thermostat test, and condenser coil dusting.',
        category: 'appliance',
        price: '$45',
        durationMinutes: 45,
        skill: 'APPLIANCE',
      },
      {
        id: 'fridge-gas',
        name: 'Refrigerator Gas Refill & Seal Service',
        description: 'Refrigerant top-up, door magnetic gasket realignment, and evaporator defrost test.',
        category: 'appliance',
        price: '$49',
        durationMinutes: 45,
        skill: 'APPLIANCE',
      },
      {
        id: 'washer-repair',
        name: 'Washing Machine Drum & Motor Repair',
        description: 'Front & top-load spin diagnostics, belt replacement, drainage pump clearing, and level balance.',
        category: 'appliance',
        price: '$39',
        durationMinutes: 45,
        skill: 'APPLIANCE',
      },
      {
        id: 'dishwasher-fix',
        name: 'Dishwasher Deep Clean & Spray Repair',
        description: 'Water inlet valve inspection, spray arm clearing, and leak-free hose seal check.',
        category: 'appliance',
        price: '$42',
        durationMinutes: 40,
        skill: 'APPLIANCE',
      },
    ],
  },
  {
    id: 'electrical',
    name: 'Electrician & Plumber',
    shortName: 'Electrician & Plumber',
    icon: Zap,
    rating: '4.9',
    totalBookings: '3400+ bookings',
    badge: 'Essential',
    color: 'from-amber-500 to-orange-600',
    services: [
      {
        id: 'plumb-leak',
        name: 'Emergency Pipe Leak & Tap Replacement',
        description: 'Fix kitchen sink drips, master bathroom supply line bursts, and angle valve leaks.',
        category: 'electrical',
        price: '$35',
        durationMinutes: 30,
        skill: 'PLUMBING',
      },
      {
        id: 'plumb-drain',
        name: 'High-Pressure Drain & Sewer Unclogging',
        description: 'Mechanical snake clearing for slow kitchen sinks, blocked shower drains, and traps.',
        category: 'electrical',
        price: '$39',
        durationMinutes: 45,
        skill: 'PLUMBING',
      },
      {
        id: 'elec-breaker',
        name: 'Circuit Breaker Tripping & Fuse Box Repair',
        description: 'Identify short circuits, load imbalance, neutral wire faults, and replace faulty MCBs.',
        category: 'electrical',
        price: '$42',
        durationMinutes: 45,
        skill: 'ELECTRICAL',
      },
      {
        id: 'elec-switch',
        name: 'Socket, Switchboard & Chandelier Wiring',
        description: 'Install heavy-duty appliance sockets, replace spark-prone switches, and hang light fixtures.',
        category: 'electrical',
        price: '$29',
        durationMinutes: 30,
        skill: 'ELECTRICAL',
      },
    ],
  },
  {
    id: 'cleaning',
    name: 'Bathroom & Kitchen Cleaning',
    shortName: 'Home Cleaning',
    icon: Sparkles,
    rating: '4.8',
    totalBookings: '1600+ bookings',
    color: 'from-emerald-500 to-teal-600',
    services: [
      {
        id: 'bath-deep',
        name: 'Deep Stain Removal Bathroom Scrub',
        description: 'Hard water scale removal from tiles, toilet descaling, chrome fixture polish, and sanitization.',
        category: 'cleaning',
        price: '$39',
        durationMinutes: 60,
        skill: 'HVAC',
      },
      {
        id: 'kitchen-degrease',
        name: 'Kitchen Degreasing & Counter Sanitization',
        description: 'Stovetop grease extraction, cabinet exterior wiping, and sink bio-sanitization.',
        category: 'cleaning',
        price: '$45',
        durationMinutes: 60,
        skill: 'HVAC',
      },
    ],
  },
  {
    id: 'painting',
    name: 'Home Painting & Touchup',
    shortName: 'Painting',
    icon: Paintbrush,
    rating: '4.7',
    totalBookings: '950+ bookings',
    color: 'from-rose-500 to-pink-600',
    services: [
      {
        id: 'wall-patch',
        name: 'Wall Crack & Waterproof Patch Repair',
        description: 'Putty filling, anti-damp treatment, primer coat, and precision color matching.',
        category: 'painting',
        price: '$59',
        durationMinutes: 90,
        skill: 'ELECTRICAL',
      },
      {
        id: 'room-paint',
        name: 'Single Room Accent Wall Painting',
        description: 'Two coats of premium low-VOC emulsion with floor protection masking.',
        category: 'painting',
        price: '$89',
        durationMinutes: 120,
        skill: 'ELECTRICAL',
      },
    ],
  },
  {
    id: 'pest',
    name: 'Pest Control Protection',
    shortName: 'Pest Control',
    icon: Bug,
    rating: '4.9',
    totalBookings: '1200+ bookings',
    color: 'from-violet-500 to-purple-600',
    services: [
      {
        id: 'pest-kitchen',
        name: 'Kitchen Cockroach & Ant Barrier Gel',
        description: '100% odorless food-safe gel dot application with 90-day protection guarantee.',
        category: 'pest',
        price: '$35',
        durationMinutes: 40,
        skill: 'HVAC',
      },
      {
        id: 'pest-termite',
        name: 'Termite & Wood Borer Injection Service',
        description: 'Drill-and-fill chemical barrier treatment across skirting boards and wooden fixtures.',
        category: 'pest',
        price: '$55',
        durationMinutes: 60,
        skill: 'HVAC',
      },
    ],
  },
];

export const UserDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Selected category state (e.g. 'ac', 'appliance', etc.)
  const categoryParam = searchParams.get('category');
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState<'explore' | 'bookings'>(
    tabParam === 'bookings' ? 'bookings' : 'explore'
  );
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(() => {
    if (categoryParam) {
      return SERVICE_CATEGORIES.find((c) => c.id === categoryParam) || null;
    }
    return null;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [liveClock, setLiveClock] = useState<string>(new Date().toLocaleTimeString());

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setLiveClock(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);
  const [loading, setLoading] = useState(true);
  const [bookingModalService, setBookingModalService] = useState<ServiceItem | null>(null);
  const [selectedZone, setSelectedZone] = useState('ZONE_NORTH');
  const [selectedPriority, setSelectedPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [bookingSuccessAlert, setBookingSuccessAlert] = useState<string | null>(null);
  // Edit Booking State
  const [editingBooking, setEditingBooking] = useState<Job | null>(null);
  const [editBookingForm, setEditBookingForm] = useState({
    description: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    serviceZone: 'ZONE_NORTH',
    estimatedDuration: 60,
  });
  const [savingBookingEdit, setSavingBookingEdit] = useState(false);

  const handleOpenEditBooking = (job: Job) => {
    setEditingBooking(job);
    setEditBookingForm({
      description: job.description,
      priority: job.priority as any,
      serviceZone: job.serviceZone || 'ZONE_NORTH',
      estimatedDuration: job.estimatedDuration || 60,
    });
  };

  const handleSaveBookingEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;
    setSavingBookingEdit(true);
    try {
      await jobsApi.update(editingBooking.id, editBookingForm);
      setBookingSuccessAlert(`Booking #${editingBooking.id.slice(0, 8).toUpperCase()} updated successfully!`);
      setEditingBooking(null);
      await fetchUserJobs();
    } catch (err: any) {
      alert(err.message || 'Failed to update booking');
    } finally {
      setSavingBookingEdit(false);
    }
  };

  const handleCancelBooking = async (jobId: string) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      await jobsApi.updateStatus(jobId, 'CANCELLED');
      setBookingSuccessAlert('Appointment status updated to CANCELLED.');
      await fetchUserJobs();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment');
    }
  };

  const handleDeleteBooking = async (jobId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this booking?')) return;
    try {
      await jobsApi.updateStatus(jobId, 'CANCELLED').catch(() => {});
      await jobsApi.delete(jobId);
      setBookingSuccessAlert('Booking deleted successfully.');
      await fetchUserJobs();
    } catch (err: any) {
      alert(err.message || 'Failed to delete booking');
    }
  };

  // Sync category param with state
  useEffect(() => {
    if (categoryParam) {
      const found = SERVICE_CATEGORIES.find((c) => c.id === categoryParam);
      if (found) {
        setSelectedCategory(found);
        setActiveTab('explore');
      }
    } else {
      setSelectedCategory(null);
    }

    if (tabParam === 'bookings') {
      setActiveTab('bookings');
    }
  }, [categoryParam, tabParam]);

  const fetchUserJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jobsApi.list({ limit: 100 });
      const currentCustomerName = (user.name || '').toLowerCase().trim();

      const filtered = res.data.filter(
        (job) =>
          !currentCustomerName ||
          job.customerName.toLowerCase().trim() === currentCustomerName ||
          job.customerName.toLowerCase().includes(currentCustomerName)
      );

      setJobs(filtered.length > 0 ? filtered : res.data.slice(0, 4));
    } catch (err) {
      console.warn('Failed to load user appointments:', err);
    } finally {
      setLoading(false);
    }
  }, [user.name]);

  useEffect(() => {
    fetchUserJobs();
  }, [fetchUserJobs]);

  const activeJobs = jobs.filter((j) =>
    ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(j.status)
  );

  // Handle instant one-click booking of a specific service
  const handleConfirmDirectBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingModalService) return;

    setBookingInProgress(true);
    try {
      const customerName = user.name || 'Valued Client';
      const createdRes = await aiBookingApi.book({
        customerName,
        description: bookingModalService.name,
        requiredSkills: [bookingModalService.skill],
        serviceZone: selectedZone,
        priority: selectedPriority,
        estimatedDuration: bookingModalService.durationMinutes,
      });

      const newJob = createdRes.data;
      setBookingModalService(null);
      setBookingSuccessAlert(
        `Appointment for "${bookingModalService.name}" booked! Work Order #${newJob.id.slice(0, 8).toUpperCase()} queued for dispatch.`
      );

      fetchUserJobs();
      setActiveTab('bookings');

      setTimeout(() => {
        setBookingSuccessAlert(null);
      }, 7000);
    } catch (err: any) {
      alert(`Booking failed: ${err.message}`);
    } finally {
      setBookingInProgress(false);
    }
  };

  // Filter categories and services by search
  const filteredCategories = SERVICE_CATEGORIES.filter((cat) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      cat.name.toLowerCase().includes(q) ||
      cat.shortName.toLowerCase().includes(q) ||
      cat.services.some(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    );
  });

  return (
    <div className="space-y-6 pb-24">
      {/* Top Banner Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('explore');
              setSelectedCategory(null);
              setSearchParams({});
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'explore'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Explore Services
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('bookings');
              setSelectedCategory(null);
              setSearchParams({ tab: 'bookings' });
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'bookings'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>My Bookings</span>
            {activeJobs.length > 0 && (
              <span className="rounded-full bg-amber-400 text-slate-950 px-1.5 py-0.2 text-[10px] font-extrabold">
                {activeJobs.length}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-1.5">
          <span>Client: <strong className="text-slate-800">{user.name || 'Sarah Jenkins'}</strong></span>
        </div>
      </div>

      {/* Success Booking Alert Banner */}
      {bookingSuccessAlert && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50 p-4 text-xs text-emerald-900 flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span className="font-semibold">{bookingSuccessAlert}</span>
          </div>
          <button
            type="button"
            onClick={() => setBookingSuccessAlert(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* TAB 1: EXPLORE SERVICES (Matches the 2nd Photo "TASKMATE") */}
      {activeTab === 'explore' && !selectedCategory && (
        <div className="space-y-6">
          {/* Consumer Search Bar */}
          <div className="relative max-w-2xl mx-auto">
            <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for 'AC Service & Repair', 'Fridge Repair', 'Electrician'..."
              className="w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Section Heading */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Schedule your first appointment
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Select a certified repair service or tap the bottom-right mic to speak your request
            </p>
          </div>

          {/* Service Categories Grid (2 Columns on mobile, 4 on desktop, styled like the cards in photo 2) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredCategories.map((category) => {
              const Icon = category.icon;
              return (
                <div
                  key={category.id}
                  onClick={() => {
                    setSelectedCategory(category);
                    setSearchParams({ category: category.id });
                  }}
                  className="group relative cursor-pointer rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md hover:border-brand-500/40 hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
                >
                  {category.badge && (
                    <span className="absolute top-3 right-3 rounded-full bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 text-[10px] font-bold">
                      {category.badge}
                    </span>
                  )}

                  {/* Icon Card Bubble */}
                  <div className="h-16 w-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 group-hover:scale-105 group-hover:bg-brand-50 group-hover:text-brand-600 transition-all mb-4">
                    <Icon className="h-8 w-8" />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                      {category.name}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-slate-700">{category.rating}</span>
                      <span>({category.totalBookings})</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-brand-600">
                    <span>{category.services.length} options</span>
                    <span>View →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DETAIL CATEGORY SCREEN (Matches the right screen in photo 2) */}
      {activeTab === 'explore' && selectedCategory && (
        <div className="space-y-6">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory(null);
                setSearchParams({});
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors shadow-2xs"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to All Categories</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-bold text-slate-900">{selectedCategory.rating}</span>
              <span>({selectedCategory.totalBookings})</span>
            </div>
          </div>

          {/* Category Title Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
              {React.createElement(selectedCategory.icon, { className: 'h-8 w-8' })}
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                {selectedCategory.name}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Verified background-checked specialists with guaranteed satisfaction
              </p>
            </div>
          </div>

          {/* Sub-Services List */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 px-1">
              Available Service Packages
            </h3>

            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              {selectedCategory.services.map((service) => (
                <div
                  key={service.id}
                  className="p-5 sm:p-6 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 flex-1">
                    <h4 className="text-sm font-bold text-slate-900">{service.name}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                      {service.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs font-semibold text-slate-700 pt-1">
                      <span className="text-brand-600 font-bold">Starting at {service.price}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock className="h-3 w-3" /> {service.durationMinutes} mins
                      </span>
                    </div>
                  </div>

                  {/* Book Button */}
                  <button
                    type="button"
                    onClick={() => setBookingModalService(service)}
                    className="rounded-xl bg-slate-900 hover:bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm active:scale-95 transition-all shrink-0 sm:self-center"
                  >
                    Book Now
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MY BOOKINGS SECTION */}
      {activeTab === 'bookings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">My Service Bookings</h2>
              <p className="text-xs text-slate-500">
                Track appointments assigned by the DispatchGrid autonomous workforce engine
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-bold">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                Live Real-Time: {liveClock}
              </span>
              <button
                type="button"
                onClick={fetchUserJobs}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="h-5 w-5 animate-spin text-brand-600" />
              <span>Loading your appointments...</span>
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-2">
              <Calendar className="h-10 w-10 mx-auto text-slate-300" />
              <div className="text-sm font-semibold text-slate-700">No appointments scheduled yet</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Explore our AC repair, fridge repair, and plumbing services to book your first certified technician!
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('explore')}
                className="mt-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-500"
              >
                Browse Services
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              {jobs.map((job) => {
                const activeAssignment = job.assignments?.find(
                  (a: any) => ['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'].includes(a.status)
                );

                return (
                  <div
                    key={job.id}
                    className="p-5 sm:p-6 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          #{job.id.slice(0, 8).toUpperCase()}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            job.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : job.status === 'IN_PROGRESS' || job.status === 'ASSIGNED'
                              ? 'bg-brand-100 text-brand-800'
                              : job.status === 'CANCELLED'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {job.status === 'PENDING' ? 'QUEUED FOR DISPATCH' : job.status}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            job.priority === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800'
                              : job.priority === 'HIGH'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {job.priority} PRIORITY
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">{job.description}</h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                        <span className="flex items-center gap-1 font-semibold text-slate-800">
                          <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          <span>{formatServiceZoneAddress(job.serviceZone)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          Est. {job.estimatedDuration} mins
                        </span>
                        <span className="flex items-center gap-1">
                          <Wrench className="h-3.5 w-3.5 text-brand-500" />
                          Skills: {ensureArray(job.requiredSkills).join(', ')}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          Booked: {new Date(job.createdAt).toLocaleDateString()} • {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-3 shrink-0">
                      {/* Real-time Location & Specialist Status */}
                      {activeAssignment?.technician ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-left sm:text-right space-y-1">
                          <div className="flex items-center sm:justify-end gap-1.5 text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                            </span>
                            <span>Live GPS Tracking: En Route</span>
                          </div>
                          <div className="font-bold text-xs text-slate-900 mt-0.5">
                            {activeAssignment.technician.name}
                          </div>
                          <div className="text-[11px] text-emerald-700 flex items-center sm:justify-end gap-1 font-mono font-semibold">
                            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                            <span>GPS: {activeAssignment.technician.latitude ? `${activeAssignment.technician.latitude.toFixed(4)}°N, ${Math.abs(activeAssignment.technician.longitude || 0).toFixed(4)}°W` : '37.7749°N, 122.4194°W'}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center sm:justify-end gap-1">
                            <Phone className="h-3 w-3 text-brand-500" />
                            <span>{activeAssignment.technician.phone || '+1 (555) 0111'}</span>
                          </div>
                          <div className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded inline-block mt-1">
                            ETA: ~{activeAssignment.travelTime || 12} mins ({activeAssignment.travelTime ? (activeAssignment.travelTime * 0.25).toFixed(1) : '2.4'} km away)
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-left sm:text-right space-y-1">
                          <div className="text-[10px] uppercase font-bold text-blue-800 tracking-wider flex items-center sm:justify-end gap-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                            </span>
                            <span>Real-Time Location & Dispatch</span>
                          </div>
                          <div className="text-xs font-bold text-slate-800 flex items-center sm:justify-end gap-1">
                            <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                            <span className="font-mono text-[11px]">GPS: {job.latitude ? `${job.latitude.toFixed(4)}°N, ${Math.abs(job.longitude || 0).toFixed(4)}°W` : '37.7749°N, 122.4194°W'}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-medium">
                            Physical Address: {formatServiceZoneAddress(job.serviceZone, true)}
                          </div>
                          <div className="text-[10px] font-semibold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded inline-block mt-0.5">
                            Autonomous engine assigning best route
                          </div>
                        </div>
                      )}

                      {/* Action Buttons: Edit, Cancel, Delete */}
                      <div className="flex items-center gap-1.5 pt-1 sm:pt-0 sm:justify-end">
                        <button
                          type="button"
                          onClick={() => handleOpenEditBooking(job)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition cursor-pointer shadow-2xs"
                          title="Edit appointment details and service zone"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCancelBooking(job.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs transition cursor-pointer shadow-2xs"
                          title="Cancel this appointment"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Cancel</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteBooking(job.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition cursor-pointer shadow-2xs"
                          title="Delete this appointment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* QUICK BOOKING MODAL */}
      {bookingModalService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-200 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">
                  Schedule Appointment
                </h3>
                <p className="text-xs text-slate-400">
                  {bookingModalService.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBookingModalService(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDirectBooking} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                  Customer / Client Name
                </label>
                <input
                  type="text"
                  disabled
                  value={user.name || 'Sarah Jenkins'}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                  Select Service Zone *
                </label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
                >
                  <option value="ZONE_NORTH">Zone North (Downtown & Bay)</option>
                  <option value="ZONE_SOUTH">Zone South (Metro Suburbs)</option>
                  <option value="ZONE_EAST">Zone East (Industrial Corridor)</option>
                  <option value="ZONE_WEST">Zone West (Coastal Hills)</option>
                  <option value="ZONE_CENTRAL">Zone Central (Commercial Plaza)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                  Service Urgency Priority
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['MEDIUM', 'HIGH', 'CRITICAL'] as const).map((pri) => (
                    <button
                      key={pri}
                      type="button"
                      onClick={() => setSelectedPriority(pri)}
                      className={`py-2 px-2 rounded-lg text-center font-bold text-[11px] border transition-all ${
                        selectedPriority === pri
                          ? pri === 'CRITICAL'
                            ? 'bg-rose-950 border-rose-500 text-rose-300'
                            : 'bg-brand-950 border-brand-500 text-brand-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {pri === 'CRITICAL' ? '🚨 Emergency' : pri === 'HIGH' ? '⚡ Today' : 'Routine'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[11px] space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Standard Duration:</span>
                  <span className="font-semibold text-white">{bookingModalService.durationMinutes} mins</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Price:</span>
                  <span className="font-bold text-emerald-400">{bookingModalService.price}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Assigned Skill:</span>
                  <span className="font-semibold text-brand-300">{bookingModalService.skill}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBookingModalService(null)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookingInProgress}
                  className="rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-600/30 transition-all"
                >
                  {bookingInProgress ? 'Scheduling...' : 'Confirm & Schedule Specialist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating AI Voice/Chat Assistant Widget */}
      <AiBookingChatModal onBookingSuccess={fetchUserJobs} />
      {/* EDIT BOOKING MODAL */}
      {editingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-200 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">
                  Edit Service Booking #{editingBooking.id.slice(0, 8).toUpperCase()}
                </h3>
                <p className="text-xs text-slate-400">
                  Update service details, urgency, and physical address
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBooking(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBookingEdit} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Service Description</label>
                <textarea
                  rows={2}
                  required
                  value={editBookingForm.description}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Priority</label>
                  <select
                    value={editBookingForm.priority}
                    onChange={(e) => setEditBookingForm({ ...editBookingForm, priority: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    min={15}
                    max={480}
                    step={15}
                    value={editBookingForm.estimatedDuration}
                    onChange={(e) => setEditBookingForm({ ...editBookingForm, estimatedDuration: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Service Zone (Physical Address)</label>
                <select
                  value={editBookingForm.serviceZone}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, serviceZone: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
                >
                  {Object.entries(ZONE_ADDRESS_MAP).map(([zoneKey, info]) => (
                    <option key={zoneKey} value={zoneKey}>
                      {info.address} ({info.label})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Selected: {formatServiceZoneAddress(editBookingForm.serviceZone)}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingBooking(null)}
                  disabled={savingBookingEdit}
                  className="rounded-xl border border-slate-700 px-4 py-2 font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBookingEdit}
                  className="rounded-xl bg-brand-600 px-4 py-2 font-bold text-white shadow-md hover:bg-brand-500 disabled:opacity-50 cursor-pointer"
                >
                  {savingBookingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDashboardPage;
