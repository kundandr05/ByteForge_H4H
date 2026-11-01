/**
 * Maps system zone identifiers to precise physical street addresses and human-readable locations.
 */
export const ZONE_ADDRESS_MAP: Record<string, { label: string; address: string; fullLocation: string }> = {
  ZONE_NORTH: {
    label: 'North Sector',
    address: '742 Evergreen Terrace, Sector 4',
    fullLocation: '742 Evergreen Terrace, Sector 4, North District (MC 98001)',
  },
  ZONE_SOUTH: {
    label: 'South Tech Corridor',
    address: '104 Industrial Park Road, Bldg C',
    fullLocation: '104 Industrial Park Road, South Tech Corridor (MC 98024)',
  },
  ZONE_EAST: {
    label: 'East Riverview',
    address: '45 Lakeview Avenue, Suite 12',
    fullLocation: '45 Lakeview Avenue, East Riverview (MC 98012)',
  },
  ZONE_WEST: {
    label: 'West Bay Plaza',
    address: '12 Sunset Boulevard, West Bay',
    fullLocation: '12 Sunset Boulevard, West Bay Marina (MC 98052)',
  },
  ZONE_CENTRAL: {
    label: 'Central Hub',
    address: '200 Main Street, Financial District',
    fullLocation: '200 Main Street, Downtown Financial District (MC 98004)',
  },
};

/**
 * Returns a human-friendly physical address for any zone string.
 * If the string is already a formatted address, returns it directly.
 */
export function formatServiceZoneAddress(zone: string | null | undefined, concise = false): string {
  if (!zone) return '742 Evergreen Terrace, Sector 4';
  const clean = zone.trim().toUpperCase();
  if (ZONE_ADDRESS_MAP[clean]) {
    return concise ? ZONE_ADDRESS_MAP[clean].address : ZONE_ADDRESS_MAP[clean].fullLocation;
  }
  return zone;
}

