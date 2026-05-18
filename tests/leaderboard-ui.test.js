import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    PlayerManager,
    GameManager,
    GroupManager,
    StatisticsCalculator,
    LeaderboardUI
} from '../app.js';

describe('LeaderboardUI', () => {
    beforeEach(() => {
        GroupManager.groups = [{ id: 'test-group', name: 'Test', createdAt: new Date().toISOString(), playerIds: [] }];
        GroupManager.currentGroupId = 'test-group';
        PlayerManager.players = [];
        GameManager.games = [];
        
        document.body.innerHTML = `
            <div id="leaderboard-table"></div>
        `;
    });

    it('should render leaderboard table with player statistics', async () => {
        const player1 = await PlayerManager.addPlayer('Alice');
        const player2 = await PlayerManager.addPlayer('Bob');
        const player3 = await PlayerManager.addPlayer('Charlie');
        
        await GameManager.recordGame(player1.data.id, player2.data.id, 10, 5);
        await GameManager.recordGame(player2.data.id, player3.data.id, 8, 8);
        await GameManager.recordGame(player1.data.id, player3.data.id, 7, 9);
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const html = container.innerHTML;
        
        expect(html).toContain('<table>');
        expect(html).toContain('Alice');
        expect(html).toContain('Bob');
        expect(html).toContain('Charlie');
    });

    it('should highlight top 3 players with top-three class', async () => {
        const player1 = await PlayerManager.addPlayer('Alice');
        const player2 = await PlayerManager.addPlayer('Bob');
        const player3 = await PlayerManager.addPlayer('Charlie');
        const player4 = await PlayerManager.addPlayer('David');
        const player5 = await PlayerManager.addPlayer('Eve');
        
        await GameManager.recordGame(player1.data.id, player2.data.id, 10, 5);
        await GameManager.recordGame(player1.data.id, player3.data.id, 10, 5);
        await GameManager.recordGame(player2.data.id, player4.data.id, 10, 5);
        await GameManager.recordGame(player3.data.id, player5.data.id, 10, 5);
        await GameManager.recordGame(player4.data.id, player5.data.id, 5, 10);
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const topThreeRows = container.querySelectorAll('tr.top-three');
        
        expect(topThreeRows.length).toBe(3);
    });

    it('should display correct statistics for each player', async () => {
        const player1 = await PlayerManager.addPlayer('Alice');
        const player2 = await PlayerManager.addPlayer('Bob');
        
        await GameManager.recordGame(player1.data.id, player2.data.id, 10, 5);
        await GameManager.recordGame(player1.data.id, player2.data.id, 8, 12);
        await GameManager.recordGame(player1.data.id, player2.data.id, 10, 5);
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const html = container.innerHTML;
        
        expect(html).toContain('66.67%');
        expect(html).toContain('33.33%');
    });

    it('should order players by win percentage descending', async () => {
        const player1 = await PlayerManager.addPlayer('Alice');
        const player2 = await PlayerManager.addPlayer('Bob');
        const player3 = await PlayerManager.addPlayer('Charlie');
        
        await GameManager.recordGame(player1.data.id, player2.data.id, 10, 5);
        await GameManager.recordGame(player1.data.id, player3.data.id, 10, 5);
        await GameManager.recordGame(player2.data.id, player3.data.id, 10, 5);
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const rows = container.querySelectorAll('tbody tr');
        
        expect(rows[0].textContent).toContain('Alice');
        expect(rows[1].textContent).toContain('Bob');
        expect(rows[2].textContent).toContain('Charlie');
    });

    it('should break ties by total wins when win percentages are equal', async () => {
        const player1 = await PlayerManager.addPlayer('Alice');
        const player2 = await PlayerManager.addPlayer('Bob');
        const player3 = await PlayerManager.addPlayer('Charlie');
        const player4 = await PlayerManager.addPlayer('David');
        
        await GameManager.recordGame(player1.data.id, player3.data.id, 10, 5);
        await GameManager.recordGame(player1.data.id, player4.data.id, 10, 5);
        await GameManager.recordGame(player2.data.id, player3.data.id, 10, 5);
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const rows = container.querySelectorAll('tbody tr');
        
        expect(rows[0].textContent).toContain('Alice');
        expect(rows[1].textContent).toContain('Bob');
    });

    it('should escape HTML in player names to prevent XSS', async () => {
        await PlayerManager.addPlayer('<script>alert("xss")</script>');
        await PlayerManager.addPlayer('Normal');
        
        await GameManager.recordGame(PlayerManager.players[0].id, PlayerManager.players[1].id, 10, 5);
        
        LeaderboardUI.render();
        
        const container = document.getElementById('leaderboard-table');
        const html = container.innerHTML;
        
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>alert');
    });
});
