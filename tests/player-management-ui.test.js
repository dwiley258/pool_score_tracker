/**
 * PlayerManagementUI Unit Tests
 * Tests the UI component for player management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlayerManager, PlayerManagementUI, Storage } from '../app.js';

describe('PlayerManagementUI', () => {
    beforeEach(() => {
        // Clear storage and reset state
        Storage.clear();
        PlayerManager.players = [];
        
        // Set up DOM structure
        document.body.innerHTML = `
            <section id="player-management" class="card">
                <h2>Player Management</h2>
                <div id="player-form-container">
                    <form id="add-player-form">
                        <input type="text" id="player-name-input" placeholder="Enter player name" required>
                        <button type="submit">Add Player</button>
                    </form>
                    <div id="player-count"></div>
                </div>
                <div id="player-list"></div>
                <div id="player-feedback" class="feedback"></div>
            </section>
        `;
    });

    describe('initialize', () => {
        it('should set up event listeners and render', () => {
            PlayerManagementUI.initialize();
            
            const playerCount = document.getElementById('player-count');
            expect(playerCount.textContent).toBe('Players: 0/20');
        });
    });

    describe('renderPlayerCount', () => {
        it('should display correct player count', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            
            PlayerManagementUI.renderPlayerCount();
            
            const playerCount = document.getElementById('player-count');
            expect(playerCount.textContent).toBe('Players: 2/20');
        });

        it('should disable add button when at 20 player limit', () => {
            // Add 20 players
            for (let i = 1; i <= 20; i++) {
                PlayerManager.addPlayer(`Player${i}`);
            }
            
            PlayerManagementUI.renderPlayerCount();
            
            const submitButton = document.querySelector('#add-player-form button[type="submit"]');
            expect(submitButton.disabled).toBe(true);
            expect(submitButton.title).toBe('Maximum player limit reached');
        });

        it('should enable add button when under 20 players', () => {
            PlayerManager.addPlayer('Alice');
            
            PlayerManagementUI.renderPlayerCount();
            
            const submitButton = document.querySelector('#add-player-form button[type="submit"]');
            expect(submitButton.disabled).toBe(false);
        });
    });

    describe('renderPlayerList', () => {
        it('should display empty message when no players', () => {
            PlayerManagementUI.renderPlayerList();
            
            const playerList = document.getElementById('player-list');
            expect(playerList.innerHTML).toContain('No players added yet');
        });

        it('should render player list with remove buttons', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            
            PlayerManagementUI.renderPlayerList();
            
            const playerList = document.getElementById('player-list');
            const playerItems = playerList.querySelectorAll('.player-item');
            
            expect(playerItems.length).toBe(2);
            
            // Check that remove buttons exist
            const removeButtons = playerList.querySelectorAll('.remove-player-btn');
            expect(removeButtons.length).toBe(2);
        });

        it('should sort players alphabetically', () => {
            PlayerManager.addPlayer('Charlie');
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            
            PlayerManagementUI.renderPlayerList();
            
            const playerNames = Array.from(document.querySelectorAll('.player-name'))
                .map(el => el.textContent);
            
            expect(playerNames).toEqual(['Alice', 'Bob', 'Charlie']);
        });

        it('should escape HTML in player names', () => {
            PlayerManager.addPlayer('<script>alert("xss")</script>');
            
            PlayerManagementUI.renderPlayerList();
            
            const playerList = document.getElementById('player-list');
            expect(playerList.innerHTML).not.toContain('<script>');
            expect(playerList.innerHTML).toContain('&lt;script&gt;');
        });
    });

    describe('handleAddPlayer', () => {
        it('should add player and show success message', () => {
            PlayerManagementUI.initialize();
            
            const input = document.getElementById('player-name-input');
            input.value = 'Alice';
            
            PlayerManagementUI.handleAddPlayer();
            
            expect(PlayerManager.players.length).toBe(1);
            expect(PlayerManager.players[0].name).toBe('Alice');
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.textContent).toContain('Alice');
            expect(feedback.textContent).toContain('added successfully');
            expect(feedback.className).toContain('success');
            
            // Input should be cleared
            expect(input.value).toBe('');
        });

        it('should show error for empty name', () => {
            PlayerManagementUI.initialize();
            
            const input = document.getElementById('player-name-input');
            input.value = '   ';
            
            PlayerManagementUI.handleAddPlayer();
            
            expect(PlayerManager.players.length).toBe(0);
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.textContent).toContain('cannot be empty');
            expect(feedback.className).toContain('error');
        });

        it('should show error for duplicate name', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManagementUI.initialize();
            
            const input = document.getElementById('player-name-input');
            input.value = 'alice'; // Case-insensitive
            
            PlayerManagementUI.handleAddPlayer();
            
            expect(PlayerManager.players.length).toBe(1);
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.textContent).toContain('already exists');
            expect(feedback.className).toContain('error');
        });

        it('should show error when at player limit', () => {
            // Add 20 players
            for (let i = 1; i <= 20; i++) {
                PlayerManager.addPlayer(`Player${i}`);
            }
            
            PlayerManagementUI.initialize();
            
            const input = document.getElementById('player-name-input');
            input.value = 'Player21';
            
            PlayerManagementUI.handleAddPlayer();
            
            expect(PlayerManager.players.length).toBe(20);
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.textContent).toContain('Cannot add more than 20 players');
            expect(feedback.className).toContain('error');
        });
    });

    describe('handleRemovePlayer', () => {
        it('should remove player with confirmation', () => {
            const player = PlayerManager.addPlayer('Alice').data;
            
            // Mock confirm to return true
            global.confirm = vi.fn(() => true);
            
            PlayerManagementUI.handleRemovePlayer(player.id, player.name);
            
            expect(PlayerManager.players.length).toBe(0);
            expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to remove Alice?');
        });

        it('should not remove player if confirmation cancelled', () => {
            const player = PlayerManager.addPlayer('Alice').data;
            
            // Mock confirm to return false
            global.confirm = vi.fn(() => false);
            
            PlayerManagementUI.handleRemovePlayer(player.id, player.name);
            
            expect(PlayerManager.players.length).toBe(1);
        });

        it('should show success message after removal', () => {
            const player = PlayerManager.addPlayer('Alice').data;
            PlayerManagementUI.initialize();
            
            // Mock confirm to return true
            global.confirm = vi.fn(() => true);
            
            PlayerManagementUI.handleRemovePlayer(player.id, player.name);
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.textContent).toContain('Alice');
            expect(feedback.textContent).toContain('removed successfully');
            expect(feedback.className).toContain('success');
        });
    });

    describe('showFeedback', () => {
        it('should display success message', () => {
            PlayerManagementUI.showFeedback('Test success', 'success');
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.textContent).toBe('Test success');
            expect(feedback.className).toContain('success');
        });

        it('should display error message', () => {
            PlayerManagementUI.showFeedback('Test error', 'error');
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.textContent).toBe('Test error');
            expect(feedback.className).toContain('error');
        });

        it('should auto-dismiss success messages after 3 seconds', (done) => {
            PlayerManagementUI.showFeedback('Test success', 'success');
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.className).toContain('success');
            
            setTimeout(() => {
                expect(feedback.className).toBe('feedback');
                expect(feedback.textContent).toBe('');
                done();
            }, 3100);
        }, 4000);
    });

    describe('escapeHtml', () => {
        it('should escape HTML special characters', () => {
            const escaped = PlayerManagementUI.escapeHtml('<script>alert("xss")</script>');
            expect(escaped).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
        });

        it('should handle quotes', () => {
            const escaped = PlayerManagementUI.escapeHtml('"test"');
            expect(escaped).toContain('test');
        });
    });
});
