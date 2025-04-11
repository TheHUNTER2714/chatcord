const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, { 
  cors: { 
    origin: ["https://chatcord-rp4q.onrender.com", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

// Enable CORS for API routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ["https://chatcord-rp4q.onrender.com", "http://localhost:3000"]);
  res.header("Access-Control-Allow-Methods", "GET, POST");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Track active rooms with additional metadata
const rooms = new Map();
const connections = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  connections.set(socket.id, null);

  socket.on("create_room", (data, callback) => {
    try {
      if (!data?.roomName || !data?.user?.name) {
        throw new Error("Invalid room creation data");
      }

      const roomCode = generateRoomCode();
      const user = {
        id: socket.id,
        name: data.user.name,
        joinedAt: new Date().toISOString()
      };

      rooms.set(roomCode, { 
        name: data.roomName, 
        users: new Map([[socket.id, user]]),
        createdAt: new Date().toISOString(),
        createdBy: user.id
      });

      connections.set(socket.id, { roomCode, user });
      socket.join(roomCode);
      
      callback({ 
        status: "success", 
        room: { 
          code: roomCode, 
          name: data.roomName 
        }
      });
      
      // Emit event to frontend
      socket.emit("room_created", { 
        code: roomCode, 
        name: data.roomName 
      });
    } catch (error) {
      console.error("Room creation error:", error);
      callback({ status: "error", message: error.message });
    }
  });

  socket.on("join_room", (data, callback) => {
    try {
      if (!data?.roomCode || !data?.user?.name) {
        throw new Error("Invalid join data");
      }

      const roomCode = data.roomCode.toUpperCase();
      const room = rooms.get(roomCode);
      
      if (!room) {
        throw new Error("Room not found");
      }

      const user = {
        id: socket.id,
        name: data.user.name,
        joinedAt: new Date().toISOString()
      };

      const usernameExists = Array.from(room.users.values()).some(
        u => u.name.toLowerCase() === user.name.toLowerCase()
      );
      
      if (usernameExists) {
        throw new Error("Username already taken in this room");
      }

      room.users.set(socket.id, user);
      connections.set(socket.id, { roomCode, user });
      socket.join(roomCode);
      
      io.to(roomCode).emit("user_joined", user);
      io.to(roomCode).emit("room_users", { 
        users: Array.from(room.users.values()),
        roomName: room.name
      });

      callback({ 
        status: "success", 
        room: { 
          code: roomCode, 
          name: room.name 
        }
      });
      
      // Emit event to frontend
      socket.emit("room_joined", { 
        room: { 
          code: roomCode, 
          name: room.name 
        },
        users: Array.from(room.users.values())
      });
    } catch (error) {
      console.error("Join room error:", error);
      callback({ status: "error", message: error.message });
      socket.emit("room_not_found");
    }
  });

  socket.on("send_message", (data, callback) => {
    try {
      if (!data?.roomCode || !data?.text) {
        throw new Error("Invalid message data");
      }

      const connection = connections.get(socket.id);
      if (!connection || connection.roomCode !== data.roomCode) {
        throw new Error("Not authorized to send messages to this room");
      }

      const room = rooms.get(data.roomCode);
      if (!room) {
        throw new Error("Room not found");
      }

      const user = room.users.get(socket.id);
      if (!user) {
        throw new Error("User not found in room");
      }

      const message = {
        id: Date.now().toString(),
        roomCode: data.roomCode,
        userId: user.id,
        userName: user.name,
        text: data.text,
        timestamp: new Date().toISOString()
      };

      io.to(data.roomCode).emit("new_message", message);
      callback({ status: "success" });
    } catch (error) {
      console.error("Message send error:", error);
      callback({ status: "error", message: error.message });
    }
  });

  socket.on("get_room_users", (data, callback) => {
    try {
      if (!data?.roomCode) {
        throw new Error("Room code required");
      }

      const room = rooms.get(data.roomCode);
      if (!room) {
        throw new Error("Room not found");
      }

      callback({
        status: "success",
        users: Array.from(room.users.values())
      });
    } catch (error) {
      console.error("Get room users error:", error);
      callback({ status: "error", message: error.message });
    }
  });

  socket.on("disconnect", () => {
    const connection = connections.get(socket.id);
    if (!connection) return;

    const { roomCode, user } = connection;
    connections.delete(socket.id);

    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      room.users.delete(socket.id);

      if (user) {
        io.to(roomCode).emit("user_left", user);
      }

      if (room.users.size === 0) {
        rooms.delete(roomCode);
        console.log(`Room ${roomCode} deleted (empty)`);
      } else {
        io.to(roomCode).emit("room_users", { 
          users: Array.from(room.users.values()),
          roomName: room.name
        });
      }
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy",
    rooms: rooms.size,
    connections: connections.size
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
