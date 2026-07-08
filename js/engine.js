// --- CHESSOLOGY CORE ENGINE --------------------------------------------------
const FILES = 'abcdefgh';
const PIECE_VALUES = { K: 0, Q: 9, R: 5, B: 3, N: 3, P: 1 };
const INIT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let board = [];
let turn = 'w';
let castling = { wK: true, wQ: true, bK: true, bQ: true };
let enPassantSquare = null;
let halfMoveClock = 0;
let fullMoveNumber = 1;
let selectedSquare = null;
let legal = [];
let moveHistory = [];
let boardHistory = [];
let lastMove = null;
let flipped = false;
let opponentFlipped = false;
let over = false;
let viewIndex = 0;
let liveState = null;

function initBoard(fen) {
  board = Array.from({ length: 8 }, () => Array(8).fill(null));
  fen.split('/').forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        c += +ch;
      } else {
        const type = ch.toUpperCase();
        board[r][c++] = {
          color: ch === type ? 'w' : 'b',
          type: type,
          types: [type]
        };
      }
    }
  });
}

const cloneBoard = b => b.map(r => r.map(s => s ? { ...s, types: s.types ? [...s.types] : [s.type] } : null));

const cloneState = () => ({
  board: cloneBoard(board),
  turn,
  castling: { ...castling },
  enPassantSquare: enPassantSquare ? { ...enPassantSquare } : null,
  halfMoveClock,
  fullMoveNumber,
  lastMove: lastMove ? { ...lastMove } : null,
  dice: window.variants && window.variants.allowedDiceTypes ? [...window.variants.allowedDiceTypes] : null
});

function restoreState(s) {
  board = cloneBoard(s.board);
  turn = s.turn;
  castling = { ...s.castling };
  enPassantSquare = s.enPassantSquare ? { ...s.enPassantSquare } : null;
  halfMoveClock = s.halfMoveClock;
  fullMoveNumber = s.fullMoveNumber;
  lastMove = s.lastMove ? { ...s.lastMove } : null;
  if (window.variants && s.dice) {
    window.variants.allowedDiceTypes = [...s.dice];
  } else if (window.variants) {
    window.variants.allowedDiceTypes = [];
  }
}

const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const isEnemy = (p, col) => p && p.color !== col;
const isFriend = (p, col) => p && p.color === col;

function boardToFen(boardState, activeColor, castlingRights, enPassantSquare) {
  let fenResult = '';
  for (let r = 0; r < 8; r++) {
    let emptySquaresCount = 0;
    for (let c = 0; c < 8; c++) {
      const p = boardState[r][c];
      if (p) {
        if (emptySquaresCount) {
          fenResult += emptySquaresCount;
          emptySquaresCount = 0;
        }
        fenResult += p.color === 'w' ? p.type : p.type.toLowerCase();
      } else {
        emptySquaresCount++;
      }
    }
    if (emptySquaresCount) fenResult += emptySquaresCount;
    if (r < 7) fenResult += '/';
  }
  
  // Why re-verify the King and Rook exist before outputting castling rights in the FEN?
  // Because custom variants like Identity Theft or Draft Mode might have moved or morphed them,
  // leaving the global castling object happily lying to us.
  const canCastleWK = castlingRights.wK && boardState[7][4]?.type === 'K' && boardState[7][4]?.color === 'w' && boardState[7][7]?.type === 'R' && boardState[7][7]?.color === 'w';
  const canCastleWQ = castlingRights.wQ && boardState[7][4]?.type === 'K' && boardState[7][4]?.color === 'w' && boardState[7][0]?.type === 'R' && boardState[7][0]?.color === 'w';
  const canCastleBK = castlingRights.bK && boardState[0][4]?.type === 'K' && boardState[0][4]?.color === 'b' && boardState[0][7]?.type === 'R' && boardState[0][7]?.color === 'b';
  const canCastleBQ = castlingRights.bQ && boardState[0][4]?.type === 'K' && boardState[0][4]?.color === 'b' && boardState[0][0]?.type === 'R' && boardState[0][0]?.color === 'b';
  const castlingString = (canCastleWK ? 'K' : '') + (canCastleWQ ? 'Q' : '') + (canCastleBK ? 'k' : '') + (canCastleBQ ? 'q' : '');
  fenResult += ` ${activeColor} ${castlingString || '-'} ${enPassantSquare ? squareToAlg(enPassantSquare.r, enPassantSquare.c) : '-'}`;
  return fenResult;
}

function positionHistory() {
  const counts = {};
  for (let i = boardHistory.length - 1; i >= 0; i--) {
    const s = boardHistory[i];
    const hash = boardToFen(s.board, s.turn, s.castling, s.enPassantSquare);
    counts[hash] = (counts[hash] || 0) + 1;
    // The halfMoveClock resets on pawn moves or captures. 
    // Since those moves are irreversible, it's physically impossible to repeat any position that occurred before them.
    // So we can safely stop looking backward once we hit a reset.
    if (s.halfMoveClock === 0) break;
  }
  const curr = boardToFen(board, turn, castling, enPassantSquare);
  counts[curr] = (counts[curr] || 0) + 1;
  return counts;
}

function isInsufficientMaterial(b) {
  let wk = 0, bk = 0, wn = 0, bn = 0, wb = [], bb = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const activeTypes = p.types || [p.type];
      if (activeTypes.includes('P') || activeTypes.includes('R') || activeTypes.includes('Q')) return false;
      if (activeTypes.includes('K')) {
        if (p.color === 'w') wk++; else bk++;
      }
      if (activeTypes.includes('N')) {
        if (p.color === 'w') wn++; else bn++;
      }
      if (activeTypes.includes('B')) {
        if (p.color === 'w') wb.push((r + c) % 2); else bb.push((r + c) % 2);
      }
    }
  }
  const wm = wn + wb.length, bm = bn + bb.length;
  if (wm === 0 && bm === 0) return true;
  // King + Minor Piece vs King is a draw because it's impossible to force a mate.
  // Unless your opponent actively helps you mate them, which we don't code for.
  if ((wm === 1 && bm === 0) || (wm === 0 && bm === 1)) return true;
  if (wn === 0 && bn === 0 && wb.length === 1 && bb.length === 1 && wb[0] === bb[0]) return true;
  return false;
}

function movesForPieceType(type, r, c, b, enPassantSquare, castlingRights, color) {
  const ms = [];
  const add = (toRow, toCol, f = {}) => {
    if (inBounds(toRow, toCol)) ms.push({ r: toRow, c: toCol, ...f });
  };
  if (type === 'P') {
    const pawnDir = color === 'w' ? -1 : 1, startRow = color === 'w' ? 6 : 1;
    if (inBounds(r + pawnDir, c) && !b[r + pawnDir][c]) {
      add(r + pawnDir, c);
      if (r === startRow && !b[r + 2 * pawnDir][c]) add(r + 2 * pawnDir, c, { dp: true });
    }
    for (const colDelta of [-1, 1]) {
      if (inBounds(r + pawnDir, c + colDelta)) {
        if (isEnemy(b[r + pawnDir][c + colDelta], color)) add(r + pawnDir, c + colDelta);
        if (enPassantSquare && r + pawnDir === enPassantSquare.r && c + colDelta === enPassantSquare.c) add(r + pawnDir, c + colDelta, { enp: true });
      }
    }
  } else if (type === 'N') {
    for (const [rowDelta, colDelta] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
      if (inBounds(r + rowDelta, c + colDelta) && !isFriend(b[r + rowDelta][c + colDelta], color)) add(r + rowDelta, c + colDelta);
    }
  } else if ('BRQ'.includes(type)) {
    const D = [[-1, -1], [-1, 1], [1, -1], [1, 1]], S = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const dirs = type === 'B' ? D : type === 'R' ? S : [...D, ...S];
    for (const [rowDelta, colDelta] of dirs) {
      for (let i = 1; i < 8; i++) {
        const toRow = r + rowDelta * i, toCol = c + colDelta * i;
        if (!inBounds(toRow, toCol)) break;
        if (isFriend(b[toRow][toCol], color)) break;
        add(toRow, toCol);
        if (isEnemy(b[toRow][toCol], color)) break;
      }
    }
  } else if (type === 'K') {
    for (const [rowDelta, colDelta] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      if (inBounds(r + rowDelta, c + colDelta) && !isFriend(b[r + rowDelta][c + colDelta], color)) add(r + rowDelta, c + colDelta);
    }
    const bk = color === 'w' ? 7 : 0;
    if (r === bk && c === 4) {
      const rookK = b[bk][7];
      const hasRookK = rookK && rookK.color === color && (rookK.type === 'R' || (rookK.types && rookK.types.includes('R')));
      if ((color === 'w' ? castlingRights.wK : castlingRights.bK) && hasRookK && !b[bk][5] && !b[bk][6] && !isAttacked(bk, 4, color, b) && !isAttacked(bk, 5, color, b) && !isAttacked(bk, 6, color, b)) add(bk, 6, { castle: 'K' });
      const rookQ = b[bk][0];
      const hasRookQ = rookQ && rookQ.color === color && (rookQ.type === 'R' || (rookQ.types && rookQ.types.includes('R')));
      if ((color === 'w' ? castlingRights.wQ : castlingRights.bQ) && hasRookQ && !b[bk][3] && !b[bk][2] && !b[bk][1] && !isAttacked(bk, 4, color, b) && !isAttacked(bk, 3, color, b) && !isAttacked(bk, 2, color, b)) add(bk, 2, { castle: 'Q' });
    }
  }
  return ms;
}

function pseudoMoves(r, c, b, enPassantSquare, castlingRights) {
  const p = b[r][c];
  if (!p) return [];
  const { color, type, types } = p;
  const activeTypes = types || [type];
  let ms = [];
  for (const t of activeTypes) {
    ms = ms.concat(movesForPieceType(t, r, c, b, enPassantSquare, castlingRights, color));
  }
  const unique = [];
  const seen = new Set();
  for (const m of ms) {
    const key = `${m.r},${m.c},${m.castle || ''},${m.enp || ''},${m.dp || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }
  return unique;
}

function isAttacked(targetRow, targetCol, color, b) {
  const opp = color === 'w' ? 'b' : 'w';
  const noCast = { wK: false, wQ: false, bK: false, bQ: false };
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const p = b[row][col];
      if (!p || p.color !== opp) continue;

      const activeTypes = p.types || [p.type];
      for (const type of activeTypes) {
        if (type === 'P') {
          // Pawns are weird. movesForPieceType checks if the square is occupied to allow diagonal captures.
          // But a square is still "attacked" by a pawn even if it's empty (e.g., for castling checks). 
          // So we hardcode pawn attack geometry here instead of relying on standard move generation.
          const direction = opp === 'w' ? -1 : 1;
          const isDiagonal = Math.abs(targetCol - col) === 1;
          if (targetRow === row + direction && isDiagonal) {
            return true;
          }
        } else {
          const attacks = movesForPieceType(type, row, col, b, null, noCast, opp);
          if (attacks.some(m => m.r === targetRow && m.c === targetCol)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function findKing(color, b) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (b[r][c]?.type === 'K' && b[r][c]?.color === color) return { r, c };
    }
  }
  return null;
}

function inCheck(color, b) {
  const k = findKing(color, b);
  return k ? isAttacked(k.r, k.c, color, b) : false;
}

function legalMovesForPiece(r, c, b, enPassantSquare, castlingRights, ignoreDice = false) {
  const p = b[r][c];
  if (!p) return [];
  // Dice Chess / Hand and Brain variants - skip non-allowed piece types
  if (!ignoreDice && window.variants && (window.variants.isDiceChessActive || window.variants.isHandAndBrainActive) && !window.variants.isDicePieceAllowed(p)) {
    return [];
  }
  const col = p.color, raw = pseudoMoves(r, c, b, enPassantSquare, castlingRights), res = [];
  for (const m of raw) {
    const simB = applyMv(b, { r, c }, { r: m.r, c: m.c }, m, m.promo);
    // In Fog of War, you are absolutely allowed to walk your King straight into an ambush.
    // It's a feature, not a bug. If you can't see the check, you suffer the consequences.
    if ((window.variants && window.variants.isFogOfWarActive) || !inCheck(col, simB)) {
      res.push(m);
    }
  }
  return res;
}

function allLegalMoves(col, b, enPassantSquare, castlingRights, ignoreDice = false) {
  const ms = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (b[r][c]?.color === col) {
        // Dice Chess / Hand and Brain variants - skip non-allowed piece types
        if (!ignoreDice && window.variants && (window.variants.isDiceChessActive || window.variants.isHandAndBrainActive) && !window.variants.isDicePieceAllowed(b[r][c])) {
          continue;
        }
        const l = legalMovesForPiece(r, c, b, enPassantSquare, castlingRights, ignoreDice);
        l.forEach(m => ms.push({ from: { r, c }, to: m, flags: m, promo: m.promo }));
      }
    }
  }
  return ms;
}

function applyMv(boardState, from, to, flags, promo) {
  const newBoard = cloneBoard(boardState);
  const p = newBoard[from.r][from.c];

  // Identity Theft variant morph handling
  if (window.variants && window.variants.isIdentityTheftActive) {
    let captured = newBoard[to.r][to.c];
    if (flags.enp) {
      const dir = p.color === 'w' ? 1 : -1;
      captured = newBoard[to.r + dir][to.c];
    }
    if (captured) {
      window.variants.handleIdentityTheft(p, captured);
    }
  }

  newBoard[to.r][to.c] = p;
  newBoard[from.r][from.c] = null;

  if (flags.enp) {
    const dir = p.color === 'w' ? 1 : -1;
    newBoard[to.r + dir][to.c] = null;
  }
  if (flags.castle === 'K') {
    const bk = from.r;
    newBoard[bk][5] = newBoard[bk][7];
    newBoard[bk][7] = null;
  }
  if (flags.castle === 'Q') {
    const bk = from.r;
    newBoard[bk][3] = newBoard[bk][0];
    newBoard[bk][0] = null;
  }
  if (promo) {
    p.type = promo;
    if (!p.types) {
      p.types = [promo];
    } else {
      const pIdx = p.types.indexOf('P');
      if (pIdx !== -1) p.types.splice(pIdx, 1);
      if (!p.types.includes(promo)) p.types.push(promo);
      p.types.sort((a, b) => (PIECE_VALUES[b] || 0) - (PIECE_VALUES[a] || 0));
    }
  }
  return newBoard;
}

function squareToAlg(r, c) { return FILES[c] + (8 - r); }

function moveToSAN(from, to, piece, cap, flags, bb, isMate, isChk, promo, enPassantSnapshot, castlingRightsSnapshot) {
  // enPassantSnapshot and castlingRightsSnapshot are pre-move snapshots so SAN disambiguation is accurate
  const _ep = (enPassantSnapshot !== undefined) ? enPassantSnapshot : enPassantSquare;
  const _cast = (castlingRightsSnapshot !== undefined) ? castlingRightsSnapshot : castling;
  if (flags.castle === 'K') return isMate ? 'O-O#' : isChk ? 'O-O+' : 'O-O';
  if (flags.castle === 'Q') return isMate ? 'O-O-O#' : isChk ? 'O-O-O+' : 'O-O-O';
  let s = '';
  const pType = piece.type;
  if (pType === 'P') {
    if (cap || flags.enp) s = FILES[from.c] + 'x';
    s += squareToAlg(to.r, to.c);
    if (promo) s += '=' + promo;
  } else {
    s += pType;
    const amb = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === from.r && c === from.c) continue;
        const p = bb[r][c];
        if (p?.color === piece.color && p?.type === pType && legalMovesForPiece(r, c, bb, _ep, _cast).some(m => m.r === to.r && m.c === to.c)) {
          amb.push({ r, c });
        }
      }
    }
    if (amb.length) {
      if (!amb.some(a => a.c === from.c)) s += FILES[from.c];
      else if (!amb.some(a => a.r === from.r)) s += (8 - from.r);
      else s += FILES[from.c] + (8 - from.r);
    }
    if (cap) s += 'x';
    s += squareToAlg(to.r, to.c);
  }
  return s + (isMate ? '#' : isChk ? '+' : '');
}

// Revokes castling rights for whichever side moved the king or a rook,
// and for any rook square that was captured into.
function updateCastlingAfterMove(piece, from, to) {
  if (piece.type === 'K') {
    if (turn === 'w') { castling.wK = false; castling.wQ = false; }
    else              { castling.bK = false; castling.bQ = false; }
  }
  if (piece.type === 'R') {
    if (from.r === 7 && from.c === 7) castling.wK = false;
    if (from.r === 7 && from.c === 0) castling.wQ = false;
    if (from.r === 0 && from.c === 7) castling.bK = false;
    if (from.r === 0 && from.c === 0) castling.bQ = false;
  }
  
  // Why check where a piece lands (the 'to' square) to revoke castling rights?
  // Because if a rook is captured sitting in its corner, it can obviously no longer castle.
  // Checking the 'to' square catches these captures directly without needing to inspect the target square's previous inhabitant.
  if (to.r === 7 && to.c === 7) castling.wK = false;
  if (to.r === 7 && to.c === 0) castling.wQ = false;
  if (to.r === 0 && to.c === 7) castling.bK = false;
  if (to.r === 0 && to.c === 0) castling.bQ = false;
}

// --- FEN/PGN IMPORT & EXPORT --------------------------------------------------
function isValidFen(fenStr) {
  if (!fenStr) return false;
  const parts = fenStr.trim().split(/\s+/);
  const rows = parts[0].split('/');
  if (rows.length !== 8) return false;

  let wKingCount = 0;
  let bKingCount = 0;

  for (let r = 0; r < 8; r++) {
    const row = rows[r];
    let sum = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        sum += parseInt(ch);
      } else {
        const up = ch.toUpperCase();
        if (/[RNBPQK]/.test(up)) {
          sum += 1;
          if (ch === 'K') wKingCount++;
          else if (ch === 'k') bKingCount++;

          if (up === 'P' && (r === 0 || r === 7)) {
            return false;
          }
        } else {
          return false;
        }
      }
    }
    if (sum !== 8) return false;
  }

  if (wKingCount !== 1 || bKingCount !== 1) return false;

  try {
    const tempBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) {
          c += parseInt(ch);
        } else {
          const color = (ch === ch.toUpperCase()) ? 'w' : 'b';
          tempBoard[r][c] = { type: ch.toUpperCase(), color: color, types: [ch.toUpperCase()] };
          c++;
        }
      }
    }
    const turnChar = (parts[1] && parts[1] === 'b') ? 'b' : 'w';
    const opponentColor = turnChar === 'w' ? 'b' : 'w';
    if (inCheck(opponentColor, tempBoard)) {
      return false;
    }
  } catch (e) {
    return false;
  }

  return true;
}

function importFen(fenStr, silent = false) {
  if (!isValidFen(fenStr)) {
    if (!silent) alert("Invalid FEN string!");
    return false;
  }
  const backup = cloneState();
  try {
    const parts = fenStr.trim().split(/\s+/);
    initBoard(parts[0]);
    turn = (parts[1] && parts[1] === 'b') ? 'b' : 'w';
    castling = { wK: false, wQ: false, bK: false, bQ: false };
    if (parts[2]) {
      if (parts[2].includes('K')) castling.wK = true;
      if (parts[2].includes('Q')) castling.wQ = true;
      if (parts[2].includes('k')) castling.bK = true;
      if (parts[2].includes('q')) castling.bQ = true;
    }
    enPassantSquare = null;
    if (parts[3] && parts[3] !== '-') {
      const file = parts[3].charCodeAt(0) - 97;
      const rank = 8 - parseInt(parts[3].charAt(1));
      if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
        enPassantSquare = { r: rank, c: file };
      }
    }
    halfMoveClock = (parts[4]) ? parseInt(parts[4]) : 0;
    if (isNaN(halfMoveClock)) halfMoveClock = 0;
    fullMoveNumber = (parts[5]) ? parseInt(parts[5]) : 1;
    if (isNaN(fullMoveNumber)) fullMoveNumber = 1;

    // Check if the FEN has a dice chess suffix (7th field or later)
    const dicePart = parts.find(p => p && p.startsWith('d:'));
    if (dicePart) {
      window.variants.diceChessEnabled = true;
      const diceTypes = dicePart.substring(2).split(',').map(s => s.trim()).filter(Boolean);
      window.variants.allowedDiceTypes = diceTypes;
    }

    selectedSquare = null; legal = []; moveHistory = []; boardHistory = []; lastMove = null; over = false;
    if (window.app && window.app.hideResultBanner) window.app.hideResultBanner();
    if (window.app && window.app.renderAll) window.app.renderAll();
    return true;
  } catch (err) {
    restoreState(backup);
    if (!silent) alert("Error parsing FEN: " + err.message);
    if (window.app && window.app.renderAll) window.app.renderAll();
    return false;
  }
}

function exportCurrentFen() {
  let fen = boardToFen(board, turn, castling, enPassantSquare) + ` ${halfMoveClock} ${fullMoveNumber}`;
  if (window.variants && window.variants.isDiceChessActive && window.variants.allowedDiceTypes.length > 0) {
    fen += ` d:${window.variants.allowedDiceTypes.join(',')}`;
  }
  return fen;
}

function exportPgn() {
  let headers = "";
  if (window.app && window.app.generatePgnHeaders) {
    headers = window.app.generatePgnHeaders();
  }

  if (window.app && window.app.exportPgnRecursive) {
    return headers + window.app.exportPgnRecursive(moveHistory);
  }
  let pgn = "";
  for (let i = 0; i < moveHistory.length; i += 2) {
    const num = (i / 2 + 1) + ".";
    const wMove = moveHistory[i]?.san || "";
    const bMove = moveHistory[i + 1]?.san || "";
    pgn += `${num} ${wMove} ${bMove} `.trim() + " ";
  }
  return headers + pgn.trim();
}

function importPgn(pgnStr) {
  const backup = cloneState();
  try {
    const varMatch = pgnStr.match(/\[(?:ChessologyVariant|Variant)\s+"Identity\s+Theft\s+\((.*?)\)"]/i);
    if (varMatch) {
      window.variants.identityTheftEnabled = true;
      window.variants.identityTheftMode = varMatch[1].toLowerCase();
    } else {
      const genericVarMatch = pgnStr.match(/\[(?:ChessologyVariant|Variant)\s+"Identity\s+Theft"]/i);
      if (genericVarMatch) {
        window.variants.identityTheftEnabled = true;
        window.variants.identityTheftMode = 'steal';
      } else {
        window.variants.identityTheftEnabled = false;
      }
    }

    const diceMatch = pgnStr.match(/\[(?:ChessologyVariant|Variant)\s+"Dice\s+Chess"]/i);
    if (diceMatch) {
      window.variants.diceChessEnabled = true;
    } else {
      window.variants.diceChessEnabled = false;
    }

    const draftMatch = pgnStr.match(/\[(?:ChessologyVariant|Variant)\s+"Draft\s+Mode"]/i);
    if (draftMatch) {
      window.variants.draftEnabled = true;
    } else {
      window.variants.draftEnabled = false;
    }

    const fogMatch = pgnStr.match(/\[(?:ChessologyVariant|Variant)\s+"Fog\s+of\s+War"]/i);
    if (fogMatch) {
      window.variants.fogOfWarEnabled = true;
    } else {
      window.variants.fogOfWarEnabled = false;
    }

    const fenMatch = pgnStr.match(/\[FEN\s+"(.*?)"]/i);
    const startingFen = fenMatch ? fenMatch[1].trim() : INIT_FEN;

    if (!importFen(startingFen, true)) {
      throw new Error("Invalid FEN layout in PGN headers");
    }

    const body = pgnStr.replace(/\[.*?\]/g, "").trim();
    const tokenRegex = /(\d+\.+)|(\{([^}]*)\})|(\S+)/g;
    let tokenMatch;
    const parsedMoves = [];

    while ((tokenMatch = tokenRegex.exec(body)) !== null) {
      if (tokenMatch[1]) continue;
      if (tokenMatch[2]) {
        const comment = tokenMatch[3].trim();
        const lastMv = parsedMoves[parsedMoves.length - 1];
        if (lastMv && comment.startsWith("Dice:")) {
          const diceStr = comment.substring(5).trim();
          lastMv.dice = diceStr.split(",").map(s => s.trim()).filter(Boolean);
        }
        continue;
      }
      if (tokenMatch[4]) {
        const tok = tokenMatch[4];
        if (tok === "*" || tok === "1-0" || tok === "0-1" || tok === "1/2-1/2") continue;
        parsedMoves.push({ san: tok, dice: null });
      }
    }

    if (parsedMoves.length === 0) {
      if (window.app && window.app.renderAll) window.app.renderAll();
      return;
    }

    // SAN normalizer - removes annotation noise for robust matching
    const normSan = s => s
      .replace(/[+#]/g, "")
      .replace(/0/g, "O")
      .replace(/[-\u2013\u2014\u2011]/g, "-")
      .replace(/x/g, "")
      .replace(/[=\/()]/g, "")
      .replace(/e\.p\.?/g, "")
      .trim();

    for (const parsedMv of parsedMoves) {
      if (window.variants.isDiceChessActive) {
        window.variants.allowedDiceTypes = parsedMv.dice || [];
      }
      const move = parsedMv.san;
      const nxt = allLegalMoves(turn, board, enPassantSquare, castling);
      let matched = null;
      const candidates = [];

      for (const mv of nxt) {
        const rawFlags = mv.flags;
        const bb = cloneBoard(board);
        const piece = board[mv.from.r][mv.from.c];
        const cap = rawFlags.enp ? { color: turn === 'w' ? 'b' : 'w', type: 'P' } : board[mv.to.r][mv.to.c];
        const simBoard = applyMv(board, mv.from, mv.to, rawFlags, mv.promo);

        const nextTurn = turn === 'w' ? 'b' : 'w';
        const simCast = { ...castling };
        if (piece.type === 'K') { if (turn === 'w') { simCast.wK = false; simCast.wQ = false; } else { simCast.bK = false; simCast.bQ = false; } }
        if (piece.type === 'R') {
          if (mv.from.r === 7 && mv.from.c === 7) simCast.wK = false;
          if (mv.from.r === 7 && mv.from.c === 0) simCast.wQ = false;
          if (mv.from.r === 0 && mv.from.c === 7) simCast.bK = false;
          if (mv.from.r === 0 && mv.from.c === 0) simCast.bQ = false;
        }
        if (mv.to.r === 7 && mv.to.c === 7) simCast.wK = false;
        if (mv.to.r === 7 && mv.to.c === 0) simCast.wQ = false;
        if (mv.to.r === 0 && mv.to.c === 7) simCast.bK = false;
        if (mv.to.r === 0 && mv.to.c === 0) simCast.bQ = false;
        const simEp = rawFlags.dp ? { r: (mv.from.r + mv.to.r) / 2, c: mv.from.c } : null;

        const nextLegal = allLegalMoves(nextTurn, simBoard, simEp, simCast, true);
        const chk = inCheck(nextTurn, simBoard);
        const isMate = nextLegal.length === 0 && chk;

        const san = moveToSAN(mv.from, mv.to, piece, cap, rawFlags, bb, isMate, chk, mv.promo);

        // Tier 1: normalised match (x, =, 0->O, dashes, +, #, e.p., parens all stripped)
        if (normSan(san) === normSan(move) || san === move) {
          matched = { from: mv.from, to: mv.to, flags: rawFlags, promo: mv.promo, piece, cap, san };
          break;
        }
        candidates.push({ san, mv, rawFlags, piece, cap });
      }

      // Tier 2: fuzzy fallback - match by piece-letter + destination square only
      // Handles wrong disambiguation, completely absent/wrong capture markers, etc.
      if (!matched) {
        const nm = normSan(move);
        const dest = nm.slice(-2);
        const pieceLetter = /^[NBRQK]/.test(nm) ? nm[0] : 'P';
        const fuzzy = candidates.filter(c => {
          const ns = normSan(c.san);
          return ns.slice(-2) === dest && (pieceLetter === 'P' ? c.piece.type === 'P' : c.piece.type === pieceLetter);
        });
        if (fuzzy.length === 1) {
          const fz = fuzzy[0];
          matched = { from: fz.mv.from, to: fz.mv.to, flags: fz.rawFlags, promo: fz.mv.promo, piece: fz.piece, cap: fz.cap, san: fz.san };
        }
      }

      if (matched) {
        boardHistory.push(cloneState());
        board = applyMv(board, matched.from, matched.to, matched.flags, matched.promo);

        const { piece, cap, flags: f, from, to } = matched;
        updateCastlingAfterMove(piece, from, to);

        enPassantSquare = f.dp ? { r: (from.r + to.r) / 2, c: from.c } : null;
        if (piece.type === 'P' || cap) halfMoveClock = 0; else halfMoveClock++;

        const prev = turn;
        turn = turn === 'w' ? 'b' : 'w';
        if (prev === 'b') fullMoveNumber++;

        moveHistory.push({
          san: matched.san,
          turn: prev,
          cap,
          dice: window.variants.isDiceChessActive ? [...window.variants.allowedDiceTypes] : null
        });
        lastMove = { from, to };
        viewIndex = moveHistory.length;
      } else {
        console.warn('[PGN] Skipped unrecognised move token:', move);
      }
    }

    if (window.app) {
      const diceToggle = document.getElementById('diceChessToggleOffline');
      if (diceToggle) diceToggle.checked = window.variants.diceChessEnabled;
      
      const theftToggle = document.getElementById('identityTheftToggleOffline');
      if (theftToggle) theftToggle.checked = window.variants.identityTheftEnabled;
      
      if (theftToggle && theftToggle.checked) {
        const theftMode = document.getElementById('identityTheftModeOffline');
        if (theftMode) theftMode.value = window.variants.identityTheftMode || 'steal';
      }

      const draftToggle = document.getElementById('draftModeToggleOffline');
      if (draftToggle) draftToggle.checked = window.variants.draftEnabled;
    }

    selectedSquare = null; legal = [];
    if (window.app && window.app.renderAll) window.app.renderAll();
  } catch (err) {
    restoreState(backup);
    alert("Error importing PGN: " + err.message);
    if (window.app && window.app.renderAll) window.app.renderAll();
  }
}
