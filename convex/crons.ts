import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// C4: the time trigger's safety net; signPeriod schedules the next period's advance directly.
crons.cron("prepare overdue period closes", "0 6 * * *", internal.advance.sweep, {});
export default crons;
