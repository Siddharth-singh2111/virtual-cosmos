import CosmosCanvas from './CosmosCanvas';
import { useEffect, useState, useRef } from 'react';
import { socket } from './socket';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  
  // Chat State
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Listen for Proximity Events
    socket.on('chat_joined', ({ roomId }) => {
      setActiveRoom(roomId);
      setMessages([{ senderId: 'system', text: 'You are now close enough to chat.' }]);
    });

    socket.on('chat_left', () => {
      setActiveRoom(null);
      setMessages([]); // Clear chat when walking away
    });

    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('chat_joined');
      socket.off('chat_left');
      socket.off('receive_message');
    };
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeRoom) return;
    
    socket.emit('send_message', { roomId: activeRoom, text: messageInput });
    setMessageInput("");
  };

  return (
    <div className="relative w-screen h-screen">
      {/* PixiJS Rendering Layer */}
      <CosmosCanvas />

      {/* Connection Status UI */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/90 p-4 rounded-xl border border-slate-700 text-white shadow-lg pointer-events-none">
        <h1 className="text-xl font-bold mb-2">Virtual Cosmos</h1>
        <div className="flex items-center gap-2 text-sm mb-3">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          {isConnected ? 'Connected to Server' : 'Connecting...'}
        </div>
        <p className="text-xs text-slate-400 font-mono">My ID: {socket.id?.substring(0,6)}...</p>
        <p className="mt-2 text-xs text-slate-400">Use WASD or Arrows to move</p>
      </div>

      {/* Proximity Chat Panel */}
      {activeRoom && (
        <div className="absolute bottom-6 right-6 z-10 w-80 bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="bg-slate-800 p-3 border-b border-slate-700 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-white text-sm font-semibold">Proximity Chat Active</span>
          </div>

          {/* Messages Area */}
          <div className="h-64 overflow-y-auto p-4 flex flex-col gap-2">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`max-w-[85%] rounded-lg p-2 text-sm ${
                  msg.senderId === 'system' ? 'mx-auto text-slate-400 text-xs italic bg-transparent' :
                  msg.senderId === socket.id ? 'bg-blue-600 text-white self-end rounded-br-none' : 
                  'bg-slate-700 text-white self-start rounded-bl-none'
                }`}
              >
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={sendMessage} className="p-3 bg-slate-800 border-t border-slate-700 flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Say something..."
              className="flex-1 bg-slate-900 text-white text-sm rounded-lg px-3 py-2 outline-none border border-slate-600 focus:border-blue-500 transition-colors"
            />
            <button 
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;