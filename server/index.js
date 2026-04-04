const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

const PORT = 3001;
const PROXIMITY_RADIUS = 150; 
const activeUsers = {};

// Helper function: Pythagorean theorem for Euclidean distance
function getDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

io.on('connection', (socket) => {
  console.log(`🟢 User connected: ${socket.id}`);

  activeUsers[socket.id] = {
    id: socket.id,
    x: Math.floor(Math.random() * 400) + 100,
    y: Math.floor(Math.random() * 400) + 100,
  };

  socket.emit('map_state', activeUsers);
  socket.broadcast.emit('user_joined', activeUsers[socket.id]);

  // Handle Movement AND Proximity Checks
  socket.on('move', (newPosition) => {
    activeUsers[socket.id].x = newPosition.x;
    activeUsers[socket.id].y = newPosition.y;

    socket.broadcast.emit('user_moved', { id: socket.id, x: newPosition.x, y: newPosition.y });

    // --- PROXIMITY LOGIC ---
    Object.values(activeUsers).forEach(otherUser => {
      if (otherUser.id === socket.id) return; // Don't calculate distance to self

      const dist = getDistance(newPosition.x, newPosition.y, otherUser.x, otherUser.y);
      
      // Create a unique, consistent Room ID for these two users
      // Sorting ensures that UserA & UserB get the same ID as UserB & UserA
      const roomId = [socket.id, otherUser.id].sort().join('_');

      if (dist <= PROXIMITY_RADIUS) {
        // They are close! Connect them if they aren't already.
        if (!socket.rooms.has(roomId)) {
          socket.join(roomId);
          const partnerSocket = io.sockets.sockets.get(otherUser.id);
          if (partnerSocket) partnerSocket.join(roomId);

          // Tell both clients to open their chat UI
          io.to(roomId).emit('chat_joined', { roomId, partnerId: otherUser.id });
        }
      } else {
        // They moved away! Disconnect them if they are in the room.
        if (socket.rooms.has(roomId)) {
          // Tell clients to close UI first, then leave the socket room
          io.to(roomId).emit('chat_left', { roomId });
          
          socket.leave(roomId);
          const partnerSocket = io.sockets.sockets.get(otherUser.id);
          if (partnerSocket) partnerSocket.leave(roomId);
        }
      }
    });
  });

  // Handle Chat Messages
  socket.on('send_message', (data) => {
    // Broadcast message only to the users in this specific proximity room
    io.to(data.roomId).emit('receive_message', {
      senderId: socket.id,
      text: data.text,
      timestamp: Date.now()
    });
  });

  socket.on('disconnect', () => {
    console.log(`🔴 User disconnected: ${socket.id}`);
    delete activeUsers[socket.id];
    io.emit('user_left', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Cosmos Server running on http://localhost:${PORT}`);
});