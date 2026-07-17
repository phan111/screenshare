import { useState, useEffect, useRef } from 'react';
import { Peer } from 'peerjs';
import { Monitor, Users, Copy, ArrowLeft, Radio, Loader2 } from 'lucide-react';
import './index.css';

function App() {
  const [view, setView] = useState('home'); // 'home', 'host', 'viewer'
  const [peerId, setPeerId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState('');
  const [emojis, setEmojis] = useState([]);
  
  const peerInstance = useRef(null);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  
  // Ref to hold the active data connection for a viewer
  const dataConnRef = useRef(null);
  // Ref to hold all active connections for the host
  const activeConnections = useRef([]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (peerInstance.current) {
      peerInstance.current.destroy();
      peerInstance.current = null;
    }
    dataConnRef.current = null;
    activeConnections.current = [];
    setStatus('disconnected');
    setError('');
    setPeerId('');
    setEmojis([]);
  };

  const triggerEmoji = (char) => {
    const id = Date.now() + Math.random();
    const x = Math.floor(Math.random() * 80) + 10; // X position 10% to 90%
    setEmojis(prev => [...prev, { id, char, x }]);
    
    // Remove from state after animation completes
    setTimeout(() => {
      setEmojis(prev => prev.filter(e => e.id !== id));
    }, 3000);
  };

  const initPeer = (id = null) => {
    return new Promise((resolve, reject) => {
      const peer = new Peer(id);
      
      peer.on('open', (id) => {
        setPeerId(id);
        resolve(peer);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        setError(err.message || 'Connection error.');
        reject(err);
      });

      peerInstance.current = peer;
    });
  };

  const startHosting = async (sourceType = 'screen') => {
    try {
      setStatus('connecting');
      setView('host');
      setError('');

      let stream;
      if (sourceType === 'screen') {
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error('Screen sharing is not supported on mobile browsers. Please use "Share Camera" instead!');
        }
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true
        });
      }
      
      streamRef.current = stream;
      
      // Stop hosting if user stops sharing via browser UI button
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          cleanup();
          setView('home');
        };
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const peer = await initPeer();
      
      // When a viewer connects via data connection, call them with our media stream
      peer.on('connection', (conn) => {
        activeConnections.current.push(conn);
        
        conn.on('data', (data) => {
          if (data && data.type === 'emoji') {
            triggerEmoji(data.emoji);
            activeConnections.current.forEach(c => {
              if (c !== conn && c.open) {
                c.send(data);
              }
            });
          }
        });

        conn.on('close', () => {
          activeConnections.current = activeConnections.current.filter(c => c !== conn);
        });

        setTimeout(() => {
          peer.call(conn.peer, streamRef.current);
        }, 500);
      });

      setStatus('connected');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to start media stream.');
      setStatus('error');
    }
  };

  const startViewing = async (e) => {
    e.preventDefault();
    if (!joinId.trim()) return;

    try {
      setStatus('connecting');
      setView('viewer');
      setError('');

      const peer = await initPeer();

      // Connect to the host using a DataConnection
      const conn = peer.connect(joinId.trim());
      dataConnRef.current = conn;
      
      conn.on('error', (err) => {
        setError('Connection failed: ' + err.message);
        setStatus('error');
      });

      conn.on('data', (data) => {
        if (data && data.type === 'emoji') {
          triggerEmoji(data.emoji);
        }
      });

      // The host will call us back with their stream
      peer.on('call', (call) => {
        call.answer(); // Answer without providing a stream

        call.on('stream', (remoteStream) => {
          if (videoRef.current) {
            if (!videoRef.current.srcObject) {
              videoRef.current.srcObject = remoteStream;
            } else {
              const existingStream = videoRef.current.srcObject;
              remoteStream.getTracks().forEach(track => {
                if (!existingStream.getTracks().find(t => t.id === track.id)) {
                  existingStream.addTrack(track);
                }
              });
            }
            setStatus('connected');
          }
        });
        
        call.on('close', () => {
          setError('Host ended the stream.');
          setStatus('disconnected');
        });

        call.on('error', (err) => {
          setError('Connection error: ' + err.message);
          setStatus('error');
        });
      });

    } catch (err) {
      console.error(err);
      setError('Failed to connect to host. ' + (err.message || ''));
      setStatus('error');
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(peerId);
  };

  const sendEmoji = (emo) => {
    triggerEmoji(emo);
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send({ type: 'emoji', emoji: emo });
    }
  };

  return (
    <div className="container">
      {view === 'home' && (
        <div className="glass-panel center-layout animate-fade-in" style={{ margin: 'auto', maxWidth: '600px' }}>
          <div style={{ marginBottom: '2rem' }}>
            <Radio size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
            <h1>ScreenCast</h1>
            <p>Share your screen or join a room in seconds.</p>
          </div>

          <div style={{ display: 'grid', gap: '1.5rem', width: '100%' }}>
            <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.03)' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Host a Session</h3>
              <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>Share your screen or camera securely via P2P.</p>
              <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                <button className="btn btn-primary" onClick={() => startHosting('screen')} style={{ width: '100%' }}>
                  <Monitor size={20} /> Share Screen
                </button>
                <button className="btn btn-outline" onClick={() => startHosting('camera')} style={{ width: '100%' }}>
                  <Users size={20} /> Share Camera (Mobile)
                </button>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.03)' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Join a Session</h3>
              <form onSubmit={startViewing}>
                <div className="input-group">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Enter Host Room ID"
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-outline" style={{ width: '100%' }}>
                  <Users size={20} /> Join Room
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {view === 'host' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-outline" onClick={() => { cleanup(); setView('home'); }}>
              <ArrowLeft size={18} /> Back
            </button>
            
            {status === 'connected' && peerId ? (
              <div className="glass-panel" style={{ padding: '0.5rem 1.2rem', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '999px' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Room ID:</span>
                <strong style={{ letterSpacing: '1px', userSelect: 'all' }}>{peerId}</strong>
                <button className="btn" style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.1)' }} onClick={copyId} title="Copy ID">
                  <Copy size={16} />
                </button>
              </div>
            ) : (
              <div className="status-badge connecting">
                <Loader2 size={14} className="pulse" />
                {status === 'connecting' ? 'Setting up room...' : 'Disconnected'}
              </div>
            )}
          </div>
          
          <div className="video-container">
            <video ref={videoRef} autoPlay playsInline muted style={{ display: status === 'connected' ? 'block' : 'none' }}></video>
            
            {/* Emojis Overlay */}
            <div className="emoji-overlay">
              {emojis.map(e => (
                <div key={e.id} className="floating-emoji" style={{ left: `${e.x}%` }}>
                  {e.char}
                </div>
              ))}
            </div>

            {status !== 'connected' && !error && (
              <div className="center-layout" style={{ position: 'absolute', inset: 0 }}>
                <Loader2 size={48} color="var(--primary)" className="pulse" />
                <p style={{ marginTop: '1rem' }}>Initializing screen capture...</p>
              </div>
            )}

            {error && (
              <div className="center-layout" style={{ position: 'absolute', inset: 0, padding: '2rem' }}>
                <p style={{ color: 'var(--danger)', fontSize: '1.125rem' }}>{error}</p>
                <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => { cleanup(); setView('home'); }}>
                  Return Home
                </button>
              </div>
            )}
          </div>
          
          {status === 'connected' && (
            <div className="center-layout">
              <div className="status-badge">
                <div className="pulse"></div> Live
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>You are sharing your screen. Others can join with your Room ID.</p>
              
              <div className="emoji-bar animate-fade-in" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                {['❤️', '👍', '😂', '🎉', '🔥'].map(emo => (
                  <button key={emo} className="emoji-btn" onClick={() => {
                     triggerEmoji(emo);
                     // Broadcast host emoji to all viewers
                     activeConnections.current.forEach(c => {
                       if (c.open) c.send({ type: 'emoji', emoji: emo });
                     });
                  }}>
                    {emo}
                  </button>
                ))}
              </div>

              <button className="btn btn-danger" onClick={() => { cleanup(); setView('home'); }}>
                Stop Sharing
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'viewer' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-outline" onClick={() => { cleanup(); setView('home'); }}>
              <ArrowLeft size={18} /> Leave Room
            </button>
            
            <div className={`status-badge ${status === 'connecting' ? 'connecting' : ''}`}>
               {status === 'connecting' && <Loader2 size={14} className="pulse" />}
               {status === 'connected' && <div className="pulse"></div>}
               {status === 'connecting' ? 'Connecting to host...' : status === 'connected' ? 'Connected' : 'Disconnected'}
            </div>
          </div>

          <div className="video-container">
            <video ref={videoRef} autoPlay playsInline controls style={{ display: status === 'connected' ? 'block' : 'none' }}></video>
            
            {/* Emojis Overlay */}
            <div className="emoji-overlay">
              {emojis.map(e => (
                <div key={e.id} className="floating-emoji" style={{ left: `${e.x}%` }}>
                  {e.char}
                </div>
              ))}
            </div>

            {status === 'connecting' && (
              <div className="center-layout" style={{ position: 'absolute', inset: 0 }}>
                <Loader2 size={48} color="var(--primary)" className="pulse" />
                <p style={{ marginTop: '1rem' }}>Waiting for stream...</p>
              </div>
            )}

             {error && (
              <div className="center-layout" style={{ position: 'absolute', inset: 0, padding: '2rem' }}>
                <p style={{ color: 'var(--danger)', fontSize: '1.125rem' }}>{error}</p>
                <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => { cleanup(); setView('home'); }}>
                  Return Home
                </button>
              </div>
            )}
          </div>
          
          {status === 'connected' && (
            <div className="emoji-bar animate-fade-in">
              {['❤️', '👍', '😂', '🎉', '🔥'].map(emo => (
                <button key={emo} className="emoji-btn" onClick={() => sendEmoji(emo)}>
                  {emo}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
