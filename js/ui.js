// --- CHESSOLOGY UI MANAGER -------------------------------------------------
window.ui = {
  init() {
    this.setupMultiplayer();
  },

  showStep(id) {
    ['stepMode','stepOnlineMode','stepJoin','stepHostWait','stepOnlineLobby','stepOfflineVariants','stepWaitHost']
      .forEach(s => {
        const el = document.getElementById(s);
        if (el) el.style.display = s === id ? 'block' : 'none';
      });
      
    if (id === 'stepMode') {
      const joinBtn = document.getElementById('joinGameBtn');
      if (joinBtn) {
        joinBtn.textContent = 'Connect';
        joinBtn.disabled = false;
      }
    }
    
    if (id === 'stepOfflineVariants') {
      this.syncStartFromPosBtn();
    }
  },

  syncStartFromPosBtn() {
    const startFromPosBtn = document.getElementById('startFromPosBtn');
    if (!startFromPosBtn) return;
    
    const isDraftChecked = document.getElementById('draftModeToggleOffline')?.checked || false;
    
    const currentFen = boardToFen(board, turn, castling, enPassantSquare);
    const isDefaultPos = (currentFen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
    
    let wKing = 0, bKing = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'K') {
          if (p.color === 'w') wKing++; else bKing++;
        }
      }
    }
    const hasInvalidKings = (wKing !== 1 || bKing !== 1);
    
    const opponent = turn === 'w' ? 'b' : 'w';
    const opponentInCheck = inCheck(opponent, board);
    
    const legalMoves = allLegalMoves(turn, board, enPassantSquare, castling);
    const isGameOver = (legalMoves.length === 0);
    
    if (isDraftChecked || isDefaultPos || hasInvalidKings || opponentInCheck || isGameOver) {
      startFromPosBtn.style.display = 'none';
    } else {
      startFromPosBtn.style.display = 'block';
    }
  },

  showClaimUsernameModal() {
    const modal = document.getElementById('claimModal');
    const input = document.getElementById('claimUsernameInput');
    const errEl = document.getElementById('claimError');
    if (modal) {
      modal.style.display = 'flex';
      if (input) input.value = '';
      if (errEl) errEl.textContent = '';
      if (input) setTimeout(() => input.focus(), 100);
    }
  },

  syncAuthUI() {
    const auth = window.auth;
    if (!auth) return;
    
    const display = document.getElementById('authUsernameDisplay');
    const signInBtn = document.getElementById('googleSignInBtn');
    const signOutBtn = document.getElementById('googleSignOutBtn');
    
    if (display) {
      display.textContent = auth.username || 'Loading...';
    }
    
    if (auth.isAuthenticated) {
      if (signInBtn) signInBtn.style.display = 'none';
      if (signOutBtn) signOutBtn.style.display = 'inline-block';
    } else {
      if (signInBtn) signInBtn.style.display = 'inline-block';
      if (signOutBtn) signOutBtn.style.display = 'none';
    }
  },

  setupMultiplayer() {
    const resetWebRTC = () => {
      if (window.webrtc.peer) { try { window.webrtc.peer.destroy(); } catch(e) {} }
      window.webrtc.active = false;
      window.webrtc.peer = null;
      window.webrtc.isHost = false;
    };

    const bindBtn = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    bindBtn('modeOfflineBtn', () => {
      resetWebRTC();
      this.showStep('stepOfflineVariants');
      window.app.renderAll();
    });

    const joinBtn = document.getElementById('joinGameBtn');
    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        const opponent = document.getElementById('connIdInput')?.value.trim().toLowerCase();
        if (!opponent) return;
        
        if (window.auth && window.auth.username && opponent === window.auth.username.toLowerCase()) {
          alert("You cannot connect to yourself! To test multiplayer locally, please open an Incognito window or a different browser (like Edge) so you have two distinct identities.");
          return;
        }

        joinBtn.textContent = 'Connecting...';
        joinBtn.disabled = true;
        
        window.webrtc.connectToHost(
          opponent,
          () => { window.app.onLobbyConnected('Joiner'); },
          (data) => { window.app.handleMultiplayerMessage(data); },
          (err) => {
            alert(window.webrtc.formatError(err));
            joinBtn.textContent = 'Connect';
            joinBtn.disabled = false;
          }
        );
      });
    }

    // -- Auth Bindings --------------------------------------------------------
    bindBtn('googleSignInBtn', () => {
      if (window.auth) window.auth.signInWithGoogle();
    });
    bindBtn('googleSignOutBtn', () => {
      if (window.auth) window.auth.signOut();
    });
    bindBtn('claimSubmitBtn', async () => {
      const input = document.getElementById('claimUsernameInput');
      const errEl = document.getElementById('claimError');
      if (!input || !errEl || !window.auth) return;
      
      const val = input.value.trim();
      const btn = document.getElementById('claimSubmitBtn');
      btn.disabled = true;
      errEl.textContent = '';
      
      const res = await window.auth.claimUsername(val);
      btn.disabled = false;
      if (res.success) {
        document.getElementById('claimModal').style.display = 'none';
      } else {
        errEl.textContent = res.message;
      }
    });

    // -- Lobby Events ---------------------------------------------------------
    bindBtn('disconnectLobbyBtn', () => {
      if (window.webrtc) window.webrtc.intentionalDisconnect = true;
      resetWebRTC();
      if (window.app && window.app.goToMenu) window.app.goToMenu();
    });

    const backOfflineBtn = document.getElementById('backToModeFromOfflineBtn');
    if (backOfflineBtn) {
      backOfflineBtn.addEventListener('click', () => {
        this.showStep('stepMode');
      });
    }

    // Audio Settings setup
    const soundToggle = document.getElementById('soundToggleBtn');
    if (soundToggle) {
      soundToggle.addEventListener('change', (e) => {
        window.audio.enabled = e.target.checked;
        if (window.audio.enabled) {
          window.audio.playSound('move');
        }
      });
    }

    const bestMoveToggle = document.getElementById('showBestMoveToggle');
    if (bestMoveToggle) {
      bestMoveToggle.addEventListener('change', () => {
        if (window.analysis) window.analysis.drawArrow();
      });
    }

    const evalBarToggle = document.getElementById('showEvalBarToggle');
    if (evalBarToggle) {
      evalBarToggle.addEventListener('change', () => {
        if (window.app) window.app.renderAll();
      });
    }

    const hintsToggle = document.getElementById('showHintsToggle');
    if (hintsToggle) {
      hintsToggle.addEventListener('change', () => {
        if (window.app) window.app.renderAll();
      });
    }

    const highlightToggle = document.getElementById('highlightLastMoveToggle');
    if (highlightToggle) {
      highlightToggle.addEventListener('change', () => {
        if (window.app) window.app.renderAll();
      });
    }

    const draftToggleOffline = document.getElementById('draftModeToggleOffline');
    if (draftToggleOffline) {
      draftToggleOffline.addEventListener('change', () => {
        window.ui.syncStartFromPosBtn();
      });
    }

    // Clock Select logic
    const clockSelOff = document.getElementById('clockSelectOffline');
    const customUIOff = document.getElementById('customClockUIOffline');
    if (clockSelOff && customUIOff) {
      clockSelOff.addEventListener('change', (e) => {
        customUIOff.style.display = e.target.value === 'custom' ? 'flex' : 'none';
      });
    }

    const clockSelLobby = document.getElementById('clockSelectLobby');
    const customUILobby = document.getElementById('customClockUILobby');
    if (clockSelLobby && customUILobby) {
      clockSelLobby.addEventListener('change', (e) => {
        customUILobby.style.display = e.target.value === 'custom' ? 'flex' : 'none';
      });
    }

    // Grid buttons sync helper
    const setupTCGrid = (gridId, selectId) => {
      const grid = document.getElementById(gridId);
      const sel = document.getElementById(selectId);
      if (!grid || !sel) return;
      
      const btns = grid.querySelectorAll('.tc-btn');
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          if (sel.disabled) return;
          btns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          sel.value = btn.dataset.val;
          sel.dispatchEvent(new Event('change'));
        });
      });

      sel.addEventListener('change', () => {
        btns.forEach(b => {
          if (b.dataset.val === sel.value) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      });
    };

    setupTCGrid('tcGridOffline', 'clockSelectOffline');
    setupTCGrid('tcGridLobby', 'clockSelectLobby');

    const copyCodeBtn = document.getElementById('copyCodeBtn');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', () => {
        const textToCopy = document.getElementById('hostCodeValue').textContent;
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            copyCodeBtn.textContent = 'Copied!';
            setTimeout(() => copyCodeBtn.textContent = 'Copy Code', 2000);
          })
          .catch((err) => {
            console.error("Clipboard copy failed:", err);
            window.prompt("Copy failed or blocked by browser permissions. Please copy manually:", textToCopy);
          });
      });
    }

    // Color segmented control logic
    const segBtns = document.querySelectorAll('#lobbyColorSeg .segmented-btn');
    segBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        segBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    bindBtn('sendChallengeBtn', () => {
      window.app.sendChallenge();
    });

    bindBtn('acceptChallengeBtn', () => {
      const p = window.app.pendingChallenge;
      if (p) window.app.acceptChallenge();
    });

    bindBtn('declineChallengeBtn', () => {
      window.app.declineChallenge();
    });

    bindBtn('acceptProposalBtn', () => {
      window.app.acceptProposal();
    });

    bindBtn('declineProposalBtn', () => {
      window.app.declineProposal();
    });

    // -- Variant Exclusivity Rules -------------------------------------------
    const setupVariantExclusivity = (hbId, conflictingIds) => {
      const hbToggle = document.getElementById(hbId);
      if (!hbToggle) return;
      
      const conflicts = conflictingIds.map(id => document.getElementById(id)).filter(Boolean);
      
      hbToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          conflicts.forEach(el => {
            el.checked = false;
            el.dispatchEvent(new Event('change'));
          });
        }
      });
      
      conflicts.forEach(el => {
        el.addEventListener('change', (e) => {
          if (e.target.checked) {
            hbToggle.checked = false;
            hbToggle.dispatchEvent(new Event('change'));
          }
        });
      });
    };

    // Online variants mutual exclusivity
    setupVariantExclusivity('handAndBrainToggle', [
      'diceChessToggle',
      'identityTheftToggle',
      'fogOfWarToggle'
    ]);
    setupVariantExclusivity('diceChessToggle', [
      'handAndBrainToggle',
      'identityTheftToggle',
      'fogOfWarToggle'
    ]);
    setupVariantExclusivity('identityTheftToggle', [
      'handAndBrainToggle',
      'diceChessToggle',
      'fogOfWarToggle'
    ]);
    setupVariantExclusivity('fogOfWarToggle', [
      'handAndBrainToggle',
      'diceChessToggle',
      'identityTheftToggle'
    ]);

    // Offline variants mutual exclusivity
    setupVariantExclusivity('handAndBrainToggleOffline', [
      'diceChessToggleOffline',
      'identityTheftToggleOffline'
    ]);
    setupVariantExclusivity('diceChessToggleOffline', [
      'handAndBrainToggleOffline',
      'identityTheftToggleOffline'
    ]);
    setupVariantExclusivity('identityTheftToggleOffline', [
      'handAndBrainToggleOffline',
      'diceChessToggleOffline'
    ]);
  }
};
