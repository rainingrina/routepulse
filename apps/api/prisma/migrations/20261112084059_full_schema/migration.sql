-- CreateEnum
CREATE TYPE "Role" AS ENUM ('COORDINATOR', 'CUSTOMER', 'DRIVER');

-- CreateEnum
CREATE TYPE "Milestone" AS ENUM ('ORDER_CONFIRMED', 'TRUCK_ASSIGNED', 'AT_GATE', 'LOADING', 'GATE_OUT', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('ON_TRACK', 'WATCH', 'AT_RISK', 'LATE');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Party" AS ENUM ('PLANT', 'TRANSPORTER', 'CUSTOMER', 'EXTERNAL', 'UNATTRIBUTED');

-- CreateEnum
CREATE TYPE "FactorCode" AS ENUM ('GATE', 'HIST', 'DISR', 'RPT', 'WIN');

-- CreateEnum
CREATE TYPE "ReasonCode" AS ENUM ('BREAKDOWN', 'PLANT_GATE_WAIT', 'TRAFFIC', 'ROAD_CLOSED', 'HEAVY_RAIN', 'DOCUMENTS', 'UNLOADING_WAIT', 'OTHER', 'TRANSPORTER_PACE', 'RECEIVING_WINDOW');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MILESTONE', 'DRIVER_REPORT', 'REPORT_REVIEWED', 'DISRUPTION_STARTED', 'DISRUPTION_ENDED', 'ALERT_OPENED', 'ALERT_RESOLVED', 'CUSTOMER_NOTIFIED', 'CUSTOMER_RESPONDED', 'RECOVERY_CHOSEN', 'RECOVERY_APPLIED', 'ATTRIBUTION_OVERRIDDEN', 'PHYSICAL_ARRIVAL');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('DRIVER', 'COORDINATOR', 'SIMULATION', 'SEED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DisruptionKind" AS ENUM ('WEATHER_SLOWDOWN', 'ROAD_CLOSURE', 'GATE_CONGESTION', 'TRUCK_BREAKDOWN');

-- CreateEnum
CREATE TYPE "DisruptionOrigin" AS ENUM ('SEED', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACTION_CHOSEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CustomerResponse" AS ENUM ('ACCEPT_PROPOSAL', 'PREFER_TO_WAIT', 'REQUEST_CALL');

-- CreateEnum
CREATE TYPE "RecoveryKind" AS ENUM ('REROUTE', 'SPLIT', 'REPLACEMENT_TRUCK', 'NEW_WINDOW', 'NOTIFY_ONLY');

-- CreateEnum
CREATE TYPE "OptionStatus" AS ENUM ('PROPOSED', 'AWAITING_CUSTOMER', 'CHOSEN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('COORDINATOR', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('AT_RISK', 'AT_RISK_CUSTOMER', 'RECOVERY_CONFIRMED', 'PLAN_UPDATED', 'REPORT_NEEDS_REVIEW', 'CUSTOMER_RESPONDED', 'BACK_ON_TRACK', 'DELIVERED', 'ARRIVED_LATE');

-- CreateEnum
CREATE TYPE "TruckStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AttributionStatus" AS ENUM ('LIVE', 'FINAL');

-- CreateEnum
CREATE TYPE "AttributionKind" AS ENUM ('TIME_LOST', 'PLAN_CHANGE', 'GAP');

-- CreateEnum
CREATE TYPE "SnapshotTrigger" AS ENUM ('STEP', 'MILESTONE', 'REPORT', 'REVIEW', 'DISRUPTION', 'RECOVERY', 'SEED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "customerId" TEXT,
    "transporterId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "receivingOpenMin" INTEGER NOT NULL,
    "receivingCloseMin" INTEGER NOT NULL,
    "unloadingMinutes" INTEGER NOT NULL DEFAULT 60,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transporter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fleetSize" INTEGER NOT NULL,

    CONSTRAINT "Transporter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "transporterId" TEXT NOT NULL,
    "capacityT" DECIMAL(6,1) NOT NULL,
    "status" "TruckStatus" NOT NULL DEFAULT 'AVAILABLE',
    "locationLabel" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "defaultDriverUserId" TEXT,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lane" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "baselineMinutes" INTEGER NOT NULL,
    "distanceKm" DECIMAL(7,2) NOT NULL,

    CONSTRAINT "Lane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL,
    "lengthKm" DECIMAL(7,2) NOT NULL,
    "baselineMinutes" INTEGER NOT NULL,
    "geometry" JSONB NOT NULL,
    "segments" JSONB NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "promisedBy" TIMESTAMPTZ(3) NOT NULL,
    "placedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "gradeCode" TEXT NOT NULL,
    "quantityT" DECIMAL(6,1) NOT NULL,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "transporterId" TEXT NOT NULL,
    "truckId" TEXT,
    "driverUserId" TEXT,
    "parentShipmentId" TEXT,
    "autopilot" BOOLEAN NOT NULL DEFAULT true,
    "isHistorical" BOOLEAN NOT NULL DEFAULT false,
    "currentMilestone" "Milestone" NOT NULL,
    "plannedGateAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedDepartureAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedArrivalAt" TIMESTAMPTZ(3) NOT NULL,
    "promisedBy" TIMESTAMPTZ(3) NOT NULL,
    "originalPromisedBy" TIMESTAMPTZ(3) NOT NULL,
    "renegotiated" BOOLEAN NOT NULL DEFAULT false,
    "receivingWindowOverrideEndAt" TIMESTAMPTZ(3),
    "progressM" INTEGER NOT NULL DEFAULT 0,
    "progressCarryMm" INTEGER NOT NULL DEFAULT 0,
    "stoppedUntil" TIMESTAMPTZ(3),
    "gateQueuedAt" TIMESTAMPTZ(3),
    "loadingStartedAt" TIMESTAMPTZ(3),
    "gateOutAt" TIMESTAMPTZ(3),
    "lastUpdateAt" TIMESTAMPTZ(3),
    "pingIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "silentFrom" TIMESTAMPTZ(3),
    "etaAt" TIMESTAMPTZ(3),
    "etaLowAt" TIMESTAMPTZ(3),
    "etaHighAt" TIMESTAMPTZ(3),
    "slackMinutes" INTEGER,
    "riskLevel" "RiskLevel",
    "riskScore" INTEGER,
    "confidence" "Confidence",
    "currentOptionSetId" TEXT,
    "firstAtRiskAt" TIMESTAMPTZ(3),
    "customerNotifiedAt" TIMESTAMPTZ(3),
    "physicalArrivalAt" TIMESTAMPTZ(3),
    "arrivedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "delayMinutes" INTEGER,
    "onTime" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantityT" DECIMAL(6,1) NOT NULL,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "milestone" "Milestone",
    "simTime" TIMESTAMPTZ(3) NOT NULL,
    "source" "EventSource" NOT NULL,
    "actorUserId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSnapshot" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "simTime" TIMESTAMPTZ(3) NOT NULL,
    "trigger" "SnapshotTrigger" NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "plannedArrivalAt" TIMESTAMPTZ(3) NOT NULL,
    "predictedArrivalAt" TIMESTAMPTZ(3) NOT NULL,
    "etaLowAt" TIMESTAMPTZ(3) NOT NULL,
    "etaHighAt" TIMESTAMPTZ(3) NOT NULL,
    "slackMinutes" INTEGER NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "progressKm" DECIMAL(7,2) NOT NULL,
    "factors" JSONB NOT NULL,

    CONSTRAINT "RiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disruption" (
    "id" TEXT NOT NULL,
    "kind" "DisruptionKind" NOT NULL,
    "origin" "DisruptionOrigin" NOT NULL,
    "label" TEXT NOT NULL,
    "segmentCodes" TEXT[],
    "shipmentId" TEXT,
    "slowdownPct" INTEGER,
    "extraMinutesPerTruck" INTEGER,
    "stopMinutes" INTEGER,
    "party" "Party" NOT NULL,
    "reasonCode" "ReasonCode" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "endedEarlyAt" TIMESTAMPTZ(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Disruption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverReport" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "simTime" TIMESTAMPTZ(3) NOT NULL,
    "chipReason" "ReasonCode",
    "text" TEXT,
    "suggestedReason" "ReasonCode",
    "matchedKeywords" TEXT[],
    "reason" "ReasonCode" NOT NULL,
    "estimatedMinutes" INTEGER,
    "appliedMinutes" INTEGER NOT NULL,
    "party" "Party" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNote" TEXT,
    "originalReason" "ReasonCode",
    "originalParty" "Party",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMPTZ(3) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "topFactor" "FactorCode",
    "topReason" "ReasonCode",
    "proposedOptionId" TEXT,
    "chosenOptionId" TEXT,
    "chosenByUserId" TEXT,
    "chosenAt" TIMESTAMPTZ(3),
    "customerResponse" "CustomerResponse",
    "customerRespondedAt" TIMESTAMPTZ(3),
    "customerRespondedByUserId" TEXT,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryOption" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "alertId" TEXT,
    "optionSetId" TEXT NOT NULL,
    "createdAtSim" TIMESTAMPTZ(3) NOT NULL,
    "kind" "RecoveryKind" NOT NULL,
    "feasible" BOOLEAN NOT NULL,
    "infeasibleReason" TEXT,
    "newEtaAt" TIMESTAMPTZ(3),
    "etaLowAt" TIMESTAMPTZ(3),
    "etaHighAt" TIMESTAMPTZ(3),
    "meetsPromise" BOOLEAN NOT NULL,
    "minutesSavedVsNotify" INTEGER NOT NULL,
    "extraCostInr" INTEGER NOT NULL,
    "co2eDeltaKg" DECIMAL(8,1),
    "co2eMethod" TEXT,
    "isSuggested" BOOLEAN NOT NULL DEFAULT false,
    "suggestionRule" TEXT NOT NULL,
    "constraints" TEXT[],
    "params" JSONB NOT NULL,
    "status" "OptionStatus" NOT NULL DEFAULT 'PROPOSED',

    CONSTRAINT "RecoveryOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "audience" "Audience" NOT NULL,
    "customerId" TEXT,
    "shipmentId" TEXT,
    "alertId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "simTime" TIMESTAMPTZ(3) NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelayAttribution" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "kind" "AttributionKind" NOT NULL DEFAULT 'TIME_LOST',
    "factor" "FactorCode",
    "reason" "ReasonCode",
    "party" "Party" NOT NULL,
    "delaySeconds" INTEGER NOT NULL,
    "status" "AttributionStatus" NOT NULL DEFAULT 'LIVE',
    "disruptionId" TEXT,
    "driverReportId" TEXT,
    "originalParty" "Party",
    "overrideNote" TEXT,
    "overriddenByUserId" TEXT,
    "overriddenAt" TIMESTAMPTZ(3),
    "updatedAtSim" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DelayAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "simTime" TIMESTAMPTZ(3),
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_customerId_idx" ON "User"("customerId");

-- CreateIndex
CREATE INDEX "User_transporterId_idx" ON "User"("transporterId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Transporter_code_key" ON "Transporter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_code_key" ON "Truck"("code");

-- CreateIndex
CREATE INDEX "Truck_status_transporterId_idx" ON "Truck"("status", "transporterId");

-- CreateIndex
CREATE UNIQUE INDEX "Lane_code_key" ON "Lane"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Lane_customerId_key" ON "Lane"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Route_code_key" ON "Route"("code");

-- CreateIndex
CREATE INDEX "Route_laneId_idx" ON "Route"("laneId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE INDEX "Order_customerId_promisedBy_idx" ON "Order"("customerId", "promisedBy");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_gradeCode_key" ON "OrderLine"("orderId", "gradeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_code_key" ON "Shipment"("code");

-- CreateIndex
CREATE INDEX "Shipment_isHistorical_riskScore_idx" ON "Shipment"("isHistorical", "riskScore" DESC);

-- CreateIndex
CREATE INDEX "Shipment_driverUserId_currentMilestone_idx" ON "Shipment"("driverUserId", "currentMilestone");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_laneId_arrivedAt_idx" ON "Shipment"("laneId", "arrivedAt");

-- CreateIndex
CREATE INDEX "Shipment_transporterId_arrivedAt_idx" ON "Shipment"("transporterId", "arrivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentItem_shipmentId_orderLineId_key" ON "ShipmentItem"("shipmentId", "orderLineId");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_simTime_idx" ON "ShipmentEvent"("shipmentId", "simTime");

-- CreateIndex
CREATE INDEX "RiskSnapshot_shipmentId_simTime_idx" ON "RiskSnapshot"("shipmentId", "simTime");

-- CreateIndex
CREATE INDEX "Disruption_startsAt_endsAt_idx" ON "Disruption"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "DriverReport_status_simTime_idx" ON "DriverReport"("status", "simTime");

-- CreateIndex
CREATE INDEX "DriverReport_shipmentId_simTime_idx" ON "DriverReport"("shipmentId", "simTime");

-- CreateIndex
CREATE INDEX "Alert_status_openedAt_idx" ON "Alert"("status", "openedAt");

-- CreateIndex
CREATE INDEX "Alert_shipmentId_idx" ON "Alert"("shipmentId");

-- CreateIndex
CREATE INDEX "RecoveryOption_shipmentId_optionSetId_idx" ON "RecoveryOption"("shipmentId", "optionSetId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryOption_optionSetId_kind_key" ON "RecoveryOption"("optionSetId", "kind");

-- CreateIndex
CREATE INDEX "Notification_audience_customerId_readAt_idx" ON "Notification"("audience", "customerId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_shipmentId_idx" ON "Notification"("shipmentId");

-- CreateIndex
CREATE INDEX "DelayAttribution_party_status_idx" ON "DelayAttribution"("party", "status");

-- CreateIndex
CREATE INDEX "DelayAttribution_shipmentId_idx" ON "DelayAttribution"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DelayAttribution_shipmentId_sourceKey_party_key" ON "DelayAttribution"("shipmentId", "sourceKey", "party");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "Transporter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "Transporter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_defaultDriverUserId_fkey" FOREIGN KEY ("defaultDriverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "Lane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "Transporter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_driverUserId_fkey" FOREIGN KEY ("driverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_parentShipmentId_fkey" FOREIGN KEY ("parentShipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSnapshot" ADD CONSTRAINT "RiskSnapshot_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSnapshot" ADD CONSTRAINT "RiskSnapshot_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disruption" ADD CONSTRAINT "Disruption_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverReport" ADD CONSTRAINT "DriverReport_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverReport" ADD CONSTRAINT "DriverReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverReport" ADD CONSTRAINT "DriverReport_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryOption" ADD CONSTRAINT "RecoveryOption_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryOption" ADD CONSTRAINT "RecoveryOption_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_disruptionId_fkey" FOREIGN KEY ("disruptionId") REFERENCES "Disruption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_driverReportId_fkey" FOREIGN KEY ("driverReportId") REFERENCES "DriverReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Raw-SQL constraints and partial unique indexes (planning/05_DATABASE_SCHEMA.md §5).
-- Prisma's schema language cannot express these; they are part of the approved design.
-- ════════════════════════════════════════════════════════════════════════════

-- §5.1 User
ALTER TABLE "User" ADD CONSTRAINT "User_role_scope_chk" CHECK (
  ("role" = 'CUSTOMER' AND "customerId" IS NOT NULL AND "transporterId" IS NULL) OR
  ("role" = 'DRIVER' AND "transporterId" IS NOT NULL AND "customerId" IS NULL) OR
  ("role" = 'COORDINATOR' AND "customerId" IS NULL AND "transporterId" IS NULL));
ALTER TABLE "User" ADD CONSTRAINT "User_email_lower_chk" CHECK ("email" = lower("email"));

-- §5.2 Customer
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_receiving_hours_chk" CHECK (
  "receivingOpenMin" BETWEEN 0 AND 1439 AND "receivingCloseMin" BETWEEN 1 AND 1440
  AND "receivingOpenMin" < "receivingCloseMin");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_unloading_chk" CHECK ("unloadingMinutes" > 0);

-- §5.3 Transporter
ALTER TABLE "Transporter" ADD CONSTRAINT "Transporter_fleet_chk" CHECK ("fleetSize" > 0);

-- §5.4 Truck
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_capacity_chk" CHECK ("capacityT" > 0);

-- §5.5 Lane
ALTER TABLE "Lane" ADD CONSTRAINT "Lane_positive_chk" CHECK ("baselineMinutes" > 0 AND "distanceKm" > 0);

-- §5.6 Route: one primary route per lane
CREATE UNIQUE INDEX "route_one_primary_per_lane" ON "Route"("laneId") WHERE "isPrimary";

-- §5.8 OrderLine
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_quantity_chk" CHECK ("quantityT" > 0);

-- §5.9 Shipment
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_progress_chk" CHECK ("progressM" >= 0 AND "progressCarryMm" BETWEEN 0 AND 999);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_risk_score_chk" CHECK ("riskScore" IS NULL OR "riskScore" BETWEEN 0 AND 100);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_outcome_together_chk" CHECK (
  ("arrivedAt" IS NULL) = ("delayMinutes" IS NULL) AND ("arrivedAt" IS NULL) = ("onTime" IS NULL));
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_delivered_after_arrival_chk" CHECK ("deliveredAt" IS NULL OR "arrivedAt" IS NOT NULL);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_arrival_physical_chk" CHECK (
  "arrivedAt" IS NULL OR ("physicalArrivalAt" IS NOT NULL AND "arrivedAt" >= "physicalArrivalAt"));
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_window_override_chk" CHECK (
  "receivingWindowOverrideEndAt" IS NULL OR ("renegotiated" AND "receivingWindowOverrideEndAt" > "originalPromisedBy"));
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_delay_nonneg_chk" CHECK ("delayMinutes" IS NULL OR "delayMinutes" >= 0);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_delivered_order_chk" CHECK (
  "deliveredAt" IS NULL OR "arrivedAt" IS NULL OR "deliveredAt" >= "arrivedAt");
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_plan_order_chk" CHECK ("plannedArrivalAt" > "plannedDepartureAt");
CREATE UNIQUE INDEX "shipment_one_live_per_truck" ON "Shipment"("truckId")
  WHERE "truckId" IS NOT NULL AND "currentMilestone" <> 'DELIVERED' AND NOT "isHistorical";

-- §5.10 ShipmentItem
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_quantity_chk" CHECK ("quantityT" > 0);

-- §5.11 ShipmentEvent
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_milestone_chk" CHECK (("type" = 'MILESTONE') = ("milestone" IS NOT NULL));
CREATE UNIQUE INDEX "event_milestone_once" ON "ShipmentEvent"("shipmentId", "milestone") WHERE "type" = 'MILESTONE';

-- §5.12 RiskSnapshot
ALTER TABLE "RiskSnapshot" ADD CONSTRAINT "RiskSnapshot_score_chk" CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "RiskSnapshot" ADD CONSTRAINT "RiskSnapshot_range_chk" CHECK (
  "etaLowAt" <= "predictedArrivalAt" AND "predictedArrivalAt" <= "etaHighAt");

-- §5.13 Disruption
ALTER TABLE "Disruption" ADD CONSTRAINT "Disruption_window_chk" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Disruption" ADD CONSTRAINT "Disruption_weather_chk" CHECK (
  "kind" <> 'WEATHER_SLOWDOWN' OR ("slowdownPct" BETWEEN 1 AND 90 AND cardinality("segmentCodes") > 0));
ALTER TABLE "Disruption" ADD CONSTRAINT "Disruption_closure_chk" CHECK ("kind" <> 'ROAD_CLOSURE' OR cardinality("segmentCodes") > 0);
ALTER TABLE "Disruption" ADD CONSTRAINT "Disruption_gate_chk" CHECK ("kind" <> 'GATE_CONGESTION' OR "extraMinutesPerTruck" > 0);
ALTER TABLE "Disruption" ADD CONSTRAINT "Disruption_breakdown_chk" CHECK (
  "kind" <> 'TRUCK_BREAKDOWN' OR ("shipmentId" IS NOT NULL AND "stopMinutes" > 0));

-- §5.14 DriverReport
ALTER TABLE "DriverReport" ADD CONSTRAINT "DriverReport_input_chk" CHECK ("chipReason" IS NOT NULL OR "text" IS NOT NULL);
ALTER TABLE "DriverReport" ADD CONSTRAINT "DriverReport_text_len_chk" CHECK (char_length(coalesce("text", '')) <= 280);
ALTER TABLE "DriverReport" ADD CONSTRAINT "DriverReport_applied_chk" CHECK ("appliedMinutes" > 0);
ALTER TABLE "DriverReport" ADD CONSTRAINT "DriverReport_review_chk" CHECK (
  "status" = 'PENDING_REVIEW' OR ("reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL));
ALTER TABLE "DriverReport" ADD CONSTRAINT "DriverReport_change_note_chk" CHECK (
  ("originalReason" IS NULL AND "originalParty" IS NULL) OR "reviewNote" IS NOT NULL);

-- §5.15 Alert: one active episode per shipment (AC-M4.7)
CREATE UNIQUE INDEX "alert_one_open_per_shipment" ON "Alert"("shipmentId") WHERE "status" IN ('OPEN', 'ACTION_CHOSEN');
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_chosen_chk" CHECK (
  "status" <> 'ACTION_CHOSEN' OR ("chosenOptionId" IS NOT NULL AND "chosenByUserId" IS NOT NULL));
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_response_pair_chk" CHECK (("customerResponse" IS NULL) = ("customerRespondedAt" IS NULL));

-- §5.16 RecoveryOption
CREATE UNIQUE INDEX "option_one_suggested_per_set" ON "RecoveryOption"("optionSetId") WHERE "isSuggested";
ALTER TABLE "RecoveryOption" ADD CONSTRAINT "RecoveryOption_infeasible_reason_chk" CHECK ("feasible" OR "infeasibleReason" IS NOT NULL);
ALTER TABLE "RecoveryOption" ADD CONSTRAINT "RecoveryOption_suggested_chk" CHECK (
  NOT "isSuggested" OR ("feasible" AND "kind" NOT IN ('NEW_WINDOW', 'NOTIFY_ONLY')));
ALTER TABLE "RecoveryOption" ADD CONSTRAINT "RecoveryOption_cost_chk" CHECK ("extraCostInr" >= 0);
ALTER TABLE "RecoveryOption" ADD CONSTRAINT "RecoveryOption_co2e_pair_chk" CHECK (("co2eDeltaKg" IS NULL) = ("co2eMethod" IS NULL));

-- §5.17 Notification
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_audience_chk" CHECK (("audience" = 'CUSTOMER') = ("customerId" IS NOT NULL));

-- §5.18 DelayAttribution
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_seconds_chk" CHECK ("delaySeconds" >= 0);
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_override_pair_chk" CHECK (("originalParty" IS NULL) = ("overrideNote" IS NULL));
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_disr_source_chk" CHECK ("sourceKey" NOT LIKE 'DISR:%' OR "disruptionId" IS NOT NULL);
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_route_source_chk" CHECK (
  "sourceKey" NOT LIKE 'ROUTE:%' OR ("disruptionId" IS NOT NULL AND "kind" = 'PLAN_CHANGE'));
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_rpt_source_chk" CHECK ("sourceKey" NOT LIKE 'RPT:%' OR "driverReportId" IS NOT NULL);
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_gap_key_chk" CHECK (("kind" = 'GAP') = ("sourceKey" = 'GAP'));
ALTER TABLE "DelayAttribution" ADD CONSTRAINT "DelayAttribution_gap_party_chk" CHECK ("kind" <> 'GAP' OR "party" = 'UNATTRIBUTED');
