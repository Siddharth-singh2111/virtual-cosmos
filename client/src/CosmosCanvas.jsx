// client/src/CosmosCanvas.jsx
import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';

export default function CosmosCanvas({ socket }) {
  const canvasRef = useRef(null);
  const avatarsRef = useRef({});
  const appRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x1e293b,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    
    appRef.current = app;
    canvasRef.current.appendChild(app.view);

    // Create a Container holding the circle AND the text
    const createAvatar = (user) => {
      const isMe = user.id === socket.id;
      const color = isMe ? 0x3b82f6 : 0xef4444; 
      
      const container = new PIXI.Container();
      
      const graphics = new PIXI.Graphics();
      graphics.beginFill(color);
      graphics.drawCircle(0, 0, 20);
      graphics.endFill();
      container.addChild(graphics);

      // Add the username label
      const text = new PIXI.Text(user.username, {
        fontFamily: 'Arial',
        fontSize: 14,
        fill: 0xffffff,
        align: 'center',
      });
      text.anchor.set(0.5, 2.5); // Position slightly above the circle
      container.addChild(text);

      container.x = user.x;
      container.y = user.y;
      
      app.stage.addChild(container);
      return container;
    };

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
        app.stage.removeChild(avatarsRef.current[userId]);
        delete avatarsRef.current[userId];
      }
    });

    const keys = {};
    window.addEventListener('keydown', (e) => { keys[e.key] = true; });
    window.addEventListener('keyup', (e) => { keys[e.key] = false; });

    const SPEED = 5;
    let lastEmitTime = 0;

    app.ticker.add(() => {
      const myAvatar = avatarsRef.current[socket.id];
      if (!myAvatar) return;

      let moved = false;
      if (keys['w'] || keys['ArrowUp']) { myAvatar.y -= SPEED; moved = true; }
      if (keys['s'] || keys['ArrowDown']) { myAvatar.y += SPEED; moved = true; }
      if (keys['a'] || keys['ArrowLeft']) { myAvatar.x -= SPEED; moved = true; }
      if (keys['d'] || keys['ArrowRight']) { myAvatar.x += SPEED; moved = true; }

      if (moved) {
        const now = Date.now();
        if (now - lastEmitTime > 50) {
          socket.emit('move', { x: myAvatar.x, y: myAvatar.y });
          lastEmitTime = now;
        }
      }
    });

    const handleResize = () => {
      app.renderer.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      app.destroy(true, true);
      socket.off('map_state');
      socket.off('user_joined');
      socket.off('user_moved');
      socket.off('user_left');
    };
  }, [socket]);

  return <div ref={canvasRef} className="absolute inset-0 z-0" />;
}