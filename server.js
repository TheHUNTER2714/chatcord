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

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    websocket: io.engine.clientsCount,
    uptime: process.uptime()
  });
});

// === In-Memory Data ===
const rooms = new Map(); // Map<roomCode, { name, code, users: [] }>
const userRooms = new Map(); // Map<socket.id, roomCode>

// === Room Code Generator ===
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

// === Socket.IO Logic ===
io.on("connection", (socket) => {
  console.log("✅ New connection:", socket.id);

  // === Create Room ===
  socket.on("create_room", ({ roomName, user }) => {
    const code = generateRoomCode();
    const room = {
      name: roomName,
      code: code,
      users: [{ id: socket.id, name: user.name }]
    };

    rooms.set(code, room);
    userRooms.set(socket.id, code);
    socket.join(code);

    socket.emit("room_created", room);
    console.log(`📦 Room created: ${code}`);
  });

  // === Join Room ===
  socket.on("join_room", ({ roomCode, user }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("room_not_found");
      return;
    }

    room.users.push({ id: socket.id, name: user.name });
    userRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    socket.emit("room_joined", { room, users: room.users });
    socket.to(roomCode).emit("user_joined", user);
  });

  // === Get Room Users ===
  socket.on("get_room_users", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (room) {
      socket.emit("room_users", room.users);
    }
  });

  // === Send Message ===
  socket.on("send_message", (message) => {
    const roomCode = message.roomCode;
    socket.to(roomCode).emit("new_message", message);
    socket.emit("new_message", message); // This will send the message back to the sender
  });

  // === Leave Room ===
  socket.on("leave_room", ({ roomCode, userId }) => {
    const room = rooms.get(roomCode);
    if (room) {
      room.users = room.users.filter(u => u.id !== userId);
      socket.leave(roomCode);
      userRooms.delete(socket.id);
      socket.to(roomCode).emit("user_left", { id: userId });
    }
  });

  // === Disconnect Cleanup ===
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    const roomCode = userRooms.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    room.users = room.users.filter(u => u.id !== socket.id);
    socket.to(roomCode).emit("user_left", { id: socket.id });
    userRooms.delete(socket.id);

    if (room.users.length === 0) {
      rooms.delete(roomCode);
      console.log(`🗑️ Room deleted: ${roomCode}`);
    }
  });
});

// === Server Start ===
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
