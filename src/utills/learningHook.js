import { learningDB } from './autoLearningDB.js';

export function processEngineEvaluation(board, x, y, score) {
  if (x < 0 || x >= 15 || y < 0 || y >= 15) return;
  const WIN_THRESHOLD = 90000;
  const LOSS_THRESHOLD = -90000;

  if (score >= WIN_THRESHOLD) {
    learningDB.learnMove(board, x, y, 'WIN');
  } else if (score <= LOSS_THRESHOLD) {
    learningDB.learnMove(board, x, y, 'LOSS');
  }
}

export function processGameOver(moveHistory, winnerPiece) {
  if (!moveHistory || moveHistory.length === 0) return;
  let tempBoard = Array.from({ length: 15 }, () => Array(15).fill(0));

  for (let i = 0; i < moveHistory.length; i++) {
    const move = moveHistory[i];
    if (i === moveHistory.length - 1 && move.color === winnerPiece) {
      learningDB.learnMove(tempBoard, move.x, move.y, 'WIN');
    }
    tempBoard[move.y][move.x] = move.color;
  }
}