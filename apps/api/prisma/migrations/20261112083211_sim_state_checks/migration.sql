-- Raw-SQL constraints (planning/05_DATABASE_SCHEMA.md §5.20); Prisma schema cannot express CHECKs.
ALTER TABLE "SimState" ADD CONSTRAINT "SimState_singleton_chk" CHECK ("id" = 1);
ALTER TABLE "SimState" ADD CONSTRAINT "SimState_speed_chk" CHECK ("speed" IN (1, 10, 60));
ALTER TABLE "SimState" ADD CONSTRAINT "SimState_step_chk" CHECK ("stepMinutes" > 0);
ALTER TABLE "SimState" ADD CONSTRAINT "SimState_settled_chk" CHECK ("lastSettledAt" <= "simTime");
