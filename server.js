const path = require("path");
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: ["https://chatcord-rp4q.onrender.com", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket"],
  connectionStateRecovery: { maxDisconnectionDuration: 120000 }
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "main.html")));
app.get("/health", (req, res) => res.status(200).json({ status: "healthy", websocket: io.engine.clientsCount, uptime: process.uptime() }));

// In-memory stores
const rooms = new Map();
const userRooms = new Map();
const typingUsers = new Map();

// Helpers
function generateRoomCode() {
  return Array.from({length: 6}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
}

// Socket.io
io.on("connection", (socket) => {
  console.log("✅ New connection:", socket.id);

  socket.on("create_room", ({ roomName, user }) => {
    const code = generateRoomCode();
    const room = { name: roomName, code, users: [{ id: socket.id, name: user.name }] };
    rooms.set(code, room);
    userRooms.set(socket.id, code);
    socket.join(code);
    socket.emit("room_created", room);
  });

  socket.on("join_room", ({ roomCode, user }) => {
    const room = rooms.get(roomCode);
    if (!room) return socket.emit("room_not_found");
    
    if (!room.users.some(u => u.id === socket.id)) {
      room.users.push({ id: socket.id, name: user.name });
    }
    
    userRooms.set(socket.id, roomCode);
    socket.join(roomCode);
    socket.emit("room_joined", { room, users: room.users });
    socket.to(roomCode).emit("user_joined", user);
  });

  socket.on("get_room_users", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (room) socket.emit("room_users", room.users);
  });

  socket.on("send_message", (message) => {
    socket.to(message.roomCode).emit("new_message", message);
    socket.emit("new_message", message);
  });

  // Typing indicators
  socket.on("typing_start", ({ roomCode, user }) => {
    if (!typingUsers.has(roomCode)) typingUsers.set(roomCode, new Set());
    typingUsers.get(roomCode).add(user.id);
    const users = Array.from(typingUsers.get(roomCode)).map(id => 
      rooms.get(roomCode)?.users.find(u => u.id === id)).filter(Boolean);
    io.to(roomCode).emit("user_typing", users);
  });

  socket.on("typing_stop", ({ roomCode, user }) => {
    if (typingUsers.has(roomCode)) {
      typingUsers.get(roomCode).delete(user.id);
      const users = Array.from(typingUsers.get(roomCode)).map(id => 
        rooms.get(roomCode)?.users.find(u => u.id === id)).filter(Boolean);
      io.to(roomCode).emit("user_stopped_typing", users);
    }
  });

  socket.on("leave_room", ({ roomCode, userId }) => {
    const room = rooms.get(roomCode);
    if (room) {
      room.users = room.users.filter(u => u.id !== userId);
      socket.leave(roomCode);
      userRooms.delete(socket.id);
      socket.to(roomCode).emit("user_left", { id: userId });
    }
  });

  socket.on("disconnect", () => {
    const roomCode = userRooms.get(socket.id);
    if (roomCode) {
      // Clean up typing status
      if (typingUsers.has(roomCode)) {
        typingUsers.get(roomCode).delete(socket.id);
        const users = Array.from(typingUsers.get(roomCode)).map(id => 
          rooms.get(roomCode)?.users.find(u => u.id === id)).filter(Boolean);
        io.to(roomCode).emit("user_stopped_typing", users);
      }

      // Clean up room data
      const room = rooms.get(roomCode);
      if (room) {
        room.users = room.users.filter(u => u.id !== socket.id);
        socket.to(roomCode).emit("user_left", { id: socket.id });
        if (room.users.length === 0) rooms.delete(roomCode);
      }
      userRooms.delete(socket.id);
    }
    console.log("❌ Disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
