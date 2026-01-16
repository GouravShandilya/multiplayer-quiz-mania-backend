const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const express = require("express");
const mongoose = require("mongoose");
const { initializeSocket } = require("./socket");
const debug = require("debug")("quiz-mania:server");
const seedQuestions = require("./utils/seedQuestions");
const { errorHandler } = require("./middleware/errorHandler");

const rateLimit = require("express-rate-limit");
dotenv.config();

const app = express();
const port = 3001;

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again in 15 minutes",
});
app.use("/api", limiter);

// Body parsing
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

const connectDB = async () => {
  try {
    const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.rlpdnti.mongodb.net/?appName=Cluster0`;
    await mongoose.connect(uri, {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });
    debug("✅ MongoDB connected successfully");
  } catch (error) {
    debug("❌ MongoDB connection error: %s", error.message);
    process.exit(1);
  }
};

// =============================================================================
// ROUTES
// =============================================================================

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Quiz Mania API is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
const gameRoutes = require("./routes/game");
const userRoutes = require("./routes/user");

app.use("/api/game", gameRoutes);
app.use("/api/user", userRoutes);

// Handle undefined routes
app.all(/(.*)/, (req, res) => {
  res.status(404).json({
    status: "fail",
    message: `Cannot find ${req.originalUrl} on this server`,
  });
});

// Global error handler
app.use(errorHandler);

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

const httpServer = http.createServer(app);

// Initialize Socket.io
initializeSocket(httpServer);

// Start server
const startServer = async () => {
  await connectDB();

  httpServer.listen(port, async () => {
    debug(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🎮 Quiz Mania Server Started Successfully!             ║
║                                                          ║
║   📍 REST API:    http://localhost:${port}               ║
║   🔌 WebSocket:   ws://localhost:${port}                 ║
║   📊 Health:      http://localhost:${port}/health        ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
        `);

    // Seed default questions
    try {
      await seedQuestions();
    } catch (error) {
      debug("Error seeding questions: %O", error);
    }
  });
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  debug("UNHANDLED REJECTION! 💥 Shutting down...");
  debug(err.name, err.message);
  httpServer.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM
process.on("SIGTERM", () => {
  debug("👋 SIGTERM received. Shutting down gracefully...");
  httpServer.close(() => {
    debug("💤 Process terminated!");
  });
});

startServer();
