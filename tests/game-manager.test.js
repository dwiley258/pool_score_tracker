/**
 * Unit tests for GameManager component
 * Feature: pool-score-tracker
 */

// Mock localStorage for testing
const mockLocalStorage = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();

global.localStorage = mockLocalStorage;

// Import modules from app.js
import { PlayerManager, GameManager } from '../app.js';

describe('GameManager', () => {
    beforeEach(() => {
        // Clear storage and reset state
        localStorage.clear();
        if (typeof PlayerManager !== 'undefined') {
            PlayerManager.players = [];
            PlayerManager.initialize();
        }
        if (typeof GameManager !== 'undefined') {
            GameManager.games = [];
            GameManager.initialize();
        }
    });

    describe('recordGame', () => {
        it('should record a game between two different players', () => {
            // Add two players
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            
            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            
            const player1Id = result1.data.id;
            const player2Id = result2.data.id;
            
            // Record a game
            const gameResult = GameManager.recordGame(player1Id, player2Id, 10, 5);
            
            expect(gameResult.success).toBe(true);
            expect(gameResult.data).toBeDefined();
            expect(gameResult.data.player1Id).toBe(player1Id);
            expect(gameResult.data.player2Id).toBe(player2Id);
            expect(gameResult.data.player1Score).toBe(10);
            expect(gameResult.data.player2Score).toBe(5);
            expect(gameResult.data.winnerId).toBe(player1Id);
        });

        it('should reject game between same player', () => {
            const result = PlayerManager.addPlayer('Alice');
            const playerId = result.data.id;
            
            const gameResult = GameManager.recordGame(playerId, playerId, 10, 5);
            
            expect(gameResult.success).toBe(false);
            expect(gameResult.error).toBe('Cannot record game between same player');
        });

        it('should reject negative scores', () => {
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            
            const gameResult = GameManager.recordGame(result1.data.id, result2.data.id, -5, 10);
            
            expect(gameResult.success).toBe(false);
            expect(gameResult.error).toBe('Scores must be non-negative integers');
        });

        it('should handle tie games correctly', () => {
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            
            const gameResult = GameManager.recordGame(result1.data.id, result2.data.id, 10, 10);
            
            expect(gameResult.success).toBe(true);
            expect(gameResult.data.winnerId).toBe(null);
        });

        it('should update player statistics', () => {
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            
            const player1 = PlayerManager.getPlayer(result1.data.id);
            const player2 = PlayerManager.getPlayer(result2.data.id);
            
            expect(player1.gamesPlayed).toBe(0);
            expect(player1.wins).toBe(0);
            
            GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            
            expect(player1.gamesPlayed).toBe(1);
            expect(player1.wins).toBe(1);
            expect(player2.gamesPlayed).toBe(1);
            expect(player2.wins).toBe(0);
        });
    });

    describe('deleteGame', () => {
        it('should delete a game by ID', () => {
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            
            const gameResult = GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            const gameId = gameResult.data.id;
            
            expect(GameManager.games.length).toBe(1);
            
            const deleteResult = GameManager.deleteGame(gameId);
            
            expect(deleteResult.success).toBe(true);
            expect(GameManager.games.length).toBe(0);
        });

        it('should update player statistics when deleting game', () => {
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            
            const gameResult = GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            
            const player1 = PlayerManager.getPlayer(result1.data.id);
            expect(player1.gamesPlayed).toBe(1);
            expect(player1.wins).toBe(1);
            
            GameManager.deleteGame(gameResult.data.id);
            
            expect(player1.gamesPlayed).toBe(0);
            expect(player1.wins).toBe(0);
        });

        it('should return error for non-existent game', () => {
            const deleteResult = GameManager.deleteGame('non-existent-id');
            
            expect(deleteResult.success).toBe(false);
            expect(deleteResult.error).toBe('Game does not exist');
        });
    });

    describe('getGameHistory', () => {
        it('should return all games in reverse chronological order', () => {
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            
            // Record multiple games - they will be in the games array in insertion order
            const game1 = GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            const game2 = GameManager.recordGame(result1.data.id, result2.data.id, 8, 12);
            const game3 = GameManager.recordGame(result1.data.id, result2.data.id, 15, 10);
            
            const history = GameManager.getGameHistory();
            
            expect(history.length).toBe(3);
            
            // Verify all games are present
            const gameIds = history.map(g => g.id);
            expect(gameIds).toContain(game1.data.id);
            expect(gameIds).toContain(game2.data.id);
            expect(gameIds).toContain(game3.data.id);
            
            // Verify they are sorted by timestamp (newest first)
            // Since games might have the same timestamp, we check that timestamps are non-increasing
            for (let i = 0; i < history.length - 1; i++) {
                const time1 = new Date(history[i].timestamp).getTime();
                const time2 = new Date(history[i + 1].timestamp).getTime();
                expect(time1).toBeGreaterThanOrEqual(time2);
            }
        });

        it('should filter games by player ID', () => {
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            const result3 = PlayerManager.addPlayer('Charlie');
            
            GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            GameManager.recordGame(result1.data.id, result3.data.id, 8, 12);
            GameManager.recordGame(result2.data.id, result3.data.id, 15, 10);
            
            const aliceGames = GameManager.getGameHistory(result1.data.id);
            
            expect(aliceGames.length).toBe(2);
            aliceGames.forEach(game => {
                expect(
                    game.player1Id === result1.data.id || game.player2Id === result1.data.id
                ).toBe(true);
            });
        });

        it('should return empty array when no games exist', () => {
            const history = GameManager.getGameHistory();
            expect(history.length).toBe(0);
        });
    });

    describe('getGameById', () => {
        it('should return game by ID', () => {
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            
            const gameResult = GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            const gameId = gameResult.data.id;
            
            const game = GameManager.getGameById(gameId);
            
            expect(game).toBeDefined();
            expect(game.id).toBe(gameId);
        });

        it('should return null for non-existent game', () => {
            const game = GameManager.getGameById('non-existent-id');
            expect(game).toBe(null);
        });
    });
});

console.log('GameManager unit tests defined. Run in browser with test framework.');
