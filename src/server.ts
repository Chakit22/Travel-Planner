import 'dotenv/config';
import { createApp } from './server/index';
import { startWeatherCron } from './server/cron/weather';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = createApp();

app.listen(PORT, () => {
  console.log(`Atlas API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Start background jobs
startWeatherCron();
