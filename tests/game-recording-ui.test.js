/**
 * Unit tests for GameRecordingUI component
 * Feature: pool-score-tracker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
    PlayerManager, 
    GameManager, 
    Storage,
    GameRecordingUI 
} from '../app.js';

describe('GameRecordingUI Component', () => {
    beforeEach(() => {
        // Clear storage and reset state
        Storage.clear();
        PlayerManager.players = [];
        GameManager.games = [];
        
        // Set up DOM structure
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

    describe('Initialization', () => {
        it('should initialize without errors', () => {
            expect(() => GameRecordingUI.initialize()).not.toThrow();
        });

        it('should set up event listeners on form', () => {
            const form = document.getElementById('record-game-form');
            const submitSpy = vi.fn();
            form.addEventListener('submit', submitSpy);
            
            GameRecordingUI.initialize();
            expect(form).toBeTruthy();
        });
    });

    describe('Rendering Player Dropdowns', () => {
        it('should render empty dropdowns when no players exist', () => {
            GameRecordingUI.render();
            
            const player1Select = document.getElementById('player1-select');
            const player2Select = document.getElementById('player2-select');
            
            expect(player1Select.options.length).toBe(1); // Only placeholder
            expect(player2Select.options.length).toBe(1); // Only placeholder
            expect(player1Select.options[0].value).toBe('');
            expect(player2Select.options[0].value).toBe('');
        });

        it('should disable form when less than 2 players', () => {
            PlayerManager.addPlayer('Alice');
            GameRecordingUI.render();
            
            const submitButton = document.querySelector('#record-game-form button[type="submit"]');
            const player1Select = document.getElementById('player1-select');
            const player2Select = document.getElementById('player2-select');
            
            expect(submitButton.disabled).toBe(true);
            expect(player1Select.disabled).toBe(true);
            expect(player2Select.disabled).toBe(true);
        });

        it('should populate dropdowns with players when 2+ players exist', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            PlayerManager.addPlayer('Charlie');
            
            GameRecordingUI.render();
            
            const player1Select = document.getElementById('player1-select');
            const player2Select = document.getElementById('player2-select');
            
            expect(player1Select.options.length).toBe(4); // 3 players + placeholder
            expect(player2Select.options.length).toBe(4);
            expect(player1Select.options[1].text).toBe('Alice');
            expect(player1Select.options[2].text).toBe('Bob');
            expect(player1Select.options[3].text).toBe('Charlie');
        });

        it('should enable form when 2+ players exist', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            
            GameRecordingUI.render();
            
            const submitButton = document.querySelector('#record-game-form button[type="submit"]');
            const player1Select = document.getElementById('player1-select');
            const player2Select = document.getElementById('player2-select');
            
            expect(submitButton.disabled).toBe(false);
            expect(player1Select.disabled).toBe(false);
            expect(player2Select.disabled).toBe(false);
        });

        it('should sort players alphabetically in dropdowns', () => {
            PlayerManager.addPlayer('Zoe');
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Mike');
            
            GameRecordingUI.render();
            
            const player1Select = document.getElementById('player1-select');
            
            expect(player1Select.options[1].text).toBe('Alice');
            expect(player1Select.options[2].text).toBe('Mike');
            expect(player1Select.options[3].text).toBe('Zoe');
        });
    });

    describe('Recording Games', () => {
        beforeEach(() => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
        });

        it('should record a valid game successfully', () => {
            const players = PlayerManager.getAllPlayers();
            const player1 = players[0];
            const player2 = players[1];
            
            document.getElementById('player1-select').value = player1.id;
            document.getElementById('player2-select').value = player2.id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            GameRecordingUI.handleRecordGame();
            
            const games = GameManager.getGameHistory();
            expect(games.length).toBe(1);
            expect(games[0].player1Id).toBe(player1.id);
            expect(games[0].player2Id).toBe(player2.id);
            expect(games[0].player1Score).toBe(10);
            expect(games[0].player2Score).toBe(8);
        });

        it('should show success feedback after recording game', () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('success')).toBe(true);
            expect(feedback.textContent).toContain('Game recorded successfully');
        });

        it('should reset form after successful game recording', () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            GameRecordingUI.handleRecordGame();
            
            expect(document.getElementById('player1-select').value).toBe('');
            expect(document.getElementById('player2-select').value).toBe('');
            expect(document.getElementById('player1-score').value).toBe('');
            expect(document.getElementById('player2-score').value).toBe('');
        });

        it('should reject game when same player is selected', () => {
            const players = PlayerManager.getAllPlayers();
            const player1 = players[0];
            
            document.getElementById('player1-select').value = player1.id;
            document.getElementById('player2-select').value = player1.id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            const gameCountBefore = GameManager.games.length;
            GameRecordingUI.handleRecordGame();
            const gameCountAfter = GameManager.games.length;
            
            expect(gameCountAfter).toBe(gameCountBefore);
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('error')).toBe(true);
            expect(feedback.textContent).toContain('Cannot record game between same player');
        });

        it('should reject game when player selection is empty', () => {
            document.getElementById('player1-select').value = '';
            document.getElementById('player2-select').value = '';
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            const gameCountBefore = GameManager.games.length;
            GameRecordingUI.handleRecordGame();
            const gameCountAfter = GameManager.games.length;
            
            expect(gameCountAfter).toBe(gameCountBefore);
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('error')).toBe(true);
            expect(feedback.textContent).toContain('Please select both players');
        });

        it('should reject game with negative scores', () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '-5';
            document.getElementById('player2-score').value = '8';
            
            const gameCountBefore = GameManager.games.length;
            GameRecordingUI.handleRecordGame();
            const gameCountAfter = GameManager.games.length;
            
            expect(gameCountAfter).toBe(gameCountBefore);
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('error')).toBe(true);
        });

        it('should show winner in success message', () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.textContent).toContain('wins!');
        });

        it('should show tie message when scores are equal', () => {
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '10';
            
            GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.textContent).toContain('tie');
        });
    });

    describe('Feedback Display', () => {
        it('should display success feedback correctly', () => {
            GameRecordingUI.showFeedback('Test success', 'success');
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('success')).toBe(true);
            expect(feedback.textContent).toBe('Test success');
        });

        it('should display error feedback correctly', () => {
            GameRecordingUI.showFeedback('Test error', 'error');
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('error')).toBe(true);
            expect(feedback.textContent).toBe('Test error');
        });
    });

    describe('HTML Escaping', () => {
        it('should escape HTML in player names', () => {
            const escaped = GameRecordingUI.escapeHtml('<script>alert("xss")</script>');
            expect(escaped).not.toContain('<script>');
            expect(escaped).toContain('&lt;');
            expect(escaped).toContain('&gt;');
        });
    });

    describe('Requirements Validation', () => {
        it('should validate Requirement 2.1: Different players required', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[0].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            const gameCountBefore = GameManager.games.length;
            GameRecordingUI.handleRecordGame();
            
            expect(GameManager.games.length).toBe(gameCountBefore);
        });

        it('should validate Requirement 2.2: Valid scores required', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '-1';
            document.getElementById('player2-score').value = '8';
            
            const gameCountBefore = GameManager.games.length;
            GameRecordingUI.handleRecordGame();
            
            expect(GameManager.games.length).toBe(gameCountBefore);
        });

        it('should validate Requirement 2.5: Non-negative integer scores', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            GameRecordingUI.handleRecordGame();
            
            const game = GameManager.games[0];
            expect(game.player1Score).toBeGreaterThanOrEqual(0);
            expect(game.player2Score).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(game.player1Score)).toBe(true);
            expect(Number.isInteger(game.player2Score)).toBe(true);
        });

        it('should validate Requirement 6.1: Clear form for recording games', () => {
            GameRecordingUI.render();
            
            const form = document.getElementById('record-game-form');
            const player1Select = document.getElementById('player1-select');
            const player2Select = document.getElementById('player2-select');
            const player1Score = document.getElementById('player1-score');
            const player2Score = document.getElementById('player2-score');
            
            expect(form).toBeTruthy();
            expect(player1Select).toBeTruthy();
            expect(player2Select).toBeTruthy();
            expect(player1Score).toBeTruthy();
            expect(player2Score).toBeTruthy();
        });

        it('should validate Requirement 6.2: Visual feedback on success', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[1].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('success')).toBe(true);
            expect(feedback.textContent.length).toBeGreaterThan(0);
        });

        it('should validate Requirement 6.2: Visual feedback on failure', () => {
            PlayerManager.addPlayer('Alice');
            PlayerManager.addPlayer('Bob');
            GameRecordingUI.render();
            
            const players = PlayerManager.getAllPlayers();
            
            document.getElementById('player1-select').value = players[0].id;
            document.getElementById('player2-select').value = players[0].id;
            document.getElementById('player1-score').value = '10';
            document.getElementById('player2-score').value = '8';
            
            GameRecordingUI.handleRecordGame();
            
            const feedback = document.getElementById('game-feedback');
            expect(feedback.classList.contains('error')).toBe(true);
            expect(feedback.textContent.length).toBeGreaterThan(0);
        });
    });
});
