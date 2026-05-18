/**
 * Tests for PoolScoreTrackerApp initialization
 * Feature: pool-score-tracker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    PoolScoreTrackerApp,
    PlayerManager,
    GameManager,
    GroupManager,
    Storage
} from '../app.js';

describe('PoolScoreTrackerApp Initialization', () => {
    beforeEach(async () => {
        PlayerManager.players = [];
        GameManager.games = [];
        GroupManager.groups = [];
        GroupManager.currentGroupId = null;

        document.body.innerHTML = `
            <div class="container">
                <section id="group-select-view">
                    <form id="create-group-form">
                        <input type="text" id="group-name-input" />
                        <button type="submit">Create Group</button>
                    </form>
                    <div id="group-feedback"></div>
                    <div id="group-list"></div>
                </section>
                <div id="main-app" style="display: none;">
                    <button id="back-to-groups"></button>
                    <span id="current-group-name"></span>
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
            </div>
        `;
    });

    it('should initialize without errors', async () => {
        await expect(PoolScoreTrackerApp.initialize()).resolves.not.toThrow();
    });

    it('should load existing players and games from storage', async () => {
        await PoolScoreTrackerApp.initialize();

        // After init with empty Firebase mock, players/games should be empty
        expect(PlayerManager.players).toEqual([]);
        expect(GameManager.games).toEqual([]);
    });

    it('should initialize all UI components', async () => {
        await PoolScoreTrackerApp.initialize();

        // Group select view should be visible
        const groupSelectView = document.getElementById('group-select-view');
        expect(groupSelectView.style.display).toBe('');

        // Main app should be hidden
        const mainApp = document.getElementById('main-app');
        expect(mainApp.style.display).toBe('none');
    });

    it('should refresh all UI components', async () => {
        await PoolScoreTrackerApp.initialize();

        // Should not throw when refreshing
        expect(() => PoolScoreTrackerApp.refreshAllUI()).not.toThrow();
    });

    it('should reload data from storage', async () => {
        await PoolScoreTrackerApp.initialize();

        // After reload, state should be consistent
        expect(PlayerManager.players).toEqual([]);
        expect(GameManager.games).toEqual([]);
    });

    it('should clear all data when requested', async () => {
        PlayerManager.players = [
            { id: '1', name: 'Alice', gamesPlayed: 0, wins: 0, createdAt: new Date().toISOString() }
        ];
        GameManager.games = [];

        global.confirm = vi.fn(() => true);

        await PoolScoreTrackerApp.clearAllData();

        expect(PlayerManager.players).toEqual([]);
        expect(GameManager.games).toEqual([]);
    });

    it('should not clear data if user cancels', () => {
        PlayerManager.players = [
            { id: '1', name: 'Alice', gamesPlayed: 0, wins: 0, createdAt: new Date().toISOString() }
        ];

        global.confirm = vi.fn(() => false);

        PoolScoreTrackerApp.clearAllData();

        expect(PlayerManager.players).toHaveLength(1);
    });
});
