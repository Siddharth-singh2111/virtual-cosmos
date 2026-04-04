// client/src/App.jsx
import CosmosCanvas from './CosmosCanvas';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

function App() {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [socket, setSocket] = useState(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [partnerName, setPartnerName] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef(null);

  // --- LOGIN LOGIC ---
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    try {
      // 1. Register/Login user in MongoDB
      await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      // 2. Initialize socket WITH the username
      const newSocket = io('http://localhost:3001', {
        query: { username }
      });
      setSocket(newSocket);
      setIsLoggedIn(true);

    } catch (error) {
      console.error("Login failed", error);
      alert("Failed to connect to server.");
    }
  };

  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('chat_joined', ({ roomId, partnerName }) => {
      setActiveRoom(roomId);
      setPartnerName(partnerName);
      setMessages([{ senderId: 'system', text: `You connected with ${partnerName}.` }]);
    });

    socket.on('chat_left', () => {
      setActiveRoom(null);
      setPartnerName("");
      setMessages([]); 
    });

    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeRoom) return;
    socket.emit('send_message', { roomId: activeRoom, text: messageInput });
    setMessageInput("");
  };

  // --- LOGIN SCREEN RENDER ---
  if (!isLoggedIn) {
    return (
      <div className="w-screen h-screen bg-slate-900 flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 text-center w-96">
          <h1 className="text-3xl font-bold text-white mb-2">Virtual Cosmos</h1>
          <p className="text-slate-400 mb-6 text-sm">Enter the workspace</p>
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-slate-900 text-white rounded-lg px-4 py-3 mb-4 border border-slate-600 focus:border-blue-500 outline-none"
            autoFocus
          />
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-colors">
            Join Room
          </button>
        </form>
      </div>
    );
  }

  // --- MAIN APP RENDER ---
  return (
    <div className="relative w-screen h-screen">
      {/* Notice we pass the socket down to the canvas now */}
      <CosmosCanvas socket={socket} />

      <div className="absolute top-4 left-4 z-10 bg-slate-900/90 p-4 rounded-xl border border-slate-700 text-white shadow-lg pointer-events-none">
        <h1 className="text-xl font-bold mb-2">Virtual Cosmos</h1>
        <div className="flex items-center gap-2 text-sm mb-3">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          {username} (Connected)
        </div>
        <p className="mt-2 text-xs text-slate-400">Use WASD or Arrows to move</p>
      </div>

      {activeRoom && (
        <div className="absolute bottom-6 right-6 z-10 w-80 bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-slate-800 p-3 border-b border-slate-700 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-white text-sm font-semibold">Chatting with {partnerName}</span>
          </div>

          <div className="h-64 overflow-y-auto p-4 flex flex-col gap-2">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`max-w-[85%] rounded-lg p-2 text-sm flex flex-col ${
                  msg.senderId === 'system' ? 'mx-auto text-slate-400 text-xs italic bg-transparent' :
                  msg.senderId === socket.id ? 'bg-blue-600 text-white self-end rounded-br-none' : 
                  'bg-slate-700 text-white self-start rounded-bl-none'
                }`}
              >
                {/* Show the sender's name if it's not you and not a system message */}
                {msg.senderId !== 'system' && msg.senderId !== socket.id && (
                  <span className="text-[10px] text-slate-300 font-bold mb-1">{msg.senderName}</span>
                )}
                <span>{msg.text}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-3 bg-slate-800 border-t border-slate-700 flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Say something..."
              className="flex-1 bg-slate-900 text-white text-sm rounded-lg px-3 py-2 outline-none border border-slate-600"
            />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;