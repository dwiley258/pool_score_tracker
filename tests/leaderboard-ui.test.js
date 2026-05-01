import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    PlayerManager,
    GameManager,
    StatisticsCalculator,
    LeaderboardUI
} from '../app.js';

describe('LeaderboardUI', () => {
    beforeEach(() => {
        // Reset managers
        PlayerManager.players = [];
        GameManager.games = [];
        
        // Mock localStorage
        global.localStorage = {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn()
        };
        
        // Create a mock DOM structure
        document.body.innerHTML = `
            <div id="leaderboard-table"></div>
        `;
    });

    it('should render empty state when no players exist', () => {
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        expect(container.innerHTML).toContain('No players yet');
    });

    it('should render leaderboard table with player statistics', () => {
        // Add players
        const player1 = PlayerManager.addPlayer('Alice');
        const player2 = PlayerManager.addPlayer('Bob');
        const player3 = PlayerManager.addPlayer('Charlie');
        
        // Record some games
        GameManager.recordGame(player1.data.id, player2.data.id, 10, 5);
        GameManager.recordGame(player2.data.id, player3.data.id, 8, 8);
        GameManager.recordGame(player1.data.id, player3.data.id, 7, 9);
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const html = container.innerHTML;
        
        // Check table structure exists
        expect(html).toContain('<table>');
        expect(html).toContain('<thead>');
        expect(html).toContain('<tbody>');
        
        // Check headers
        expect(html).toContain('Rank');
        expect(html).toContain('Player');
        expect(html).toContain('Games');
        expect(html).toContain('Wins');
        expect(html).toContain('Win %');
        
        // Check player names appear
        expect(html).toContain('Alice');
        expect(html).toContain('Bob');
        expect(html).toContain('Charlie');
    });

    it('should highlight top 3 players with top-three class', () => {
        // Add 5 players
        const player1 = PlayerManager.addPlayer('Alice');
        const player2 = PlayerManager.addPlayer('Bob');
        const player3 = PlayerManager.addPlayer('Charlie');
        const player4 = PlayerManager.addPlayer('David');
        const player5 = PlayerManager.addPlayer('Eve');
        
        // Record games to create different win percentages
        GameManager.recordGame(player1.data.id, player2.data.id, 10, 5); // Alice wins
        GameManager.recordGame(player1.data.id, player3.data.id, 10, 5); // Alice wins
        GameManager.recordGame(player2.data.id, player4.data.id, 10, 5); // Bob wins
        GameManager.recordGame(player3.data.id, player5.data.id, 10, 5); // Charlie wins
        GameManager.recordGame(player4.data.id, player5.data.id, 5, 10); // Eve wins
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const topThreeRows = container.querySelectorAll('tr.top-three');
        
        // Should have exactly 3 rows with top-three class
        expect(topThreeRows.length).toBe(3);
    });

    it('should display correct statistics for each player', () => {
        // Add players
        const player1 = PlayerManager.addPlayer('Alice');
        const player2 = PlayerManager.addPlayer('Bob');
        
        // Record games
        GameManager.recordGame(player1.data.id, player2.data.id, 10, 5); // Alice wins
        GameManager.recordGame(player1.data.id, player2.data.id, 8, 12); // Bob wins
        GameManager.recordGame(player1.data.id, player2.data.id, 10, 5); // Alice wins
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const html = container.innerHTML;
        
        // Alice should have 3 games, 2 wins, 66.67% win rate
        expect(html).toContain('66.67%');
        
        // Bob should have 3 games, 1 win, 33.33% win rate
        expect(html).toContain('33.33%');
    });

    it('should order players by win percentage descending', () => {
        // Add players
        const player1 = PlayerManager.addPlayer('Alice');
        const player2 = PlayerManager.addPlayer('Bob');
        const player3 = PlayerManager.addPlayer('Charlie');
        
        // Record games to create specific win percentages
        // Alice: 2 wins out of 2 games = 100%
        GameManager.recordGame(player1.data.id, player2.data.id, 10, 5);
        GameManager.recordGame(player1.data.id, player3.data.id, 10, 5);
        
        // Bob: 1 win out of 2 games = 50%
        GameManager.recordGame(player2.data.id, player3.data.id, 10, 5);
        
        // Charlie: 0 wins out of 3 games = 0%
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const rows = container.querySelectorAll('tbody tr');
        
        // Check order: Alice (rank 1), Bob (rank 2), Charlie (rank 3)
        expect(rows[0].textContent).toContain('Alice');
        expect(rows[0].textContent).toContain('100%');
        
        expect(rows[1].textContent).toContain('Bob');
        expect(rows[1].textContent).toContain('50%');
        
        expect(rows[2].textContent).toContain('Charlie');
        expect(rows[2].textContent).toContain('0%');
    });

    it('should break ties by total wins when win percentages are equal', () => {
        // Add players
        const player1 = PlayerManager.addPlayer('Alice');
        const player2 = PlayerManager.addPlayer('Bob');
        const player3 = PlayerManager.addPlayer('Charlie');
        const player4 = PlayerManager.addPlayer('David');
        
        // Alice: 2 wins out of 2 games = 100%
        GameManager.recordGame(player1.data.id, player3.data.id, 10, 5);
        GameManager.recordGame(player1.data.id, player4.data.id, 10, 5);
        
        // Bob: 1 win out of 1 game = 100%
        GameManager.recordGame(player2.data.id, player3.data.id, 10, 5);
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const rows = container.querySelectorAll('tbody tr');
        
        // Alice should be ranked higher than Bob (both 100%, but Alice has 2 wins vs Bob's 1)
        expect(rows[0].textContent).toContain('Alice');
        expect(rows[0].textContent).toContain('2'); // 2 wins
        
        expect(rows[1].textContent).toContain('Bob');
        expect(rows[1].textContent).toContain('1'); // 1 win
    });

    it('should escape HTML in player names to prevent XSS', () => {
        // Add player with HTML in name
        const player = PlayerManager.addPlayer('<script>alert("xss")</script>');
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const html = container.innerHTML;
        
        // Should contain escaped HTML, not actual script tag
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>alert');
    });
});
