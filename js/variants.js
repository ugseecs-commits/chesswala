// --- CHESSOLOGY VARIANTS ENGINE ----------------------------------------------
const PIECE_COSTS = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

window.variants = {
  // Dice Chess
  diceChessEnabled: false,
  allowedDiceTypes: [],

  // Fog of War
  fogOfWarEnabled: false,

  // Salary Cap (The Draft)
  DRAFT_BUDGET: 39,
  draftEnabled: false,
  draftLocked: { w: false, b: false },
  draftPointsLeft: { w: 39, b: 39 },
  draftActivePieceType: null, // 'P', 'N', 'B', 'R', 'Q', 'K'
  draftActiveColor: 'w',      // client side placing color

  // Identity Theft
  identityTheftEnabled: false,
  identityTheftMode: 'steal', // 'steal' or 'append'

  // Hand and Brain
  handAndBrainEnabled: false,
  brainSuggestedPiece: null, // 'P', 'N', 'B', 'R', 'Q', 'K'

  init() {
    this.allowedDiceTypes = [];
    this.brainSuggestedPiece = null;
    this.draftLocked = { w: false, b: false };
    this.draftPointsLeft = { w: this.DRAFT_BUDGET, b: this.DRAFT_BUDGET };
    this.draftActivePieceType = null;

    if (this.draftEnabled) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board[r][c] = null;
        }
      }
    }
  },

  get isDiceChessActive() {
    return this.diceChessEnabled && !this.isDraftActive; // Draft phase suspends variants until game start
  },

  get isFogOfWarActive() {
    return this.fogOfWarEnabled && !this.isDraftActive;
  },

  // draftEnabled is the lobby rule setting. isDraftActive is the temporal phase.
  // We need both because Draft Mode is "on" for the whole match, but the actual drafting 
  // only happens before both players lock in. Once they lock, the variant is still enabled 
  // but the drafting phase is dead. RIP drafting phase.
  get isDraftActive() {
    return this.draftEnabled && (!this.draftLocked.w || !this.draftLocked.b);
  },

  get isIdentityTheftActive() {
    return this.identityTheftEnabled;
  },

  get isHandAndBrainActive() {
    return this.handAndBrainEnabled && !this.isDraftActive;
  },

  handleBrainBestMove(moveStr) {
    const colChar = moveStr[0];
    const rowChar = moveStr[1];
    const col = colChar.charCodeAt(0) - 'a'.charCodeAt(0);
    const row = '8'.charCodeAt(0) - rowChar.charCodeAt(0);
    const piece = board[row][col];
    if (piece) {
      this.brainSuggestedPiece = piece.type;
      console.log(`Brain suggests piece type: ${piece.type}`);
      if (window.app && window.app.renderAll) {
        window.app.renderAll();
      }
    }
  },

  // 1. Dice Chess logic
  rollDice(color) {
    if (!this.diceChessEnabled) return;
    if (window.webrtc && window.webrtc.active && !window.webrtc.isHost) return;

    let totalPieces = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.color === color) totalPieces++;
      }
    }

    const allMoves = this.getMovesIgnoringDice(color);

    const movableTypes = new Set();
    allMoves.forEach(m => {
      const p = board[m.from.r][m.from.c];
      if (p) p.types.forEach(t => movableTypes.add(t));
    });

    const movableArr = Array.from(movableTypes);

    if (totalPieces <= 2 || movableArr.length <= 2) {
      this.allowedDiceTypes = movableArr;
    } else {
      // Pick 2 random movable types using Fisher-Yates shuffle
      const shuffled = [...movableArr];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      this.allowedDiceTypes = [shuffled[0], shuffled[1]];
    }

    if (window.webrtc && window.webrtc.active && window.webrtc.isHost) {
      window.webrtc.sendData({
        type: 'dice-roll',
        allowedDiceTypes: this.allowedDiceTypes
      });
    }
  },

  getMovesIgnoringDice(color) {
    this.diceChessEnabled = false;
    const moves = allLegalMoves(color, board, enPassantSquare, castling);
    this.diceChessEnabled = true;
    return moves;
  },

  isDicePieceAllowed(piece) {
    if (this.isDiceChessActive && this.allowedDiceTypes.length > 0) {
      const pTypes = piece.types || [piece.type];
      if (!pTypes.some(t => this.allowedDiceTypes.includes(t))) return false;
    }
    if (this.isHandAndBrainActive) {
      if (!this.brainSuggestedPiece) return false;
      const pTypes = piece.types || [piece.type];
      if (!pTypes.includes(this.brainSuggestedPiece)) return false;
    }
    return true;
  },

  // 2. Fog of War visibility map calculation
  getVisibleSquares(playerColor, boardState) {
    const visible = new Set();
    const noCastlingRights = { wK: false, wQ: false, bK: false, bQ: false };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = boardState[r][c];
        if (!p || p.color !== playerColor) continue;

        visible.add(`${r},${c}`);

        const moves = pseudoMoves(r, c, boardState, enPassantSquare, noCastlingRights);
        moves.forEach(m => visible.add(`${m.r},${m.c}`));
      }
    }
    return visible;
  },

  // 3. Salary Cap Draft management
  getPieceCost(type) {
    return PIECE_COSTS[type] ?? 0;
  },

  handleDraftPlace(r, c, color) {
    const isRowValid = color === 'w' ? (r >= 4 && r <= 7) : (r >= 0 && r <= 3);
    if (!isRowValid) return false;

    const existing = board[r][c];

    // Click your own piece to remove it and get points back
    if (existing) {
      if (existing.color !== color) return false;
      this.draftPointsLeft[color] += this.getPieceCost(existing.type);
      board[r][c] = null;
      return true;
    }

    if (!this.draftActivePieceType) return false;

    const cost = this.getPieceCost(this.draftActivePieceType);
    if (this.draftPointsLeft[color] < cost) {
      alert('Not enough points!');
      return false;
    }

    // Only one King is allowed per player
    if (this.draftActivePieceType === 'K') {
      this.removeKingForColor(color);
    }

    board[r][c] = {
      color,
      type: this.draftActivePieceType,
      types: [this.draftActivePieceType]
    };
    this.draftPointsLeft[color] -= cost;
    return true;
  },

  removeKingForColor(color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c]?.type === 'K' && board[r][c]?.color === color) {
          board[r][c] = null;
        }
      }
    }
  },

  lockDraft(color) {
    const hasKing = this.findKingForColor(color) !== null;
    if (!hasKing) {
      alert('You must place your King before locking!');
      return false;
    }
    this.draftLocked[color] = true;
    return true;
  },

  findKingForColor(color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c]?.type === 'K' && board[r][c]?.color === color) {
          return { r, c };
        }
      }
    }
    return null;
  },

  // 4. Identity Theft morphs
  handleIdentityTheft(attacker, captured) {
    if (!this.identityTheftEnabled) return;
    if (attacker.type === 'K') return; // Kings retain their royal status and do not steal identities

    const capTypes = captured.types || [captured.type];

    if (this.identityTheftMode === 'steal') {
      attacker.type = captured.type;
      attacker.types = [...capTypes];
    } else if (this.identityTheftMode === 'append') {
      if (!attacker.types) attacker.types = [attacker.type];

      capTypes.forEach(t => {
        if (!this.isTypeSubsumed(t, attacker.types)) {
          attacker.types.push(t);
        }
      });
      // Sort types by point value so the base type is always the strongest
      attacker.types.sort((a, b) => (PIECE_VALUES[b] || 0) - (PIECE_VALUES[a] || 0));
      attacker.type = attacker.types[0];
    }
  },

  isTypeSubsumed(type, existingTypes) {
    if (existingTypes.includes(type)) return true;
    if (existingTypes.includes('Q') && (type === 'B' || type === 'R' || type === 'P')) return true;
    return false;
  }
};
