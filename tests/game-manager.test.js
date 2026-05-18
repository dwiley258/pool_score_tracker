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
import { PlayerManager, GameManager, GroupManager } from '../app.js';

describe('GameManager', () => {
    beforeEach(async () => {
        localStorage.clear();
        GroupManager.groups = [{ id: 'test-group', name: 'Test', createdAt: new Date().toISOString(), playerIds: [] }];
        GroupManager.currentGroupId = 'test-group';
        PlayerManager.players = [];
        await PlayerManager.initialize();
        GameManager.games = [];
        await GameManager.initialize();
    });

    describe('recordGame', () => {
        it('should record a game between two different players', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            
            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            
            const player1Id = result1.data.id;
            const player2Id = result2.data.id;
            
            const gameResult = await GameManager.recordGame(player1Id, player2Id, 10, 5);
            
            expect(gameResult.success).toBe(true);
            expect(gameResult.data).toBeDefined();
            expect(gameResult.data.player1Id).toBe(player1Id);
            expect(gameResult.data.player2Id).toBe(player2Id);
            expect(gameResult.data.player1Score).toBe(10);
            expect(gameResult.data.player2Score).toBe(5);
            expect(gameResult.data.winnerId).toBe(player1Id);
        });

        it('should reject game between same player', async () => {
            const result = await PlayerManager.addPlayer('Alice');
            const playerId = result.data.id;
            
            const gameResult = await GameManager.recordGame(playerId, playerId, 10, 5);
            
            expect(gameResult.success).toBe(false);
            expect(gameResult.error).toBe('Cannot record game between same player');
        });

        it('should reject negative scores', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            
            const gameResult = await GameManager.recordGame(result1.data.id, result2.data.id, -5, 10);
            
            expect(gameResult.success).toBe(false);
            expect(gameResult.error).toBe('Scores must be non-negative integers');
        });

        it('should handle tie games correctly', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            
            const gameResult = await GameManager.recordGame(result1.data.id, result2.data.id, 10, 10);
            
            expect(gameResult.success).toBe(true);
            expect(gameResult.data.winnerId).toBe(null);
        });

        it('should update player statistics', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            
            const player1 = PlayerManager.getPlayer(result1.data.id);
            const player2 = PlayerManager.getPlayer(result2.data.id);
            
            expect(player1.gamesPlayed).toBe(0);
            expect(player1.wins).toBe(0);
            
            await GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            
            expect(player1.gamesPlayed).toBe(1);
            expect(player1.wins).toBe(1);
            expect(player2.gamesPlayed).toBe(1);
            expect(player2.wins).toBe(0);
        });
    });

    describe('deleteGame', () => {
        it('should delete a game by ID', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            
            const gameResult = await GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            const gameId = gameResult.data.id;
            
            expect(GameManager.games.length).toBe(1);
            
            const deleteResult = await GameManager.deleteGame(gameId);
            
            expect(deleteResult.success).toBe(true);
            expect(GameManager.games.length).toBe(0);
        });

        it('should update player statistics when deleting game', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            
            const gameResult = await GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            
            const player1 = PlayerManager.getPlayer(result1.data.id);
            expect(player1.gamesPlayed).toBe(1);
            expect(player1.wins).toBe(1);
            
            await GameManager.deleteGame(gameResult.data.id);
            
            expect(player1.gamesPlayed).toBe(0);
            expect(player1.wins).toBe(0);
        });

        it('should return error for non-existent game', async () => {
            const deleteResult = await GameManager.deleteGame('non-existent-id');
            
            expect(deleteResult.success).toBe(false);
            expect(deleteResult.error).toBe('Game does not exist');
        });
    });

    describe('getGameHistory', () => {
        it('should return all games in reverse chronological order', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            
            const game1 = await GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            const game2 = await GameManager.recordGame(result1.data.id, result2.data.id, 8, 12);
            const game3 = await GameManager.recordGame(result1.data.id, result2.data.id, 15, 10);
            
            const history = GameManager.getGameHistory();
            
            expect(history.length).toBe(3);
            
            const gameIds = history.map(g => g.id);
            expect(gameIds).toContain(game1.data.id);
            expect(gameIds).toContain(game2.data.id);
            expect(gameIds).toContain(game3.data.id);
            
            for (let i = 0; i < history.length - 1; i++) {
                const time1 = new Date(history[i].timestamp).getTime();
                const time2 = new Date(history[i + 1].timestamp).getTime();
                expect(time1).toBeGreaterThanOrEqual(time2);
            }
        });

        it('should filter games by player ID', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            const result3 = await PlayerManager.addPlayer('Charlie');
            
            await GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
            await GameManager.recordGame(result1.data.id, result3.data.id, 8, 12);
            await GameManager.recordGame(result2.data.id, result3.data.id, 15, 10);
            
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
        it('should return game by ID', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            
            const gameResult = await GameManager.recordGame(result1.data.id, result2.data.id, 10, 5);
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
