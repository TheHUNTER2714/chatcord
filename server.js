const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, { 
  cors: { 
    origin: [
      "https://chatcord-rp4q.onrender.com",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket"],
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    websocket: io.engine.clientsCount,
    uptime: process.uptime()
  });
});

// Track active rooms and connections
const rooms = new Map();
const connections = new Map();

// Helper function to generate room code
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length: 6}, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log("New connection:", socket.id);
  
  // Existing room creation, join, and message handlers
  // ... (keep your existing room/message handling logic)

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    // Existing cleanup logic
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: wss://chatcord-rp4q.onrender.com`);
});
