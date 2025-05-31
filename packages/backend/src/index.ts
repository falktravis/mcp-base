// Main entry point for the backend application
import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
// import { PrismaClient } from '@prisma/client';
import { initializeDatabase } from './config/database'; // Import initializeDatabase

// Import routes
import managementApiRoutes from './routes/managementApi';
import mcpApiRoutes from './routes/mcpApi';

dotenv.config(); // Load environment variables from .env file

const app: Express = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Basic CORS middleware (consider using the 'cors' package for more options)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all origins (adjust for production)
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    return res.status(200).json({});
  }
  next();
});

// API Routes
app.use('/api/management', managementApiRoutes);
app.use('/mcp', mcpApiRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.send('MCP Pro Backend is running!');
});

// Global error handler (simple example)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

async function main() {
  // Initialize database
  try {
    await initializeDatabase();
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize the database:', error);
    process.exit(1); // Exit if DB initialization fails
  }

  app.listen(port, () => {
    console.log(`Backend server is listening on port ${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1); // Exit directly
});
