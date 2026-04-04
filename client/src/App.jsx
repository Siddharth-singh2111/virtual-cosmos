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
  
  // Refs to prevent React State closure issues
  const peerRef = useRef(null);
  const myStreamRef = useRef(null);
  const callRef = useRef(null); 
  
  const myVideoRef = useRef(null);
  const partnerVideoRef = useRef(null);

  // Keep Refs updated for our event listeners
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

  // --- HARDWARE CONTROLS (Mic / Cam) ---
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
      // Stop sharing: Swap back to webcam
      const webcamTrack = myStreamRef.current.getVideoTracks()[0];
      if (callRef.current) {
        const sender = callRef.current.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(webcamTrack);
      }
      if (myVideoRef.current) myVideoRef.current.srcObject = myStreamRef.current;
      setIsSharingScreen(false);
    } else {
      // Start sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (callRef.current) {
          const sender = callRef.current.peerConnection.getSenders().find(s => s.track.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        }
        if (myVideoRef.current) myVideoRef.current.srcObject = screenStream;
        setIsSharingScreen(true);

        // Listen for the browser's native "Stop Sharing" button
        screenTrack.onended = () => {
          toggleScreenShare(); // Revert to webcam
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
      console.log("Receiving call...");
      call.answer(myStream);
      callRef.current = call;
      call.on('stream', (remoteStream) => {
        console.log("Partner stream received!");
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
      
      // OUTGOING CALL LOGIC (With Race-Condition Fix)
      if (socket.id > partnerId) {
        console.log("Initiating call to", partnerName);
        
        // Wait 500ms to ensure the partner's PeerJS is ready to receive
        setTimeout(() => {
          if (peerRef.current && myStreamRef.current) {
            const call = peerRef.current.call(partnerId, myStreamRef.current);
            callRef.current = call;
            call.on('stream', (remoteStream) => {
              console.log("Partner stream received!");
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
      // Browsers strictly require interaction to play audio. The .play() forces it.
      partnerVideoRef.current.play().catch(e => console.error("Partner video play blocked", e));
    }
  }, [partnerStream]);

  // Chat auto-scroll
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
      <div className="w-screen h-screen bg-slate-900 flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 text-center w-96">
          <h1 className="text-3xl font-bold text-white mb-2">Virtual Cosmos</h1>
          <p className="text-slate-400 mb-6 text-sm">Enter the workspace</p>
          <input type="text" placeholder="Enter your name" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-slate-900 text-white rounded-lg px-4 py-3 mb-4 border border-slate-600 outline-none focus:border-blue-500 transition-colors" autoFocus />
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-colors">Join Room</button>
        </form>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900">
      <CosmosCanvas socket={socket} />

      {/* Top Left: Server Status */}
      <div className="fixed top-4 left-4 z-50 bg-slate-900/90 p-4 rounded-xl border border-slate-700 text-white shadow-lg pointer-events-none">
        <h1 className="text-xl font-bold mb-2">Virtual Cosmos</h1>
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          {username}
        </div>
      </div>

      {/* --- FLOATING VIDEO UI --- */}
      {activeRoom && (
        <div className="fixed top-6 right-6 z-50 flex flex-col gap-4 items-end pointer-events-none">
          
          {/* Partner's Big Video */}
          {partnerStream && (
            <div className="w-80 h-56 bg-slate-900 rounded-xl overflow-hidden border-2 border-green-500 shadow-2xl relative pointer-events-auto">
              <video ref={partnerVideoRef} autoPlay playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
              <span className="absolute bottom-2 left-2 bg-black/60 px-3 py-1 text-sm text-white rounded font-bold shadow">
                {partnerName}
              </span>
            </div>
          )}

          {/* Your Mini Video */}
          {myStream && (
            <div className="w-40 h-28 bg-slate-900 rounded-xl overflow-hidden border-2 border-slate-600 shadow-lg relative pointer-events-auto">
              <video ref={myVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
              <span className="absolute bottom-1 left-1 bg-black/60 px-2 py-1 text-xs text-white rounded">
                You
              </span>
              {/* Mic Status Icon */}
              {!isMicOn && (
                <span className="absolute top-1 right-1 bg-red-500 px-1 rounded text-xs text-white shadow">
                  Muted
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- CENTRAL BOTTOM CONTROL BAR --- */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-full px-6 py-3 flex gap-4 shadow-2xl items-center">
        <button onClick={toggleMic} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-colors ${isMicOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`} title="Toggle Microphone">
          {isMicOn ? '🎙️' : '🔇'}
        </button>
        <button onClick={toggleCam} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-colors ${isCamOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`} title="Toggle Camera">
          {isCamOn ? '📹' : '🚫'}
        </button>
        {activeRoom && (
          <>
            <div className="w-px h-8 bg-slate-600 mx-2"></div>
            <button onClick={toggleScreenShare} className={`px-4 h-12 rounded-full flex items-center gap-2 font-bold transition-colors ${isSharingScreen ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`} title="Share Screen">
              💻 {isSharingScreen ? 'Sharing...' : 'Share'}
            </button>
          </>
        )}
      </div>

      {/* --- CHAT UI --- */}
      {activeRoom && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-slate-800 p-3 border-b border-slate-700 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-white text-sm font-semibold">Chatting with {partnerName}</span>
          </div>

          <div className="h-48 overflow-y-auto p-4 flex flex-col gap-2">
            {messages.map((msg, index) => (
              <div key={index} className={`max-w-[85%] rounded-lg p-2 text-sm flex flex-col ${msg.senderId === 'system' ? 'mx-auto text-slate-400 text-xs italic bg-transparent' : msg.senderId === socket.id ? 'bg-blue-600 text-white self-end rounded-br-none' : 'bg-slate-700 text-white self-start rounded-bl-none'}`}>
                {msg.senderId !== 'system' && msg.senderId !== socket.id && ( <span className="text-[10px] text-slate-300 font-bold mb-1">{msg.senderName}</span> )}
                <span>{msg.text}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-3 bg-slate-800 border-t border-slate-700 flex gap-2">
            <input type="text" value={messageInput} onChange={(e) => setMessageInput(e.target.value)} placeholder="Say something..." className="flex-1 bg-slate-900 text-white text-sm rounded-lg px-3 py-2 outline-none border border-slate-600" />
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;