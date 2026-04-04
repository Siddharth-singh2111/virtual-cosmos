// client/src/socket.js
import { io } from 'socket.io-client';

// Connect to the Node server we built in Phase 1
const URL = 'http://localhost:3001';
export const socket = io(URL);