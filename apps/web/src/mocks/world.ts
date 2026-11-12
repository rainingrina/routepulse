/**
 * DEVELOPMENT MOCK — fictional reference data for `vite --mode mock` only. Never imported by the
 * production build (see api/services/index.ts). Replaced by Dev A's deterministic seed (PROGRESS 4.x).
 *
 * Sources: names and values marked [doc] come from the planning documents (journeys §1 and §3,
 * engine doc §2 and §10). Everything else is [mock]: an illustrative fictional placeholder chosen for
 * this mock, not a seed value. City coordinates are real geography only (spec §5.1); route lines are
 * coarse hand-drawn polylines, NOT the routing export (task 4.1).
 */
import type { Segment } from '../api/contract';

/** Mock demo day: Thursday 2026-11-12 (IST = UTC+05:30). */
const DAY0 = Date.UTC(2026, 10, 12, 0, 0) - (5 * 60 + 30) * 60_000;

/** ISO UTC string for an IST wall time on the mock Thursday (dayOffset 1 = Friday). */
export function ist(hhmm: string, dayOffset = 0): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return new Date(DAY0 + dayOffset * 86_400_000 + (h * 60 + m) * 60_000).toISOString();
}

export const PLANT = { name: 'Plant X', lat: 19.06, lng: 73.12 }; // [mock] "Mumbai metropolitan region" [doc]

export interface MockCustomer {
  id: string;
  code: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  receivingHours: string;
}

export const CUSTOMERS: MockCustomer[] = [
  { id: 'cus-kestrel', code: 'KES', name: 'Kestrel Moulders', city: 'Pune', lat: 18.52, lng: 73.86, receivingHours: '08:00–18:00' }, // [doc]
  { id: 'cus-heronfield', code: 'HER', name: 'Heronfield Plastics', city: 'Nashik', lat: 20.0, lng: 73.79, receivingHours: '08:00–18:00' }, // [mock]
  { id: 'cus-larkspur', code: 'LAR', name: 'Larkspur Films', city: 'Surat', lat: 21.17, lng: 72.83, receivingHours: '07:00–19:00' }, // [mock]
  { id: 'cus-wrenbrook', code: 'WRE', name: 'Wrenbrook Packaging', city: 'Ahmedabad', lat: 23.02, lng: 72.57, receivingHours: '08:00–18:00' }, // [mock]
  { id: 'cus-tealstone', code: 'TEA', name: 'Tealstone Pipes', city: 'Indore', lat: 22.72, lng: 75.86, receivingHours: '08:00–18:00' }, // [mock]
  { id: 'cus-corvid', code: 'COR', name: 'Corvid Containers', city: 'Nagpur', lat: 21.15, lng: 79.09, receivingHours: '08:00–20:00' }, // [mock]
];

export interface MockTransporter {
  id: string;
  code: string;
  name: string;
  fleetSize: number;
  isSmall: boolean;
}

export const TRANSPORTERS: MockTransporter[] = [
  { id: 'trn-ghatline', code: 'GHT', name: 'Ghatline Carriers', fleetSize: 4, isSmall: true }, // [doc] 4-truck owner-operator
  { id: 'trn-bluefinch', code: 'BLF', name: 'Bluefinch Freight', fleetSize: 60, isSmall: false }, // [mock]
  { id: 'trn-ironpeak', code: 'IRP', name: 'Ironpeak Haulage', fleetSize: 25, isSmall: false }, // [mock]
  { id: 'trn-saltpan', code: 'SLT', name: 'Saltpan Roadways', fleetSize: 12, isSmall: false }, // [mock]
  { id: 'trn-monsoon', code: 'MON', name: 'Monsoon Movers', fleetSize: 8, isSmall: true }, // [mock]
];

export interface MockLane {
  id: string;
  code: string;
  name: string;
  customerId: string;
}

export const LANES: MockLane[] = [
  { id: 'lane-pune', code: 'L-PNQ', name: 'Plant X → Pune', customerId: 'cus-kestrel' },
  { id: 'lane-nashik', code: 'L-NSK', name: 'Plant X → Nashik', customerId: 'cus-heronfield' },
  { id: 'lane-surat', code: 'L-STV', name: 'Plant X → Surat', customerId: 'cus-larkspur' },
  { id: 'lane-ahmedabad', code: 'L-AMD', name: 'Plant X → Ahmedabad', customerId: 'cus-wrenbrook' },
  { id: 'lane-indore', code: 'L-IDR', name: 'Plant X → Indore', customerId: 'cus-tealstone' },
  { id: 'lane-nagpur', code: 'L-NAG', name: 'Plant X → Nagpur', customerId: 'cus-corvid' },
];

export interface MockRoute {
  id: string;
  code: string;
  laneId: string;
  name: string;
  isPrimary: boolean;
  lengthKm: number;
  coordinates: [number, number][];
  segments: Segment[];
}

const P: [number, number] = [PLANT.lng, PLANT.lat];

export const ROUTES: MockRoute[] = [
  {
    // [doc] Plant X → expressway → ghat section → Pune; ghat = baseline minutes 90–150 of 270.
    id: 'rte-pune-a',
    code: 'R-PNQ-A',
    laneId: 'lane-pune',
    name: 'Expressway via ghat section',
    isPrimary: true,
    lengthKm: 150,
    coordinates: [P, [73.11, 18.99], [73.28, 18.83], [73.34, 18.79], [73.41, 18.75], [73.67, 18.73], [73.86, 18.52]],
    segments: [
      { segmentCode: 'PNQ-EXP-1', name: 'Plant X to Khopoli', startKm: 0, endKm: 55, speedKmh: 37 },
      { segmentCode: 'PNQ-GHAT', name: 'Ghat section (Khopoli–Lonavala)', startKm: 55, endKm: 80, speedKmh: 25 },
      { segmentCode: 'PNQ-EXP-2', name: 'Lonavala to Pune', startKm: 80, endKm: 150, speedKmh: 35 },
    ],
  },
  {
    // [doc] alternate route exists (longer, avoids ghat); geometry [mock].
    id: 'rte-pune-b',
    code: 'R-PNQ-B',
    laneId: 'lane-pune',
    name: 'Alternate avoiding the ghat',
    isPrimary: false,
    lengthKm: 210,
    coordinates: [P, [73.13, 19.24], [73.78, 19.33], [73.87, 19.2], [73.86, 18.52]],
    segments: [{ segmentCode: 'PNQ-ALT-1', name: 'Plant X to Pune via Malshej', startKm: 0, endKm: 210, speedKmh: 35 }],
  },
  {
    id: 'rte-nashik-a',
    code: 'R-NSK-A',
    laneId: 'lane-nashik',
    name: 'Via Kasara ghat',
    isPrimary: true,
    lengthKm: 170,
    coordinates: [P, [73.06, 19.3], [73.48, 19.63], [73.56, 19.7], [73.79, 20.0]],
    segments: [{ segmentCode: 'NSK-1', name: 'Plant X to Nashik', startKm: 0, endKm: 170, speedKmh: 49 }],
  },
  {
    id: 'rte-surat-a',
    code: 'R-STV-A',
    laneId: 'lane-surat',
    name: 'Western highway',
    isPrimary: true,
    lengthKm: 290,
    coordinates: [P, [73.06, 19.3], [72.9, 20.37], [72.83, 21.17]],
    segments: [{ segmentCode: 'STV-1', name: 'Plant X to Surat', startKm: 0, endKm: 290, speedKmh: 53 }],
  },
  {
    id: 'rte-ahmedabad-a',
    code: 'R-AMD-A',
    laneId: 'lane-ahmedabad',
    name: 'Western highway via Vadodara',
    isPrimary: true,
    lengthKm: 540,
    coordinates: [P, [73.06, 19.3], [72.9, 20.37], [72.83, 21.17], [73.18, 22.31], [72.57, 23.02]],
    segments: [{ segmentCode: 'AMD-1', name: 'Plant X to Ahmedabad', startKm: 0, endKm: 540, speedKmh: 57 }],
  },
  {
    id: 'rte-indore-a',
    code: 'R-IDR-A',
    laneId: 'lane-indore',
    name: 'Via Nashik and Dhule',
    isPrimary: true,
    lengthKm: 590,
    coordinates: [P, [73.06, 19.3], [73.79, 20.0], [74.77, 20.9], [75.86, 22.72]],
    segments: [{ segmentCode: 'IDR-1', name: 'Plant X to Indore', startKm: 0, endKm: 590, speedKmh: 59 }],
  },
  {
    id: 'rte-nagpur-a',
    code: 'R-NAG-A',
    laneId: 'lane-nagpur',
    name: 'Expressway via Aurangabad',
    isPrimary: true,
    lengthKm: 820,
    coordinates: [P, [73.06, 19.3], [74.48, 19.77], [75.34, 19.88], [77.75, 20.93], [79.09, 21.15]],
    segments: [{ segmentCode: 'NAG-1', name: 'Plant X to Nagpur', startKm: 0, endKm: 820, speedKmh: 59 }],
  },
];

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: 'COORDINATOR' | 'CUSTOMER' | 'DRIVER';
  customerId: string | null;
  transporterId: string | null;
}

export const USERS: MockUser[] = [
  { id: 'usr-meera', name: 'Meera', email: 'coordinator@plantx.test', role: 'COORDINATOR', customerId: null, transporterId: null }, // [doc]
  { id: 'usr-arjun', name: 'Arjun', email: 'buyer@kestrel.test', role: 'CUSTOMER', customerId: 'cus-kestrel', transporterId: null }, // [doc]
  { id: 'usr-ramesh', name: 'Ramesh', email: 'driver.ramesh@ghatline.test', role: 'DRIVER', customerId: null, transporterId: 'trn-ghatline' }, // [doc]
  { id: 'usr-vikram', name: 'Vikram', email: 'driver.vikram@ghatline.test', role: 'DRIVER', customerId: null, transporterId: 'trn-ghatline' }, // [mock] second driver (D3)
];

export interface MockTruck {
  id: string;
  code: string;
  transporterId: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE';
  locationLabel: string;
  hasDefaultDriver: boolean;
}

export const TRUCKS: MockTruck[] = [
  { id: 'trk-07', code: 'TRK-07', transporterId: 'trn-ghatline', status: 'ASSIGNED', locationLabel: 'On route to Pune', hasDefaultDriver: true }, // [doc]
  { id: 'trk-11', code: 'TRK-11', transporterId: 'trn-ghatline', status: 'AVAILABLE', locationLabel: 'Khopoli yard', hasDefaultDriver: true }, // [doc]
  { id: 'trk-21', code: 'TRK-21', transporterId: 'trn-bluefinch', status: 'ASSIGNED', locationLabel: 'On route to Nashik', hasDefaultDriver: true },
  { id: 'trk-22', code: 'TRK-22', transporterId: 'trn-bluefinch', status: 'ASSIGNED', locationLabel: 'On route to Ahmedabad', hasDefaultDriver: true },
  { id: 'trk-31', code: 'TRK-31', transporterId: 'trn-ironpeak', status: 'ASSIGNED', locationLabel: 'On route to Nagpur', hasDefaultDriver: true },
  { id: 'trk-41', code: 'TRK-41', transporterId: 'trn-saltpan', status: 'ASSIGNED', locationLabel: 'On route to Surat', hasDefaultDriver: true },
  { id: 'trk-42', code: 'TRK-42', transporterId: 'trn-saltpan', status: 'ASSIGNED', locationLabel: 'Heronfield Plastics, Nashik', hasDefaultDriver: true },
  { id: 'trk-51', code: 'TRK-51', transporterId: 'trn-monsoon', status: 'ASSIGNED', locationLabel: 'Plant X', hasDefaultDriver: true },
];

/** Point at fraction f (0–1) along a polyline, by planar length. Mock positions only. */
export function pointAtFraction(coords: [number, number][], f: number): { lng: number; lat: number; bearing: number } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lens.push(l);
    total += l;
  }
  let target = Math.min(Math.max(f, 0), 1) * total;
  for (let i = 0; i < lens.length; i++) {
    const l = lens[i]!;
    const a = coords[i]!;
    const b = coords[i + 1]!;
    if (target <= l || i === lens.length - 1) {
      const r = l === 0 ? 0 : Math.min(target / l, 1);
      const bearing = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
      return { lng: a[0] + (b[0] - a[0]) * r, lat: a[1] + (b[1] - a[1]) * r, bearing: (bearing + 360) % 360 };
    }
    target -= l;
  }
  const last = coords[coords.length - 1]!;
  return { lng: last[0], lat: last[1], bearing: 0 };
}
