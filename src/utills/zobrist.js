const ZOBRIST_TABLE = Array.from({ length: 3 }, () =>
  Array.from({ length: 15 }, () =>
    Array.from({ length: 15 }, () => {
      const high = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
      const low = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
      return (high << 32n) | low;
    })
  )
);

function getSymmetricCoords(x, y, sym) {
  let nx = x;
  let ny = y;
  if (sym & 1) nx = 14 - x;
  if (sym & 2) ny = 14 - y;
  if (sym & 4) [nx, ny] = [ny, nx];
  return { nx, ny };
}

export function getCanonicalBoardHash(board) {
  let minHash = null;
  for (let sym = 0; sym < 8; sym++) {
    let currentHash = 0n;
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const piece = board[y][x];
        if (!piece || piece === 0) continue;
        const { nx, ny } = getSymmetricCoords(x, y, sym);
        currentHash ^= ZOBRIST_TABLE[piece][ny][nx];
      }
    }
    if (minHash === null || currentHash < minHash) {
      minHash = currentHash;
    }
  }
  return "0x" + (minHash || 0n).toString(16).toUpperCase();
}