import cron from 'node-cron';
import { checkWeatherForUpcomingTrips } from '../services/replan';

// Run every 6 hours: at minute 0 of hours 0, 6, 12, 18
const SCHEDULE = '0 0,6,12,18 * * *';

export function startWeatherCron() {
  console.log('Weather cron scheduled: every 6 hours');

  cron.schedule(SCHEDULE, async () => {
    console.log(`[${new Date().toISOString()}] Running weather check...`);
    try {
      await checkWeatherForUpcomingTrips();
      console.log(`[${new Date().toISOString()}] Weather check complete.`);
    } catch (err) {
      console.error('Weather cron error:', err);
    }
  });
}
