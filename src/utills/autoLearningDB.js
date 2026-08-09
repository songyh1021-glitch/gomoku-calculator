import { getCanonicalBoardHash } from './zobrist.js';

class AutoLearningDB {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('GomokuKnowledgeDB', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('board_states')) {
          db.createObjectStore('board_states', { keyPath: 'hash' });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getStatus(board) {
    await this.initPromise;
    if (!this.db) return [];
    const hash = getCanonicalBoardHash(board);
    return new Promise((resolve) => {
      const tx = this.db.transaction('board_states', 'readonly');
      const store = tx.objectStore('board_states');
      const req = store.get(hash);
      req.onsuccess = () => resolve(req.result ? req.result.moves : []);
      req.onerror = () => resolve([]);
    });
  }

  async learnMove(board, x, y, status) {
    await this.initPromise;
    if (!this.db) return;
    const hash = getCanonicalBoardHash(board);
    const tx = this.db.transaction('board_states', 'readwrite');
    const store = tx.objectStore('board_states');
    const req = store.get(hash);
    
    req.onsuccess = () => {
      let record = req.result || { hash: hash, moves: [] };
      const existingIdx = record.moves.findIndex((m) => m.x === x && m.y === y);
      if (existingIdx >= 0) {
        record.moves[existingIdx].status = status;
      } else {
        record.moves.push({ x, y, status });
      }
      store.put(record);
    };
  }
}

export const learningDB = new AutoLearningDB();