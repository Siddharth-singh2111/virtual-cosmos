// server/index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json()); // Allows us to read JSON from the React login form

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

const PORT = 3001;
const PROXIMITY_RADIUS = 150; 
const activeUsers = {};

// --- 1. MONGODB SETUP ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('📦 Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Create a simple User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  lastActive: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// --- 2. LOGIN API ENDPOINT ---
app.post('/api/login', async (req, res) => {
  try {
    const { username } = req.body;
    // Find user, or create them if they don't exist
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({ username });
      await user.save();
    } else {
      user.lastActive = Date.now();
      await user.save();
    }
    res.json({ success: true, username: user.username });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- HELPER FUNCTION ---
function getDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// --- 3. SOCKET LOGIC (Now expecting usernames) ---
io.on('connection', (socket) => {
  // Grab the username passed from React during connection
  const username = socket.handshake.query.username;
  
  if (!username) {
    socket.disconnect(); // Kick them out if they didn't log in
    return;
  }

  console.log(`🟢 User joined: ${username} (${socket.id})`);

  activeUsers[socket.id] = {
    id: socket.id,
    username: username,
    x: Math.floor(Math.random() * 400) + 100,
    y: Math.floor(Math.random() * 400) + 100,
  };

  socket.emit('map_state', activeUsers);
  socket.broadcast.emit('user_joined', activeUsers[socket.id]);

  socket.on('move', (newPosition) => {
    activeUsers[socket.id].x = newPosition.x;
    activeUsers[socket.id].y = newPosition.y;

    socket.broadcast.emit('user_moved', { id: socket.id, x: newPosition.x, y: newPosition.y });

    // Proximity Math
    Object.values(activeUsers).forEach(otherUser => {
      if (otherUser.id === socket.id) return;

      const dist = getDistance(newPosition.x, newPosition.y, otherUser.x, otherUser.y);
      const roomId = [socket.id, otherUser.id].sort().join('_');

      if (dist <= PROXIMITY_RADIUS) {
        if (!socket.rooms.has(roomId)) {
          socket.join(roomId);
          const partnerSocket = io.sockets.sockets.get(otherUser.id);
          if (partnerSocket) partnerSocket.join(roomId);
          // Send the partner's name so we can show it in the chat UI
          io.to(roomId).emit('chat_joined', { roomId, partnerName: otherUser.username });
        }
      } else {
        if (socket.rooms.has(roomId)) {
          io.to(roomId).emit('chat_left', { roomId });
          socket.leave(roomId);
          const partnerSocket = io.sockets.sockets.get(otherUser.id);
          if (partnerSocket) partnerSocket.leave(roomId);
        }
      }
    });
  });

  socket.on('send_message', (data) => {
    io.to(data.roomId).emit('receive_message', {
      senderName: username, // Send the actual username in the chat
      senderId: socket.id,
      text: data.text,
      timestamp: Date.now()
    });
  });

  socket.on('disconnect', () => {
    console.log(`🔴 User left: ${username}`);
    delete activeUsers[socket.id];
    io.emit('user_left', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Cosmos Server running on http://localhost:${PORT}`);
});