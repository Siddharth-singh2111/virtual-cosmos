import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';

PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

export default function CosmosCanvas({ socket }) {
  const canvasRef = useRef(null);
  const avatarsRef = useRef({});
  const appRef = useRef(null);
  const worldRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x1e293b,
      resolution: window.devicePixelRatio || 1,
      resizeTo: window,
    });
    appRef.current = app;
    canvasRef.current.appendChild(app.view);

    const world = new PIXI.Container();
    worldRef.current = world;
    app.stage.addChild(world);

    // --- 1. PROCEDURAL WORLD BUILDER ---
    // Instead of a blurry image, we draw a sharp, grid-based map
    const buildWorld = () => {
      const bgGraphics = new PIXI.Graphics();
      
      // Base: The entire campus (Grass)
      bgGraphics.beginFill(0x2d5a27); // Dark Green
      bgGraphics.drawRect(-500, -500, 2000, 2000);
      bgGraphics.endFill();

      // Main Building Floor (Wood/Light carpet)
      bgGraphics.beginFill(0xddcfa8); // Tan/Wood color
      bgGraphics.drawRect(0, 0, 1000, 1000);
      bgGraphics.endFill();

      // Left Wing: Meeting Rooms (Carpet)
      bgGraphics.beginFill(0x9ca3af); // Gray carpet
      bgGraphics.drawRect(0, 0, 200, 1000);
      bgGraphics.endFill();

      // Right Wing: Auditorium (Green carpet)
      bgGraphics.beginFill(0x86efac); // Light green carpet
      bgGraphics.drawRect(700, 0, 300, 600);
      bgGraphics.endFill();

      // Draw Desk Clusters (Simulating the rows in your image)
      bgGraphics.beginFill(0x475569); // Desk color
      for (let x = 300; x < 600; x += 100) {
        for (let y = 100; y < 900; y += 100) {
          bgGraphics.drawRoundedRect(x, y, 60, 40, 5);
        }
      }
      bgGraphics.endFill();

      // Draw Room Dividers/Walls
      bgGraphics.beginFill(0x1e293b); // Dark wall color
      bgGraphics.drawRect(200, 0, 10, 1000); // Main hallway wall
      bgGraphics.drawRect(0, 300, 200, 10); // Meeting room wall 1
      bgGraphics.drawRect(0, 600, 200, 10); // Meeting room wall 2
      bgGraphics.endFill();

      world.addChild(bgGraphics);
    };

    buildWorld();

    // --- 2. THE RETRO AVATAR ---
    const createAvatar = (user) => {
      const isMe = user.id === socket.id;
      const color = isMe ? 0x3b82f6 : 0xef4444; 
      
      const container = new PIXI.Container();
      const graphics = new PIXI.Graphics();

      // Drop Shadow
      graphics.beginFill(0x000000, 0.3);
      graphics.drawEllipse(0, 20, 18, 6);
      graphics.endFill();

      // Backpack
      graphics.beginFill(color);
      graphics.drawRoundedRect(-20, -10, 10, 22, 5);
      graphics.endFill();

      // Body
      graphics.beginFill(color);
      graphics.drawRoundedRect(-15, -25, 30, 45, 15);
      graphics.endFill();

      // Visor
      graphics.beginFill(0x94a3b8);
      graphics.drawRoundedRect(-5, -15, 22, 14, 6);
      graphics.endFill();
      
      // Highlight
      graphics.beginFill(0xffffff, 0.6);
      graphics.drawRoundedRect(0, -13, 12, 4, 2);
      graphics.endFill();

      container.addChild(graphics);

      // Name Tag
      const text = new PIXI.Text(user.username, {
        fontFamily: 'Arial',
        fontSize: 14,
        fill: 0xffffff,
        fontWeight: 'bold',
        stroke: 0x000000,
        strokeThickness: 3,
      });
      text.anchor.set(0.5);
      text.y = -45;
      container.addChild(text);

      container.x = user.x;
      container.y = user.y;
      
      world.addChild(container);
      return container;
    };

    // --- 3. SOCKET LOGIC ---
    socket.on('map_state', (users) => {
      Object.values(users).forEach((user) => {
        avatarsRef.current[user.id] = createAvatar(user);
      });
    });

    socket.on('user_joined', (user) => {
      avatarsRef.current[user.id] = createAvatar(user);
    });

    socket.on('user_moved', (user) => {
      if (avatarsRef.current[user.id]) {
        avatarsRef.current[user.id].x = user.x;
        avatarsRef.current[user.id].y = user.y;
      }
    });

    socket.on('user_left', (userId) => {
      if (avatarsRef.current[userId]) {
        world.removeChild(avatarsRef.current[userId]);
        delete avatarsRef.current[userId];
      }
    });

    // --- 4. MOVEMENT & CAMERA ---
    const keys = {};
    window.addEventListener('keydown', (e) => { keys[e.key] = true; });
    window.addEventListener('keyup', (e) => { keys[e.key] = false; });

    const SPEED = 6; // slightly faster movement
    let lastEmitTime = 0;

    app.ticker.add(() => {
      const myAvatar = avatarsRef.current[socket.id];
      if (!myAvatar) return;

      let moved = false;
      if (keys['w'] || keys['ArrowUp']) { myAvatar.y -= SPEED; moved = true; }
      if (keys['s'] || keys['ArrowDown']) { myAvatar.y += SPEED; moved = true; }
      if (keys['a'] || keys['ArrowLeft']) { myAvatar.x -= SPEED; moved = true; }
      if (keys['d'] || keys['ArrowRight']) { myAvatar.x += SPEED; moved = true; }

      // Keep avatar inside the main building (Boundary collision)
      if (myAvatar.x < 10) myAvatar.x = 10;
      if (myAvatar.x > 990) myAvatar.x = 990;
      if (myAvatar.y < 10) myAvatar.y = 10;
      if (myAvatar.y > 990) myAvatar.y = 990;

      if (moved) {
        const now = Date.now();
        if (now - lastEmitTime > 50) {
          socket.emit('move', { x: myAvatar.x, y: myAvatar.y });
          lastEmitTime = now;
        }
      }

      // Smooth Camera Follow
      const targetX = (window.innerWidth / 2) - myAvatar.x;
      const targetY = (window.innerHeight / 2) - myAvatar.y;
      
      world.x += (targetX - world.x) * 0.1;
      world.y += (targetY - world.y) * 0.1;
    });

    return () => {
      app.destroy(true, true);
      socket.off('map_state');
      socket.off('user_joined');
      socket.off('user_moved');
      socket.off('user_left');
    };
  }, [socket]);

  return <div ref={canvasRef} className="absolute inset-0 z-0" />;
}