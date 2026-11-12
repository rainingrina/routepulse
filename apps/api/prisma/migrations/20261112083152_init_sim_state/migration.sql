-- CreateTable
CREATE TABLE "SimState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "simTime" TIMESTAMPTZ(3) NOT NULL,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "speed" INTEGER NOT NULL DEFAULT 1,
    "stepMinutes" INTEGER NOT NULL DEFAULT 5,
    "lastSettledAt" TIMESTAMPTZ(3) NOT NULL,
    "worldVersion" INTEGER NOT NULL DEFAULT 0,
    "seedName" TEXT NOT NULL,
    "simError" TEXT,

    CONSTRAINT "SimState_pkey" PRIMARY KEY ("id")
);
