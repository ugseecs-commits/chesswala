// --- CHESSOLOGY WEBRTC MULTIPLAYER -------------------------------------------
const WEBRTC_TIMING = {
  FULL_SYNC_DELAY_MS: 2000,
  SIGNALING_RETRY_DELAY_MS: 3000,
  RECONNECT_TIMEOUT_MS: 15000,
  RECONNECT_RETRY_DELAY_MS: 2000
};

const PEER_OPTS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:openrelay.metered.ca:80' },
      // OpenRelay is a free community TURN relay. These credentials are public
      // by design -- there are no private keys here.
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  }
};

window.webrtc = {
  peer: null,
  conn: null,
  active: false,
  myColor: 'w', // 'w' or 'b'
  peerId: '',
  reconnectAttempts: 0,

  formatError(err) {
    if (err.type === 'peer-unavailable') return 'Room code not found. The host may be offline.';
    if (err.type === 'webrtc') return 'ICE handshake failed. Firewall or NAT may be blocking the connection.';
    if (err.type === 'network') return 'Network error. Check your internet connection.';
    if (err.type === 'unavailable-id') return 'ID collision - retrying...';
    return err.message || 'Unknown connection error.';
  },

  initPeer(retryCount = 0) {
    if (this.peer) {
      try { this.peer.destroy(); } catch(e) {}
    }
    
    const rawName = window.auth ? window.auth.username : ('Guest' + Math.floor(Math.random() * 10000));
    const peerIdLower = rawName.toLowerCase();
    this.peerId = peerIdLower;
    
    this.peer = new Peer(peerIdLower, PEER_OPTS);

    this.peer.on('open', (id) => {
      console.log('My WebRTC ID is: ' + id);
      if (window.ui && typeof window.ui.syncAuthUI === 'function') {
        window.ui.syncAuthUI();
      }
    });

    this.peer.on('connection', (connection) => {
      this.conn = connection;
      this.isHost = true;
      this.myColor = 'w';
      
      const onConnect = () => {
        if (window.app && window.app.gameState === 'playing') {
          console.log("Resuming active game with reconnected joiner...");
        } else if (window.app && window.app.onLobbyConnected) {
          window.app.onLobbyConnected('Host');
        }
      };
      
      this.setupConnectionListeners(
        onConnect,
        (data) => { if (window.app && window.app.handleMultiplayerMessage) window.app.handleMultiplayerMessage(data); }
      );

      // Only sync full board state on reconnection (game already in progress with move history).
      // Do NOT fire on a fresh connection — it races against the start-game handshake.
      if (window.app && window.app.syncFullBoardState) {
        setTimeout(() => {
          if (window.app.gameState === 'playing' && typeof moveHistory !== 'undefined' && moveHistory.length > 0) {
            window.app.syncFullBoardState();
          }
        }, WEBRTC_TIMING.FULL_SYNC_DELAY_MS);
      }
    });

    this.peer.on('disconnected', () => {
      console.warn("Signaling disconnected. Reconnecting...");
      if (!this.peer.destroyed) this.peer.reconnect();
    });

    this.peer.on('error', (err) => {
      console.warn("PeerJS Error:", err);
      if (err.type === 'unavailable-id') {
        if (retryCount < 5) {
          console.warn(`ID collision. Retrying initPeer... (${retryCount + 1}/5)`);
          setTimeout(() => this.initPeer(retryCount + 1), 1500);
        } else {
          alert("Username collision detected. Please choose a different identity.");
        }
      } else if (err.type === 'network' || err.type === 'disconnected' || err.type === 'server-error') {
        setTimeout(() => {
          if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
            this.peer.reconnect();
          }
        }, WEBRTC_TIMING.SIGNALING_RETRY_DELAY_MS);
      }
    });
  },

  connectToHost(hostId, onConnectCallback, onDataCallback, onErrorCallback) {
    if (!this.peer) this.initPeer();
    
    const targetPeerId = hostId.toLowerCase();
    this.hostId = targetPeerId;
    this.isHost = false;
    this.myColor = 'b';
    
    // Clean up previous error handler if it exists to prevent listener leaks
    if (this._connErrHandler) {
      this.peer.off('error', this._connErrHandler);
    }
    
    this.conn = this.peer.connect(targetPeerId);
    this.setupConnectionListeners(onConnectCallback, onDataCallback);

    this._connErrHandler = (err) => {
      if (err.type === 'peer-unavailable' && onErrorCallback) {
        onErrorCallback(err);
        this.peer.off('error', this._connErrHandler);
        this._connErrHandler = null;
      }
    };
    this.peer.on('error', this._connErrHandler);
  },

  setupConnectionListeners(onConnectCallback, onDataCallback) {
    this.conn.on('open', () => {
      this.active = true;
      this.reconnectAttempts = 0;
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      if (onConnectCallback) onConnectCallback(this.myColor);

      const peerNameEl = document.getElementById('lobbyPeerName');
      if (peerNameEl && window.app && window.app.gameState === 'setup') {
        peerNameEl.textContent = this.conn?.peer || 'Opponent';
      }
      
      // PeerJS bug workaround: forcefully trigger close if the underlying ICE connection drops
      if (this.conn.peerConnection) {
        this.conn.peerConnection.addEventListener('iceconnectionstatechange', () => {
          const state = this.conn.peerConnection.iceConnectionState;
          if (state === 'failed' || state === 'disconnected' || state === 'closed') {
            if (this.active) {
              console.warn("ICE connection failed. Forcing connection close.");
              this.active = false;
              this.conn.emit('close');
            }
          }
        });
      }
    });

    this.conn.on('data', (data) => {
      if (onDataCallback) onDataCallback(data);
    });

    this.conn.on('close', () => {
      this.active = false;
      if (this.intentionalDisconnect) {
        this.intentionalDisconnect = false;
        if (window.app && window.app.goToMenu) window.app.goToMenu();
        else if (window.app && window.app.renderAll) window.app.renderAll();
      } else {
        // Always attempt reconnection if it was an accidental drop
        this.attemptReconnection(onConnectCallback, onDataCallback);
      }
    });

    this.conn.on('error', (err) => {
      console.error("Connection error:", err);
      this.active = false;
      this.attemptReconnection(onConnectCallback, onDataCallback);
    });
  },

  attemptReconnection(onConnectCallback, onDataCallback) {
    if (this.isHost) {
      console.warn("Waiting for Joiner to reconnect...");
      
      const peerNameEl = document.getElementById('lobbyPeerName');
      if (peerNameEl && window.app && window.app.gameState === 'setup') {
        peerNameEl.textContent = 'Opponent disconnected. Waiting for reconnect...';
      }
      
      if (!this.reconnectTimeout) {
        this.reconnectTimeout = setTimeout(() => {
          if (!this.active) {
            alert("Connection lost. Opponent disconnected.");
            if (window.app && window.app.goToMenu) window.app.goToMenu();
            else if (window.app && window.app.renderAll) window.app.renderAll();
          }
          this.reconnectTimeout = null;
        }, WEBRTC_TIMING.RECONNECT_TIMEOUT_MS);
      }
    } else {
      if (this.reconnectAttempts >= 5) {
        alert("Connection lost. Opponent disconnected.");
        this.reconnectAttempts = 0;
        if (window.app && window.app.goToMenu) window.app.goToMenu();
        else if (window.app && window.app.renderAll) window.app.renderAll();
        return;
      }
      this.reconnectAttempts++;
      console.warn(`Reconnection attempt ${this.reconnectAttempts} of 5...`);
      
      const peerNameEl = document.getElementById('lobbyPeerName');
      if (peerNameEl && window.app && window.app.gameState === 'setup') {
        peerNameEl.textContent = `Reconnecting to host (Attempt ${this.reconnectAttempts}/5)...`;
      }

      setTimeout(() => {
        if (!this.active && this.hostId) {
          // Provide an onErrorCallback so if it fails, it can try again
          this.connectToHost(
            this.hostId, 
            onConnectCallback, 
            onDataCallback,
            (err) => {
              console.warn("Reconnection failed: ", err);
              this.attemptReconnection(onConnectCallback, onDataCallback);
            }
          );
        }
      }, WEBRTC_TIMING.RECONNECT_RETRY_DELAY_MS);
    }
  },

  sendData(data) {
    if (this.conn && this.active) {
      this.conn.send(data);
    }
  },

  sendMove(fromRow, fromCol, toRow, toCol, flags, promo, remainingTime, stateSnapshot) {
    this.sendData({
      type: 'move',
      move: { fromRow, fromCol, toRow, toCol, flags, promo },
      remainingTime: remainingTime,
      state: stateSnapshot
    });
  },

  sendDraftLock(color, draftBoard = null) {
    this.sendData({
      type: 'draft-lock',
      color: color,
      board: draftBoard
    });
  },

  sendUndo() {
    this.sendData({ type: 'undo' });
  },

  sendReset() {
    this.sendData({ type: 'reset' });
  }
};
