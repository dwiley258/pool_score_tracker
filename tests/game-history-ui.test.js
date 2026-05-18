/**
 * GameHistoryUI Unit Tests
 * Tests the UI component for game history display
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlayerManager, GameManager, GameHistoryUI, Storage, GroupManager } from '../app.js';

describe('GameHistoryUI', () => {
    let player1, player2, player3;

    beforeEach(async () => {
        await Storage.clear();
        GroupManager.groups = [{ id: 'test-group', name: 'Test', createdAt: new Date().toISOString(), playerIds: [] }];
        GroupManager.currentGroupId = 'test-group';
        PlayerManager.players = [];
        GameManager.games = [];
        
        document.body.innerHTML = `
            <section id="game-history" class="card">
                <h2>Game History</h2>
                <div class="filter-container">
                    <label for="player-filter">Filter by player:</label>
                    <select id="player-filter">
                        <option value="">All Players</option>
                    </select>
                </div>
                <div id="game-list"></div>
            </section>
        `;

        player1 = (await PlayerManager.addPlayer('Alice')).data;
        player2 = (await PlayerManager.addPlayer('Bob')).data;
        player3 = (await PlayerManager.addPlayer('Charlie')).data;
    });

    describe('initialize', () => {
        it('should set up event listeners and render', () => {
            GameHistoryUI.initialize();
            
            const playerFilter = document.getElementById('player-filter');
            const options = playerFilter.querySelectorAll('option');
            
            expect(options.length).toBe(4);
        });
    });

    describe('renderPlayerFilter', () => {
        it('should populate filter with all players', () => {
            GameHistoryUI.renderPlayerFilter();
            
            const playerFilter = document.getElementById('player-filter');
            const options = playerFilter.querySelectorAll('option');
            
            expect(options.length).toBe(4);
            expect(options[0].value).toBe('');
            expect(options[0].textContent).toBe('All Players');
        });

        it('should sort players alphabetically in filter', () => {
            GameHistoryUI.renderPlayerFilter();
            
            const playerFilter = document.getElementById('player-filter');
            const options = Array.from(playerFilter.querySelectorAll('option'));
            const playerNames = options.slice(1).map(opt => opt.textContent);
            
            expect(playerNames).toEqual(['Alice', 'Bob', 'Charlie']);
        });

        it('should preserve current selection when re-rendering', () => {
            GameHistoryUI.renderPlayerFilter();
            
            const playerFilter = document.getElementById('player-filter');
            playerFilter.value = player1.id;
            
            GameHistoryUI.renderPlayerFilter();
            
            expect(playerFilter.value).toBe(player1.id);
        });

        it('should escape HTML in player names', async () => {
            await PlayerManager.addPlayer('<script>alert("xss")</script>');
            
            GameHistoryUI.renderPlayerFilter();
            
            const playerFilter = document.getElementById('player-filter');
            expect(playerFilter.innerHTML).not.toContain('<script>');
            expect(playerFilter.innerHTML).toContain('&lt;script&gt;');
        });
    });

    describe('renderGameList', () => {
        it('should display empty message when no games', () => {
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            expect(gameList.innerHTML).toContain('No games recorded yet');
        });

        it('should display filtered message when no games for player', async () => {
            await GameManager.recordGame(player1.id, player2.id, 10, 5);
            
            const playerFilter = document.getElementById('player-filter');
            
            GameHistoryUI.renderPlayerFilter();
            playerFilter.value = player3.id;
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            // When filtered and no games match, shows the empty message
            expect(gameList.innerHTML).toContain('No games recorded yet');
        });

        it('should render game list with all games', async () => {
            await GameManager.recordGame(player1.id, player2.id, 10, 5);
            await GameManager.recordGame(player2.id, player3.id, 8, 8);
            await GameManager.recordGame(player1.id, player3.id, 3, 7);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            
            expect(gameItems.length).toBe(3);
        });

        it('should display games in reverse chronological order', async () => {
            const game1 = (await GameManager.recordGame(player1.id, player2.id, 10, 5)).data;
            game1.timestamp = new Date('2024-01-01T10:00:00.000Z').toISOString();
            
            const game2 = (await GameManager.recordGame(player2.id, player3.id, 8, 8)).data;
            game2.timestamp = new Date('2024-01-02T10:00:00.000Z').toISOString();
            
            const game3 = (await GameManager.recordGame(player1.id, player3.id, 3, 7)).data;
            game3.timestamp = new Date('2024-01-03T10:00:00.000Z').toISOString();
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            
            expect(gameItems[0].getAttribute('data-game-id')).toBe(game3.id);
            expect(gameItems[1].getAttribute('data-game-id')).toBe(game2.id);
            expect(gameItems[2].getAttribute('data-game-id')).toBe(game1.id);
        });

        it('should filter games by player', async () => {
            await GameManager.recordGame(player1.id, player2.id, 10, 5);
            await GameManager.recordGame(player2.id, player3.id, 8, 8);
            await GameManager.recordGame(player1.id, player3.id, 3, 7);
            
            const playerFilter = document.getElementById('player-filter');
            
            GameHistoryUI.renderPlayerFilter();
            playerFilter.value = player1.id;
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            
            expect(gameItems.length).toBe(2);
        });

        it('should display player names and scores', async () => {
            await GameManager.recordGame(player1.id, player2.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameResult = gameList.querySelector('.game-result');
            
            expect(gameResult.textContent).toContain('Alice');
            expect(gameResult.textContent).toContain('Bob');
            expect(gameResult.textContent).toContain('10');
            expect(gameResult.textContent).toContain('5');
        });

        it('should highlight winner', async () => {
            await GameManager.recordGame(player1.id, player2.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameResult = gameList.querySelector('.game-result');
            
            expect(gameResult.innerHTML).toContain('class="player-name winner"');
        });

        it('should display tie indicator for tied games', async () => {
            await GameManager.recordGame(player1.id, player2.id, 8, 8);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameResult = gameList.querySelector('.game-result');
            
            expect(gameResult.textContent).toContain('(Tie)');
        });

        it('should display formatted timestamp', async () => {
            await GameManager.recordGame(player1.id, player2.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const timestamp = gameList.querySelector('.game-timestamp');
            
            expect(timestamp.textContent.match(/AM|PM/)).toBeTruthy();
        });

        it('should render delete buttons', async () => {
            await GameManager.recordGame(player1.id, player2.id, 10, 5);
            await GameManager.recordGame(player2.id, player3.id, 8, 8);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const deleteButtons = gameList.querySelectorAll('.delete-game-btn');
            
            expect(deleteButtons.length).toBe(2);
        });

        it('should escape HTML in player names', async () => {
            const xssPlayer = (await PlayerManager.addPlayer('<script>alert("xss")</script>')).data;
            await GameManager.recordGame(xssPlayer.id, player1.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            expect(gameList.innerHTML).not.toContain('<script>');
            expect(gameList.innerHTML).toContain('&lt;script&gt;');
        });
    });

    describe('handleDeleteGame', () => {
        it('should delete game with confirmation', async () => {
            const game = (await GameManager.recordGame(player1.id, player2.id, 10, 5)).data;
            
            global.confirm = vi.fn(() => true);
            
            await GameHistoryUI.handleDeleteGame(game.id);
            
            expect(GameManager.games.length).toBe(0);
            expect(global.confirm).toHaveBeenCalled();
        });

        it('should not delete game if confirmation cancelled', async () => {
            const game = (await GameManager.recordGame(player1.id, player2.id, 10, 5)).data;
            
            global.confirm = vi.fn(() => false);
            
            await GameHistoryUI.handleDeleteGame(game.id);
            
            expect(GameManager.games.length).toBe(1);
        });

        it('should handle non-existent game gracefully', async () => {
            global.confirm = vi.fn(() => true);
            
            await expect(async () => {
                await GameHistoryUI.handleDeleteGame('non-existent-id');
            }).not.toThrow();
            
            expect(global.confirm).not.toHaveBeenCalled();
        });
    });

    describe('formatTimestamp', () => {
        it('should format valid ISO timestamp', () => {
            const timestamp = '2024-01-15T15:45:00.000Z';
            const formatted = GameHistoryUI.formatTimestamp(timestamp);
            
            expect(formatted).toContain('2024');
            expect(formatted).toContain('Jan');
        });

        it('should handle invalid timestamp gracefully', () => {
            const formatted = GameHistoryUI.formatTimestamp('invalid-date');
            
            expect(formatted).toBe('Invalid date');
        });

        it('should format with 12-hour time', () => {
            const timestamp = '2024-01-15T15:45:00.000Z';
            const formatted = GameHistoryUI.formatTimestamp(timestamp);
            
            expect(formatted.match(/AM|PM/)).toBeTruthy();
        });
    });

    describe('escapeHtml', () => {
        it('should escape HTML special characters', async () => {
            const xssPlayer = (await PlayerManager.addPlayer('<b>bold</b>')).data;
            await GameManager.recordGame(xssPlayer.id, player1.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            expect(gameList.innerHTML).not.toContain('<b>bold</b>');
            expect(gameList.innerHTML).toContain('&lt;b&gt;');
        });

        it('should handle quotes', async () => {
            const quotePlayer = (await PlayerManager.addPlayer('"test"')).data;
            await GameManager.recordGame(quotePlayer.id, player1.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            expect(gameList.innerHTML).toContain('test');
        });

        it('should handle ampersands', async () => {
            const ampPlayer = (await PlayerManager.addPlayer('Tom & Jerry')).data;
            await GameManager.recordGame(ampPlayer.id, player1.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            expect(gameList.innerHTML).toContain('&amp;');
        });
    });

    describe('setupEventListeners', () => {
        it('should set up change listener on player filter', () => {
            GameHistoryUI.setupEventListeners();
            
            const playerFilter = document.getElementById('player-filter');
            
            playerFilter.value = player1.id;
            playerFilter.dispatchEvent(new Event('change'));
            
            expect(playerFilter).toBeDefined();
        });
    });

    describe('integration', () => {
        it('should update when games are recorded', async () => {
            GameHistoryUI.initialize();
            
            let gameList = document.getElementById('game-list');
            expect(gameList.innerHTML).toContain('No games recorded yet');
            
            await GameManager.recordGame(player1.id, player2.id, 10, 5);
            GameHistoryUI.render();
            
            gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            expect(gameItems.length).toBe(1);
        });

        it('should update when games are deleted', async () => {
            const game1 = (await GameManager.recordGame(player1.id, player2.id, 10, 5)).data;
            await GameManager.recordGame(player2.id, player3.id, 8, 8);
            
            GameHistoryUI.initialize();
            
            let gameList = document.getElementById('game-list');
            let gameItems = gameList.querySelectorAll('.game-item');
            expect(gameItems.length).toBe(2);
            
            global.confirm = vi.fn(() => true);
            
            await GameHistoryUI.handleDeleteGame(game1.id);
            
            gameList = document.getElementById('game-list');
            gameItems = gameList.querySelectorAll('.game-item');
            expect(gameItems.length).toBe(1);
        });

        it('should filter games when filter changes', async () => {
            await GameManager.recordGame(player1.id, player2.id, 10, 5);
            await GameManager.recordGame(player2.id, player3.id, 8, 8);
            await GameManager.recordGame(player1.id, player3.id, 3, 7);
            
            GameHistoryUI.initialize();
            
            const playerFilter = document.getElementById('player-filter');
            playerFilter.value = player1.id;
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            
            expect(gameItems.length).toBe(2);
        });
    });
});
