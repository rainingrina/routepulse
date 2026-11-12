/**
 * Fictional reference data for Plant X (spec §5.1). Every company, person, truck and order is
 * fictional; real city locations are used only as map geography.
 *
 * ROUTE GEOMETRY IS HAND-TRACED DEMO DATA (task 4.1): the one-time open-routing export was not
 * available, so each line is a rough sketch through a few waypoints. It is not routing-engine
 * output and does not follow real roads precisely. Segment distances and baseline speeds are
 * fictional planning values chosen so the baseline minutes match the approved documents.
 */
import type { GeoJSONLineString, Segment } from '@routepulse/shared';
import { PLANT } from '@routepulse/shared';

export const GEOMETRY_SOURCE = 'HAND_TRACED_DEMO' as const;

// ───────────── Customers (one site and one lane each) ─────────────
export interface CustomerSeed {
  id: string;
  code: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
}
const RECEIVING = { receivingOpenMin: 480, receivingCloseMin: 1080, unloadingMinutes: 60 } as const; // 08:00–18:00 [A]

export const CUSTOMERS: readonly CustomerSeed[] = [
  { id: 'cus_kestrel', code: 'CUST-KES', name: 'Kestrel Moulders', city: 'Pune', lat: 18.5204, lng: 73.8567 },
  { id: 'cus_osprey', code: 'CUST-OSP', name: 'Osprey Containers', city: 'Nashik', lat: 19.9975, lng: 73.7898 },
  { id: 'cus_plover', code: 'CUST-PLO', name: 'Plover Packaging', city: 'Surat', lat: 21.1702, lng: 72.8311 },
  { id: 'cus_avocet', code: 'CUST-AVO', name: 'Avocet Polymers', city: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { id: 'cus_merlin', code: 'CUST-MER', name: 'Merlin Extrusions', city: 'Indore', lat: 22.7196, lng: 75.8577 },
  { id: 'cus_shrike', code: 'CUST-SHR', name: 'Shrike Pipes', city: 'Nagpur', lat: 21.1458, lng: 79.0882 },
];
export const CUSTOMER_RECEIVING = RECEIVING;

// ───────────── Transporters (fleetSize is the company size; ≤ 10 = small fleet) ─────────────
export interface TransporterSeed {
  id: string;
  code: string;
  name: string;
  fleetSize: number;
}
export const TRANSPORTERS: readonly TransporterSeed[] = [
  { id: 'trn_ghatline', code: 'TR-GHAT', name: 'Ghatline Carriers', fleetSize: 4 },
  { id: 'trn_coastway', code: 'TR-COAS', name: 'Coastway Movers', fleetSize: 8 },
  { id: 'trn_bluehill', code: 'TR-BLUE', name: 'Bluehill Transport', fleetSize: 25 },
  { id: 'trn_ironroad', code: 'TR-IRON', name: 'Ironroad Freight', fleetSize: 40 },
  { id: 'trn_northstar', code: 'TR-NRTH', name: 'Northstar Haulage', fleetSize: 60 },
];

// ───────────── Segments and routes ─────────────
/** Segment definition: code, name, length km, baseline minutes, hand-traced waypoints [lng, lat]. */
interface SegmentDef {
  code: string;
  name: string;
  km: number;
  minutes: number;
  /** Waypoints after the segment start (the start is the previous segment's end / the plant). */
  path: [number, number][];
}
const P: [number, number] = [PLANT.lng, PLANT.lat];

const SEGMENTS: Record<string, SegmentDef> = {
  // Pune corridor (hero lane). Ghat = baseline minutes 90–150 of the primary route.
  'PLT-KHP': { code: 'PLT-KHP', name: 'Plant X → Khopoli', km: 45, minutes: 90, path: [[73.2, 18.93], [73.34, 18.79]] },
  'KHP-LNV-GHAT': { code: 'KHP-LNV-GHAT', name: 'Khopoli–Lonavala ghat', km: 20, minutes: 60, path: [[73.37, 18.77], [73.405, 18.75]] },
  'LNV-PUN': { code: 'LNV-PUN', name: 'Lonavala → Pune', km: 65, minutes: 120, path: [[73.6, 18.66], [73.86, 18.52]] },
  'KHP-PUN-S': { code: 'KHP-PUN-S', name: 'Khopoli → Pune (southern road, avoids ghat)', km: 108, minutes: 270, path: [[73.25, 18.6], [73.45, 18.44], [73.86, 18.52]] },
  // North-east corridor (Nashik, Indore, Nagpur share the first stretches)
  'PLT-THN': { code: 'PLT-THN', name: 'Plant X → Thane', km: 35, minutes: 60, path: [[73.0, 19.2]] },
  'THN-KSR': { code: 'THN-KSR', name: 'Thane → Kasara', km: 70, minutes: 80, path: [[73.2, 19.42], [73.47, 19.65]] },
  'KSR-NSK': { code: 'KSR-NSK', name: 'Kasara → Nashik', km: 60, minutes: 70, path: [[73.6, 19.85], [73.79, 20.0]] },
  'THN-NSK-ALT': { code: 'THN-NSK-ALT', name: 'Thane → Nashik (alternate inland road)', km: 150, minutes: 200, path: [[73.4, 19.4], [73.75, 19.6], [73.79, 20.0]] },
  'NSK-DHL': { code: 'NSK-DHL', name: 'Nashik → Dhule', km: 160, minutes: 200, path: [[74.3, 20.5], [74.77, 20.9]] },
  'DHL-IDR': { code: 'DHL-IDR', name: 'Dhule → Indore', km: 260, minutes: 330, path: [[75.3, 21.6], [75.86, 22.72]] },
  'NSK-AUR': { code: 'NSK-AUR', name: 'Nashik → Aurangabad', km: 180, minutes: 240, path: [[74.6, 19.95], [75.34, 19.88]] },
  'AUR-AMR': { code: 'AUR-AMR', name: 'Aurangabad → Amravati', km: 330, minutes: 420, path: [[76.4, 20.4], [77.75, 20.93]] },
  'AMR-NGP': { code: 'AMR-NGP', name: 'Amravati → Nagpur', km: 155, minutes: 200, path: [[78.4, 21.0], [79.09, 21.15]] },
  // North-west corridor (Surat, Ahmedabad)
  'PLT-BWD': { code: 'PLT-BWD', name: 'Plant X → Bhiwandi', km: 40, minutes: 70, path: [[73.06, 19.3]] },
  'BWD-VPI': { code: 'BWD-VPI', name: 'Bhiwandi → Vapi', km: 140, minutes: 180, path: [[72.95, 19.8], [72.9, 20.37]] },
  'VPI-SRT': { code: 'VPI-SRT', name: 'Vapi → Surat', km: 100, minutes: 130, path: [[72.9, 20.8], [72.83, 21.17]] },
  'BWD-SRT-COAST': { code: 'BWD-SRT-COAST', name: 'Bhiwandi → Surat (coastal road)', km: 250, minutes: 360, path: [[72.8, 19.7], [72.72, 20.4], [72.83, 21.17]] },
  'SRT-VDR': { code: 'SRT-VDR', name: 'Surat → Vadodara', km: 150, minutes: 180, path: [[73.0, 21.7], [73.18, 22.31]] },
  'VDR-AMD': { code: 'VDR-AMD', name: 'Vadodara → Ahmedabad', km: 110, minutes: 120, path: [[72.85, 22.7], [72.57, 23.02]] },
};

export interface RouteSeed {
  id: string;
  code: string;
  laneId: string;
  name: string;
  isPrimary: boolean;
  segmentCodes: string[];
}
export interface LaneSeed {
  id: string;
  code: string;
  name: string;
  customerId: string;
}

export const LANES: readonly LaneSeed[] = [
  { id: 'lane_pune', code: 'LN-PUNE', name: 'Plant X → Pune', customerId: 'cus_kestrel' },
  { id: 'lane_nashik', code: 'LN-NASH', name: 'Plant X → Nashik', customerId: 'cus_osprey' },
  { id: 'lane_surat', code: 'LN-SURT', name: 'Plant X → Surat', customerId: 'cus_plover' },
  { id: 'lane_ahmedabad', code: 'LN-AHMD', name: 'Plant X → Ahmedabad', customerId: 'cus_avocet' },
  { id: 'lane_indore', code: 'LN-INDR', name: 'Plant X → Indore', customerId: 'cus_merlin' },
  { id: 'lane_nagpur', code: 'LN-NAGP', name: 'Plant X → Nagpur', customerId: 'cus_shrike' },
];

export const ROUTES: readonly RouteSeed[] = [
  { id: 'rt_pune_a', code: 'RT-PUNE-A', laneId: 'lane_pune', name: 'Expressway via Khopoli–Lonavala ghat', isPrimary: true, segmentCodes: ['PLT-KHP', 'KHP-LNV-GHAT', 'LNV-PUN'] },
  { id: 'rt_pune_b', code: 'RT-PUNE-B', laneId: 'lane_pune', name: 'Southern road (avoids the ghat)', isPrimary: false, segmentCodes: ['PLT-KHP', 'KHP-PUN-S'] },
  { id: 'rt_nashik_a', code: 'RT-NASH-A', laneId: 'lane_nashik', name: 'Via Thane and Kasara', isPrimary: true, segmentCodes: ['PLT-THN', 'THN-KSR', 'KSR-NSK'] },
  { id: 'rt_nashik_b', code: 'RT-NASH-B', laneId: 'lane_nashik', name: 'Alternate inland road', isPrimary: false, segmentCodes: ['PLT-THN', 'THN-NSK-ALT'] },
  { id: 'rt_surat_a', code: 'RT-SURT-A', laneId: 'lane_surat', name: 'Via Bhiwandi and Vapi', isPrimary: true, segmentCodes: ['PLT-BWD', 'BWD-VPI', 'VPI-SRT'] },
  { id: 'rt_surat_b', code: 'RT-SURT-B', laneId: 'lane_surat', name: 'Coastal road', isPrimary: false, segmentCodes: ['PLT-BWD', 'BWD-SRT-COAST'] },
  { id: 'rt_ahmedabad_a', code: 'RT-AHMD-A', laneId: 'lane_ahmedabad', name: 'Via Surat and Vadodara', isPrimary: true, segmentCodes: ['PLT-BWD', 'BWD-VPI', 'VPI-SRT', 'SRT-VDR', 'VDR-AMD'] },
  { id: 'rt_indore_a', code: 'RT-INDR-A', laneId: 'lane_indore', name: 'Via Nashik and Dhule', isPrimary: true, segmentCodes: ['PLT-THN', 'THN-KSR', 'KSR-NSK', 'NSK-DHL', 'DHL-IDR'] },
  { id: 'rt_nagpur_a', code: 'RT-NAGP-A', laneId: 'lane_nagpur', name: 'Via Nashik, Aurangabad and Amravati', isPrimary: true, segmentCodes: ['PLT-THN', 'THN-KSR', 'KSR-NSK', 'NSK-AUR', 'AUR-AMR', 'AMR-NGP'] },
];

export interface BuiltRoute extends RouteSeed {
  lengthKm: number;
  baselineMinutes: number;
  segments: Segment[];
  geometry: GeoJSONLineString & { x_source: typeof GEOMETRY_SOURCE };
}

/** Builds the stored segment table and the hand-traced LineString for a route. */
export function buildRoute(r: RouteSeed): BuiltRoute {
  const segments: Segment[] = [];
  const coords: [number, number][] = [P];
  let km = 0;
  let minutes = 0;
  for (const code of r.segmentCodes) {
    const def = SEGMENTS[code];
    if (!def) throw new Error(`unknown segment ${code}`);
    // Speed chosen so that round(km / speed × 60) = the designed minutes exactly.
    segments.push({ segmentCode: def.code, name: def.name, startKm: km, endKm: km + def.km, speedKmh: (def.km * 60) / def.minutes });
    km += def.km;
    minutes += def.minutes;
    coords.push(...def.path);
  }
  return {
    ...r,
    lengthKm: km,
    baselineMinutes: minutes,
    segments,
    geometry: { type: 'LineString', coordinates: coords, x_source: GEOMETRY_SOURCE },
  };
}

export const BUILT_ROUTES: readonly BuiltRoute[] = ROUTES.map(buildRoute);

export function primaryRouteOf(laneId: string): BuiltRoute {
  const r = BUILT_ROUTES.find((x) => x.laneId === laneId && x.isPrimary);
  if (!r) throw new Error(`no primary route for ${laneId}`);
  return r;
}

// ───────────── Users ─────────────
export interface UserSeed {
  id: string;
  email: string;
  name: string;
  role: 'COORDINATOR' | 'CUSTOMER' | 'DRIVER';
  customerId?: string;
  transporterId?: string;
  phone?: string;
}
/** All emails use the reserved .test domain; phone numbers are obviously fictional. */
export const USERS: readonly UserSeed[] = [
  { id: 'usr_coord_meera', email: 'coordinator@plantx.test', name: 'Meera', role: 'COORDINATOR' },
  { id: 'usr_cust_arjun', email: 'buyer@kestrel.test', name: 'Arjun', role: 'CUSTOMER', customerId: 'cus_kestrel' },
  { id: 'usr_cust_osprey', email: 'buyer@osprey.test', name: 'Neha', role: 'CUSTOMER', customerId: 'cus_osprey' },
  { id: 'usr_cust_plover', email: 'buyer@plover.test', name: 'Imran', role: 'CUSTOMER', customerId: 'cus_plover' },
  { id: 'usr_cust_avocet', email: 'buyer@avocet.test', name: 'Priya', role: 'CUSTOMER', customerId: 'cus_avocet' },
  { id: 'usr_cust_merlin', email: 'buyer@merlin.test', name: 'Kabir', role: 'CUSTOMER', customerId: 'cus_merlin' },
  { id: 'usr_cust_shrike', email: 'buyer@shrike.test', name: 'Sana', role: 'CUSTOMER', customerId: 'cus_shrike' },
  // Hero driver and the second Ghatline driver for the replacement truck (decision D3)
  { id: 'usr_drv_ramesh', email: 'driver.ramesh@ghatline.test', name: 'Ramesh', role: 'DRIVER', transporterId: 'trn_ghatline', phone: '+91-00000-00001' },
  { id: 'usr_drv_suresh', email: 'driver.suresh@ghatline.test', name: 'Suresh', role: 'DRIVER', transporterId: 'trn_ghatline', phone: '+91-00000-00002' },
  { id: 'usr_drv_anil', email: 'driver.anil@bluehill.test', name: 'Anil', role: 'DRIVER', transporterId: 'trn_bluehill', phone: '+91-00000-00003' },
  { id: 'usr_drv_vikram', email: 'driver.vikram@northstar.test', name: 'Vikram', role: 'DRIVER', transporterId: 'trn_northstar', phone: '+91-00000-00004' },
  { id: 'usr_drv_farhan', email: 'driver.farhan@coastway.test', name: 'Farhan', role: 'DRIVER', transporterId: 'trn_coastway', phone: '+91-00000-00005' },
  { id: 'usr_drv_joseph', email: 'driver.joseph@ironroad.test', name: 'Joseph', role: 'DRIVER', transporterId: 'trn_ironroad', phone: '+91-00000-00006' },
  { id: 'usr_drv_deepak', email: 'driver.deepak@northstar.test', name: 'Deepak', role: 'DRIVER', transporterId: 'trn_northstar', phone: '+91-00000-00007' },
  { id: 'usr_drv_gopal', email: 'driver.gopal@bluehill.test', name: 'Gopal', role: 'DRIVER', transporterId: 'trn_bluehill', phone: '+91-00000-00008' },
];

// ───────────── Trucks (20) ─────────────
export interface TruckSeed {
  id: string;
  code: string;
  transporterId: string;
  capacityT: number;
  status: 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE';
  locationLabel: string;
  lat: number;
  lng: number;
  defaultDriverUserId?: string;
}
const AT_PLANT = { locationLabel: 'Plant X yard', lat: PLANT.lat, lng: PLANT.lng };
export const TRUCKS: readonly TruckSeed[] = [
  // Ghatline (small fleet): TRK-07 hero truck; TRK-11 replacement truck parked at Khopoli yard (~20 km from the ghat)
  { id: 'trk_07', code: 'TRK-07', transporterId: 'trn_ghatline', capacityT: 25, status: 'ASSIGNED', ...AT_PLANT, defaultDriverUserId: 'usr_drv_ramesh' },
  { id: 'trk_08', code: 'TRK-08', transporterId: 'trn_ghatline', capacityT: 25, status: 'AVAILABLE', ...AT_PLANT },
  { id: 'trk_11', code: 'TRK-11', transporterId: 'trn_ghatline', capacityT: 25, status: 'AVAILABLE', locationLabel: 'Khopoli yard', lat: 18.786, lng: 73.343, defaultDriverUserId: 'usr_drv_suresh' },
  { id: 'trk_12', code: 'TRK-12', transporterId: 'trn_ghatline', capacityT: 20, status: 'MAINTENANCE', ...AT_PLANT },
  // Coastway (small fleet)
  { id: 'trk_21', code: 'TRK-21', transporterId: 'trn_coastway', capacityT: 22, status: 'ASSIGNED', ...AT_PLANT, defaultDriverUserId: 'usr_drv_farhan' },
  { id: 'trk_22', code: 'TRK-22', transporterId: 'trn_coastway', capacityT: 22, status: 'ASSIGNED', ...AT_PLANT },
  // Bluehill
  { id: 'trk_31', code: 'TRK-31', transporterId: 'trn_bluehill', capacityT: 25, status: 'ASSIGNED', ...AT_PLANT, defaultDriverUserId: 'usr_drv_anil' },
  { id: 'trk_32', code: 'TRK-32', transporterId: 'trn_bluehill', capacityT: 25, status: 'ASSIGNED', ...AT_PLANT, defaultDriverUserId: 'usr_drv_gopal' },
  { id: 'trk_33', code: 'TRK-33', transporterId: 'trn_bluehill', capacityT: 25, status: 'ASSIGNED', ...AT_PLANT },
  { id: 'trk_34', code: 'TRK-34', transporterId: 'trn_bluehill', capacityT: 25, status: 'AVAILABLE', ...AT_PLANT },
  // Ironroad
  { id: 'trk_41', code: 'TRK-41', transporterId: 'trn_ironroad', capacityT: 28, status: 'ASSIGNED', ...AT_PLANT, defaultDriverUserId: 'usr_drv_joseph' },
  { id: 'trk_42', code: 'TRK-42', transporterId: 'trn_ironroad', capacityT: 28, status: 'ASSIGNED', ...AT_PLANT },
  { id: 'trk_43', code: 'TRK-43', transporterId: 'trn_ironroad', capacityT: 28, status: 'AVAILABLE', ...AT_PLANT },
  // Northstar
  { id: 'trk_51', code: 'TRK-51', transporterId: 'trn_northstar', capacityT: 28, status: 'ASSIGNED', ...AT_PLANT, defaultDriverUserId: 'usr_drv_vikram' },
  { id: 'trk_52', code: 'TRK-52', transporterId: 'trn_northstar', capacityT: 28, status: 'ASSIGNED', ...AT_PLANT, defaultDriverUserId: 'usr_drv_deepak' },
  { id: 'trk_53', code: 'TRK-53', transporterId: 'trn_northstar', capacityT: 28, status: 'ASSIGNED', ...AT_PLANT },
  { id: 'trk_54', code: 'TRK-54', transporterId: 'trn_northstar', capacityT: 28, status: 'ASSIGNED', ...AT_PLANT },
  { id: 'trk_55', code: 'TRK-55', transporterId: 'trn_northstar', capacityT: 28, status: 'AVAILABLE', ...AT_PLANT },
  { id: 'trk_56', code: 'TRK-56', transporterId: 'trn_northstar', capacityT: 28, status: 'AVAILABLE', ...AT_PLANT },
  { id: 'trk_57', code: 'TRK-57', transporterId: 'trn_northstar', capacityT: 28, status: 'AVAILABLE', ...AT_PLANT },
];

/** Fictional polymer grade codes. */
export const GRADES = ['PX-PP 110', 'PX-HD 520', 'PX-LD 210', 'PX-PP 330'] as const;
