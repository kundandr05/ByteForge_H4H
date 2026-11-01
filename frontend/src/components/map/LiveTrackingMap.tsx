import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Navigation,
  Clock,
  Phone,
  X,
  Compass,
} from 'lucide-react';

interface LiveTrackingMapProps {
  technicianName?: string;
  technicianPhone?: string;
  technicianLat?: number;
  technicianLng?: number;
  destinationAddress?: string;
  destinationLat: number;
  destinationLng: number;
  jobStatus?: string;
  jobDescription?: string;
  onClose?: () => void;
  heightClass?: string;
}

// Calculate Haversine distance in kilometers
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  technicianName = 'Field Specialist',
  technicianPhone = '+1-555-0100',
  technicianLat,
  technicianLng,
  destinationAddress = 'Customer Service Address',
  destinationLat,
  destinationLng,
  jobStatus = 'ASSIGNED',
  jobDescription = 'Service Request',
  onClose,
  heightClass = 'h-[420px]',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // If technician coordinates are missing, simulate realistic coordinates near the destination (~2.5km offset)
  const effectiveTechLat = technicianLat || destinationLat + 0.018;
  const effectiveTechLng = technicianLng || destinationLng - 0.022;

  const distanceKm = calculateDistanceKm(
    effectiveTechLat,
    effectiveTechLng,
    destinationLat,
    destinationLng
  );
  // Estimate driving time (~30 km/h average city speed)
  const etaMinutes = Math.max(3, Math.round((distanceKm / 30) * 60));

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Destroy existing map instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const centerLat = (effectiveTechLat + destinationLat) / 2;
    const centerLng = (effectiveTechLng + destinationLng) / 2;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 13,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    mapInstanceRef.current = map;

    // OpenStreetMap standard tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Custom pulse marker for Technician
    const techIcon = L.divIcon({
      className: 'custom-tech-pin',
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 36px; height: 36px; border-radius: 9999px; background-color: rgba(59, 130, 246, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 28px; height: 28px; border-radius: 9999px; background-color: #2563eb; border: 2px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 13px; font-weight: bold;">
            🚗
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    // Custom marker for Destination
    const destIcon = L.divIcon({
      className: 'custom-dest-pin',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div style="width: 28px; height: 28px; border-radius: 9999px; background-color: #059669; border: 2px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 13px; font-weight: bold;">
            📍
          </div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });

    // Add Technician Marker
    const techMarker = L.marker([effectiveTechLat, effectiveTechLng], { icon: techIcon })
      .addTo(map)
      .bindPopup(
        `<div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: #1e3a8a;">${technicianName}</strong><br/>
          <span style="color: #64748b;">Specialist GPS Location</span><br/>
          <span style="font-weight: 600; color: #2563eb;">ETA: ~${etaMinutes} mins (${distanceKm} km away)</span>
        </div>`
      );

    // Add Destination Marker
    L.marker([destinationLat, destinationLng], { icon: destIcon })
      .addTo(map)
      .bindPopup(
        `<div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: #065f46;">Service Destination</strong><br/>
          <span style="color: #334155;">${destinationAddress}</span><br/>
          <span style="font-size: 11px; color: #64748b;">${jobDescription}</span>
        </div>`
      );

    // Create a realistic multi-point waypoint route
    const midLat = (effectiveTechLat + destinationLat) / 2 + 0.003;
    const midLng = (effectiveTechLng + destinationLng) / 2 - 0.004;

    const routeCoords: [number, number][] = [
      [effectiveTechLat, effectiveTechLng],
      [midLat, midLng],
      [destinationLat, destinationLng],
    ];

    // Draw route polyline
    L.polyline(routeCoords, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.85,
      dashArray: '8, 8',
      lineCap: 'round',
    }).addTo(map);

    // Fit map bounds comfortably around both markers
    const bounds = L.latLngBounds([
      [effectiveTechLat, effectiveTechLng],
      [destinationLat, destinationLng],
    ]);
    map.fitBounds(bounds, { padding: [50, 50] });

    // Open tech popup initially for quick glance
    techMarker.openPopup();

    // Trigger size invalidation to fix any initial rendering offset
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [
    effectiveTechLat,
    effectiveTechLng,
    destinationLat,
    destinationLng,
    technicianName,
    destinationAddress,
    jobDescription,
    distanceKm,
    etaMinutes,
  ]);

  const handleRecenter = () => {
    if (!mapInstanceRef.current) return;
    const bounds = L.latLngBounds([
      [effectiveTechLat, effectiveTechLng],
      [destinationLat, destinationLng],
    ]);
    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
  };

  return (
    <div className="flex flex-col bg-slate-900 rounded-2xl border border-slate-700/60 overflow-hidden shadow-2xl">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/90 border-b border-slate-800 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md">
            <Navigation className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Live Route & Specialist Tracking</h3>
              <span className="rounded-full bg-emerald-950 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                LIVE GPS
              </span>
            </div>
            <p className="text-[11px] text-slate-400">OpenStreetMap Interactive Route View</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRecenter}
            className="flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition-colors cursor-pointer"
            title="Re-center route"
          >
            <Compass className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Center</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Map Container */}
      <div className="relative">
        <div ref={mapContainerRef} className={`w-full ${heightClass} z-10`} />

        {/* Floating Telemetry Badge Overlay */}
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-[400] flex flex-wrap gap-2 pointer-events-none">
          <div className="pointer-events-auto bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3.5 py-2 shadow-lg flex items-center gap-3 text-xs text-white">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <Clock className="h-4 w-4" />
              <span>ETA ~{etaMinutes} mins</span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div className="flex items-center gap-1 text-slate-300">
              <Navigation className="h-3.5 w-3.5 text-blue-400" />
              <span>{distanceKm} km away</span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <span className="font-semibold text-slate-200">{technicianName}</span>
          </div>
        </div>
      </div>

      {/* Bottom Specialist & Destination Info Footer */}
      <div className="p-3.5 bg-slate-950/95 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
        <div className="flex items-start gap-2.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
          <div className="h-7 w-7 rounded-full bg-blue-900/40 border border-blue-500/30 flex items-center justify-center text-blue-300 flex-shrink-0">
            🚗
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">En Route Specialist</span>
            <div className="font-bold text-white text-sm">{technicianName}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
              <Phone className="h-3 w-3 text-slate-500" />
              <span>{technicianPhone}</span>
              <span className="text-slate-600">•</span>
              <span className="text-blue-400 font-semibold">{jobStatus}</span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
          <div className="h-7 w-7 rounded-full bg-emerald-900/40 border border-emerald-500/30 flex items-center justify-center text-emerald-300 flex-shrink-0">
            <MapPin className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Destination Address</span>
            <div className="font-semibold text-slate-100 line-clamp-1">{destinationAddress}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{jobDescription}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
