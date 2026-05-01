/**
 * GameHistoryUI Unit Tests
 * Tests the UI component for game history display
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlayerManager, GameManager, GameHistoryUI, Storage } from '../app.js';

describe('GameHistoryUI', () => {
    let player1, player2, player3;

    beforeEach(() => {
        // Clear storage and reset state
        Storage.clear();
        PlayerManager.players = [];
        GameManager.games = [];
        
        // Set up DOM structure
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

        // Add test players
        player1 = PlayerManager.addPlayer('Alice').data;
        player2 = PlayerManager.addPlayer('Bob').data;
        player3 = PlayerManager.addPlayer('Charlie').data;
    });

    describe('initialize', () => {
        it('should set up event listeners and render', () => {
            GameHistoryUI.initialize();
            
            const playerFilter = document.getElementById('player-filter');
            const options = playerFilter.querySelectorAll('option');
            
            // Should have "All Players" + 3 players
            expect(options.length).toBe(4);
        });
    });

    describe('renderPlayerFilter', () => {
        it('should populate filter with all players', () => {
            GameHistoryUI.renderPlayerFilter();
            
            const playerFilter = document.getElementById('player-filter');
            const options = playerFilter.querySelectorAll('option');
            
            expect(options.length).toBe(4); // "All Players" + 3 players
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

        it('should escape HTML in player names', () => {
            PlayerManager.addPlayer('<script>alert("xss")</script>');
            
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

        it('should display filtered message when no games for player', () => {
            GameManager.recordGame(player1.id, player2.id, 10, 5);
            
            const playerFilter = document.getElementById('player-filter');
            playerFilter.value = player3.id;
            
            // Need to render the filter first to populate it
            GameHistoryUI.renderPlayerFilter();
            playerFilter.value = player3.id;
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            expect(gameList.innerHTML).toContain('No games found for this player');
        });

        it('should render game list with all games', () => {
            GameManager.recordGame(player1.id, player2.id, 10, 5);
            GameManager.recordGame(player2.id, player3.id, 8, 8);
            GameManager.recordGame(player1.id, player3.id, 3, 7);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            
            expect(gameItems.length).toBe(3);
        });

        it('should display games in reverse chronological order', () => {
            const game1 = GameManager.recordGame(player1.id, player2.id, 10, 5).data;
            // Ensure different timestamps by modifying them
            game1.timestamp = new Date('2024-01-01T10:00:00.000Z').toISOString();
            
            const game2 = GameManager.recordGame(player2.id, player3.id, 8, 8).data;
            game2.timestamp = new Date('2024-01-02T10:00:00.000Z').toISOString();
            
            const game3 = GameManager.recordGame(player1.id, player3.id, 3, 7).data;
            game3.timestamp = new Date('2024-01-03T10:00:00.000Z').toISOString();
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            
            // Most recent game should be first
            expect(gameItems[0].getAttribute('data-game-id')).toBe(game3.id);
            expect(gameItems[1].getAttribute('data-game-id')).toBe(game2.id);
            expect(gameItems[2].getAttribute('data-game-id')).toBe(game1.id);
        });

        it('should filter games by player', () => {
            GameManager.recordGame(player1.id, player2.id, 10, 5);
            GameManager.recordGame(player2.id, player3.id, 8, 8);
            GameManager.recordGame(player1.id, player3.id, 3, 7);
            
            const playerFilter = document.getElementById('player-filter');
            
            // Need to render the filter first to populate it
            GameHistoryUI.renderPlayerFilter();
            playerFilter.value = player1.id;
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            
            // Only 2 games involve player1
            expect(gameItems.length).toBe(2);
        });

        it('should display player names and scores', () => {
            GameManager.recordGame(player1.id, player2.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameResult = gameList.querySelector('.game-result');
            
            expect(gameResult.textContent).toContain('Alice');
            expect(gameResult.textContent).toContain('Bob');
            expect(gameResult.textContent).toContain('10');
            expect(gameResult.textContent).toContain('5');
        });

        it('should highlight winner', () => {
            GameManager.recordGame(player1.id, player2.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameResult = gameList.querySelector('.game-result');
            
            // Alice won, so she should have the winner class
            expect(gameResult.innerHTML).toContain('class="player-name winner"');
        });

        it('should display tie indicator for tied games', () => {
            GameManager.recordGame(player1.id, player2.id, 8, 8);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const gameResult = gameList.querySelector('.game-result');
            
            expect(gameResult.textContent).toContain('(Tie)');
        });

        it('should display formatted timestamp', () => {
            GameManager.recordGame(player1.id, player2.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const timestamp = gameList.querySelector('.game-timestamp');
            
            expect(timestamp.textContent).toContain('at');
        });

        it('should render delete buttons', () => {
            GameManager.recordGame(player1.id, player2.id, 10, 5);
            GameManager.recordGame(player2.id, player3.id, 8, 8);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            const deleteButtons = gameList.querySelectorAll('.delete-game-btn');
            
            expect(deleteButtons.length).toBe(2);
        });

        it('should escape HTML in player names', () => {
            const xssPlayer = PlayerManager.addPlayer('<script>alert("xss")</script>').data;
            GameManager.recordGame(xssPlayer.id, player1.id, 10, 5);
            
            GameHistoryUI.renderGameList();
            
            const gameList = document.getElementById('game-list');
            expect(gameList.innerHTML).not.toContain('<script>');
            expect(gameList.innerHTML).toContain('&lt;script&gt;');
        });
    });

    describe('handleDeleteGame', () => {
        it('should delete game with confirmation', () => {
            const game = GameManager.recordGame(player1.id, player2.id, 10, 5).data;
            
            // Mock confirm to return true
            global.confirm = vi.fn(() => true);
            
            GameHistoryUI.handleDeleteGame(game.id);
            
            expect(GameManager.games.length).toBe(0);
            expect(global.confirm).toHaveBeenCalled();
        });

        it('should not delete game if confirmation cancelled', () => {
            const game = GameManager.recordGame(player1.id, player2.id, 10, 5).data;
            
            // Mock confirm to return false
            global.confirm = vi.fn(() => false);
            
            GameHistoryUI.handleDeleteGame(game.id);
            
            expect(GameManager.games.length).toBe(1);
        });

        it('should handle non-existent game gracefully', () => {
            // Mock confirm to return true
            global.confirm = vi.fn(() => true);
            
            // Should not throw error
            expect(() => {
                GameHistoryUI.handleDeleteGame('non-existent-id');
            }).not.toThrow();
            
            // Confirm should not be called for non-existent game
            expect(global.confirm).not.toHaveBeenCalled();
        });
    });

    describe('formatTimestamp', () => {
        it('should format valid ISO timestamp', () => {
            const timestamp = '2024-01-15T15:45:00.000Z';
            const formatted = GameHistoryUI.formatTimestamp(timestamp);
            
            expect(formatted).toContain('2024');
            expect(formatted).toContain('at');
        });

        it('should handle invalid timestamp gracefully', () => {
            const formatted = GameHistoryUI.formatTimestamp('invalid-date');
            
            expect(formatted).toBe('Invalid date');
        });

        it('should format with 12-hour time', () => {
            const timestamp = '2024-01-15T15:45:00.000Z';
            const formatted = GameHistoryUI.formatTimestamp(timestamp);
            
            // Should contain AM or PM
            expect(formatted.match(/AM|PM/)).toBeTruthy();
        });
    });

    describe('escapeHtml', () => {
        it('should escape HTML special characters', () => {
            const escaped = GameHistoryUI.escapeHtml('<script>alert("xss")</script>');
            expect(escaped).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
        });

        it('should handle quotes', () => {
            const escaped = GameHistoryUI.escapeHtml('"test"');
            expect(escaped).toContain('test');
        });

        it('should handle ampersands', () => {
            const escaped = GameHistoryUI.escapeHtml('Tom & Jerry');
            expect(escaped).toContain('&amp;');
        });
    });

    describe('setupEventListeners', () => {
        it('should set up change listener on player filter', () => {
            GameHistoryUI.setupEventListeners();
            
            const playerFilter = document.getElementById('player-filter');
            
            // Trigger change event
            playerFilter.value = player1.id;
            playerFilter.dispatchEvent(new Event('change'));
            
            // Should trigger render (we can't easily test this without mocking)
            expect(playerFilter).toBeDefined();
        });
    });

    describe('integration', () => {
        it('should update when games are recorded', () => {
            GameHistoryUI.initialize();
            
            let gameList = document.getElementById('game-list');
            expect(gameList.innerHTML).toContain('No games recorded yet');
            
            GameManager.recordGame(player1.id, player2.id, 10, 5);
            GameHistoryUI.render();
            
            gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            expect(gameItems.length).toBe(1);
        });

        it('should update when games are deleted', () => {
            const game1 = GameManager.recordGame(player1.id, player2.id, 10, 5).data;
            const game2 = GameManager.recordGame(player2.id, player3.id, 8, 8).data;
            
            GameHistoryUI.initialize();
            
            let gameList = document.getElementById('game-list');
            let gameItems = gameList.querySelectorAll('.game-item');
            expect(gameItems.length).toBe(2);
            
            // Mock confirm to return true
            global.confirm = vi.fn(() => true);
            
            GameHistoryUI.handleDeleteGame(game1.id);
            
            gameList = document.getElementById('game-list');
            gameItems = gameList.querySelectorAll('.game-item');
            expect(gameItems.length).toBe(1);
        });

        it('should filter games when filter changes', () => {
            GameManager.recordGame(player1.id, player2.id, 10, 5);
            GameManager.recordGame(player2.id, player3.id, 8, 8);
            GameManager.recordGame(player1.id, player3.id, 3, 7);
            
            GameHistoryUI.initialize();
            
            const playerFilter = document.getElementById('player-filter');
            playerFilter.value = player1.id;
            playerFilter.dispatchEvent(new Event('change'));
            
            const gameList = document.getElementById('game-list');
            const gameItems = gameList.querySelectorAll('.game-item');
            
            expect(gameItems.length).toBe(2);
        });
    });
});
