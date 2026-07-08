// --- CHESSOLOGY STOCKFISH ANALYSIS ------------------------------------------
window.analysis = {
  worker: null,
  active: false,
  bestMove: null, // format: { fromRow, fromCol, toRow, toCol }
  currentFen: null,

  init() {
    if (this.worker) return;
    try {
      this.worker = new Worker('js/stockfish-18-lite-single.js');
      this.worker.onmessage = this.onMessage.bind(this);
      this.worker.postMessage('uci');
    } catch(e) {
      console.error('Failed to load Stockfish worker:', e);
    }
  },

  pendingFen: null,

  analyze(fen) {
    if (this.currentFen === fen) return;
    this.currentFen = fen;

    if (!this.worker) this.init();
    if (!this.worker) return;

    // Clear old best move immediately so it doesn't linger on screen
    this.bestMove = null;
    this.clearArrow();

    if (this.active) {
      // Queue the new position and stop the current search.
      // The new search starts when the engine replies with 'bestmove'.
      this.pendingFen = fen;
      this.worker.postMessage('stop');
    } else {
      this.active = true;
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage('go infinite');
    }
  },

  stop() {
    if (this.active && this.worker) {
      this.worker.postMessage('stop');
    }
    this.active = false;
    this.currentFen = null;
    this.pendingFen = null;
    this.clearArrow();
    const evalBar = document.getElementById('evalBar');
    if (evalBar) evalBar.style.display = 'none';
  },

  onMessage(event) {
    const line = event.data;
    if (typeof line !== 'string') return;

    if (line.startsWith('info depth')) {
      // Ignore old search info if a new FEN is pending
      if (this.pendingFen !== null) return;

      const depthMatch = line.match(/info depth (\d+)/);
      const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;

      // Ignore aspiration window bounds (these cause wild inaccurate evaluation jumps)
      if (line.includes('upperbound') || line.includes('lowerbound')) return;

      const cpMatch = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);

      if ((depth >= 8 || mateMatch) && (cpMatch || mateMatch)) {
        const isWhiteTurn = (typeof turn !== 'undefined' && turn === 'w');
        let text = '';
        let fillPct = 50;

        if (mateMatch) {
          const mateMoves = parseInt(mateMatch[1], 10);
          const absoluteMate = isWhiteTurn ? mateMoves : -mateMoves;
          text = 'M' + Math.abs(absoluteMate);
          fillPct = absoluteMate > 0 ? 100 : 0;
        } else if (cpMatch) {
          const cp = parseInt(cpMatch[1], 10);
          // UCI score is relative to side to move - convert to absolute (+ is White, - is Black)
          const absoluteCp = isWhiteTurn ? cp : -cp;
          const evalScore = absoluteCp / 100;
          text = (evalScore > 0 ? '+' : '') + evalScore.toFixed(1);
          // Standard chess eval bar curve: 50 + 50 * (2/pi) * atan(eval/4)
          fillPct = 50 + 50 * (2 / Math.PI) * Math.atan(evalScore / 4);
        }

        const evalBar = document.getElementById('evalBar');
        const evalFill = document.getElementById('evalFill');
        const evalText = document.getElementById('evalText');
        if (evalBar && evalFill && evalText) {
          const isEvalVisible = window.app && typeof window.app.isEvalVisible === 'function' ? window.app.isEvalVisible() : false;
          if (isEvalVisible) {
            evalBar.style.display = 'flex';
            evalFill.style.height = `${fillPct}%`;
            evalText.textContent = text;
            
            const isFlipped = evalBar.classList.contains('flipped');
            evalText.style.top = '';
            evalText.style.bottom = '';
            evalText.style.transform = '';
            
            if (fillPct > 50) {
              if (isFlipped) {
                evalText.style.top = '12px';
              } else {
                evalText.style.bottom = '12px';
              }
              evalText.style.color = '#1a1a1a';
            } else {
              if (isFlipped) {
                evalText.style.bottom = '12px';
              } else {
                evalText.style.top = '12px';
              }
              evalText.style.color = '#e0e0e0';
            }
          } else {
            evalBar.style.display = 'none';
          }
        }
      }

      if (line.includes('pv ')) {
        const pvMatch = line.match(/pv\s+([a-h][1-8][a-h][1-8])/);
        if (pvMatch && pvMatch[1]) {
          this.updateBestMove(pvMatch[1]);
          if (window.variants && window.variants.isHandAndBrainActive) {
            if (depth >= 8) {
              window.variants.handleBrainBestMove(pvMatch[1]);
            }
          }
        }
      }
    } else if (line.startsWith('bestmove ')) {
      const match = line.match(/bestmove\s+([a-h][1-8][a-h][1-8])/);

      const isOldSearch = (this.pendingFen !== null);
      if (!isOldSearch && match && match[1]) {
        this.updateBestMove(match[1]);
        if (window.variants && window.variants.isHandAndBrainActive) {
          window.variants.handleBrainBestMove(match[1]);
        }
      }

      this.active = false;

      // If another analysis was queued while stopping, start it now
      if (this.pendingFen) {
        const fenToAnalyze = this.pendingFen;
        this.pendingFen = null;
        this.active = true;
        this.worker.postMessage(`position fen ${fenToAnalyze}`);
        this.worker.postMessage('go infinite');
      }
    }
  },

  updateBestMove(moveStr) {
    const col = (char) => char.charCodeAt(0) - 'a'.charCodeAt(0);
    const row = (char) => '8'.charCodeAt(0) - char.charCodeAt(0);

    this.bestMove = {
      fromCol: col(moveStr[0]),
      fromRow: row(moveStr[1]),
      toCol: col(moveStr[2]),
      toRow: row(moveStr[3])
    };
    this.drawArrow();
  },

  drawArrow() {
    this.clearArrow();
    const showBestToggle = document.getElementById('showBestMoveToggle');
    const isPlaying = window.app && window.app.gameState === 'playing' && !over;
    const isIdentityTheft = window.variants && window.variants.isIdentityTheftActive;
    const isFog = window.variants && window.variants.fogOfWarEnabled;
    const showBest = showBestToggle && showBestToggle.checked && !isPlaying && !isIdentityTheft && !isFog;
    if (!showBest || !this.bestMove) return;
    const { fromRow, fromCol, toRow, toCol } = this.bestMove;

    const svgOverlay = document.getElementById('arrowOverlay');
    if (!svgOverlay) return;

    const isFlipped = (window.webrtc?.active && window.app?.gameState === 'playing')
      ? window.webrtc.myColor === 'b'
      : (typeof flipped !== 'undefined' ? flipped : false);

    const sqSize = 100 / 8; // viewBox is 0 0 100 100

    const getCoord = (r, c) => {
      const displayR = isFlipped ? 7 - r : r;
      const displayC = isFlipped ? 7 - c : c;
      return {
        x: (displayC + 0.5) * sqSize,
        y: (displayR + 0.5) * sqSize
      };
    };

    const fromPt = getCoord(fromRow, fromCol);
    const toPt = getCoord(toRow, toCol);

    const dx = toPt.x - fromPt.x;
    const dy = toPt.y - fromPt.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;

    // Proportions for a standard chess arrow
    const w = sqSize * 0.15;  // shaft width
    const hw = sqSize * 0.40; // head width
    const hl = sqSize * 0.40; // head length

    const d = dist;
    const startOffset = 0;

    // Build the arrow polygon pointing horizontally to the right
    const points = [
      { x: startOffset, y: -w/2 },
      { x: d - hl, y: -w/2 },
      { x: d - hl, y: -hw/2 },
      { x: d, y: 0 },
      { x: d - hl, y: hw/2 },
      { x: d - hl, y: w/2 },
      { x: startOffset, y: w/2 }
    ];

    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const transformed = points.map(p => {
      const nx = p.x * cos - p.y * sin;
      const ny = p.x * sin + p.y * cos;
      return `${fromPt.x + nx},${fromPt.y + ny}`;
    });

    // Create defs and gradient if not exist
    let defs = svgOverlay.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svgOverlay.insertBefore(defs, svgOverlay.firstChild);
    }
    let grad = defs.querySelector('#arrow-grad');
    if (!grad) {
      grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      grad.setAttribute('id', 'arrow-grad');
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      
      const stopStart = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stopStart.setAttribute('offset', '0%');
      stopStart.setAttribute('stop-color', '#4d90f0');
      stopStart.setAttribute('stop-opacity', '0');
      
      const stopEnd = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stopEnd.setAttribute('offset', '100%');
      stopEnd.setAttribute('stop-color', '#4d90f0');
      stopEnd.setAttribute('stop-opacity', '0.75');
      
      grad.appendChild(stopStart);
      grad.appendChild(stopEnd);
      defs.appendChild(grad);
    }
    
    // Position gradient along the vector from tail to head
    grad.setAttribute('x1', fromPt.x);
    grad.setAttribute('y1', fromPt.y);
    grad.setAttribute('x2', toPt.x);
    grad.setAttribute('y2', toPt.y);

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', transformed.join(' '));
    polygon.setAttribute('fill', 'url(#arrow-grad)');
    polygon.setAttribute('class', 'analysis-arrow');

    svgOverlay.appendChild(polygon);
  },

  clearArrow() {
    const svgOverlay = document.getElementById('arrowOverlay');
    if (!svgOverlay) return;
    const arrows = svgOverlay.querySelectorAll('.analysis-arrow');
    arrows.forEach(a => a.remove());
  }
};
