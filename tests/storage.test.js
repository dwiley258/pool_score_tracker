/**
 * Property-Based Tests for Storage Layer
 * Feature: pool-score-tracker
 * Uses fast-check for property-based testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Mock localStorage for Node.js environment
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();

global.localStorage = localStorageMock;

// Import application code (we'll need to export these from app.js)
// For now, we'll inline the necessary code

const STORAGE_KEY = 'poolScoreTracker';
const STORAGE_VERSION = '1.0';

const Storage = {
    savePlayers(players) {
        try {
            const data = this._loadStorageData();
            data.players = players;
            this._saveStorageData(data);
        } catch (error) {
            console.error('Failed to save players:', error);
            throw new Error('Unable to save data - storage full');
        }
    },

    loadPlayers() {
        try {
            const data = this._loadStorageData();
            return Array.isArray(data.players) ? data.players : [];
        } catch (error) {
            console.error('Failed to load players:', error);
            this._handleCorruptedData();
            return [];
        }
    },

    saveGames(games) {
        try {
            const data = this._loadStorageData();
            data.games = games;
            this._saveStorageData(data);
        } catch (error) {
            console.error('Failed to save games:', error);
            throw new Error('Unable to save data - storage full');
        }
    },

    loadGames() {
        try {
            const data = this._loadStorageData();
            return Array.isArray(data.games) ? data.games : [];
        } catch (error) {
            console.error('Failed to load games:', error);
            this._handleCorruptedData();
            return [];
        }
    },

    clear() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear storage:', error);
        }
    },

    _loadStorageData() {
        const stored = localStorage.getItem(STORAGE_KEY);
        
        if (!stored) {
            return this._createEmptyStorageData();
        }

        try {
            const data = JSON.parse(stored);
            
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid storage structure');
            }

            if (data.version !== STORAGE_VERSION) {
                console.warn('Storage version mismatch, initializing fresh data');
                return this._createEmptyStorageData();
            }

            return data;
        } catch (error) {
            console.error('Parse error in storage data:', error);
            throw error;
        }
    },

    _saveStorageData(data) {
        const serialized = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, serialized);
    },

    _createEmptyStorageData() {
        return {
            players: [],
            games: [],
            version: STORAGE_VERSION
        };
    },

    _handleCorruptedData() {
        console.warn('Corrupted storage data detected, clearing and initializing empty state');
        this.clear();
    }
};

describe('Storage Layer - Property-Based Tests', () => {
    beforeEach(() => {
        Storage.clear();
    });

    afterEach(() => {
        Storage.clear();
    });

    /**
     * Property 15: Storage Round Trip
     * Validates: Requirements 5.1, 5.2
     * 
     * For any valid application state (players and games), serializing to local storage
     * then deserializing should produce an equivalent state with all players and games intact.
     */
    it('Property 15: Storage Round Trip - save/load produces equivalent state', () => {
        // Arbitrary for Player
        const playerArbitrary = fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            gamesPlayed: fc.nat({ max: 1000 }),
            wins: fc.nat({ max: 1000 }),
            createdAt: fc.date().map(d => d.toISOString())
        });

        // Arbitrary for Game
        const gameArbitrary = fc.record({
            id: fc.uuid(),
            player1Id: fc.uuid(),
            player2Id: fc.uuid(),
            player1Score: fc.nat({ max: 100 }),
            player2Score: fc.nat({ max: 100 }),
            winnerId: fc.oneof(fc.uuid(), fc.constant(null)),
            timestamp: fc.date().map(d => d.toISOString())
        });

        // Arbitrary for application state
        const appStateArbitrary = fc.record({
            players: fc.array(playerArbitrary, { maxLength: 20 }),
            games: fc.array(gameArbitrary, { maxLength: 100 })
        });

        // Property: For any valid application state, save then load should produce equivalent state
        fc.assert(
            fc.property(appStateArbitrary, (state) => {
                // Clear storage before each iteration
                Storage.clear();

                // Save the state
                Storage.savePlayers(state.players);
                Storage.saveGames(state.games);

                // Load the state back
                const loadedPlayers = Storage.loadPlayers();
                const loadedGames = Storage.loadGames();

                // Verify players match
                expect(loadedPlayers).toHaveLength(state.players.length);
                
                for (let i = 0; i < state.players.length; i++) {
                    const original = state.players[i];
                    const loaded = loadedPlayers[i];

                    expect(loaded.id).toBe(original.id);
                    expect(loaded.name).toBe(original.name);
                    expect(loaded.gamesPlayed).toBe(original.gamesPlayed);
                    expect(loaded.wins).toBe(original.wins);
                    expect(loaded.createdAt).toBe(original.createdAt);
                }

                // Verify games match
                expect(loadedGames).toHaveLength(state.games.length);
                
                for (let i = 0; i < state.games.length; i++) {
                    const original = state.games[i];
                    const loaded = loadedGames[i];

                    expect(loaded.id).toBe(original.id);
                    expect(loaded.player1Id).toBe(original.player1Id);
                    expect(loaded.player2Id).toBe(original.player2Id);
                    expect(loaded.player1Score).toBe(original.player1Score);
                    expect(loaded.player2Score).toBe(original.player2Score);
                    expect(loaded.winnerId).toBe(original.winnerId);
                    expect(loaded.timestamp).toBe(original.timestamp);
                }

                return true;
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });
});
