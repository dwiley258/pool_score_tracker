/**
 * Unit tests for StatisticsCalculator component
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
import { PlayerManager, GameManager, StatisticsCalculator, GroupManager } from '../app.js';

describe('StatisticsCalculator', () => {
    beforeEach(async () => {
        localStorage.clear();
        GroupManager.groups = [{ id: 'test-group', name: 'Test', createdAt: new Date().toISOString(), playerIds: [] }];
        GroupManager.currentGroupId = 'test-group';
        PlayerManager.players = [];
        await PlayerManager.initialize();
        GameManager.games = [];
        await GameManager.initialize();
    });

    describe('calculatePlayerStats', () => {
        it('should calculate correct stats for a player with games', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            const aliceId = result1.data.id;
            const bobId = result2.data.id;
            
            await GameManager.recordGame(aliceId, bobId, 10, 5);
            await GameManager.recordGame(aliceId, bobId, 8, 12);
            await GameManager.recordGame(aliceId, bobId, 15, 10);
            await GameManager.recordGame(aliceId, bobId, 7, 7);
            
            const stats = StatisticsCalculator.calculatePlayerStats(aliceId, GameManager.games);
            
            expect(stats.gamesPlayed).toBe(4);
            expect(stats.wins).toBe(2);
            expect(stats.losses).toBe(1);
            expect(stats.ties).toBe(1);
            expect(stats.winPercentage).toBe(50.00);
        });

        it('should return zero stats for player with no games', async () => {
            const result = await PlayerManager.addPlayer('Alice');
            const aliceId = result.data.id;
            
            const stats = StatisticsCalculator.calculatePlayerStats(aliceId, GameManager.games);
            
            expect(stats.gamesPlayed).toBe(0);
            expect(stats.wins).toBe(0);
            expect(stats.losses).toBe(0);
            expect(stats.ties).toBe(0);
            expect(stats.winPercentage).toBe(0);
        });

        it('should calculate win percentage correctly', async () => {
            const result1 = await PlayerManager.addPlayer('Alice');
            const result2 = await PlayerManager.addPlayer('Bob');
            const aliceId = result1.data.id;
            const bobId = result2.data.id;
            
            await GameManager.recordGame(aliceId, bobId, 10, 5);
            await GameManager.recordGame(aliceId, bobId, 8, 12);
            await GameManager.recordGame(aliceId, bobId, 15, 10);
            await GameManager.recordGame(aliceId, bobId, 20, 15);
            
            const stats = StatisticsCalculator.calculatePlayerStats(aliceId, GameManager.games);
            
            expect(stats.winPercentage).toBe(75.00);
        });
    });

    describe('generateLeaderboard', () => {
        it('should sort players by win percentage descending', async () => {
            const alice = (await PlayerManager.addPlayer('Alice')).data;
            const bob = (await PlayerManager.addPlayer('Bob')).data;
            const charlie = (await PlayerManager.addPlayer('Charlie')).data;
            
            await GameManager.recordGame(alice.id, bob.id, 10, 5);
            await GameManager.recordGame(alice.id, bob.id, 10, 5);
            await GameManager.recordGame(alice.id, bob.id, 10, 5);
            await GameManager.recordGame(alice.id, bob.id, 5, 10);
            await GameManager.recordGame(bob.id, charlie.id, 10, 5);
            await GameManager.recordGame(charlie.id, alice.id, 10, 5);
            await GameManager.recordGame(charlie.id, alice.id, 10, 5);
            await GameManager.recordGame(charlie.id, alice.id, 10, 5);
            await GameManager.recordGame(charlie.id, alice.id, 10, 5);
            
            const leaderboard = StatisticsCalculator.generateLeaderboard(PlayerManager.players);
            
            expect(leaderboard.length).toBe(3);
            expect(leaderboard[0].player.name).toBe('Charlie');
            expect(leaderboard[0].rank).toBe(1);
            expect(leaderboard[1].player.name).toBe('Bob');
            expect(leaderboard[1].rank).toBe(2);
            expect(leaderboard[2].player.name).toBe('Alice');
            expect(leaderboard[2].rank).toBe(3);
        });

        it('should break ties by total wins', async () => {
            const alice = (await PlayerManager.addPlayer('Alice')).data;
            const bob = (await PlayerManager.addPlayer('Bob')).data;
            const charlie = (await PlayerManager.addPlayer('Charlie')).data;
            
            await GameManager.recordGame(alice.id, charlie.id, 10, 5);
            await GameManager.recordGame(alice.id, charlie.id, 10, 5);
            await GameManager.recordGame(alice.id, charlie.id, 5, 10);
            await GameManager.recordGame(alice.id, charlie.id, 5, 10);
            await GameManager.recordGame(bob.id, charlie.id, 10, 5);
            await GameManager.recordGame(bob.id, charlie.id, 5, 10);
            
            const leaderboard = StatisticsCalculator.generateLeaderboard(PlayerManager.players);
            
            const aliceRank = leaderboard.find(e => e.player.name === 'Alice').rank;
            const bobRank = leaderboard.find(e => e.player.name === 'Bob').rank;
            
            expect(aliceRank).toBeLessThan(bobRank);
        });

        it('should handle empty player list', () => {
            const leaderboard = StatisticsCalculator.generateLeaderboard([]);
            expect(leaderboard.length).toBe(0);
        });
    });

    describe('recalculateAllStats', () => {
        it('should update player statistics based on game history', async () => {
            const alice = (await PlayerManager.addPlayer('Alice')).data;
            const bob = (await PlayerManager.addPlayer('Bob')).data;
            
            await GameManager.recordGame(alice.id, bob.id, 10, 5);
            await GameManager.recordGame(alice.id, bob.id, 8, 12);
            
            alice.gamesPlayed = 999;
            alice.wins = 999;
            
            StatisticsCalculator.recalculateAllStats(PlayerManager.players, GameManager.games);
            
            expect(alice.gamesPlayed).toBe(2);
            expect(alice.wins).toBe(1);
        });

        it('should handle players with no games', async () => {
            const alice = (await PlayerManager.addPlayer('Alice')).data;
            
            alice.gamesPlayed = 5;
            alice.wins = 3;
            
            StatisticsCalculator.recalculateAllStats(PlayerManager.players, GameManager.games);
            
            expect(alice.gamesPlayed).toBe(0);
            expect(alice.wins).toBe(0);
        });
    });
});
