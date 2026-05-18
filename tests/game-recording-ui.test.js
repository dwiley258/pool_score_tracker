/**
 * Unit tests for GameRecordingUI component
 * Feature: pool-score-tracker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
    PlayerManager, 
    GameManager, 
    Storage,
    GroupManager,
    GameRecordingUI 
} from '../app.js';

describe('GameRecordingUI Component', () => {
    beforeEach(async () => {
        await Storage.clear();
        GroupManager.groups = [{ id: 'test-group', name: 'Test', createdAt: new Date().toISOString(), playerIds: [] }];
        GroupManager.currentGroupId = 'test-group';
        PlayerManager.players = [];
        GameManager.games = [];
        
        document.body.innerHTML = `
            <section id="game-recording" class="card">
                <h2>Record Game</h2>
                <form id="record-game-form">
                    <div class="form-group">
                        <label for="player1-select">Player 1:</label>
                        <select id="player1-select" required>
                            <option value="">Select Player 1</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="player1-score">Score:</label>
                        <input type="number" id="player1-score" min="0" required>
                    </div>
                    <div class="form-group">
                        <label for="player2-select">Player 2:</label>
                        <select id="player2-select" required>
                            <option value="">Select Player 2</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="player2-score">Score:</label>
                        <input type="number" id="player2-score" min="0" required>
                    </div>
                    <button type="submit">Record Game</button>
                </form>
                <div id="game-feedback" class="feedback"></div>
            </section>
        `;
    });

    describe('Rendering Player Dropdowns', () => {
        it('should populate dropdowns with players when 2+ players exist', async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            await PlayerManager.addPlayer('Charlie');
            
            GameRecordingUI.render();
            
            const player1Select = document.getElementById('player1-select');
            const player2Select = document.getElementById('player2-select');
            
            expect(player1Select.options.length).toBe(4);
            expect(player2Select.options.length).toBe(4);
        });

        it('should enable form when 2+ players exist', async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            
            GameRecordingUI.render();
            
            const submitButton = document.querySelector('#record-game-form button[type="submit"]');
            const player1Select = document.getElementById('player1-select');
            const player2Select = document.getElementById('player2-select');
            
            expect(submitButton.disabled).toBe(false);
            expect(player1Select.disabled).toBe(false);
            expect(player2Select.disabled).toBe(false);
        });

        it('should sort players alphabetically in dropdowns', async () => {
            await PlayerManager.addPlayer('Zoe');
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Mike');
            
            GameRecordingUI.render();
            
            const player1Select = document.getElementById('player1-select');
            
            expect(player1Select.options[1].text).toBe('Alice');
            expect(player1Select.options[2].text).toBe('Mike');
            expect(player1Select.options[3].text).toBe('Zoe');
        });
    });

    describe('Recording Games', () => {
        beforeEach(async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
        });

        it('should record a valid game successfully', async () => {
            const players = PlayerManager.getAllPlayers();
            const player1 = players[0];
            const player2 = players[1];
            
            document.getElementById('player1-select').value = player1.id;
            document.getElementById('player2-select').value = player2.id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            const games = GameManager.getGameHistory();
            expect(games.length).toBe(1);
            expect(games[0].player1Id).toBe(player1.id);
            expect(games[0].player2Id).toBe(player2.id);
            expect(games[0].player1Score).toBe(10);
            expect(games[0].player2Score).toBe(8);
        });

        it('should show success feedback after recording game', async () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('success')).toBe(true);
        });

        it('should reset form after successful game recording', async () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            expect(document.getElementById('player1-select').value).toBe('');
            expect(document.getElementById('player2-select').value).toBe('');
            expect(document.getElementById('player1-score').value).toBe('');
            expect(document.getElementById('player2-score').value).toBe('');
        });

        it('should reject game when same player is selected', async () => {
            const players = PlayerManager.getAllPlayers();
            const player1 = players[0];
            
            document.getElementById('player1-select').value = player1.id;
            document.getElementById('player2-select').value = player1.id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            expect(GameManager.games.length).toBe(0);
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('error')).toBe(true);
        });

        it('should reject game when player selection is empty', async () => {
            document.getElementById('player1-select').value = '';
            document.getElementById('player2-select').value = '';
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            expect(GameManager.games.length).toBe(0);
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('error')).toBe(true);
        });

        it('should reject game with negative scores', async () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '-5';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            expect(GameManager.games.length).toBe(0);
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('error')).toBe(true);
        });

        it('should show winner in success message', async () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('success')).toBe(true);
        });

        it('should show tie message when scores are equal', async () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '10';
            
            await GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('success')).toBe(true);
        });
    });

    describe('HTML Escaping', () => {
        it('should escape HTML in player names', async () => {
            await PlayerManager.addPlayer('<script>alert("xss")</script>');
            await PlayerManager.addPlayer('Normal');
            
            GameRecordingUI.render();
            
            const player1Select = document.getElementById('player1-select');
            expect(player1Select.innerHTML).not.toContain('<script>');
            expect(player1Select.innerHTML).toContain('&lt;script&gt;');
        });
    });

    describe('Requirements Validation', () => {
        it('should validate Requirement 2.1: Different players required', async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[0].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            expect(GameManager.games.length).toBe(0);
        });

        it('should validate Requirement 2.2: Valid scores required', async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '-1';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            expect(GameManager.games.length).toBe(0);
        });

        it('should validate Requirement 2.5: Non-negative integer scores', async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            const game = GameManager.games[0];
            expect(game.player1Score).toBeGreaterThanOrEqual(0);
            expect(game.player2Score).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(game.player1Score)).toBe(true);
            expect(Number.isInteger(game.player2Score)).toBe(true);
        });

        it('should validate Requirement 6.2: Visual feedback on success', async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('success')).toBe(true);
            expect(feedback.textContent.length).toBeGreaterThan(0);
        });

        it('should validate Requirement 6.2: Visual feedback on failure', async () => {
            await PlayerManager.addPlayer('Alice');
            await PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[0].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            await GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('error')).toBe(true);
            expect(feedback.textContent.length).toBeGreaterThan(0);
        });
    });
});
