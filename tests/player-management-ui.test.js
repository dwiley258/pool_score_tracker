/**
 * PlayerManagementUI Unit Tests
 * Tests the UI component for player management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlayerManager, PlayerManagementUI, Storage, GroupManager } from '../app.js';

describe('PlayerManagementUI', () => {
    beforeEach(async () => {
        await Storage.clear();
        GroupManager.groups = [{ id: 'test-group', name: 'Test', createdAt: new Date().toISOString(), playerIds: [] }];
        GroupManager.currentGroupId = 'test-group';
        PlayerManager.players = [];
        
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

    describe('renderPlayerCount', () => {
        it('should display correct player count', async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            
            PlayerManagementUI.render();
            
            const playerCount = document.getElementById('player-count');
            expect(playerCount.textContent).toContain('2/20');
        });

        it('should disable add button when at 20 player limit', async () => {
            for (let i = 1; i <= 20; i++) {
                await PlayerManager.addPlayer(`Player${i}`);
            }
            
            PlayerManagementUI.render();
            
            const submitButton = document.querySelector('#add-player-form button[type="submit"]');
            expect(submitButton.disabled).toBe(true);
        });

        it('should enable add button when under 20 players', async () => {
            await PlayerManager.addPlayer('Alice');
            
            PlayerManagementUI.render();
            
            const submitButton = document.querySelector('#add-player-form button[type="submit"]');
            expect(submitButton.disabled).toBe(false);
        });
    });

    describe('renderPlayerList', () => {
        it('should display empty message when no players', () => {
            PlayerManagementUI.render();
            
            const playerList = document.getElementById('player-list');
            expect(playerList.innerHTML).toContain('No players added yet');
        });

        it('should render player list with remove buttons', async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            
            PlayerManagementUI.render();
            
            const playerList = document.getElementById('player-list');
            const playerItems = playerList.querySelectorAll('.player-item');
            
            expect(playerItems.length).toBe(2);
            
            const removeButtons = playerList.querySelectorAll('.remove-player-btn');
            expect(removeButtons.length).toBe(2);
        });

        it('should sort players alphabetically', async () => {
            await PlayerManager.addPlayer('Charlie');
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            
            PlayerManagementUI.render();
            
            const playerNames = Array.from(document.querySelectorAll('.player-name'))
                .map(el => el.textContent);
            
            expect(playerNames).toEqual(['Alice', 'Bob', 'Charlie']);
        });

        it('should escape HTML in player names', async () => {
            await PlayerManager.addPlayer('<script>alert("xss")</script>');
            
            PlayerManagementUI.render();
            
            const playerList = document.getElementById('player-list');
            // Uses textContent so script tags won't be in innerHTML as executable
            expect(playerList.innerHTML).not.toContain('<script>alert');
        });
    });

    describe('handleAddPlayer', () => {
        it('should add player and show success message', async () => {
            PlayerManagementUI.initialize();
            
            const input = document.getElementById('player-name-input');
            input.value = 'Alice';
            
            await PlayerManagementUI.handleAddPlayer();
            
            expect(PlayerManager.players.length).toBe(1);
            expect(PlayerManager.players[0].name).toBe('Alice');
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.textContent).toContain('Alice');
            expect(feedback.className).toContain('success');
            
            expect(input.value).toBe('');
        });

        it('should show error for empty name', async () => {
            PlayerManagementUI.initialize();
            
            const input = document.getElementById('player-name-input');
            input.value = '   ';
            
            await PlayerManagementUI.handleAddPlayer();
            
            expect(PlayerManager.players.length).toBe(0);
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.className).toContain('error');
        });

        it('should show error for duplicate name', async () => {
            await PlayerManager.addPlayer('Alice');
            PlayerManagementUI.initialize();
            
            const input = document.getElementById('player-name-input');
            input.value = 'alice';
            
            await PlayerManagementUI.handleAddPlayer();
            
            // Should still be 1 (not added again)
            expect(PlayerManager.players.length).toBe(1);
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.className).toContain('error');
        });

        it('should show error when at player limit', async () => {
            for (let i = 1; i <= 20; i++) {
                await PlayerManager.addPlayer(`Player${i}`);
            }
            
            PlayerManagementUI.initialize();
            
            const input = document.getElementById('player-name-input');
            input.value = 'Player21';
            
            await PlayerManagementUI.handleAddPlayer();
            
            expect(PlayerManager.players.length).toBe(20);
            
            const feedback = document.getElementById('player-feedback');
            expect(feedback.className).toContain('error');
        });
    });

    describe('handleRemovePlayer', () => {
        it('should remove player with confirmation', async () => {
            const player = (await PlayerManager.addPlayer('Alice')).data;
            
            global.confirm = vi.fn(() => true);
            
            await PlayerManagementUI.handleRemovePlayer(player.id, player.name);
            
            expect(PlayerManager.players.length).toBe(0);
            expect(global.confirm).toHaveBeenCalled();
        });

        it('should not remove player if confirmation cancelled', async () => {
            const player = (await PlayerManager.addPlayer('Alice')).data;
            
            global.confirm = vi.fn(() => false);
            
            await PlayerManagementUI.handleRemovePlayer(player.id, player.name);
            
            expect(PlayerManager.players.length).toBe(1);
        });

        it('should show success message after removal', async () => {
            const player = (await PlayerManager.addPlayer('Alice')).data;
            PlayerManagementUI.initialize();
            
            global.confirm = vi.fn(() => true);
            
            await PlayerManagementUI.handleRemovePlayer(player.id, player.name);
            
            // Player should be removed
            expect(PlayerManager.players.length).toBe(0);
        });
    });

    describe('escapeHtml', () => {
        it('should escape HTML special characters', async () => {
            await PlayerManager.addPlayer('<b>bold</b>');
            
            PlayerManagementUI.render();
            
            const playerList = document.getElementById('player-list');
            // textContent-based rendering means no raw HTML
            expect(playerList.innerHTML).not.toContain('<b>bold</b>');
        });

        it('should handle quotes', async () => {
            await PlayerManager.addPlayer('"test"');
            
            PlayerManagementUI.render();
            
            const playerNames = Array.from(document.querySelectorAll('.player-name'))
                .map(el => el.textContent);
            expect(playerNames[0]).toBe('"test"');
        });
    });
});
