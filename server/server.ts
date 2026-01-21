import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import { initGridFS } from './config/gridfs';
import authRoutes from './routes/auth.routes';
import circularRoutes from './routes/circular.routes';
import pendingRoutes from './routes/pending.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * ================================
 * CORS CONFIG (PRODUCTION SAFE)
 * ================================
 */
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'https://circularnest-ui.vercel.app'
    ];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/**
 * ================================
 * DATABASE + GRIDFS
 * ================================
 */
(async () => {
  await connectDB();
  initGridFS();
})();

/**
 * ================================
 * ROUTES (UNCHANGED)
 * ================================
 */
app.use('/api/auth', authRoutes);
app.use('/api/circulars', circularRoutes);
app.use('/api/pending', pendingRoutes);

/**
 * ================================
 * HEALTH CHECK
 * ================================
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'CircularNest API is running',
    timestamp: new Date().toISOString()
  });
});

/**
 * ================================
 * ERROR HANDLER
 * ================================
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message || err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

/**
 * ================================
 * START SERVER
 * ================================
 */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
