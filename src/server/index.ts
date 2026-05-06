import express from 'express';
import cors from 'cors';
import { usersRouter } from './routes/users';
import { tripsRouter } from './routes/trips';
import { chatRouter } from './routes/chat';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', agent: 'Atlas' });
  });

  // Routes
  app.use('/api/users', usersRouter);
  app.use('/api/trips', tripsRouter);
  app.use('/api/trips', chatRouter);

  return app;
}
