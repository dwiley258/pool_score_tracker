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
import { PlayerManager, GameManager, StatisticsCalculator } from '../app.js';

describe('StatisticsCalculator', () => {
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

    describe('calculatePlayerStats', () => {
        it('should calculate correct stats for a player with games', () => {
            // Add players
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            const aliceId = result1.data.id;
            const bobId = result2.data.id;
            
            // Record games: Alice wins 2, loses 1, ties 1
            GameManager.recordGame(aliceId, bobId, 10, 5);  // Alice wins
            GameManager.recordGame(aliceId, bobId, 8, 12);  // Alice loses
            GameManager.recordGame(aliceId, bobId, 15, 10); // Alice wins
            GameManager.recordGame(aliceId, bobId, 7, 7);   // Tie
            
            const stats = StatisticsCalculator.calculatePlayerStats(aliceId, GameManager.games);
            
            expect(stats.gamesPlayed).toBe(4);
            expect(stats.wins).toBe(2);
            expect(stats.losses).toBe(1);
            expect(stats.ties).toBe(1);
            expect(stats.winPercentage).toBe(50.00);
        });

        it('should return zero stats for player with no games', () => {
            const result = PlayerManager.addPlayer('Alice');
            const aliceId = result.data.id;
            
            const stats = StatisticsCalculator.calculatePlayerStats(aliceId, GameManager.games);
            
            expect(stats.gamesPlayed).toBe(0);
            expect(stats.wins).toBe(0);
            expect(stats.losses).toBe(0);
            expect(stats.ties).toBe(0);
            expect(stats.winPercentage).toBe(0);
        });

        it('should calculate win percentage correctly', () => {
            const result1 = PlayerManager.addPlayer('Alice');
            const result2 = PlayerManager.addPlayer('Bob');
            const aliceId = result1.data.id;
            const bobId = result2.data.id;
            
            // Alice wins 3 out of 4 games = 75%
            GameManager.recordGame(aliceId, bobId, 10, 5);
            GameManager.recordGame(aliceId, bobId, 8, 12);
            GameManager.recordGame(aliceId, bobId, 15, 10);
            GameManager.recordGame(aliceId, bobId, 20, 15);
            
            const stats = StatisticsCalculator.calculatePlayerStats(aliceId, GameManager.games);
            
            expect(stats.winPercentage).toBe(75.00);
        });
    });

    describe('generateLeaderboard', () => {
        it('should sort players by win percentage descending', () => {
            const alice = PlayerManager.addPlayer('Alice').data;
            const bob = PlayerManager.addPlayer('Bob').data;
            const charlie = PlayerManager.addPlayer('Charlie').data;
            
            // Alice plays 8 games total: 3 wins vs Bob, 0 wins vs Charlie = 3/8 = 37.5%
            GameManager.recordGame(alice.id, bob.id, 10, 5);   // Alice wins
            GameManager.recordGame(alice.id, bob.id, 10, 5);   // Alice wins
            GameManager.recordGame(alice.id, bob.id, 10, 5);   // Alice wins
            GameManager.recordGame(alice.id, bob.id, 5, 10);   // Bob wins
            
            // Bob plays 5 games total: 1 win vs Alice, 1 win vs Charlie = 2/5 = 40%
            GameManager.recordGame(bob.id, charlie.id, 10, 5); // Bob wins
            
            // Charlie plays 5 games total: 4 wins vs Alice, 0 wins vs Bob = 4/5 = 80%
            GameManager.recordGame(charlie.id, alice.id, 10, 5); // Charlie wins
            GameManager.recordGame(charlie.id, alice.id, 10, 5); // Charlie wins
            GameManager.recordGame(charlie.id, alice.id, 10, 5); // Charlie wins
            GameManager.recordGame(charlie.id, alice.id, 10, 5); // Charlie wins
            
            const leaderboard = StatisticsCalculator.generateLeaderboard(PlayerManager.players);
            
            expect(leaderboard.length).toBe(3);
            // Expected order: Charlie (80%), Bob (40%), Alice (37.5%)
            expect(leaderboard[0].player.name).toBe('Charlie');
            expect(leaderboard[0].rank).toBe(1);
            expect(leaderboard[1].player.name).toBe('Bob');
            expect(leaderboard[1].rank).toBe(2);
            expect(leaderboard[2].player.name).toBe('Alice');
            expect(leaderboard[2].rank).toBe(3);
        });

        it('should break ties by total wins', () => {
            const alice = PlayerManager.addPlayer('Alice').data;
            const bob = PlayerManager.addPlayer('Bob').data;
            const charlie = PlayerManager.addPlayer('Charlie').data;
            
            // Alice: 2/4 = 50%, 2 wins
            GameManager.recordGame(alice.id, charlie.id, 10, 5);
            GameManager.recordGame(alice.id, charlie.id, 10, 5);
            GameManager.recordGame(alice.id, charlie.id, 5, 10);
            GameManager.recordGame(alice.id, charlie.id, 5, 10);
            
            // Bob: 1/2 = 50%, 1 win
            GameManager.recordGame(bob.id, charlie.id, 10, 5);
            GameManager.recordGame(bob.id, charlie.id, 5, 10);
            
            const leaderboard = StatisticsCalculator.generateLeaderboard(PlayerManager.players);
            
            // Alice should rank higher than Bob (same %, but more wins)
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
        it('should update player statistics based on game history', () => {
            const alice = PlayerManager.addPlayer('Alice').data;
            const bob = PlayerManager.addPlayer('Bob').data;
            
            // Record games
            GameManager.recordGame(alice.id, bob.id, 10, 5);
            GameManager.recordGame(alice.id, bob.id, 8, 12);
            
            // Manually corrupt stats
            alice.gamesPlayed = 999;
            alice.wins = 999;
            
            // Recalculate
            StatisticsCalculator.recalculateAllStats(PlayerManager.players, GameManager.games);
            
            // Stats should be corrected
            expect(alice.gamesPlayed).toBe(2);
            expect(alice.wins).toBe(1);
        });

        it('should handle players with no games', () => {
            const alice = PlayerManager.addPlayer('Alice').data;
            
            alice.gamesPlayed = 5;
            alice.wins = 3;
            
            StatisticsCalculator.recalculateAllStats(PlayerManager.players, GameManager.games);
            
            expect(alice.gamesPlayed).toBe(0);
            expect(alice.wins).toBe(0);
        });
    });
});

console.log('StatisticsCalculator unit tests defined. Run in browser with test framework.');
