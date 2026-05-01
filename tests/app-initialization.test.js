/**
 * Tests for PoolScoreTrackerApp initialization
 * Feature: pool-score-tracker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
    PoolScoreTrackerApp,
    PlayerManager,
    GameManager,
    Storage
} from '../app.js';

describe('PoolScoreTrackerApp Initialization', () => {
    let dom;
    let document;
    let window;
    let localStorage;

    beforeEach(() => {
        // Create a new JSDOM instance with a complete HTML structure
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <body>
                <div class="container">
                    <section id="player-management">
                        <form id="add-player-form">
                            <input type="text" id="player-name-input" />
                            <button type="submit">Add Player</button>
                        </form>
                        <div id="player-count"></div>
                        <div id="player-list"></div>
                        <div id="player-feedback"></div>
                    </section>
                    <section id="game-recording">
                        <form id="record-game-form">
                            <select id="player1-select"></select>
                            <input type="number" id="player1-score" />
                            <select id="player2-select"></select>
                            <input type="number" id="player2-score" />
                            <button type="submit">Record Game</button>
                        </form>
                        <div id="game-feedback"></div>
                    </section>
                    <section id="game-history">
                        <select id="player-filter"></select>
                        <div id="game-list"></div>
                    </section>
                    <section id="leaderboard">
                        <div id="leaderboard-table"></div>
                    </section>
                </div>
            </body>
            </html>
        `, { url: 'http://localhost' });

        document = dom.window.document;
        window = dom.window;
        localStorage = {
            data: {},
            getItem(key) {
                return this.data[key] || null;
            },
            setItem(key, value) {
                this.data[key] = value;
            },
            removeItem(key) {
                delete this.data[key];
            },
            clear() {
                this.data = {};
            }
        };

        // Set up global objects
        global.document = document;
        global.window = window;
        global.localStorage = localStorage;

        // Clear any existing data
        PlayerManager.players = [];
        GameManager.games = [];
        localStorage.clear();
    });

    it('should initialize without errors when storage is empty', () => {
        expect(() => {
            PoolScoreTrackerApp.initialize();
        }).not.toThrow();

        expect(PlayerManager.players).toEqual([]);
        expect(GameManager.games).toEqual([]);
    });

    it('should load existing players and games from storage', () => {
        // Set up some data in storage
        const testData = {
            players: [
                { id: '1', name: 'Alice', gamesPlayed: 0, wins: 0, createdAt: new Date().toISOString() },
                { id: '2', name: 'Bob', gamesPlayed: 0, wins: 0, createdAt: new Date().toISOString() }
            ],
            games: [],
            version: '1.0'
        };

        localStorage.setItem('poolScoreTracker', JSON.stringify(testData));

        PoolScoreTrackerApp.initialize();

        expect(PlayerManager.players).toHaveLength(2);
        expect(PlayerManager.players[0].name).toBe('Alice');
        expect(PlayerManager.players[1].name).toBe('Bob');
    });

    it('should initialize all UI components', () => {
        PoolScoreTrackerApp.initialize();

        // Check that player count is rendered
        const playerCount = document.getElementById('player-count');
        expect(playerCount.textContent).toContain('Players: 0/20');

        // Check that player dropdowns are initialized
        const player1Select = document.getElementById('player1-select');
        expect(player1Select.innerHTML).toContain('Select Player 1');
    });

    it('should refresh all UI components', () => {
        PoolScoreTrackerApp.initialize();

        // Add a player
        PlayerManager.addPlayer('Test Player');

        // Refresh UI
        PoolScoreTrackerApp.refreshAllUI();

        // Check that player count is updated
        const playerCount = document.getElementById('player-count');
        expect(playerCount.textContent).toContain('Players: 1/20');
    });

    it('should reload data from storage', () => {
        PoolScoreTrackerApp.initialize();

        // Simulate external storage change
        const newData = {
            players: [
                { id: '1', name: 'Charlie', gamesPlayed: 0, wins: 0, createdAt: new Date().toISOString() }
            ],
            games: [],
            version: '1.0'
        };

        localStorage.setItem('poolScoreTracker', JSON.stringify(newData));

        // Reload data
        PoolScoreTrackerApp.reloadData();

        expect(PlayerManager.players).toHaveLength(1);
        expect(PlayerManager.players[0].name).toBe('Charlie');
    });

    it('should handle corrupted storage data gracefully', () => {
        // Set corrupted data
        localStorage.setItem('poolScoreTracker', 'invalid json');

        expect(() => {
            PoolScoreTrackerApp.initialize();
        }).not.toThrow();

        // Should initialize with empty data
        expect(PlayerManager.players).toEqual([]);
        expect(GameManager.games).toEqual([]);
    });

    it('should clear all data when requested', () => {
        // Add some data
        PlayerManager.players = [
            { id: '1', name: 'Alice', gamesPlayed: 0, wins: 0, createdAt: new Date().toISOString() }
        ];
        GameManager.games = [];

        // Mock confirm to return true
        global.confirm = vi.fn(() => true);

        PoolScoreTrackerApp.clearAllData();

        expect(PlayerManager.players).toEqual([]);
        expect(GameManager.games).toEqual([]);
        expect(localStorage.getItem('poolScoreTracker')).toBeNull();
    });

    it('should not clear data if user cancels', () => {
        // Add some data
        PlayerManager.players = [
            { id: '1', name: 'Alice', gamesPlayed: 0, wins: 0, createdAt: new Date().toISOString() }
        ];

        // Mock confirm to return false
        global.confirm = vi.fn(() => false);

        PoolScoreTrackerApp.clearAllData();

        // Data should still be there
        expect(PlayerManager.players).toHaveLength(1);
    });
});
