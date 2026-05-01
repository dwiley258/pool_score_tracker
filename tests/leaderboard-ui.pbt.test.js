/**
 * Property-Based Tests for LeaderboardUI
 * Feature: pool-score-tracker
 * Uses fast-check for property-based testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
    PlayerManager,
    GameManager,
    StatisticsCalculator,
    LeaderboardUI
} from '../app.js';

// Mock localStorage for Node.js environment
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();

global.localStorage = localStorageMock;

describe('LeaderboardUI - Property-Based Tests', () => {
    beforeEach(() => {
        // Reset managers
        PlayerManager.players = [];
        GameManager.games = [];
        localStorage.clear();
        
        // Create a mock DOM structure
        document.body.innerHTML = `
            <div id="leaderboard-table"></div>
        `;
    });

    /**
     * Property 16: Leaderboard Top Three Highlighting
     * Feature: pool-score-tracker, Property 16: Leaderboard Top Three Highlighting
     * Validates: Requirements 6.5
     * 
     * For any leaderboard with at least 3 players, the top three ranked players 
     * should have a visual highlight indicator in the rendered output.
     */
    it('Property 16: Leaderboard Top Three Highlighting - top 3 players have highlight indicator', () => {
        // Arbitrary for generating random leaderboards with varying player counts and game results
        const leaderboardScenario = fc.record({
            playerCount: fc.integer({ min: 3, max: 20 }), // At least 3 players for meaningful test
            gameResults: fc.array(
                fc.record({
                    player1Index: fc.nat(),
                    player2Index: fc.nat(),
                    score1: fc.integer({ min: 0, max: 20 }),
                    score2: fc.integer({ min: 0, max: 20 })
                }),
                { minLength: 3, maxLength: 50 } // Generate 3-50 games
            )
        });

        // Property: Top 3 ranked players should have the 'top-three' class
        fc.assert(
            fc.property(leaderboardScenario, (scenario) => {
                // Reset state for each iteration
                PlayerManager.players = [];
                GameManager.games = [];
                localStorage.clear();

                // Add players
                const players = [];
                for (let i = 0; i < scenario.playerCount; i++) {
                    const result = PlayerManager.addPlayer(`Player${i}`);
                    if (result.success) {
                        players.push(result.data);
                    }
                }

                // Skip if we couldn't add enough players
                if (players.length < 3) {
                    return true;
                }

                // Record games based on generated game results
                for (const gameResult of scenario.gameResults) {
                    // Ensure different players are selected
                    const player1Index = gameResult.player1Index % players.length;
                    let player2Index = gameResult.player2Index % players.length;
                    
                    // Ensure player2 is different from player1
                    if (player1Index === player2Index) {
                        player2Index = (player2Index + 1) % players.length;
                    }

                    const player1 = players[player1Index];
                    const player2 = players[player2Index];

                    GameManager.recordGame(
                        player1.id,
                        player2.id,
                        gameResult.score1,
                        gameResult.score2
                    );
                }

                // Render the leaderboard
                LeaderboardUI.render();

                // Get the rendered leaderboard container
                const container = document.getElementById('leaderboard-table');
                const topThreeRows = container.querySelectorAll('tr.top-three');

                // Property assertion: Should have exactly 3 rows with top-three class
                // (or fewer if there are fewer than 3 players, but we ensured at least 3)
                const expectedTopThreeCount = Math.min(3, players.length);
                expect(topThreeRows.length).toBe(expectedTopThreeCount);

                // Property assertion: The top-three class should be on the first 3 rows in tbody
                const tbodyRows = container.querySelectorAll('tbody tr');
                
                // Verify that the first 3 rows have the top-three class
                for (let i = 0; i < expectedTopThreeCount; i++) {
                    expect(tbodyRows[i].classList.contains('top-three')).toBe(true);
                }

                // Property assertion: Rows beyond the top 3 should NOT have the top-three class
                for (let i = expectedTopThreeCount; i < tbodyRows.length; i++) {
                    expect(tbodyRows[i].classList.contains('top-three')).toBe(false);
                }

                // Property assertion: Verify the leaderboard is properly ordered
                // (top-three should correspond to ranks 1, 2, 3)
                const leaderboard = StatisticsCalculator.generateLeaderboard(players);
                
                for (let i = 0; i < Math.min(3, leaderboard.length); i++) {
                    const entry = leaderboard[i];
                    const row = tbodyRows[i];
                    
                    // Verify rank is 1, 2, or 3
                    expect(entry.rank).toBeLessThanOrEqual(3);
                    
                    // Verify the row contains the player's name
                    expect(row.textContent).toContain(entry.player.name);
                    
                    // Verify the row has the top-three class
                    expect(row.classList.contains('top-three')).toBe(true);
                }
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });

    /**
     * Additional property test: Leaderboard with fewer than 3 players
     * Ensures the system handles edge cases gracefully
     */
    it('Property 16 (Edge Case): Leaderboard with fewer than 3 players highlights all players', () => {
        // Arbitrary for generating leaderboards with 0-2 players
        const smallLeaderboardScenario = fc.record({
            playerCount: fc.integer({ min: 0, max: 2 }),
            gameResults: fc.array(
                fc.record({
                    player1Index: fc.nat(),
                    player2Index: fc.nat(),
                    score1: fc.integer({ min: 0, max: 20 }),
                    score2: fc.integer({ min: 0, max: 20 })
                }),
                { minLength: 0, maxLength: 10 }
            )
        });

        fc.assert(
            fc.property(smallLeaderboardScenario, (scenario) => {
                // Reset state for each iteration
                PlayerManager.players = [];
                GameManager.games = [];
                localStorage.clear();

                // Add players
                const players = [];
                for (let i = 0; i < scenario.playerCount; i++) {
                    const result = PlayerManager.addPlayer(`Player${i}`);
                    if (result.success) {
                        players.push(result.data);
                    }
                }

                // Record games if we have at least 2 players
                if (players.length >= 2) {
                    for (const gameResult of scenario.gameResults) {
                        const player1Index = gameResult.player1Index % players.length;
                        let player2Index = gameResult.player2Index % players.length;
                        
                        if (player1Index === player2Index) {
                            player2Index = (player2Index + 1) % players.length;
                        }

                        const player1 = players[player1Index];
                        const player2 = players[player2Index];

                        GameManager.recordGame(
                            player1.id,
                            player2.id,
                            gameResult.score1,
                            gameResult.score2
                        );
                    }
                }

                // Render the leaderboard
                LeaderboardUI.render();

                // Get the rendered leaderboard container
                const container = document.getElementById('leaderboard-table');
                
                // If no players, should show empty state
                if (players.length === 0) {
                    expect(container.innerHTML).toContain('No players yet');
                    return true;
                }

                const topThreeRows = container.querySelectorAll('tr.top-three');

                // Property assertion: Should highlight all players if fewer than 3
                expect(topThreeRows.length).toBe(players.length);

                // Property assertion: All rows should have the top-three class
                const tbodyRows = container.querySelectorAll('tbody tr');
                for (let i = 0; i < tbodyRows.length; i++) {
                    expect(tbodyRows[i].classList.contains('top-three')).toBe(true);
                }
            }),
            { numRuns: 100 }
        );
    });
});
