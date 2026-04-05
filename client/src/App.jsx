// client/src/App.jsx
import CosmosCanvas from './CosmosCanvas';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Peer } from 'peerjs';

function App() {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Chat State
  const [activeRoom, setActiveRoom] = useState(null);
  const [partnerName, setPartnerName] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef(null);

  // WebRTC & Hardware State
  const [peer, setPeer] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const [partnerStream, setPartnerStream] = useState(null);
  
  // Hardware Toggles
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  
  const peerRef = useRef(null);
  const myStreamRef = useRef(null);
  const callRef = useRef(null); 
  
  const myVideoRef = useRef(null);
  const partnerVideoRef = useRef(null);

  useEffect(() => { peerRef.current = peer; }, [peer]);
  useEffect(() => { myStreamRef.current = myStream; }, [myStream]);

  // --- LOGIN & PERMISSIONS ---
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    try {
      await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      const newSocket = io('http://localhost:3001', { query: { username } });
      setSocket(newSocket);
      setIsLoggedIn(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setMyStream(stream);
      } catch (err) {
        console.error("Camera/Mic denied", err);
        alert("Please allow camera and mic access for proximity chat.");
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  // --- HARDWARE CONTROLS ---
  const toggleMic = () => {
    if (myStreamRef.current) {
      const audioTrack = myStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const toggleCam = () => {
    if (myStreamRef.current) {
      const videoTrack = myStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOn(videoTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (isSharingScreen) {
      const webcamTrack = myStreamRef.current.getVideoTracks()[0];
      if (callRef.current) {
        const sender = callRef.current.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(webcamTrack);
      }
      if (myVideoRef.current) myVideoRef.current.srcObject = myStreamRef.current;
      setIsSharingScreen(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (callRef.current) {
          const sender = callRef.current.peerConnection.getSenders().find(s => s.track.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        }
        if (myVideoRef.current) myVideoRef.current.srcObject = screenStream;
        setIsSharingScreen(true);

        screenTrack.onended = () => {
          toggleScreenShare(); 
        };
      } catch (err) {
        console.error("Failed to share screen", err);
      }
    }
  };

  // --- HANDLE INCOMING CALLS ---
  useEffect(() => {
    if (!peer || !myStream) return;

    peer.on('call', (call) => {
      call.answer(myStream);
      callRef.current = call;
      call.on('stream', (remoteStream) => {
        setPartnerStream(remoteStream);
      });
    });
  }, [peer, myStream]);

  // --- SOCKET & PROXIMITY LOGIC ---
  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => {
      setIsConnected(true);
      const newPeer = new Peer(socket.id, {
        host: 'localhost',
        port: 3001,
        path: '/peerjs'
      });
      setPeer(newPeer);
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('chat_joined', ({ roomId, partnerName, partnerId }) => {
      setActiveRoom(roomId);
      setPartnerName(partnerName);
      setMessages([{ senderId: 'system', text: `You connected with ${partnerName}.` }]);
      
      if (socket.id > partnerId) {
        setTimeout(() => {
          if (peerRef.current && myStreamRef.current) {
            const call = peerRef.current.call(partnerId, myStreamRef.current);
            callRef.current = call;
            call.on('stream', (remoteStream) => {
              setPartnerStream(remoteStream);
            });
          }
        }, 500);
      }
    });

    socket.on('chat_left', () => {
      setActiveRoom(null);
      setPartnerName("");
      setMessages([]); 
      setPartnerStream(null);

      if (callRef.current) {
        callRef.current.close();
        callRef.current = null;
      }
    });

    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
      if (peer) peer.destroy();
    };
  }, [socket]);

  // --- BIND STREAMS & BYPASS AUTOPLAY BLOCKS ---
  useEffect(() => {
    if (myVideoRef.current && myStream) {
      myVideoRef.current.srcObject = myStream;
      myVideoRef.current.play().catch(e => console.error("Video play blocked", e));
    }
  }, [myStream, isLoggedIn]);

  useEffect(() => {
    if (partnerVideoRef.current && partnerStream) {
      partnerVideoRef.current.srcObject = partnerStream;
      partnerVideoRef.current.play().catch(e => console.error("Partner video play blocked", e));
    }
  }, [partnerStream]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeRoom) return;
    socket.emit('send_message', { roomId: activeRoom, text: messageInput });
    setMessageInput("");
  };

  // --- LOGIN SCREEN RENDER ---
  if (!isLoggedIn) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
        
        <form onSubmit={handleLogin} className="bg-slate-900/80 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border border-slate-800 text-center w-[400px] z-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <span className="text-2xl">🌌</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Virtual Cosmos</h1>
          <p className="text-slate-400 mb-8 text-sm">Enter your name to join the workspace</p>
          <input 
            type="text" 
            placeholder="e.g. Siddharth" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            className="w-full bg-slate-950 text-white rounded-xl px-4 py-3 mb-6 border border-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600" 
            autoFocus 
          />
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-lg shadow-blue-600/20">
            Join Room
          </button>
        </form>
      </div>
    );
  }

  // --- MAIN APP RENDER (THE NEW SHELL) ---
  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 overflow-hidden font-sans">
      
      {/* 1. TOP NAVBAR */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm shadow-lg shadow-blue-600/20">🌌</div>
          <h1 className="text-lg font-bold text-white tracking-tight">Virtual Cosmos</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-500'}`}></div>
            <span className="text-sm text-slate-300 font-medium">{username}</span>
          </div>
        </div>
      </header>

      {/* 2. MIDDLE CONTENT AREA */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* Center: Canvas Area */}
        <div className="flex-1 relative bg-slate-900 overflow-hidden">
          
          <CosmosCanvas socket={socket} />
          
          {/* VIGNETTE OVERLAY (Depth Polish) */}
          <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(15,23,42,0.8)] z-0"></div>

          {/* Floating Video Overlay */}
          {activeRoom && (
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-3 items-end pointer-events-none">
              
              {/* Partner Video with Active Glow */}
              {partnerStream && (
                <div className="w-72 h-48 bg-slate-950 rounded-xl overflow-hidden border border-slate-700 relative pointer-events-auto group transition-all duration-300 ring-2 ring-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                 <video ref={partnerVideoRef} autoPlay playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
                    <span className="text-sm text-white font-medium drop-shadow-md">{partnerName}</span>
                  </div>
                </div>
              )}

              {/* My Video */}
              {myStream && (
                <div className="w-36 h-24 bg-slate-950 rounded-xl overflow-hidden border border-slate-700 shadow-xl relative pointer-events-auto">
                  <video ref={myVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                    <span className="text-xs text-white font-medium drop-shadow-md">You</span>
                  </div>
                  {!isMicOn && (
                    <div className="absolute top-2 right-2 bg-red-500/90 backdrop-blur-sm p-1 rounded-md text-xs text-white shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                        <path d="M11.883 13.298l1.411 1.41A5.975 5.975 0 0110 16c-3.314 0-6-2.686-6-6V7.116l1.5 1.5v1.384a4.5 4.5 0 007.383 3.3zM10 2a3 3 0 00-3 3v3.116l6 6V5a3 3 0 00-3-3z" />
                        <path d="M2.293 2.293a1 1 0 011.414 0l14 14a1 1 0 01-1.414 1.414l-14-14a1 1 0 010-1.414z" />
                      </svg>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. BOTTOM CONTROL DOCK (With Tooltips) */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
            <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-2xl p-2 flex gap-2 shadow-2xl items-center">
              
              <div className="relative group flex justify-center">
                <button onClick={toggleMic} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isMicOn ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}>
                  {isMicOn ? '🎙️' : '🔇'}
                </button>
                <span className="absolute -top-10 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700 shadow-lg whitespace-nowrap">
                  {isMicOn ? 'Mute' : 'Unmute'}
                </span>
              </div>
              
              <div className="relative group flex justify-center">
                <button onClick={toggleCam} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isCamOn ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}>
                  {isCamOn ? '📹' : '🚫'}
                </button>
                <span className="absolute -top-10 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700 shadow-lg whitespace-nowrap">
                  {isCamOn ? 'Turn Off Video' : 'Turn On Video'}
                </span>
              </div>
              
              {activeRoom && (
                <>
                  <div className="w-px h-8 bg-slate-700 mx-1"></div>
                  <div className="relative group flex justify-center">
                    <button onClick={toggleScreenShare} className={`px-5 h-12 rounded-xl flex items-center gap-2 font-medium transition-all ${isSharingScreen ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
                      </svg>
                      {isSharingScreen ? 'Sharing' : 'Share'}
                    </button>
                    <span className="absolute -top-10 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700 shadow-lg whitespace-nowrap">
                      {isSharingScreen ? 'Stop Screen Share' : 'Share Screen'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>

        {/* 4. RIGHT SIDEBAR (Chat & Participants) */}
        <aside className={`w-80 bg-slate-950 border-l border-slate-800 flex flex-col shrink-0 transition-all duration-300 ${activeRoom ? 'translate-x-0' : 'translate-x-full absolute right-0 h-full invisible'}`}>
          {/* Sidebar Header */}
          <div className="h-14 border-b border-slate-800 flex items-center px-4 shrink-0 bg-slate-900/50">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              Meeting Chat
            </h2>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm text-center">
                <span className="text-3xl mb-2">👋</span>
                <p>You are now connected with {partnerName}.</p>
                <p>Say hello!</p>
              </div>
            )}
            
            {messages.map((msg, index) => (
              <div 
                key={index} 
                /* Slide-up Animation applied right here! */
                className={`max-w-[85%] rounded-2xl p-3 text-sm flex flex-col chat-animation ${msg.senderId === 'system' ? 'mx-auto text-slate-500 text-xs text-center italic bg-transparent' : msg.senderId === socket.id ? 'bg-blue-600 text-white self-end rounded-br-sm' : 'bg-slate-800 text-slate-200 self-start rounded-bl-sm border border-slate-700'}`}
              >
                {msg.senderId !== 'system' && msg.senderId !== socket.id && ( 
                  <span className="text-xs text-slate-400 font-medium mb-1 block">{msg.senderName}</span> 
                )}
                <span className="leading-relaxed">{msg.text}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0">
            <form onSubmit={sendMessage} className="flex gap-2">
              <input 
                type="text" 
                value={messageInput} 
                onChange={(e) => setMessageInput(e.target.value)} 
                placeholder={`Message ${partnerName}...`} 
                className="flex-1 bg-slate-900 text-white text-sm rounded-xl px-4 py-2.5 outline-none border border-slate-800 focus:border-blue-500 transition-colors placeholder:text-slate-600" 
              />
              <button type="submit" disabled={!messageInput.trim()} className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white p-2.5 rounded-xl transition-colors flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                </svg>
              </button>
            </form>
          </div>
        </aside>
        
      </main>
    </div>
  );
}

export default App;