import type { Prisma } from '../generated/prisma/client.js';

/** All rows the seed inserts, in dependency order. Every row carries an explicit, stable id. */
export interface SeedRows {
  customers: Prisma.CustomerCreateManyInput[];
  transporters: Prisma.TransporterCreateManyInput[];
  users: Prisma.UserCreateManyInput[];
  trucks: Prisma.TruckCreateManyInput[];
  lanes: Prisma.LaneCreateManyInput[];
  routes: Prisma.RouteCreateManyInput[];
  orders: Prisma.OrderCreateManyInput[];
  orderLines: Prisma.OrderLineCreateManyInput[];
  shipments: Prisma.ShipmentCreateManyInput[];
  shipmentItems: Prisma.ShipmentItemCreateManyInput[];
  disruptions: Prisma.DisruptionCreateManyInput[];
  driverReports: Prisma.DriverReportCreateManyInput[];
  events: Prisma.ShipmentEventCreateManyInput[];
  alerts: Prisma.AlertCreateManyInput[];
  recoveryOptions: Prisma.RecoveryOptionCreateManyInput[];
  notifications: Prisma.NotificationCreateManyInput[];
  attributions: Prisma.DelayAttributionCreateManyInput[];
}

export function emptyRows(): SeedRows {
  return {
    customers: [],
    transporters: [],
    users: [],
    trucks: [],
    lanes: [],
    routes: [],
    orders: [],
    orderLines: [],
    shipments: [],
    shipmentItems: [],
    disruptions: [],
    driverReports: [],
    events: [],
    alerts: [],
    recoveryOptions: [],
    notifications: [],
    attributions: [],
  };
}
