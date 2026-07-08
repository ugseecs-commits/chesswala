// --- CHESSOLOGY APPLICATION LAYER -------------------------------------------
console.log("Chessology app.js loaded: Version [P2P-Sync-Fix-v4]");
const APP_TIMING = {
  SESSION_RESTORE_DELAY_MS: 500,
  RESULT_BANNER_DELAY_MS: 300,
  DRAG_THRESHOLD_PX: 6
};

window.app = {
  passPlayMode: 'static', // 'static', 'rotate', 'bothSides'
  draftColor: 'w',        // For local draft setup selection
  gameState: 'setup',
  branches: null,
  currentBranchId: 'main',

  get over() {
    return over;
  },
  set over(val) {
    over = val;
  },

  init() {
    this.bindEvents();
    const hasPendingSession = sessionStorage.getItem('chessology_session')
      && sessionStorage.getItem('chessology_game_state');
    if (hasPendingSession) {
      // We still need `board` allocated as an 8x8 grid - checkAndRestoreSession
      // overwrites every square immediately after, but needs the array to exist
      // first. Don't call newGame()/localReset() here though, since that wipes
      // the very session state we're about to restore.
      initBoard(INIT_FEN);
      setTimeout(() => this.checkAndRestoreSession(), APP_TIMING.SESSION_RESTORE_DELAY_MS);
    } else {
      newGame();
    }
  },

  hideResultBanner() {
    document.getElementById('resultBanner').classList.remove('show');
  },



  // --- RENDERING UI ----------------------------------------------------------
  renderAll() {
    this.syncFogToggleState();
    this.syncSetupCardState();
    this.syncGameActionButtons();
    
    this.renderBoard();
    if (window.analysis && window.analysis.bestMove) {
      window.analysis.drawArrow();
    }
    this.renderBars();
    this.renderHist();
    this.renderStatus();
    this.renderDraftUI();
    this.renderEditorUI();
    this.renderBranchSelector();

    this.syncEvalBarState();
    this.syncImportControls();
    this.syncEditorButtonState();
    if (window.ui && window.ui.syncStartFromPosBtn) {
      window.ui.syncStartFromPosBtn();
    }
  },

  syncFogToggleState() {
    const fogToggle = document.getElementById('fogOfWarToggle');
    if (fogToggle) {
      const isOnlineOrHost = webrtc.active || (webrtc.peer && webrtc.isHost);
      if (isOnlineOrHost) {
        fogToggle.disabled = false;
      } else {
        fogToggle.disabled = true;
        fogToggle.checked = false;
        window.variants.fogOfWarEnabled = false;
      }
    }
  },

  syncSetupCardState() {
    const gameActive = this.gameState !== 'setup';
    const isPlaying = this.gameState === 'playing';
    const setupCard = document.getElementById('setupCard');
    if (setupCard) {
      const isAnalysis = (this.gameState !== 'playing' || over);
      const isEditActive = isAnalysis && this.editorTool === 'edit';
      if (isEditActive) {
        setupCard.style.display = 'none';
      } else {
        setupCard.style.display = gameActive ? 'none' : 'block';
      }
    }
    
    const gameActionsCard = document.getElementById('gameActionsCard');
    const perspectiveCard = document.getElementById('perspectiveCard');
    if (gameActionsCard) {
      gameActionsCard.style.display = isPlaying ? 'block' : 'none';
    }
    
    const gameWrap = document.querySelector('.game-wrap');
    const isSetupFlow = (this.gameState === 'setup' && this.editorTool !== 'edit');
    
    if (perspectiveCard) {
      // Perspective card is always accessible offline (for free analysis, editor, and offline matches)
      perspectiveCard.style.display = !webrtc.active ? 'block' : 'none';
    }

    if (gameWrap) {
      gameWrap.classList.toggle('in-setup-flow', isSetupFlow);
    }
  },

  syncGameActionButtons() {
    const gameActive = this.gameState !== 'setup';
    const resignBtn = document.getElementById('resignBtn');
    const drawBtn = document.getElementById('drawBtn');
    const undoBtn = document.getElementById('undoBtn');
    const returnToMenuBtn = document.getElementById('returnToMenuBtn');
    const rematchBtnStatus = document.getElementById('rematchBtnStatus');
    
    if (resignBtn) {
      resignBtn.style.display = gameActive && !over ? 'block' : 'none';
      const isAbort = moveHistory.length < 2;
      resignBtn.innerHTML = isAbort ? ICONS.abort + 'Abort' : ICONS.resign + 'Resign';
    }
    if (drawBtn) {
      drawBtn.style.display = gameActive && !over && moveHistory.length >= 2 ? 'block' : 'none';
      drawBtn.innerHTML = ICONS.draw + 'Draw';
      drawBtn.disabled = false;
    }
    if (undoBtn) undoBtn.style.display = gameActive && !over && !webrtc.active && moveHistory.length > 0 ? 'block' : 'none';
    if (returnToMenuBtn) returnToMenuBtn.style.display = gameActive && over ? 'block' : 'none';
    if (rematchBtnStatus) rematchBtnStatus.style.display = gameActive && over ? 'block' : 'none';
  },

  triggerBrainAnalysis() {
    if (window.variants && window.variants.isHandAndBrainActive && !over) {
      window.variants.brainSuggestedPiece = null;
      if (window.analysis) {
        window.analysis.analyze(boardToFen(board, turn, castling, enPassantSquare));
      }
    }
  },

  isEvalVisible() {
    const showEval = document.getElementById('showEvalBarToggle')?.checked !== false;
    const isIdentityTheft = window.variants && window.variants.isIdentityTheftActive;
    const isFog = window.variants && window.variants.fogOfWarEnabled;
    return ((this.gameState !== 'playing' || over) && showEval && !isIdentityTheft && !isFog);
  },

  syncEvalBarState() {
    const evalBar = document.getElementById('evalBar');
    const isPerspectiveFlipped = flipped;
    const boardCol = document.querySelector('.board-col');
    if (boardCol) {
      boardCol.classList.toggle('flipped', isPerspectiveFlipped);
    }
    
    const isEvalVisible = this.isEvalVisible();
    
    const gameWrap = document.querySelector('.game-wrap');
    if (gameWrap) {
      gameWrap.classList.toggle('has-eval', isEvalVisible);
    }
    
    if (isEvalVisible) {
      if (evalBar) {
        evalBar.style.display = 'flex';
        evalBar.classList.toggle('flipped', isPerspectiveFlipped);
      }
      if (window.analysis && !window.variants.isDraftActive) {
        window.analysis.analyze(boardToFen(board, turn, castling, enPassantSquare));
      }
    } else {
      if (evalBar) evalBar.style.display = 'none';
      if (window.analysis && (!window.variants || !window.variants.isHandAndBrainActive)) {
        window.analysis.stop();
      }
    }
  },

  syncImportControls() {
    const isIdentityTheft = window.variants && window.variants.isIdentityTheftActive;
    const copyFenBtn = document.getElementById('copyFenBtn');
    if (copyFenBtn) {
      copyFenBtn.disabled = isIdentityTheft;
      copyFenBtn.style.opacity = isIdentityTheft ? '0.4' : '1';
      copyFenBtn.style.cursor = isIdentityTheft ? 'not-allowed' : 'pointer';
    }

    const evalToggle = document.getElementById('showEvalBarToggle');
    const bestToggle = document.getElementById('showBestMoveToggle');
    if (evalToggle && bestToggle) {
      const isFog = window.variants && window.variants.fogOfWarEnabled;
      const isPlaying = (this.gameState === 'playing' && !over);
      const showAssist = !isPlaying && !isIdentityTheft && !isFog;
      evalToggle.parentElement.style.display = showAssist ? 'flex' : 'none';
      bestToggle.parentElement.style.display = showAssist ? 'flex' : 'none';
    }

    const importBtn = document.getElementById('importBtn');
    const fenPgnInput = document.getElementById('fenPgnInput');
    const isPlaying = (this.gameState === 'playing' && !over);
    const isMultiActive = webrtc.active;
    const isImportDisabled = isPlaying || isMultiActive;
    if (importBtn) {
      importBtn.disabled = isImportDisabled;
      importBtn.style.opacity = isImportDisabled ? '0.4' : '1';
      importBtn.style.pointerEvents = isImportDisabled ? 'none' : 'auto';
    }
    if (fenPgnInput) {
      fenPgnInput.disabled = isImportDisabled;
      fenPgnInput.style.opacity = isImportDisabled ? '0.4' : '1';
      fenPgnInput.placeholder = isPlaying ? "Import is disabled during gameplay" : (isMultiActive ? "Import is disabled during multiplayer" : "Paste FEN or PGN here...");
    }
  },

  syncEditorButtonState() {
    const editBoardBtn = document.getElementById('editBoardBtn');
    if (editBoardBtn) {
      const isOnline = webrtc.active;
      editBoardBtn.disabled = isOnline;
      editBoardBtn.style.opacity = isOnline ? '0.4' : '1';
      editBoardBtn.style.pointerEvents = isOnline ? 'none' : 'auto';
    }
  },

  renderBoard() {
    const el = document.getElementById('boardEl');
    el.innerHTML = '';
    
    // Determine perspective color for Fog of War and Coordinate Flipped states
    const activeViewer = webrtc.active ? webrtc.myColor : turn;
    const isPerspectiveFlipped = flipped;
    
    const getRealRow = rIdx => isPerspectiveFlipped ? 7 - rIdx : rIdx;
    const getRealCol = cIdx => isPerspectiveFlipped ? 7 - cIdx : cIdx;

    // Get Fog of War visibility map - lift fog entirely when game is over
    const hasFog = window.variants.isFogOfWarActive && !window.variants.isDraftActive && !over;
    const visibleSquares = hasFog ? window.variants.getVisibleSquares(activeViewer, board) : null;

    // Highlights validation on draft mode rows
    const isDrafting = window.variants.isDraftActive;
    const activeDraftColor = webrtc.active ? webrtc.myColor : this.draftColor;

    for (let rowIdx = 0; rowIdx < 8; rowIdx++) {
      for (let colIdx = 0; colIdx < 8; colIdx++) {
        const r = getRealRow(rowIdx), c = getRealCol(colIdx);
        const isFogged = hasFog && !visibleSquares.has(`${r},${c}`);

        const sq = this.renderSquares(r, c, rowIdx, colIdx, isFogged, isDrafting, activeDraftColor);
        if (!isFogged) {
          this.renderHighlights(sq, r, c);
        }
        this.renderPieces(sq, r, c, isFogged, isDrafting, activeDraftColor, isPerspectiveFlipped);
        
        el.appendChild(sq);
      }
    }
    
    // Append arrowOverlay as the last child to ensure it is always painted on top of all squares/pieces
    const svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgOverlay.id = "arrowOverlay";
    svgOverlay.setAttribute("viewBox", "0 0 100 100");
    svgOverlay.setAttribute("preserveAspectRatio", "none");
    svgOverlay.setAttribute("style", "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;");
    el.appendChild(svgOverlay);
  },

  renderSquares(r, c, displayRow, displayCol, isFogged, isDrafting, activeDraftColor) {
    const light = (r + c) % 2 === 0;
    const sq = document.createElement('div');
    sq.className = 'sq ' + (light ? 'light' : 'dark');
    sq.dataset.r = r;
    sq.dataset.c = c;

    // Render coordinate inside the square
    if (displayCol === 7) {
      const rankLbl = document.createElement('span');
      rankLbl.className = 'coord rank-coord';
      rankLbl.textContent = 8 - r;
      sq.appendChild(rankLbl);
    }
    if (displayRow === 7) {
      const fileLbl = document.createElement('span');
      fileLbl.className = 'coord file-coord';
      fileLbl.textContent = FILES[c];
      sq.appendChild(fileLbl);
    }

    if (isFogged) sq.classList.add('fog');

    if (isDrafting && !window.variants.draftLocked[activeDraftColor]) {
      const isMyDraftRow = activeDraftColor === 'w' ? (r >= 4 && r <= 7) : (r >= 0 && r <= 3);
      if (isMyDraftRow) sq.classList.add('draft-valid');
    }
    return sq;
  },

  renderHighlights(sq, r, c) {
    let ckr = -1, ckc = -1;
    if (!over && !window.variants.isDraftActive && !(window.variants && window.variants.isFogOfWarActive) && inCheck(turn, board)) {
      const k = findKing(turn, board);
      if (k) { ckr = k.r; ckc = k.c; }
    }

    if (selectedSquare?.r === r && selectedSquare?.c === c) sq.classList.add('selectedSquare');
    
    const hlLast = document.getElementById('highlightLastMoveToggle')?.checked !== false;
    if (lastMove && hlLast) {
      if (lastMove.from.r === r && lastMove.from.c === c) sq.classList.add('lf');
      if (lastMove.to.r === r && lastMove.to.c === c) sq.classList.add('lt');
    }
    if (r === ckr && c === ckc) sq.classList.add('chk');
    
    const showHints = document.getElementById('showHintsToggle')?.checked !== false;
    if (selectedSquare && showHints) {
      const mv = legal.find(m => m.r === r && m.c === c);
      if (mv) sq.classList.add(board[r][c] || mv.enp ? 'chint' : 'mhint');
    }
  },

  renderPieces(sq, r, c, isFogged, isDrafting, activeDraftColor, isPerspectiveFlipped) {
    const piece = board[r][c];
    if (!piece || isFogged) return;

    // Hide opponent's pieces during draft phase for secret drafting
    if (isDrafting && piece.color !== activeDraftColor) return;

    const pe = document.createElement('div');
    pe.className = 'piece';
    const shouldFlip = opponentFlipped && ((!isPerspectiveFlipped && piece.color === 'b') || (isPerspectiveFlipped && piece.color === 'w'));
    if (shouldFlip) pe.classList.add('flip-piece');
    
    const isMyTurnOnline = webrtc.active ? (webrtc.myColor === turn) : true;
    if (piece.color === turn && !over && isMyTurnOnline && !isDrafting) {
      pe.classList.add('mine');
    }
    // Allow draft edits on user pieces
    if (isDrafting && piece.color === activeDraftColor && !window.variants.draftLocked[activeDraftColor]) {
      pe.classList.add('mine');
    }

    // Build SVG representation (aggregates compound icons for Append mode)
    const pTypes = piece.types || [piece.type];
    if (pTypes.length > 1) {
      // Render composite compound layout
      pe.innerHTML = this.generateCompositeSVG(piece.color, pTypes);
    } else {
      pe.innerHTML = SVG[piece.color + piece.type];
    }
    sq.appendChild(pe);
  },

  generateCompositeSVG(color, types) {
    // Renders primary piece slightly scaled with secondary piece badge
    const p1 = SVG[color + types[0]];
    const p2 = SVG[color + types[1]];
    return `
      <div style="position:relative;width:100%;height:100%">
        <div style="width:85%;height:85%;position:absolute;top:0;left:0">${p1}</div>
        <div style="width:50%;height:50%;position:absolute;bottom:-2px;right:-2px;background:var(--panel2);border:1px solid var(--gold);border-radius:4px;padding:1px">${p2}</div>
      </div>
    `;
  },


  renderBars() {
    // Hide active players dots on draft
    const isDrafting = window.variants.isDraftActive;
    document.getElementById('barW').classList.toggle('active', turn === 'w' && !over && !isDrafting);
    document.getElementById('barB').classList.toggle('active', turn === 'b' && !over && !isDrafting);

    const wc = moveHistory.filter(m => m.cap && m.turn === 'w').map(m => m.cap);
    const bc = moveHistory.filter(m => m.cap && m.turn === 'b').map(m => m.cap);

    const wm = wc.reduce((s, p) => s + (PIECE_VALUES[p.type] || 0), 0);
    const bm = bc.reduce((s, p) => s + (PIECE_VALUES[p.type] || 0), 0);

    const wCounts = { P: 0, N: 0, B: 0, R: 0, Q: 0 };
    const bCounts = { P: 0, N: 0, B: 0, R: 0, Q: 0 };
    wc.forEach(p => wCounts[p.type]++);
    bc.forEach(p => bCounts[p.type]++);

    const types = ['P', 'N', 'B', 'R', 'Q'];
    let netW = [], netB = [];

    types.forEach(t => {
      const diff = wCounts[t] - bCounts[t];
      if (diff > 0) {
        for (let i = 0; i < diff; i++) netW.push({ color: 'b', type: t });
      } else if (diff < 0) {
        for (let i = 0; i < Math.abs(diff); i++) netB.push({ color: 'w', type: t });
      }
    });

    document.getElementById('capW').innerHTML = netW.map(p => `<span>${SVG[p.color + p.type]}</span>`).join('');
    document.getElementById('scoreW').textContent = wm > bm ? '+' + (wm - bm) : '';

    document.getElementById('capB').innerHTML = netB.map(p => `<span>${SVG[p.color + p.type]}</span>`).join('');
    document.getElementById('scoreB').textContent = bm > wm ? '+' + (bm - wm) : '';
  },

  renderHist() {
    const body = document.getElementById('histBody'); body.innerHTML = '';
    const activeIdx = viewIndex - 1;

    // Fog of War: hide opponent moves until game ends
    const hasFog = window.variants.isFogOfWarActive && !over;
    // In online fog, myColor is the viewer; opponent is the other side
    const myColor = webrtc.active ? webrtc.myColor : null;
    // White moves are at even moveHistory indices, black at odd
    const isOpponentMove = (color) => hasFog && myColor && color !== myColor;

    for (let i = 0; i < moveHistory.length; i += 2) {
      const wm = moveHistory[i], bm = moveHistory[i + 1];
      const row = document.createElement('div'); row.className = 'mrow';
      const num = document.createElement('div'); num.className = 'mnum'; num.textContent = (i / 2 + 1) + '.';

      const wc = document.createElement('div'); wc.className = 'mcell';
      if (isOpponentMove('w')) {
        wc.textContent = wm ? '???' : '';
        wc.style.opacity = '0.4';
        wc.style.cursor = 'default';
      } else {
        wc.textContent = wm?.san || '';
        wc.onclick = () => jumpTo(i + 1);
        if (i === activeIdx) wc.classList.add('cur');
        
        if (wm) {
          const vars = this.getBranchesAtMove(i + 1);
          vars.forEach(v => {
            const link = document.createElement('span');
            link.className = 'var-inline-link';
            link.textContent = ` (${this.getVarPreviewText(v, i + 1)})`;
            link.onclick = (e) => {
              e.stopPropagation();
              this.switchBranch(v.id);
            };
            wc.appendChild(link);
          });
        }
      }

      const bc2 = document.createElement('div'); bc2.className = 'mcell';
      if (isOpponentMove('b')) {
        bc2.textContent = bm ? '???' : '';
        bc2.style.opacity = '0.4';
        bc2.style.cursor = 'default';
      } else {
        bc2.textContent = bm?.san || '';
        if (bm) {
          bc2.onclick = () => jumpTo(i + 2);
          if (i + 1 === activeIdx) bc2.classList.add('cur');
          
          const vars = this.getBranchesAtMove(i + 2);
          vars.forEach(v => {
            const link = document.createElement('span');
            link.className = 'var-inline-link';
            link.textContent = ` (${this.getVarPreviewText(v, i + 2)})`;
            link.onclick = (e) => {
              e.stopPropagation();
              this.switchBranch(v.id);
            };
            bc2.appendChild(link);
          });
        }
      }

      row.append(num, wc, bc2); body.appendChild(row);
    }
    if (viewIndex === moveHistory.length) {
      body.scrollTop = body.scrollHeight;
    } else {
      const activeEl = body.querySelector('.mcell.cur');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  },

  renderStatus() {
    const el = document.getElementById('statusTxt');
    if (!el) return;
    if (over) return; // handled by result banner

    if (this.gameState === 'setup') {
      // 1. Check for King capture (neither color has a king)
      let wKing = false, bKing = false;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece && piece.type === 'K') {
            if (piece.color === 'w') wKing = true;
            else bKing = true;
          }
        }
      }
      if (!wKing) {
        el.textContent = "Black wins! (White King Captured)";
        return;
      }
      if (!bKing) {
        el.textContent = "White wins! (Black King Captured)";
        return;
      }

      // 2. Check for checkmate, stalemate, draws, check
      const nxt = allLegalMoves(turn, board, enPassantSquare, castling, true);
      const chk = inCheck(turn, board);
      const isMate = nxt.length === 0 && chk;
      const isStale = nxt.length === 0 && !chk;
      const isInsuff = !window.variants.fogOfWarEnabled && isInsufficientMaterial(board);
      
      if (isMate) {
        const winner = turn === 'w' ? 'Black' : 'White';
        el.textContent = `Checkmate! ${winner} wins.`;
        return;
      }
      if (isStale) {
        el.textContent = "Draw (Stalemate)";
        return;
      }
      if (isInsuff) {
        el.textContent = "Draw (Insufficient material)";
        return;
      }
      if (chk) {
        el.textContent = `Check! ${turn === 'w' ? 'White' : 'Black'} to move.`;
        return;
      }
      
      let txt = moveHistory.length > 0 ? "Reviewing past moves..." : "Board set, ready to play!";
      if (window.variants.isDiceChessActive && window.variants.allowedDiceTypes.length > 0) {
        const icons = window.variants.allowedDiceTypes.map(t => {
          return `<span class="dice-piece-icon">${SVG[turn + t]}</span>`;
        }).join('');
        txt += `<div class="variant-info-box">${ICONS.dice} Move: ${icons}</div>`;
      }
      el.innerHTML = txt;
      return;
    }

    if (window.pendingPowerSelection) {
      el.textContent = "Waiting for opponent to select powers...";
      return;
    }

    // Draft phase status text
    if (window.variants.isDraftActive) {
      const activeColor = webrtc.active ? webrtc.myColor : this.draftColor;
      const points = window.variants.draftPointsLeft[activeColor];
      const lockedSelf = window.variants.draftLocked[activeColor];
      
      if (lockedSelf) {
        el.textContent = "Locked in. Waiting for opponent...";
      } else {
        el.textContent = `Drafting: ${points} pts left`;
      }
      return;
    }

    // Normal game play status
    const isFog = window.variants && window.variants.isFogOfWarActive;
    let txt = (turn === 'w' ? 'White' : 'Black') + ((!isFog && inCheck(turn, board)) ? ' is in check!' : ' to move');

    // Dice Chess allowed pieces info
    if (window.variants.isDiceChessActive && window.variants.allowedDiceTypes.length > 0) {
      const icons = window.variants.allowedDiceTypes.map(t => {
        return `<span class="dice-piece-icon">${SVG[turn + t]}</span>`;
      }).join('');
      txt += `<div class="variant-info-box">${ICONS.dice} Move: ${icons}</div>`;
    }

    // Hand and Brain suggestion info
    if (window.variants.isHandAndBrainActive) {
      if (window.variants.brainSuggestedPiece) {
        const icon = `<span class="dice-piece-icon">${SVG[turn + window.variants.brainSuggestedPiece]}</span>`;
        txt += `<div class="variant-info-box">${ICONS.brain} Move: ${icon}</div>`;
      } else {
        txt += `<div class="variant-info-box"><span class="brain-thinking">${ICONS.brain} Thinking...</span></div>`;
      }
    }

    el.innerHTML = txt;
  },

  renderDraftUI() {
    const container = document.getElementById('draftUI');
    if (!window.variants.isDraftActive || this.gameState === 'setup') {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';

    const activeColor = webrtc.active ? webrtc.myColor : this.draftColor;
    const lockedSelf = window.variants.draftLocked[activeColor];
    const points = window.variants.draftPointsLeft[activeColor];

    let html = `<div class="draft-pts">Draft Points Left: <strong>${points}</strong></div>`;
    
    if (!lockedSelf) {
      const types = ['P', 'N', 'B', 'R', 'Q', 'K'];
      html += `<div class="draft-bank">`;
      types.forEach(t => {
        const cost = window.variants.getPieceCost(t);
        const label = t === 'K' ? 'Free' : `(${cost})`;
        const activeClass = window.variants.draftActivePieceType === t ? 'active' : '';
        html += `
          <button class="draft-piece-btn ${activeClass}" onclick="window.app.selectDraftPiece('${t}')">
            ${SVG[activeColor + t]}
            <span>${t} ${label}</span>
          </button>
        `;
      });
      html += `</div>`;
      html += `<button class="btn primary" style="width:100%;margin-top:6px" onclick="window.app.lockDraftSelf()">Lock Draft</button>`;
    } else {
      html += `<div class="draft-pts" style="color:var(--dim)">Draft setup submitted successfully.</div>`;
    }

    container.innerHTML = html;
  },

  selectDraftPiece(type) {
    window.variants.draftActivePieceType = type;
    this.renderAll();
  },

  renderEditorUI() {
    const container = document.getElementById('editorUI');
    if (!container) return;
    
    const isAnalysis = (this.gameState !== 'playing' || over);
    const isEditActive = isAnalysis && this.editorTool === 'edit';
    
    const setupCard = document.getElementById('setupCard');
    
    if (!isEditActive) {
      container.style.display = 'none';
      
      const editBtn = document.getElementById('editBoardBtn');
      if (editBtn) {
        const textSpan = document.getElementById('editBtnText');
        if (textSpan) textSpan.textContent = "Edit";
        editBtn.classList.remove('primary');
      }
      
      // Restore default visibility
      this.syncSetupCardState();
      return;
    }
    
    // Hide select mode in edit mode
    if (setupCard) setupCard.style.display = 'none';
    
    container.style.display = 'block';
    
    const editBtn = document.getElementById('editBoardBtn');
    if (editBtn) {
      const textSpan = document.getElementById('editBtnText');
      if (textSpan) textSpan.textContent = "Exit";
      editBtn.classList.add('primary');
    }
    
    const activeColor = this.editorColor || 'w';
    const activeType = this.editorPieceType || 'P';
    
    let html = `
      <div class="card-hd">Board Editor</div>
      <div class="status-body" style="padding:10px; gap:8px; display:flex; flex-direction:column;">
    `;
    
    html += this.buildEditorStatusSection();
    html += this.buildEditorPaletteSection(activeColor, activeType);
    html += this.buildEditorToolsSection();
    
    html += `</div>`; // Close status-body
    
    container.innerHTML = html;
  },

  buildEditorStatusSection() {
    return `
        <div style="font-size:0.7rem; color:var(--dim); text-align:center; margin-bottom: 2px;">
          Select a piece below, then click a square to place it.<br>Click it again to erase. Click <strong>Exit Edit</strong> when done.
        </div>
    `;
  },

  buildEditorPaletteSection(activeColor, activeType) {
    let html = `
        <div style="font-size:0.72rem; color:var(--gold); font-weight:600; margin-bottom:-4px;">White Pieces:</div>
        <div class="draft-bank" style="margin-top:2px; background:var(--panel2); padding:4px;">
    `;
    
    const types = ['P', 'N', 'B', 'R', 'Q', 'K'];
    types.forEach(t => {
      const isActive = (activeColor === 'w' && activeType === t);
      const activeClass = isActive ? 'active' : '';
      html += `
        <button class="draft-piece-btn ${activeClass}" onclick="window.app.selectEditorPiece('w', '${t}')">
          ${SVG['w' + t]}
          <span>${t}</span>
        </button>
      `;
    });
    
    html += `
        </div>
        <div style="font-size:0.72rem; color:var(--gold); font-weight:600; margin-top:4px; margin-bottom:-4px;">Black Pieces:</div>
        <div class="draft-bank" style="margin-top:2px; background:var(--panel2); padding:4px;">
    `;
    
    types.forEach(t => {
      const isActive = (activeColor === 'b' && activeType === t);
      const activeClass = isActive ? 'active' : '';
      html += `
        <button class="draft-piece-btn ${activeClass}" onclick="window.app.selectEditorPiece('b', '${t}')">
          ${SVG['b' + t]}
          <span>${t}</span>
        </button>
      `;
    });
    
    html += `</div>`;
    return html;
  },

  buildEditorToolsSection() {
    // Castling Rights check based on home square pieces
    const canWK = board[7][4]?.type === 'K' && board[7][4]?.color === 'w' && board[7][7]?.type === 'R' && board[7][7]?.color === 'w';
    const canWQ = board[7][4]?.type === 'K' && board[7][4]?.color === 'w' && board[7][0]?.type === 'R' && board[7][0]?.color === 'w';
    const canBK = board[0][4]?.type === 'K' && board[0][4]?.color === 'b' && board[0][7]?.type === 'R' && board[0][7]?.color === 'b';
    const canBQ = board[0][4]?.type === 'K' && board[0][4]?.color === 'b' && board[0][0]?.type === 'R' && board[0][0]?.color === 'b';

    let html = '';
    if (canWK || canWQ || canBK || canBQ) {
      html += `
        <div style="font-size:0.72rem; color:var(--gold); font-weight:600; margin-top:4px; margin-bottom:-4px;">Castling Rights:</div>
        <div style="background:var(--panel2); padding:6px; border-radius:6px; display:flex; flex-direction:column; gap:4px;">
      `;
      if (canWK) {
        html += `
          <label style="display:flex; align-items:center; gap:6px; font-size:0.7rem; cursor:pointer;">
            <input type="checkbox" ${castling.wK ? 'checked' : ''} onchange="window.app.toggleEditorCastling('wK')">
            White King-side (O-O)
          </label>
        `;
      }
      if (canWQ) {
        html += `
          <label style="display:flex; align-items:center; gap:6px; font-size:0.7rem; cursor:pointer;">
            <input type="checkbox" ${castling.wQ ? 'checked' : ''} onchange="window.app.toggleEditorCastling('wQ')">
            White Queen-side (O-O-O)
          </label>
        `;
      }
      if (canBK) {
        html += `
          <label style="display:flex; align-items:center; gap:6px; font-size:0.7rem; cursor:pointer;">
            <input type="checkbox" ${castling.bK ? 'checked' : ''} onchange="window.app.toggleEditorCastling('bK')">
            Black King-side (O-O)
          </label>
        `;
      }
      if (canBQ) {
        html += `
          <label style="display:flex; align-items:center; gap:6px; font-size:0.7rem; cursor:pointer;">
            <input type="checkbox" ${castling.bQ ? 'checked' : ''} onchange="window.app.toggleEditorCastling('bQ')">
            Black Queen-side (O-O-O)
          </label>
        `;
      }
      html += `</div>`;
    }

    const hasUndo = this.editorUndoStack && this.editorUndoStack.length > 0;
    html += `
        <div class="btn-row" style="margin-top:6px; width:100%;">
          <button class="btn" style="flex:1; font-size:0.72rem; padding:6px 2px;" onclick="window.app.clearEditorBoard()">Clear</button>
          <button class="btn" style="flex:1; font-size:0.72rem; padding:6px 2px;" onclick="window.app.resetEditorBoard()">Reset</button>
          <button class="btn" style="flex:1; font-size:0.72rem; padding:6px 2px;" onclick="window.app.undoEditorChange()" ${hasUndo ? '' : 'disabled style="opacity:0.5; cursor:not-allowed;"'}>Undo</button>
          <button class="btn" style="flex:1; font-size:0.72rem; padding:6px 2px;" onclick="window.app.flipEditorBoard()">Flip</button>
        </div>
    `;
    return html;
  },

  toggleBoardEditor() {
    if (webrtc.active) {
      alert("Board editing is disabled in multiplayer games.");
      return;
    }
    
    if (this.editorTool === 'edit') {
      // 1. Validate Kings presence
      let wKingCount = 0;
      let bKingCount = 0;
      let wKing = null;
      let bKing = null;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece && piece.type === 'K') {
            if (piece.color === 'w') {
              wKingCount++;
              wKing = { r, c };
            } else if (piece.color === 'b') {
              bKingCount++;
              bKing = { r, c };
            }
          }
        }
      }
      if (wKingCount !== 1 || bKingCount !== 1) {
        alert("Cannot exit editor: there must be exactly one White King and one Black King on the board.");
        return;
      }
      
      // 2. Validate Kings distance (no touching)
      const distR = Math.abs(wKing.r - bKing.r);
      const distC = Math.abs(wKing.c - bKing.c);
      if (distR <= 1 && distC <= 1) {
        alert("Cannot exit editor: Kings cannot touch each other.");
        return;
      }
      
      // 3. Validate Pawns not on 1st or 8th rank (row 0 or row 7)
      for (let c = 0; c < 8; c++) {
        const p0 = board[0][c];
        const p7 = board[7][c];
        if (p0 && p0.type === 'P') {
          alert("Cannot exit editor: Pawns cannot be on the 8th rank.");
          return;
        }
        if (p7 && p7.type === 'P') {
          alert("Cannot exit editor: Pawns cannot be on the 1st rank.");
          return;
        }
      }
      
      // 4. Validate opponent's King is not under check
      const opponentColor = turn === 'w' ? 'b' : 'w';
      if (inCheck(opponentColor, board)) {
        alert(`Cannot exit editor: The ${opponentColor === 'w' ? 'White' : 'Black'} King is under check, but it is not their turn to move.`);
        return;
      }
      
      this.editorTool = 'move';
    } else {
      // If we were playing, pause/end the game and switch to setup/edit state
      if (this.gameState === 'playing' && !over) {
        if (!confirm("Editing the board will end the current game and enter custom setup. Proceed?")) {
          return;
        }
        this.gameState = 'setup';
        over = true;
        viewIndex = moveHistory.length;
        liveState = null;
      }
      this.editorUndoStack = [];
      this.editorTool = 'edit';
      if (!this.editorPieceType) {
        this.editorColor = 'w';
        this.editorPieceType = 'P';
      }
    }
    this.renderAll();
  },

  selectEditorPiece(color, type) {
    this.editorColor = color;
    this.editorPieceType = type;
    this.editorTool = 'edit';
    this.renderAll();
  },

  setEditorTool(tool) {
    this.editorTool = tool;
    this.renderAll();
  },

  clearEditorBoard() {
    this.saveEditorHistory();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board[r][c] = null;
      }
    }
    this.branches = null;
    this.currentBranchId = 'main';
    moveHistory = [];
    boardHistory = [];
    viewIndex = 0;
    liveState = null;
    this.renderAll();
  },

  resetEditorBoard() {
    this.saveEditorHistory();
    importFen(INIT_FEN, true);
    this.branches = null;
    this.currentBranchId = 'main';
    this.renderAll();
  },

  saveEditorHistory() {
    if (!this.editorUndoStack) this.editorUndoStack = [];
    this.editorUndoStack.push({
      board: cloneBoard(board),
      turn: turn,
      castling: { ...castling },
      enPassantSquare: enPassantSquare ? { ...enPassantSquare } : null
    });
    if (this.editorUndoStack.length > 20) {
      this.editorUndoStack.shift();
    }
  },

  undoEditorChange() {
    if (!this.editorUndoStack || this.editorUndoStack.length === 0) return;
    const prev = this.editorUndoStack.pop();
    board = cloneBoard(prev.board);
    turn = prev.turn;
    castling = { ...prev.castling };
    enPassantSquare = prev.enPassantSquare ? { ...prev.enPassantSquare } : null;
    this.renderAll();
  },

  toggleEditorCastling(right) {
    this.saveEditorHistory();
    castling[right] = !castling[right];
    this.renderAll();
  },

  flipEditorBoard() {
    flipped = !flipped;
    this.renderAll();
  },

  lockDraftSelf() {
    const activeColor = webrtc.active ? webrtc.myColor : this.draftColor;
    if (window.variants.lockDraft(activeColor)) {
      if (webrtc.active) {
        // Send our locked draft board pieces
        const myPieces = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].color === activeColor) {
              myPieces.push({ r, c, type: board[r][c].type, types: board[r][c].types });
            }
          }
        }
        webrtc.sendDraftLock(activeColor, myPieces);
      } else {
        // Local mode: automatically switch to the other color if it's not locked
        if (activeColor === 'w' && !window.variants.draftLocked.b) {
          this.draftColor = 'b';
        } else if (activeColor === 'b' && !window.variants.draftLocked.w) {
          this.draftColor = 'w';
        }
      }
      this.checkDraftCompletion();
      this.renderAll();
    }
  },

  checkDraftCompletion() {
    if (window.variants.draftLocked.w && window.variants.draftLocked.b) {
      // Both locked! Start standard match
      window.variants.draftEnabled = false;
      
      // Roll dice for first turn if Dice Chess
      if (window.variants.diceChessEnabled) {
        window.variants.rollDice('w');
      }
      
      if (window.timer && window.timer.enabled) {
        window.timer.start('w');
      }
      
      // Sync complete board to other side if host
      if (webrtc.active && webrtc.isHost) {
        const allPieces = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (board[r][c]) {
              allPieces.push({ r, c, type: board[r][c].type, color: board[r][c].color, types: board[r][c].types });
            }
          }
        }
        webrtc.sendData({
          type: 'draft-complete-sync',
          board: allPieces
        });
      }
      
      alert("Draft completed! The battle begins.");
      // Reset live state history baseline
      boardHistory = [cloneState()];
      viewIndex = 0;
      liveState = null;
    }
  },

  // â”€â”€â”€ MOVE EXECUTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  execMove(fromRow, fromCol, toRow, toCol, flags, promo = null) {
    let stateSnapshot = null;
    if (webrtc.active && this.gameState === 'playing' && !over) {
      stateSnapshot = {
        fen: boardToFen(board, turn, castling, enPassantSquare),
        turn: turn,
        castling: { ...castling },
        enPassant: enPassantSquare ? { ...enPassantSquare } : null
      };
    }

    this.execMoveDirect(fromRow, fromCol, toRow, toCol, flags, promo);

    // Roll dice for next turn if Dice Chess
    if (window.variants.diceChessEnabled) {
      window.variants.rollDice(turn);
    }

    // Sync online move if multi - only while an actual live game is in progress.
    if (webrtc.active && this.gameState === 'playing' && !over && turn !== webrtc.myColor) {
      const myTime = webrtc.myColor === 'w' ? window.timer.whiteTime : window.timer.blackTime;
      webrtc.sendMove(fromRow, fromCol, toRow, toCol, flags, promo, myTime, stateSnapshot);
    }

    this.renderAll();
  },

  execMoveDirect(fromRow, fromCol, toRow, toCol, flags, promo = null) {
    const moveData = this.applyMoveToBoard(fromRow, fromCol, toRow, toCol, flags, promo);
    
    this.playMoveEffects(moveData.isMate, moveData.chk, moveData.cap, moveData.prevTurn);
    
    const isGameOver = this.detectGameEndState(moveData.cap, moveData.prevTurn, moveData.isMate, moveData.chk);

    if (!isGameOver) {
      this.handleIdentityTheftTrim(toRow, toCol, moveData.prevTurn);
      if (!over) {
        this.saveSessionState();
      }
    }
    this.triggerBrainAnalysis();
  },

  applyMoveToBoard(fromRow, fromCol, toRow, toCol, flags, promo) {
    const isAnalysis = (this.gameState !== 'playing' || over);
    if (isAnalysis && viewIndex < moveHistory.length) {
      this.createAnalysisBranch();
    }

    const bb = cloneBoard(board);
    boardHistory.push(cloneState());
    const piece = board[fromRow][fromCol];
    const cap = flags.enp ? { color: turn === 'w' ? 'b' : 'w', type: 'P' } : board[toRow][toCol];

    // Snapshot pre-move enPassantSquare/castling for correct SAN disambiguation
    const prevEnPassantSquare = enPassantSquare ? { ...enPassantSquare } : null;
    const prevCastlingRights = { ...castling };

    board = applyMv(board, { r: fromRow, c: fromCol }, { r: toRow, c: toCol }, flags, promo);
    
    updateCastlingAfterMove(piece, { r: fromRow, c: fromCol }, { r: toRow, c: toCol });

    enPassantSquare = flags.dp ? { r: (fromRow + toRow) / 2, c: fromCol } : null;
    if (piece.type === 'P' || cap) halfMoveClock = 0; else halfMoveClock++;
    
    const prevTurn = turn;
    turn = turn === 'w' ? 'b' : 'w';
    if (prevTurn === 'b') fullMoveNumber++;

    if (window.timer && window.timer.enabled) {
      window.timer.switchTurn(turn);
    }

    const nxt = allLegalMoves(turn, board, enPassantSquare, castling, true);
    const chk = (window.variants && window.variants.isFogOfWarActive) ? false : inCheck(turn, board);
    const isMate = nxt.length === 0 && chk;

    const san = moveToSAN({ r: fromRow, c: fromCol }, { r: toRow, c: toCol }, piece, cap, flags, bb, isMate, chk, promo, prevEnPassantSquare, prevCastlingRights);
    lastMove = { from: { r: fromRow, c: fromCol }, to: { r: toRow, c: toCol } };
    moveHistory.push({
      san,
      turn: prevTurn,
      cap,
      dice: window.variants.isDiceChessActive ? [...window.variants.allowedDiceTypes] : null
    });
    
    if (this.branches && this.currentBranchId !== 'main') {
      const activeBranch = this.branches.find(b => b.id === this.currentBranchId);
      if (activeBranch && activeBranch.name.startsWith('Var at Move')) {
        const moveNumber = Math.floor((moveHistory.length - 1) / 2) + 1;
        const isWhite = ((moveHistory.length - 1) % 2 === 0);
        activeBranch.name = `Var: ${moveNumber}${isWhite ? '.' : '...'}${san}`;
      }
    }
    
    viewIndex = moveHistory.length;
    liveState = null;
    selectedSquare = null;
    legal = [];

    return { cap, prevTurn, isMate, chk };
  },

  createAnalysisBranch() {
    const branchId = 'var-' + Date.now();
    moveHistory = moveHistory.slice(0, viewIndex);
    boardHistory = boardHistory.slice(0, viewIndex);
    
    if (!this.branches) {
      this.branches = [
        {
          id: 'main',
          name: 'Main Line',
          moveHistory: [],
          boardHistory: [],
          liveState: cloneState()
        }
      ];
    }
    
    const parentBranchId = this.currentBranchId;
    const parentMoveIdx = viewIndex;

    const newBranch = {
      id: branchId,
      name: `Var at Move ${Math.floor(viewIndex / 2) + 1}`,
      moveHistory: [...moveHistory],
      boardHistory: [...boardHistory],
      liveState: cloneState(),
      parentBranchId: parentBranchId,
      parentMoveIdx: parentMoveIdx
    };
    this.branches.push(newBranch);
    this.currentBranchId = branchId;
  },

  playMoveEffects(isMate, chk, cap, prevTurn) {
    // Trigger local sounds
    if (isMate) window.audio.playSound('end');
    else if (chk) window.audio.playSound('check');
    else if (cap) window.audio.playSound('capture');
    else window.audio.playSound('move');

    // Auto rotate perspective locally if set in Pass 'n' Play
    if (!webrtc.active && this.passPlayMode === 'rotate') {
      flipped = (turn === 'b');
    }
  },

  detectGameEndState(cap, prevTurn, isMate, chk) {
    const doEnd = (title, sub) => {
      if (this.gameState === 'setup') return;
      over = true;
      window.app.clearSessionState();
      setTimeout(() => {
        document.getElementById('resultTitle').textContent = title;
        document.getElementById('resultSub').textContent = sub;
        document.getElementById('rematchBtn').style.display = 'block';
        document.getElementById('reviewBtn').style.display = 'block';
        document.getElementById('resultBanner').classList.add('show');
        if (!isMate && !(cap && cap.type === 'K')) window.audio.playSound('end');
      }, APP_TIMING.RESULT_BANNER_DELAY_MS);
    };

    if (cap && cap.type === 'K') {
      const winner = cap.color === 'w' ? 'Black' : 'White';
      doEnd(`${winner} Wins!`, 'King Captured');
      return true;
    }

    const nxt = allLegalMoves(turn, board, enPassantSquare, castling, true);
    const actualChk = (window.variants && window.variants.isFogOfWarActive) ? false : chk;
    const isStale = nxt.length === 0 && !actualChk;
    
    const currFen = boardToFen(board, turn, castling, enPassantSquare);
    const counts = positionHistory();
    const isRep = counts[currFen] >= 3;
    const isInsuff = isInsufficientMaterial(board);

    if (isMate || isStale || halfMoveClock >= 100 || isRep || isInsuff) {
      if (isMate) doEnd((prevTurn === 'w' ? 'White' : 'Black') + ' Wins!', 'by checkmate');
      else if (isStale) doEnd('Draw', 'Stalemate');
      else if (halfMoveClock >= 100) doEnd('Draw', '50-move rule');
      else if (isRep) doEnd('Draw', 'Threefold repetition');
      else if (isInsuff) doEnd('Draw', 'Insufficient material');
      return true;
    }
    return false;
  },

  handleIdentityTheftTrim(toRow, toCol, prevTurn) {
    const movedPiece = board[toRow][toCol];
    // In 'append' mode, a piece can theoretically collect identities like Infinity Stones.
    // However, to keep the UI from imploding, we hard-cap it at 2 active powers.
    // If they grab a 3rd, we freeze the game and force them to trim back down to 2.
    if (window.variants.isIdentityTheftActive && window.variants.identityTheftMode === 'append' && movedPiece && movedPiece.types && movedPiece.types.length > 2) {
      window.pendingPowerSelection = { r: toRow, c: toCol, types: [...movedPiece.types], selected: [] };
      if (window.timer && window.timer.enabled) {
        window.timer.stop();
      }
      const isMyPiece = webrtc.active ? (webrtc.myColor === prevTurn) : true;
      if (isMyPiece) {
        this.showPowerSelect(toRow, toCol, movedPiece.color, movedPiece.types);
      }
    }
  },

  showPowerSelect(r, c, color, types) {
    const container = document.getElementById('powerSelectContainer');
    const confirmBtn = document.getElementById('confirmPowerSelectBtn');
    container.innerHTML = '';
    window.pendingPowerSelection.selected = [];
    confirmBtn.disabled = true;

    types.forEach(t => {
      const btn = document.createElement('div');
      btn.className = 'pbtn';
      btn.style.width = '48px'; btn.style.height = '48px';
      btn.innerHTML = SVG[color + t];
      btn.dataset.type = t;
      btn.addEventListener('click', () => {
        const selectedList = window.pendingPowerSelection.selected;
        if (selectedList.includes(t)) {
          selectedList.splice(selectedList.indexOf(t), 1);
          btn.style.borderColor = 'var(--border)';
        } else if (selectedList.length < 2) {
          selectedList.push(t);
          btn.style.borderColor = 'var(--gold)';
        }
        confirmBtn.disabled = selectedList.length !== 2;
      });
      container.appendChild(btn);
    });

    confirmBtn.onclick = () => {
      const selectedList = window.pendingPowerSelection.selected;
      document.getElementById('powerSelectOverlay').classList.remove('show');
      
      // Update locally
      const p = board[r][c];
      p.types = [...selectedList];
      p.types.sort((a, b) => (PIECE_VALUES[b] || 0) - (PIECE_VALUES[a] || 0));
      p.type = p.types[0];
      
      window.pendingPowerSelection = null;
      this.renderAll();

      if (window.timer && window.timer.enabled) {
        window.timer.start(turn);
      }

      if (webrtc.active && this.gameState === 'playing' && !over) {
        webrtc.sendData({ type: 'trim-powers', r, c, types: p.types });
      }
    };

    document.getElementById('powerSelectOverlay').classList.add('show');
  },

  renderBranchSelector() {
    if (!this.branches || (moveHistory.length === 0 && this.branches.find(b => b.id === this.currentBranchId)?.moveHistory.length > 0)) {
      this.branches = [
        {
          id: 'main',
          name: 'Main Line',
          moveHistory: [...moveHistory],
          boardHistory: [...boardHistory],
          liveState: cloneState()
        }
      ];
      this.currentBranchId = 'main';
    }

    const activeBranch = this.branches.find(b => b.id === this.currentBranchId);
    if (activeBranch && viewIndex === moveHistory.length) {
      activeBranch.moveHistory = [...moveHistory];
      activeBranch.boardHistory = [...boardHistory];
      activeBranch.liveState = cloneState();
    }

    const branchSelect = document.getElementById('branchSelect');
    if (branchSelect) {
      branchSelect.style.display = 'none';
    }
  },

  switchBranch(branchId) {
    const branch = this.branches.find(b => b.id === branchId);
    if (!branch) return;
    
    this.currentBranchId = branchId;
    moveHistory = [...branch.moveHistory];
    boardHistory = [...branch.boardHistory];
    
    restoreState(branch.liveState);
    viewIndex = moveHistory.length;
    liveState = null;
    selectedSquare = null;
    legal = [];
    
    this.renderAll();
  },

  getBranchesAtMove(branchIdx) {
    if (!this.branches) return [];
    const list = [];
    
    // We want to find other branches that branch off at this exact ply (index branchIdx - 1).
    // They must share the exact same prefix of moves up to branchIdx - 1.
    const myPrefix = moveHistory.slice(0, branchIdx - 1);
    const myMove = moveHistory[branchIdx - 1];
    if (!myMove) return [];
    
    this.branches.forEach(b => {
      if (b.id === this.currentBranchId) return;
      
      // Check if this branch has enough moves
      if (b.moveHistory.length < branchIdx) return;
      
      // Check if it shares the prefix
      let prefixMatch = true;
      for (let i = 0; i < branchIdx - 1; i++) {
        if (b.moveHistory[i]?.san !== myPrefix[i]?.san) {
          prefixMatch = false;
          break;
        }
      }
      if (!prefixMatch) return;
      
      // Check if the move at branchIdx - 1 is different
      const otherMove = b.moveHistory[branchIdx - 1];
      if (otherMove && otherMove.san !== myMove.san) {
        list.push(b);
      }
    });
    
    return list;
  },

  getVarPreviewText(v, branchIdx) {
    let text = '';
    const startPly = branchIdx - 1;
    for (let i = 0; i < 2; i++) {
      const plyIdx = startPly + i;
      const mv = v.moveHistory[plyIdx];
      if (!mv) break;
      
      const moveNumber = Math.floor(plyIdx / 2) + 1;
      const isWhite = (plyIdx % 2 === 0);
      if (i === 0) {
        text += (isWhite ? moveNumber + '.' : moveNumber + '...') + mv.san;
      } else {
        text += ' ' + (isWhite ? moveNumber + '.' : '') + mv.san;
      }
    }
    if (v.moveHistory.length > startPly + 2) {
      text += '...';
    }
    return text;
  },

  exportPgnRecursive(history, startPly = 0) {
    let pgn = "";
    let printNum = true;
    
    for (let i = startPly; i < history.length; i++) {
      const isWhite = (i % 2 === 0);
      const moveNumber = Math.floor(i / 2) + 1;
      
      let commentStr = "";
      if (history[i].dice && history[i].dice.length > 0) {
        commentStr = ` {Dice: ${history[i].dice.join(',')}}`;
      }
      
      if (isWhite) {
        pgn += `${moveNumber}. ${history[i].san}${commentStr} `;
        printNum = false;
      } else {
        if (printNum) {
          pgn += `${moveNumber}... ${history[i].san}${commentStr} `;
          printNum = false;
        } else {
          pgn += `${history[i].san}${commentStr} `;
        }
      }
      
      const nextPly = i + 2;
      const vars = this.getBranchesAtMove(nextPly);
      if (vars.length > 0) {
        vars.forEach(v => {
          const varPgn = this.exportPgnRecursive(v.moveHistory, i + 1);
          pgn += `(${varPgn.trim()}) `;
        });
        printNum = true;
      }
    }
    return pgn.trim();
  },

  generatePgnHeaders() {
    const isIdentityTheft = window.variants && window.variants.isIdentityTheftActive;
    const isDiceChess = window.variants && window.variants.isDiceChessActive;
    const isDraft = window.variants && window.variants.isDraftActive;
    const isFog = window.variants && window.variants.isFogOfWarActive;
    
    let headers = "";
    headers += `[Event "Local Game"]\n`;
    headers += `[Site "Chessology"]\n`;
    
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    headers += `[Date "${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}"]\n`;
    headers += `[Round "1"]\n`;
    headers += `[White "White"]\n`;
    headers += `[Black "Black"]\n`;
    headers += `[Result "*"]\n`;
    
    const startingFen = (boardHistory.length > 0) ? boardToFen(boardHistory[0].board, boardHistory[0].turn, boardHistory[0].castling, boardHistory[0].enPassantSquare) : INIT_FEN;
    if (startingFen !== INIT_FEN) {
      headers += `[FEN "${startingFen}"]\n`;
      headers += `[SetUp "1"]\n`;
      headers += `[Variant "From Position"]\n`;
    } else {
      headers += `[Variant "Standard"]\n`;
    }
    
    if (isIdentityTheft) {
      headers += `[ChessologyVariant "Identity Theft (${window.variants.identityTheftMode})"]\n`;
      headers += `[Note "Only workable in Chessology parser"]\n`;
    } else if (isDiceChess) {
      headers += `[ChessologyVariant "Dice Chess"]\n`;
    } else if (isDraft) {
      headers += `[ChessologyVariant "Draft Mode"]\n`;
    } else if (isFog) {
      headers += `[ChessologyVariant "Fog of War"]\n`;
    }
    
    return headers + "\n";
  },

  // â”€â”€â”€ USER INTERACTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  bindEvents() {
    // Board pointer interactions
    const boardEl = document.getElementById('boardEl');
    boardEl.addEventListener('pointerdown', this.onPointerDown.bind(this));

    const branchSelect = document.getElementById('branchSelect');
    if (branchSelect) {
      branchSelect.addEventListener('change', e => {
        this.switchBranch(e.target.value);
      });
    }

    // Keyboard Arrow navigation & Escape bindings
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && selectedSquare && !over) {
        clearHints();
        this.renderAll();
      }
      if (moveHistory.length > 0) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (viewIndex > 0) jumpTo(viewIndex - 1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (viewIndex < moveHistory.length) jumpTo(viewIndex + 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          jumpTo(0);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          jumpTo(moveHistory.length);
        }
      }
    });

    // Sidebar selectors setup
    const passPlaySeg = document.getElementById('passPlaySeg');
    if (passPlaySeg) {
      passPlaySeg.querySelectorAll('.segmented-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const targetBtn = e.currentTarget;
          const wasActive = targetBtn.classList.contains('active');
          
          passPlaySeg.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
          targetBtn.classList.add('active');
          this.passPlayMode = targetBtn.dataset.val;
          opponentFlipped = (this.passPlayMode === 'bothSides');
          
          if (this.passPlayMode === 'static') {
            if (wasActive) {
              flipped = !flipped;
            } else {
              flipped = false;
            }
          } else if (this.passPlayMode === 'rotate') {
            flipped = (turn === 'b');
          } else {
            flipped = false;
          }
          this.renderAll();
        });
      });
    }

    document.getElementById('backToModeFromOfflineBtn').addEventListener('click', () => {
      this.showStep('stepMode');
    });

    // Variants toggles have no immediate side-effects.
    // They are securely read and locked in when startGame() is called.
  },

  onPointerDown(e) {
    if (pointerId !== null || window.pendingPowerSelection) return;
    
    // Lock controls online when it is opponent's turn (only if game is active)
    if (this.gameState === 'playing' && webrtc.active && turn !== webrtc.myColor) return;

    if (this.resolveInputMode(e)) return;

    const sq = sqFromXY(e.clientX, e.clientY);
    if (!sq) return;
    const { r, c } = sq;

    const piece = board[r][c];
    if (!piece || piece.color !== turn) {
      this.clickSq(r, c);
      return;
    }
    
    if (!this.isMyTurn()) return;

    this.handleDragStart(e, r, c);
  },

  resolveInputMode(e) {
    // Handle Board Editor placement click interactions
    const isEditMode = (this.gameState !== 'playing' || over) && !webrtc.active && this.editorTool === 'edit';
    if (isEditMode) {
      const sq = sqFromXY(e.clientX, e.clientY);
      if (sq) {
        this.saveEditorHistory();
        const { r, c } = sq;
        const activeColor = this.editorColor || 'w';
        const activeType = this.editorPieceType || 'P';
        
        const existing = board[r][c];
        if (existing && existing.color === activeColor && existing.type === activeType) {
          board[r][c] = null;
        } else {
          // If placing a King, remove any existing King of the same color first
          if (activeType === 'K') {
            for (let row = 0; row < 8; row++) {
              for (let col = 0; col < 8; col++) {
                if (board[row][col]?.type === 'K' && board[row][col]?.color === activeColor) {
                  board[row][col] = null;
                }
              }
            }
          }
          
          board[r][c] = {
            color: activeColor,
            type: activeType,
            types: [activeType]
          };
        }
        
        this.branches = null;
        this.currentBranchId = 'main';
        moveHistory = [];
        boardHistory = [];
        viewIndex = 0;
        liveState = null;
        
        this.renderAll();
      }
      return true; // Input handled
    }

    if (over) return true;

    // Snaps back to live if viewing history (unless in analysis mode)
    const isAnalysis = (this.gameState !== 'playing' || over);
    if (viewIndex !== moveHistory.length && !isAnalysis) {
      jumpTo(moveHistory.length);
      return true;
    }

    // Handle Draft placement click interactions
    if (window.variants.isDraftActive) {
      const sq = sqFromXY(e.clientX, e.clientY);
      if (sq) {
        const activeColor = webrtc.active ? webrtc.myColor : this.draftColor;
        if (!window.variants.draftLocked[activeColor]) {
          window.variants.handleDraftPlace(sq.r, sq.c, activeColor);
          this.renderAll();
        }
      }
      return true;
    }

    return false; // Not handled, proceed to game move interaction
  },

  handleDragStart(e, r, c) {
    pointerId = e.pointerId;
    dragStartSquare = { r, c };
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    const wasSelected = (selectedSquare && selectedSquare.r === r && selectedSquare.c === c);
    
    selectedSquare = { r, c };
    legal = legalMovesForPiece(r, c, board, enPassantSquare, castling);
    this.updateHints();

    const sqEl = boardEl.querySelector(`.sq[data-r="${r}"][data-c="${c}"]`);
    draggedElement = sqEl ? sqEl.querySelector('.piece') : null;

    if (draggedElement) {
      boardEl.setPointerCapture(pointerId);
      draggedElement.classList.add('dragging-active');
    }

    const onPointerMove = (ev) => {
      if (pointerId === null || ev.pointerId !== pointerId || !draggedElement) return;
      const dx = ev.clientX - dragStartX;
      const dy = ev.clientY - dragStartY;
      if (!isDragging && Math.hypot(dx, dy) > APP_TIMING.DRAG_THRESHOLD_PX) {
        isDragging = true;
      }
      if (isDragging) {
        draggedElement.style.transform = `translate(${dx}px, ${dy}px)`;
        hlDropXY(ev.clientX, ev.clientY);
      }
    };

    const cleanup = () => {
      boardEl.removeEventListener('pointermove', onPointerMove);
      boardEl.removeEventListener('pointerup', onPointerUp);
      boardEl.removeEventListener('pointercancel', onPointerCancel);
      document.querySelectorAll('.sq.dov').forEach(el2 => el2.classList.remove('dov'));

      if (draggedElement) {
        try {
          boardEl.releasePointerCapture(pointerId);
        } catch (err) {}
        draggedElement.classList.remove('dragging-active');
        draggedElement.style.transform = '';
      }

      pointerId = null;
      draggedElement = null;
      isDragging = false;
    };

    const onPointerUp = (ev) => {
      if (pointerId === null || ev.pointerId !== pointerId) return;

      const endSq = sqFromXY(ev.clientX, ev.clientY);
      const wasDragged = isDragging;

      cleanup();

      if (wasDragged && endSq && dragStartSquare && (endSq.r !== dragStartSquare.r || endSq.c !== dragStartSquare.c)) {
        this.handleTapSelect(dragStartSquare, endSq);
      } else if (!wasDragged && wasSelected) {
        clearHints();
        this.renderAll();
      } else {
        this.renderAll();
      }
    };

    const onPointerCancel = (ev) => {
      if (pointerId === null || ev.pointerId !== pointerId) return;
      cleanup();
      this.renderAll();
    };

    boardEl.addEventListener('pointermove', onPointerMove);
    boardEl.addEventListener('pointerup', onPointerUp);
    boardEl.addEventListener('pointercancel', onPointerCancel);
  },

  handleTapSelect(startSq, endSq) {
    const mv = legal.find(m => m.r === endSq.r && m.c === endSq.c);
    if (mv) {
      const mp = board[startSq.r][startSq.c];
      if (this.checkPromo(mp, endSq.r, endSq.c)) {
        showPromo(mp.color, p => this.execMove(startSq.r, startSq.c, endSq.r, endSq.c, mv, p));
      } else {
        clearHints();
        this.execMove(startSq.r, startSq.c, endSq.r, endSq.c, mv);
      }
    }
  },

  updateHints() {
    document.querySelectorAll('.sq').forEach(sq => {
      sq.classList.remove('selectedSquare', 'chint', 'mhint');
    });
    if (!selectedSquare) return;
    
    const selSq = boardEl.querySelector(`.sq[data-r="${selectedSquare.r}"][data-c="${selectedSquare.c}"]`);
    if (selSq) selSq.classList.add('selectedSquare');
    
    const showHints = document.getElementById('showHintsToggle')?.checked !== false;
    if (!showHints) return;
    
    legal.forEach(m => {
      const sq = boardEl.querySelector(`.sq[data-r="${m.r}"][data-c="${m.c}"]`);
      if (sq) {
        sq.classList.add(board[m.r][m.c] || m.enp ? 'chint' : 'mhint');
      }
    });
  },

  clickSq(r, c) {
    if (over || window.pendingPowerSelection) return;
    const piece = board[r][c];
    if (selectedSquare) {
      const { r: sr, c: sc } = selectedSquare;
      if (sr === r && sc === c) {
        clearHints();
        this.renderAll();
        return;
      }
      const mv = legal.find(m => m.r === r && m.c === c);
      if (mv) {
        const mp = board[sr][sc];
        if (this.checkPromo(mp, r, c)) {
          showPromo(mp.color, p => this.execMove(sr, sc, r, c, mv, p));
          return;
        }
        clearHints();
        this.execMove(sr, sc, r, c, mv);
        return;
      }
      if (piece && piece.color === turn) {
        if (!this.isMyTurn()) return;
        selectedSquare = { r, c };
        legal = legalMovesForPiece(r, c, board, enPassantSquare, castling);
        this.updateHints();
        return;
      }
      clearHints();
      this.renderAll();
      return;
    }
    if (piece && piece.color === turn) {
      if (!this.isMyTurn()) return;
      selectedSquare = { r, c };
      legal = legalMovesForPiece(r, c, board, enPassantSquare, castling);
      this.updateHints();
    }
  },

  isMyTurn() {
    if (this.gameState !== 'playing') return true;
    return !webrtc.active || webrtc.myColor === turn;
  },

  checkPromo(mp, r, c) {
    const promoRank = mp.color === 'w' ? 0 : 7;
    const target = board[r][c];
    
    // A pawn stealing a non-pawn's identity doesn't need to promote. It just became something better anyway.
    const isStealCaptureOfNonPawn = target && target.type !== 'P' && window.variants.isIdentityTheftActive && window.variants.identityTheftMode === 'steal';
    
    if (mp.type === 'P' && r === promoRank && !isStealCaptureOfNonPawn) return true;
    
    // Steal-mode capture of a pawn on the promotion rank would leave the piece as an illegal P on rank 1 or 8.
    // That breaks the universe. So we route it through normal promotion instead.
    if (window.variants.isIdentityTheftActive && window.variants.identityTheftMode === 'steal') {
      if (target && target.type === 'P' && r === promoRank) {
        return true;
      }
    }
    return false;
  },

  showHints(r, c) {
    selectedSquare = { r, c };
    legal = legalMovesForPiece(r, c, board, enPassantSquare, castling);
  },

  // â”€â”€â”€ SIGNALING & MULTIPLAYER SETUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


  onLobbyConnected(role) {
    window.ui.showStep('stepOnlineLobby');
    const opponentName = window.webrtc.conn?.peer || 'Opponent';
    document.getElementById('lobbyPeerName').textContent = opponentName;
    // Start with fresh defaults in the lobby
    this.hideResultBanner();
    over = false;

    // Lobby is fully symmetrical now. Both players can propose a game.
    document.getElementById('diceChessToggle').disabled = false;
    document.getElementById('fogOfWarToggle').disabled = false;
    document.getElementById('draftModeToggle').disabled = false;
    document.getElementById('identityTheftToggle').disabled = false;
    document.getElementById('identityTheftMode').disabled = false;
    document.getElementById('handAndBrainToggle').disabled = false;
    
    document.getElementById('clockSelectLobby').disabled = false;
    document.getElementById('wTimeLobby').disabled = false;
    document.getElementById('wIncLobby').disabled = false;
    document.getElementById('bTimeLobby').disabled = false;
    document.getElementById('bIncLobby').disabled = false;
    
    const colorBtns = document.querySelectorAll('#lobbyColorSeg .segmented-btn');
    colorBtns.forEach(btn => {
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
    });

    const sendBtn = document.getElementById('sendChallengeBtn');
    if (sendBtn) {
      sendBtn.style.display = 'block';
      sendBtn.disabled = false;
      sendBtn.textContent = 'Propose Game';
    }

    let statusMsg = document.getElementById('lobbyJoinerStatus');
    if (statusMsg) {
      statusMsg.style.display = 'none';
    }
    
    // Save lobby session so a refresh can restore it
    this.saveSessionState();
  },

  readLobbyVariants() {
    return {
      diceChessEnabled: document.getElementById('diceChessToggle').checked,
      fogOfWarEnabled: document.getElementById('fogOfWarToggle').checked,
      draftEnabled: document.getElementById('draftModeToggle').checked,
      identityTheftEnabled: document.getElementById('identityTheftToggle').checked,
      identityTheftMode: document.getElementById('identityTheftMode').value,
      handAndBrainEnabled: document.getElementById('handAndBrainToggle').checked
    };
  },

  readClockConfig(mode) {
    // 'Lobby' uses elements: clockSelectLobby, wTimeLobby, bTimeLobby, wIncLobby, bIncLobby
    // 'Offline' uses elements: clockSelectOffline, wTimeOff, bTimeOff, wIncOff, bIncOff
    const isLobby = mode === 'Lobby';
    const selectedOption = document.getElementById(isLobby ? 'clockSelectLobby' : 'clockSelectOffline').value;
    if (selectedOption === 'custom') {
      const suffix = isLobby ? 'Lobby' : 'Off';
      return {
        wTime: parseInt(document.getElementById('wTime' + suffix).value) || 0,
        bTime: parseInt(document.getElementById('bTime' + suffix).value) || 0,
        wInc:  parseInt(document.getElementById('wInc'  + suffix).value) || 0,
        bInc:  parseInt(document.getElementById('bInc'  + suffix).value) || 0
      };
    }
    const [minutes, inc] = selectedOption.split('|').map(Number);
    return { wTime: minutes * 60, bTime: minutes * 60, wInc: inc, bInc: inc };
  },

  sendChallenge() {
    const sendBtn = document.getElementById('sendChallengeBtn');
    if (sendBtn.disabled) return;

    const colorBtn = document.querySelector('#lobbyColorSeg .segmented-btn.active');
    const colorReq = colorBtn ? colorBtn.dataset.color : 'random';

    webrtc.sendData({
      type: 'challenge',
      variants: this.readLobbyVariants(),
      colorReq: colorReq,
      clockConfig: this.readClockConfig('Lobby')
    });

    sendBtn.disabled = true;
    sendBtn.textContent = 'Waiting for opponent...';
  },

  acceptChallenge() {
    if (!this.pendingChallenge) return;
    const oppColor = this.pendingChallenge.myColor === 'w' ? 'b' : 'w';
    webrtc.sendData({ type: 'accept-challenge', yourColor: oppColor });
    document.getElementById('challengePopup').style.display = 'none';
    this.startGameWithSettings(this.pendingChallenge.variants, this.pendingChallenge.myColor, this.pendingChallenge.clockConfig);
    this.pendingChallenge = null;
  },

  declineChallenge() {
    webrtc.sendData({ type: 'decline-challenge' });
    document.getElementById('challengePopup').style.display = 'none';
    this.pendingChallenge = null;
  },

  showProposal(type) {
    this.pendingProposal = type;
    const title = document.getElementById('proposalTitle');
    const text = document.getElementById('proposalText');
    const popup = document.getElementById('proposalPopup');
    
    if (type === 'undo') {
      title.textContent = "Undo Request";
      text.textContent = "Opponent has requested to undo the last move.";
    } else if (type === 'reset') {
      title.textContent = "Restart Request";
      text.textContent = "Opponent has requested to restart the game.";
    } else if (type === 'draw') {
      title.textContent = "Draw Offer";
      text.textContent = "Opponent has offered a draw.";
    }
    if (popup) popup.style.display = 'block';
  },

  acceptProposal() {
    if (!this.pendingProposal) return;
    const type = this.pendingProposal;
    this.pendingProposal = null;
    const popup = document.getElementById('proposalPopup');
    if (popup) popup.style.display = 'none';
    
    if (type === 'undo') {
      webrtc.sendData({ type: 'accept-undo' });
      this.localUndo();
    } else if (type === 'reset') {
      webrtc.sendData({ type: 'accept-reset' });
      this.localReset();
      this.onLobbyConnected(webrtc.isHost ? 'Host' : 'Joiner');
    } else if (type === 'draw') {
      webrtc.sendData({ type: 'accept-draw' });
      this.onDrawAccepted();
    }
  },

  declineProposal() {
    if (!this.pendingProposal) return;
    const type = this.pendingProposal;
    this.pendingProposal = null;
    const popup = document.getElementById('proposalPopup');
    if (popup) popup.style.display = 'none';
    
    if (type === 'undo') {
      webrtc.sendData({ type: 'decline-undo' });
    } else if (type === 'reset') {
      webrtc.sendData({ type: 'decline-reset' });
    } else if (type === 'draw') {
      webrtc.sendData({ type: 'decline-draw' });
    }
  },

  syncFullBoardState() {
    if (webrtc.active && webrtc.isHost) {
      const allPieces = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (board[r][c]) {
            allPieces.push({ r, c, type: board[r][c].type, color: board[r][c].color, types: board[r][c].types });
          }
        }
      }
      webrtc.sendData({
        type: 'state-sync',
        board: allPieces,
        turn: turn,
        whiteTime: window.timer.whiteTime,
        blackTime: window.timer.blackTime
      });
    }
  },

  saveSessionState() {
    if (!webrtc.active) return;
    const sess = {
      role: webrtc.isHost ? 'host' : 'joiner',
      opponentUsername: webrtc.isHost ? (webrtc.conn ? webrtc.conn.peer : null) : webrtc.hostId,
      myColor: webrtc.myColor,
      gameState: this.gameState
    };
    sessionStorage.setItem('chessology_session', JSON.stringify(sess));
    
    const allPieces = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c]) {
          allPieces.push({ r, c, type: board[r][c].type, color: board[r][c].color, types: board[r][c].types });
        }
      }
    }
    const gameState = {
      board: allPieces,
      turn: turn,
      castling: castling,
      enPassantSquare: enPassantSquare,
      halfMoveClock: halfMoveClock,
      fullMoveNumber: fullMoveNumber,
      whiteTime: window.timer ? window.timer.whiteTime : null,
      blackTime: window.timer ? window.timer.blackTime : null,
      variants: {
        diceChessEnabled: window.variants.diceChessEnabled,
        fogOfWarEnabled: window.variants.fogOfWarEnabled,
        draftEnabled: window.variants.draftEnabled,
        identityTheftEnabled: window.variants.identityTheftEnabled
      }
    };
    sessionStorage.setItem('chessology_game_state', JSON.stringify(gameState));
  },

  clearSessionState() {
    if (window.timer) window.timer.stop();
    sessionStorage.removeItem('chessology_session');
    sessionStorage.removeItem('chessology_game_state');
  },

  checkAndRestoreSession() {
    const sessionStr = sessionStorage.getItem('chessology_session');
    const gameStateStr = sessionStorage.getItem('chessology_game_state');
    if (!sessionStr || !gameStateStr) return;

    try {
      const sess = JSON.parse(sessionStr);
      const state = JSON.parse(gameStateStr);
      
      console.log("Active multiplayer session detected. Seamlessly reconnecting...");
      

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board[r][c] = null;
        }
      }
      state.board.forEach(p => {
        board[p.r][p.c] = { type: p.type, color: p.color, types: p.types };
      });
      turn = state.turn;
      castling = state.castling;
      enPassantSquare = state.enPassantSquare;
      halfMoveClock = state.halfMoveClock;
      fullMoveNumber = state.fullMoveNumber;
      
      window.variants.diceChessEnabled = state.variants.diceChessEnabled;
      window.variants.fogOfWarEnabled = state.variants.fogOfWarEnabled;
      window.variants.draftEnabled = state.variants.draftEnabled;
      window.variants.identityTheftEnabled = state.variants.identityTheftEnabled;
      
      if (window.timer) {
        window.timer.init(state.whiteTime || 0, state.blackTime || 0, 0, 0);
        if (window.timer.enabled && !window.variants.draftEnabled) {
          window.timer.start(turn);
        }
      }
      
      flipped = (sess.myColor === 'b');
      this.gameState = sess.gameState || 'playing';
      webrtc.myColor = sess.myColor;
      webrtc.isHost = (sess.role === 'host');
      
      const targetStep = this.gameState === 'setup' ? 'stepOnlineLobby' : 'stepGame';
      
      if (webrtc.isHost) {
        // As host, our auth.js already called webrtc.initPeer() when setting identity.
        // We just wait for the joiner to reconnect to us.
        window.ui.showStep(targetStep);
      } else if (sess.opponentUsername) {
        // As joiner, we must actively reconnect to the host
        webrtc.hostId = sess.opponentUsername;
        window.ui.showStep(targetStep); // Show UI instantly so they see "Reconnecting..."
        
        webrtc.attemptReconnection(
          (color) => {
            if (this.gameState === 'playing') this.syncFullBoardState();
          },
          (data) => this.handleMultiplayerMessage(data)
        );
      }
      
      this.renderAll();
    } catch (e) {
      console.error("Failed to restore session:", e);
      this.clearSessionState();
      newGame();
    }
  },

  startGameWithSettings(variants, myColor, clockConfig) {
    this.localReset();

    webrtc.myColor = myColor;
    window.variants.diceChessEnabled = variants.diceChessEnabled;
    window.variants.fogOfWarEnabled = variants.fogOfWarEnabled;
    window.variants.draftEnabled = variants.draftEnabled;
    window.variants.identityTheftEnabled = variants.identityTheftEnabled;
    window.variants.identityTheftMode = variants.identityTheftMode;
    window.variants.handAndBrainEnabled = variants.handAndBrainEnabled;

    if (clockConfig) {
      window.timer.init(clockConfig.wTime, clockConfig.bTime, clockConfig.wInc, clockConfig.bInc);
      if (window.timer.enabled && !variants.draftEnabled) {
        window.timer.start('w');
      }
    } else {
      window.timer.init(0, 0, 0, 0);
    }

    this.gameState = 'playing';
    flipped = (myColor === 'b'); // Set initial online perspective based on color
    window.variants.init();

    if (window.variants.diceChessEnabled && !window.variants.draftEnabled) {
      window.variants.rollDice('w');
    }
    this.triggerBrainAnalysis();
    this.saveSessionState();
    this.renderAll();
  },

  handleMultiplayerMessage(data) {
    // A 200-line if/else chain for message parsing is a crime against humanity.
    // This dispatch table prevents our multiplayer handler from devolving into spaghetti.
    const handlers = {
      'challenge':           (d) => this.onReceiveChallenge(d),
      'accept-challenge':    (d) => this.onChallengeAccepted(d),
      'decline-challenge':   ()  => this.onChallengeDeclined(),
      'move':                (d) => this.onRemoteMove(d),
      'dice-roll':           (d) => this.onDiceRoll(d),
      'draft-lock':          (d) => this.onDraftLock(d),
      'draft-complete-sync': (d) => this.onDraftCompleteSync(d),
      'trim-powers':         (d) => this.onTrimPowers(d),
      'propose-undo':        ()  => this.showProposal('undo'),
      'accept-undo':         ()  => this.onUndoAccepted(),
      'decline-undo':        ()  => this.onUndoDeclined(),
      'propose-reset':       ()  => this.showProposal('reset'),
      'accept-reset':        ()  => this.onResetAccepted(),
      'decline-reset':       ()  => this.onResetDeclined(),
      'offer-draw':          ()  => this.showProposal('draw'),
      'accept-draw':         ()  => this.onDrawAccepted(),
      'decline-draw':        ()  => this.onDrawDeclined(),
      'start-game':          (d) => this.onStartGame(d),
      'resign':              ()  => this.onOpponentResign(),
      'abort':               ()  => this.onGameAborted(),
      'timeout':             (d) => this.handleTimeOut(d.color, true),
      'request-clock-sync':  (d) => this.onClockSyncRequest(d),
      'clock-sync-response': (d) => this.onClockSyncResponse(d),
      'state-sync':          (d) => this.onStateSync(d),
      'request-state-sync':  ()  => this.syncFullBoardState(),
    };
    const handler = handlers[data.type];
    if (handler) handler(data);
  },

  onReceiveChallenge(data) {
    const sendBtn = document.getElementById('sendChallengeBtn');
    if (sendBtn && sendBtn.disabled && sendBtn.textContent === 'Waiting for opponent...') {
      // Both users sent a challenge at the exact same time!
      const myName = (window.webrtc.peerId || '').toLowerCase();
      const oppName = (window.webrtc.conn?.peer || '').toLowerCase();
      if (myName > oppName) {
        console.log("Simultaneous proposal: yielding to opponent's proposal.");
      } else {
        console.log("Simultaneous proposal: enforcing my proposal.");
        return; // Ignore their proposal, wait for them to accept ours
      }
    }

    const myColor = data.colorReq === 'random'
      ? (Math.random() < 0.5 ? 'w' : 'b')
      : (data.colorReq === 'w' ? 'b' : 'w');

    this.pendingChallenge = { variants: data.variants, myColor, clockConfig: data.clockConfig };

    const list = document.getElementById('challengeVariantsList');
    const v = data.variants;
    list.innerHTML = '';
    if (v.diceChessEnabled)    list.innerHTML += '<div>• Dice Chess</div>';
    if (v.fogOfWarEnabled)     list.innerHTML += '<div>• Fog of War</div>';
    if (v.draftEnabled)        list.innerHTML += '<div>• Draft Mode</div>';
    if (v.identityTheftEnabled) list.innerHTML += `<div>• Identity Theft (${v.identityTheftMode})</div>`;
    if (v.handAndBrainEnabled) list.innerHTML += '<div>• Hand and Brain</div>';
    if (!list.innerHTML)       list.innerHTML  = '<div style="color:var(--dim)">Standard Chess</div>';

    if (data.colorReq !== 'random') {
      list.innerHTML += `<div style="margin-top:4px; color:var(--text);">You will play as: <strong style="color:#fff">${myColor === 'w' ? 'White' : 'Black'}</strong></div>`;
    }
    document.getElementById('challengePopup').style.display = 'block';
  },

  onChallengeAccepted(data) {
    const sendBtn = document.getElementById('sendChallengeBtn');
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Propose Game';
    }
    this.startGameWithSettings(this.readLobbyVariants(), data.yourColor, this.readClockConfig('Lobby'));
  },

  onChallengeDeclined() {
    alert('Opponent declined your game proposal.');
    const sendBtn = document.getElementById('sendChallengeBtn');
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Propose Game';
    }
  },

  onRemoteMove(data) {
    const { fromRow, fromCol, toRow, toCol, flags, promo } = data.move;
    const senderState = data.state;

    if (senderState) {
      const localFen = boardToFen(board, turn, castling, enPassantSquare);
      if (senderState.fen !== localFen || senderState.turn !== turn) {
        console.error("STATE MISMATCH DETECTED BEFORE MOVE APPLICATION!", {
          senderFen: senderState.fen,
          localFen: localFen,
          senderTurn: senderState.turn,
          localTurn: turn,
          senderCastling: JSON.stringify(senderState.castling),
          localCastling: JSON.stringify(castling),
          senderEnPassant: JSON.stringify(senderState.enPassant),
          localEnPassant: JSON.stringify(enPassantSquare)
        });
      }
    }

    const legalMoves = allLegalMoves(turn, board, enPassantSquare, castling, true);
    // Note: we do NOT check promo here. The engine's move generator never sets a
    // promo field — any promotion piece (Q/R/B/N) is always valid for a legal
    // pawn-to-back-rank move. The piece choice is a UI decision, not a legality one.
    const isValid = legalMoves.some(m =>
      m.from.r === fromRow && m.from.c === fromCol &&
      m.to.r === toRow && m.to.c === toCol
    );


    if (!isValid) {
      const moveStr = squareToAlg(fromRow, fromCol) + squareToAlg(toRow, toCol);
      const legalMovesStr = legalMoves.map(m => `${squareToAlg(m.from.r, m.from.c)}->${squareToAlg(m.to.r, m.to.c)}`).join(', ');
      const diceStr = window.variants ? window.variants.allowedDiceTypes.join(',') : 'N/A';
      const debugText = `MOVE: ${moveStr} | TURN: ${turn} | MY_COLOR: ${webrtc.myColor} | FEN: ${boardToFen(board, turn, castling, enPassantSquare)} | DICE: ${diceStr} | LEGAL_MOVES: [${legalMovesStr}]`;
      console.error('ILLEGAL REMOTE MOVE DETAILS:', debugText);

      if (webrtc.active) webrtc.sendData({ type: 'abort' });
      this.showAbortBanner('Desync Detected', `Move: ${moveStr} | Turn: ${turn} | Side: ${webrtc.myColor}`);
      return;
    }

    if (window.timer && window.timer.enabled && data.remainingTime !== undefined) {
      const oppColor = webrtc.myColor === 'w' ? 'b' : 'w';
      if (oppColor === 'w') window.timer.whiteTime = data.remainingTime;
      else                  window.timer.blackTime = data.remainingTime;
    }

    this.execMoveDirect(fromRow, fromCol, toRow, toCol, flags, promo);
    if (window.variants.diceChessEnabled) {
      window.variants.rollDice(turn);
    }
    this.renderAll();
  },

  onDiceRoll(data) {
    window.variants.allowedDiceTypes = data.allowedDiceTypes;
    this.renderAll();
  },

  onDraftLock(data) {
    window.variants.draftLocked[data.color] = true;
    
    // Clear the locking player's home territory to avoid duplicate/orphaned pieces
    const startRow = data.color === 'w' ? 4 : 0;
    const endRow = data.color === 'w' ? 7 : 3;
    for (let r = startRow; r <= endRow; r++) {
      for (let c = 0; c < 8; c++) {
        board[r][c] = null;
      }
    }

    if (data.board && Array.isArray(data.board)) {
      data.board.forEach(p => {
        board[p.r][p.c] = { type: p.type, color: data.color, types: p.types };
      });
    }
    this.checkDraftCompletion();
    this.renderAll();
  },

  onDraftCompleteSync(data) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) board[r][c] = null;
    }
    data.board.forEach(p => {
      board[p.r][p.c] = { type: p.type, color: p.color, types: p.types };
    });
    this.renderAll();
  },

  onTrimPowers(data) {
    const p = board[data.r][data.c];
    if (p) {
      p.types = data.types;
      p.type = data.types[0];
    }
    window.pendingPowerSelection = null;
    if (window.timer && window.timer.enabled) window.timer.start(turn);
    this.renderAll();
  },

  onUndoAccepted() {
    this.localUndo();
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
      undoBtn.disabled = false;
      undoBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>Undo`;
    }
  },

  onUndoDeclined() {
    alert('Opponent declined your undo request.');
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
      undoBtn.disabled = false;
      undoBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>Undo`;
    }
  },

  onResetAccepted() {
    this.localReset();
    this.onLobbyConnected(webrtc.isHost ? 'Host' : 'Joiner');
  },

  onResetDeclined() {
    alert('Opponent declined the rematch request.');
    document.querySelectorAll('.result-box button').forEach(btn => {
      if (btn.textContent.includes('Request Sent')) {
        btn.disabled = false;
        btn.textContent = 'Rematch';
      }
    });
  },

  onStartGame(data) {
    this.localReset();
    this.gameState = 'playing';
    flipped = (webrtc.myColor === 'b');
    if (data.variants) {
      window.variants.diceChessEnabled      = data.variants.diceChessEnabled;
      window.variants.fogOfWarEnabled       = data.variants.fogOfWarEnabled;
      window.variants.draftEnabled          = data.variants.draftEnabled;
      window.variants.identityTheftEnabled  = data.variants.identityTheftEnabled;
      window.variants.identityTheftMode     = data.variants.identityTheftMode;
      window.variants.handAndBrainEnabled   = data.variants.handAndBrainEnabled;
      // Reflect settings in the Joiner's lobby UI
      const diceToggle = document.getElementById('diceChessToggle');    if (diceToggle) diceToggle.checked = data.variants.diceChessEnabled;
      const fogToggle = document.getElementById('fogOfWarToggle');     if (fogToggle) fogToggle.checked = data.variants.fogOfWarEnabled;
      const draftToggle = document.getElementById('draftModeToggle');    if (draftToggle) draftToggle.checked = data.variants.draftEnabled;
      const identityToggle = document.getElementById('identityTheftToggle'); if (identityToggle) identityToggle.checked = data.variants.identityTheftEnabled;
      const identityModeSelect = document.getElementById('identityTheftMode');  if (identityModeSelect) identityModeSelect.value = data.variants.identityTheftMode;
      const hbToggle = document.getElementById('handAndBrainToggle'); if (hbToggle) hbToggle.checked = data.variants.handAndBrainEnabled;
    }
    
    if (data.clockConfig) {
      window.timer.init(data.clockConfig.wTime, data.clockConfig.bTime, data.clockConfig.wInc, data.clockConfig.bInc);
      if (window.timer.enabled && (!data.variants || !data.variants.draftEnabled)) {
        window.timer.start('w');
      }
    } else {
      window.timer.init(0, 0, 0, 0);
    }

    window.variants.init();
    this.triggerBrainAnalysis();
    this.renderAll();
  },

  onOpponentResign() {
    const winnerColor = webrtc.myColor !== 'w' ? 'White' : 'Black';
    over = true;
    this.clearSessionState();
    document.getElementById('resultTitle').textContent = (webrtc.myColor === 'b' ? 'White' : 'Black') + ' Resigned';
    document.getElementById('resultSub').textContent = 'You win!';
    document.getElementById('rematchBtn').style.display = 'block';
    document.getElementById('reviewBtn').style.display = 'block';
    document.getElementById('resultBanner').classList.add('show');
    window.audio.playSound('end');
    this.renderAll();
  },

  onGameAborted() {
    this.showAbortBanner('Game Aborted', 'Opponent aborted the game.');
  },

  showAbortBanner(title, sub) {
    over = true;
    this.clearSessionState();
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultSub').textContent = sub;
    document.getElementById('rematchBtn').style.display = 'none';
    document.getElementById('reviewBtn').style.display = 'none';
    document.getElementById('resultBanner').classList.add('show');
    window.audio.playSound('end');
    this.renderAll();
  },

  onClockSyncRequest(data) {
    if (!webrtc.isHost || !window.timer) return;
    webrtc.sendData({
      type: 'clock-sync-response',
      t: data.requestTimestamp,
      whiteTime: window.timer.whiteTime,
      blackTime: window.timer.blackTime,
      activeSide: window.timer.activeSide
    });
  },

  onClockSyncResponse(data) {
    if (webrtc.isHost || !window.timer) return;
    // We assume symmetric latency. (Date.now() - data.requestTimestamp) is the full round trip,
    // so dividing by 2 gives us an approximate one-way travel time to adjust the clock precision.
    const latency = Math.max(0, (Date.now() - data.requestTimestamp) / 2);
    window.timer.handleSyncResponse(data, latency);
  },

  onStateSync(data) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) board[r][c] = null;
    }
    data.board.forEach(p => {
      board[p.r][p.c] = { type: p.type, color: p.color, types: p.types };
    });
    turn = data.turn;
    if (window.timer) {
      window.timer.whiteTime = data.whiteTime;
      window.timer.blackTime = data.blackTime;
      window.timer.render();
    }
    this.saveSessionState();
    this.renderAll();
  },

  localUndo() {
    if (!boardHistory.length) return;
    restoreState(boardHistory.pop());
    moveHistory.pop();
    clearHints();
    over = false;
    viewIndex = moveHistory.length;
    liveState = null;
    this.hideResultBanner();
    this.renderAll();
  },

  localReset() {
    initBoard(INIT_FEN);
    turn = 'w';
    castling = { wK: true, wQ: true, bK: true, bQ: true };
    enPassantSquare = null;
    halfMoveClock = 0;
    fullMoveNumber = 1;
    selectedSquare = null;
    legal = [];
    moveHistory = [];
    boardHistory = [];
    lastMove = null;
    over = false;
    dragStartSquare = null;
    draggedElement = null;
    isDragging = false;
    viewIndex = 0;
    liveState = null;
    this.gameState = 'setup';
    this.branches = null;
    this.currentBranchId = 'main';
    window.variants.isDiceChessActive = false;
    window.variants.isDraftActive = false;
    window.variants.isIdentityTheftActive = false;
    window.variants.handAndBrainEnabled = false;
    window.variants.brainSuggestedPiece = null;
    window.variants.draftLocked = { w: false, b: false };
    window.variants.draftPointsLeft = { w: window.variants.DRAFT_BUDGET, b: window.variants.DRAFT_BUDGET };
    window.variants.draftActivePieceType = null;
    this.clearSessionState();
    this.hideResultBanner();
    this.renderAll();
  },

  startGame() {
    const getT = (offId) => document.getElementById(offId)?.checked || false;
    const getS = (offId) => document.getElementById(offId)?.value || 'steal';
    
    window.variants.diceChessEnabled = getT('diceChessToggleOffline');
    window.variants.draftEnabled = getT('draftModeToggleOffline');
    window.variants.identityTheftEnabled = getT('identityTheftToggleOffline');
    window.variants.identityTheftMode = getS('identityTheftModeOffline');
    window.variants.handAndBrainEnabled = getT('handAndBrainToggleOffline');
    window.variants.fogOfWarEnabled = false; // Never online here

    const clockConfig = this.readClockConfig('Offline');
    window.timer.init(clockConfig.wTime, clockConfig.bTime, clockConfig.wInc, clockConfig.bInc);

    this.gameState = 'playing';
    window.variants.init();
    
    if (window.timer.enabled && !window.variants.draftEnabled) {
      window.timer.start('w');
    }
    
    if (window.variants.diceChessEnabled && !window.variants.draftEnabled) {
      window.variants.rollDice('w');
    }
    this.triggerBrainAnalysis();

    this.renderAll();
  },

  rematch() {
    newGame();
    if (webrtc.active) {
      // In mutual lobby mode, returning to lobby is required for a rematch.
      // Alternatively, we could automatically send a challenge with the same settings.
      // For now, let's just drop them in the lobby so they can explicitly re-challenge.
      this.onLobbyConnected(webrtc.isHost ? 'Host' : 'Joiner');
    } else {
      // Offline can restart immediately
      this.localReset();
      this.gameState = 'playing';
      window.variants.init();
      if (window.variants.diceChessEnabled && !window.variants.draftEnabled) {
        window.variants.rollDice('w');
      }
      this.triggerBrainAnalysis();
      this.renderAll();
    }
  },

  offerDraw() {
    if (this.gameState !== 'playing' || over) return;
    
    if (!webrtc.active) {
      if (confirm('Agree to a draw?')) {
        this.onDrawAccepted();
      }
      return;
    }
    
    const drawBtn = document.getElementById('drawBtn');
    if (drawBtn) {
      drawBtn.disabled = true;
      drawBtn.textContent = 'Offer Sent';
    }
    webrtc.sendData({ type: 'offer-draw' });
  },

  onDrawAccepted() {
    over = true;
    this.clearSessionState();
    document.getElementById('resultTitle').textContent = 'Draw';
    document.getElementById('resultSub').textContent = 'By Agreement';
    document.getElementById('rematchBtn').style.display = 'block';
    document.getElementById('reviewBtn').style.display = 'block';
    document.getElementById('resultBanner').classList.add('show');
    window.audio.playSound('end');
    this.renderAll();
  },

  onDrawDeclined() {
    alert('Opponent declined your draw offer.');
    const drawBtn = document.getElementById('drawBtn');
    if (drawBtn) {
      drawBtn.disabled = false;
      drawBtn.innerHTML = ICONS.draw + 'Draw';
    }
  },

  resignGame() {
    if (this.gameState !== 'playing' || over) return;
    const isAbort = moveHistory.length < 2;
    if (!confirm(isAbort ? 'Abort the game?' : 'Are you sure you want to resign?')) return;

    if (isAbort) {
      if (webrtc.active) webrtc.sendData({ type: 'abort' });
      this.showAbortBanner('Game Aborted', 'No result recorded.');
    } else {
      over = true;
      this.clearSessionState();
      const isWhite = webrtc.active ? (webrtc.myColor === 'w') : (turn === 'w');
      document.getElementById('resultTitle').textContent = (isWhite ? 'White' : 'Black') + ' Resigned';
      document.getElementById('resultSub').textContent = 'Opponent wins!';
      if (webrtc.active) webrtc.sendData({ type: 'resign' });
      document.getElementById('rematchBtn').style.display = 'block';
      document.getElementById('reviewBtn').style.display = 'block';
      document.getElementById('resultBanner').classList.add('show');
      window.audio.playSound('end');
      this.renderAll();
    }
  },

  goToMenu() {
    this.localReset();
    this.clearSessionState();
    if (webrtc.active) {
      this.onLobbyConnected(webrtc.isHost ? 'Host' : 'Joiner');
    } else {
      window.ui.showStep('stepMode');
    }
  },

  handleTimeOut(color, isRemote = false) {
    if (over) return;
    over = true;
    const winnerColor = color === 'w' ? 'Black' : 'White';
    document.getElementById('resultTitle').textContent = `${winnerColor} won on time`;
    document.getElementById('resultSub').textContent = 'Time out!';
    document.getElementById('resultBanner').classList.add('show');
    window.audio.playSound('end');
    
    if (window.timer) window.timer.stop();
    
    if (webrtc.active && !isRemote) {
      webrtc.sendData({ type: 'timeout', color: color });
    }
    this.renderAll();
  },

  startGameNormal() {
    const isDraft = document.getElementById('draftModeToggleOffline')?.checked || false;
    if (!isDraft) {
      importFen(INIT_FEN, true);
    }
    this.startGame();
  },

  startGameFromCurrent() {
    const currentFen = boardToFen(board, turn, castling, enPassantSquare);
    importFen(currentFen, true);
    this.branches = null;
    this.currentBranchId = 'main';
    this.startGame();
  }
};

// â”€â”€â”€ IMPORT / EXPORT TRIGGERS (called from index.html) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function triggerImport() {
  if (webrtc.active) {
    alert("Importing FEN/PGN is disabled during active multiplayer sessions.");
    return;
  }
  const inputEl = document.getElementById('fenPgnInput');
  const val = inputEl.value.trim();
  if (!val) { alert("Please paste a FEN or PGN first!"); return; }
  
  window.app.branches = null;
  window.app.currentBranchId = 'main';
  
  if (isValidFen(val)) {
    const hasDiceSuffix = val.split(/\s+/).some(p => p.startsWith('d:'));
    window.variants.diceChessEnabled = hasDiceSuffix;
    const diceToggle = document.getElementById('diceChessToggleOffline');
    if (diceToggle) diceToggle.checked = hasDiceSuffix;
    
    window.variants.identityTheftEnabled = false;
    const theftToggle = document.getElementById('identityTheftToggleOffline');
    if (theftToggle) theftToggle.checked = false;
    
    window.variants.draftEnabled = false;
    const draftToggle = document.getElementById('draftModeToggleOffline');
    if (draftToggle) draftToggle.checked = false;

    importFen(val);
  } else {
    importPgn(val);
  }
  
  window.app.gameState = 'setup';
  over = false;
  viewIndex = moveHistory.length;
  liveState = null;
  
  window.app.renderAll();
  
  inputEl.value = '';
  const ov = document.getElementById('importOv');
  if (ov) ov.classList.remove('show');
}

function triggerExportFen() {
  const isIdentityTheft = window.variants && window.variants.isIdentityTheftActive;
  if (isIdentityTheft) {
    alert("FEN export is disabled in Identity Theft variant because of custom pieces.");
    return;
  }
  const fen = exportCurrentFen();
  document.getElementById('fenPgnInput').value = fen;
  navigator.clipboard.writeText(fen)
    .then(() => alert("FEN copied to clipboard!"))
    .catch((err) => {
      console.error("Clipboard FEN copy failed:", err);
      alert("Copying to clipboard blocked by browser. Please select and copy the FEN manually from the text box.");
    });
}

function triggerExportPgn() {
  const pgn = exportPgn();
  document.getElementById('fenPgnInput').value = pgn;
  navigator.clipboard.writeText(pgn)
    .then(() => alert("PGN copied to clipboard!"))
    .catch((err) => {
      console.error("Clipboard PGN copy failed:", err);
      alert("Copying to clipboard blocked by browser. Please select and copy the PGN manually from the text box.");
    });
}


function clearHints() {
  selectedSquare = null; legal = [];
}

function jumpTo(idx) {
  if (idx < 0 || idx > moveHistory.length) return;
  if (viewIndex === moveHistory.length) {
    liveState = cloneState();
  }
  viewIndex = idx;
  if (viewIndex === moveHistory.length) {
    if (liveState) {
      restoreState(liveState);
      liveState = null;
    }
  } else {
    restoreState(boardHistory[viewIndex]);
  }
  window.app.renderAll();
}

function undoMove() {
  if (webrtc.active) {
    webrtc.sendData({ type: 'propose-undo' });
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
      undoBtn.disabled = true;
      undoBtn.textContent = "Waiting...";
    }
  } else {
    window.app.localUndo();
  }
}

function newGame() {
  if (webrtc.active) {
    webrtc.sendData({ type: 'propose-reset' });
    const buttons = document.querySelectorAll('.result-box button');
    buttons.forEach(btn => {
      if (btn.textContent.includes('Rematch')) {
        btn.disabled = true;
        btn.textContent = "Request Sent...";
      }
    });
  } else {
    window.app.localReset();
  }
}

let promotionCallback = null;
function showPromo(color, cb) {
  promotionCallback = cb;
  const row = document.getElementById('promoRow'); row.innerHTML = '';
  ['Q', 'R', 'B', 'N'].forEach(t => {
    const btn = document.createElement('button'); btn.className = 'pbtn';
    btn.innerHTML = SVG[color + t];
    btn.onclick = () => {
      document.getElementById('promoOv').classList.remove('show');
      promotionCallback(t);
    };
    row.appendChild(btn);
  });
  document.getElementById('promoOv').classList.add('show');
}

// Unified Pointer detection coordinates helper
let dragStartSquare = null, draggedElement = null, isDragging = false, dragStartX = 0, dragStartY = 0;
let pointerId = null;

const boardEl = document.getElementById('boardEl');

function sqFromXY(x, y) {
  const rect = boardEl.getBoundingClientRect();
  const col = Math.floor((x - rect.left) / (rect.width / 8));
  const row = Math.floor((y - rect.top) / (rect.height / 8));
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const isPerspectiveFlipped = flipped;
  const r = isPerspectiveFlipped ? 7 - row : row;
  const c = isPerspectiveFlipped ? 7 - col : col;
  return { r, c };
}

function hlDropXY(x, y) {
  document.querySelectorAll('.sq.dov').forEach(el => el.classList.remove('dov'));
  const sq = sqFromXY(x, y);
  if (sq && legal.some(m => m.r === sq.r && m.c === sq.c)) {
    const el = boardEl.querySelector(`.sq[data-r="${sq.r}"][data-c="${sq.c}"]`);
    if (el) el.classList.add('dov');
  }
}
