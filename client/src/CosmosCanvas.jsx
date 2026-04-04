// client/src/CosmosCanvas.jsx
import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { socket } from './socket';

export default function CosmosCanvas() {
  const canvasRef = useRef(null);
  const avatarsRef = useRef({}); // Store all player graphics here
  const appRef = useRef(null);

  useEffect(() => {
    // 1. Initialize PixiJS Application
    const app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x1e293b, // Tailwind slate-800
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    
    appRef.current = app;
    canvasRef.current.appendChild(app.view);

    // Helper function to create a circular avatar
    const createAvatar = (color, x, y) => {
      const graphics = new PIXI.Graphics();
      graphics.beginFill(color);
      graphics.drawCircle(0, 0, 20); // 20px radius avatar
      graphics.endFill();
      graphics.x = x;
      graphics.y = y;
      app.stage.addChild(graphics);
      return graphics;
    };

    // 2. Listen to Socket Events
    socket.on('map_state', (users) => {
      // Load everyone currently in the room
      Object.values(users).forEach((user) => {
        const color = user.id === socket.id ? 0x3b82f6 : 0xef4444; // Blue for me, Red for others
        avatarsRef.current[user.id] = createAvatar(color, user.x, user.y);
      });
    });

    socket.on('user_joined', (user) => {
      avatarsRef.current[user.id] = createAvatar(0xef4444, user.x, user.y);
    });

    socket.on('user_moved', (user) => {
      if (avatarsRef.current[user.id]) {
        // Direct mutation is fast! No React state updates.
        avatarsRef.current[user.id].x = user.x;
        avatarsRef.current[user.id].y = user.y;
      }
    });

    socket.on('user_left', (userId) => {
      if (avatarsRef.current[userId]) {
        app.stage.removeChild(avatarsRef.current[userId]);
        delete avatarsRef.current[userId];
      }
    });

    // 3. Handle Local Movement (WASD / Arrows)
    const keys = {};
    window.addEventListener('keydown', (e) => { keys[e.key] = true; });
    window.addEventListener('keyup', (e) => { keys[e.key] = false; });

    const SPEED = 5;
    let lastEmitTime = 0;

    // The Game Loop
    app.ticker.add(() => {
      const myAvatar = avatarsRef.current[socket.id];
      if (!myAvatar) return;

      let moved = false;
      if (keys['w'] || keys['ArrowUp']) { myAvatar.y -= SPEED; moved = true; }
      if (keys['s'] || keys['ArrowDown']) { myAvatar.y += SPEED; moved = true; }
      if (keys['a'] || keys['ArrowLeft']) { myAvatar.x -= SPEED; moved = true; }
      if (keys['d'] || keys['ArrowRight']) { myAvatar.x += SPEED; moved = true; }

      // Performance Win: Throttle the socket emits to 20 times a second (50ms)
      // Otherwise, you'll flood the server holding down 'W'
      if (moved) {
        const now = Date.now();
        if (now - lastEmitTime > 50) {
          socket.emit('move', { x: myAvatar.x, y: myAvatar.y });
          lastEmitTime = now;
        }
      }
    });

    // Cleanup on unmount
    return () => {
      app.destroy(true, true);
      socket.off('map_state');
      socket.off('user_joined');
      socket.off('user_moved');
      socket.off('user_left');
    };
  }, []);

  return <div ref={canvasRef} className="absolute inset-0 z-0" />;
}