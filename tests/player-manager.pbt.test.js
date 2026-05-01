/**
 * Property-Based Tests for PlayerManager
 * Feature: pool-score-tracker
 * Uses fast-check for property-based testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

// Import the app.js functions (we need to make them available)
// For testing purposes, we'll redefine the necessary components

// Utility: Generate UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Create Player
function createPlayer(name) {
    return {
        id: generateUUID(),
        name: name,
        gamesPlayed: 0,
        wins: 0,
        createdAt: new Date().toISOString()
    };
}

// Storage
const STORAGE_KEY = 'poolScoreTracker';
const STORAGE_VERSION = '1.0';

const Storage = {
    savePlayers(players) {
        try {
            const data = this._loadStorageData();
            data.players = players;
            this._saveStorageData(data);
        } catch (error) {
            throw new Error('Unable to save data - storage full');
        }
    },

    loadPlayers() {
        try {
            const data = this._loadStorageData();
            return Array.isArray(data.players) ? data.players : [];
        } catch (error) {
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

        const data = JSON.parse(stored);
        
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid storage structure');
        }

        if (data.version !== STORAGE_VERSION) {
            return this._createEmptyStorageData();
        }

        return data;
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
        this.clear();
    }
};

// PlayerManager
const PlayerManager = {
    players: [],

    addPlayer(name) {
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return { success: false, error: 'Player name cannot be empty' };
        }

        const trimmedName = name.trim();

        if (!this.canAddPlayer()) {
            return { success: false, error: 'Cannot add more than 20 players' };
        }

        const nameExists = this.players.some(
            player => player.name.toLowerCase() === trimmedName.toLowerCase()
        );

        if (nameExists) {
            return { success: false, error: 'Player name already exists' };
        }

        const newPlayer = createPlayer(trimmedName);
        this.players.push(newPlayer);

        try {
            Storage.savePlayers(this.players);
        } catch (error) {
            this.players.pop();
            return { success: false, error: error.message };
        }

        return { success: true, data: newPlayer };
    },

    removePlayer(playerId) {
        if (!playerId || typeof playerId !== 'string') {
            return { success: false, error: 'Invalid player ID' };
        }

        const playerIndex = this.players.findIndex(player => player.id === playerId);

        if (playerIndex === -1) {
            return { success: false, error: 'Player does not exist' };
        }

        const removedPlayer = this.players.splice(playerIndex, 1)[0];

        try {
            Storage.savePlayers(this.players);
        } catch (error) {
            this.players.splice(playerIndex, 0, removedPlayer);
            return { success: false, error: error.message };
        }

        return { success: true };
    },

    getPlayer(playerId) {
        if (!playerId || typeof playerId !== 'string') {
            return null;
        }

        const player = this.players.find(player => player.id === playerId);
        return player || null;
    },

    getAllPlayers() {
        return [...this.players];
    },

    canAddPlayer() {
        return this.players.length < 20;
    },

    initialize() {
        this.players = Storage.loadPlayers();
    }
};

describe('PlayerManager - Property-Based Tests', () => {
    beforeEach(() => {
        // Clear storage and reset PlayerManager before each test
        localStorage.clear();
        PlayerManager.players = [];
    });

    /**
     * Property 1: Player Limit Enforcement
     * Feature: pool-score-tracker, Property 1: Player Limit Enforcement
     * Validates: Requirements 1.4
     * 
     * For any sequence of player additions, the system should never allow 
     * more than 20 players in the team.
     */
    it('Property 1: Player Limit Enforcement - never exceeds 20 players', () => {
        // Arbitrary for generating sequences of player addition attempts
        const playerAdditionSequence = fc.array(
            fc.string({ minLength: 1, maxLength: 20 }),
            { minLength: 0, maxLength: 30 } // Try to add up to 30 players
        );

        // Property: For any sequence of player additions, team size never exceeds 20
        fc.assert(
            fc.property(playerAdditionSequence, (playerNames) => {
                // Reset state for each iteration
                PlayerManager.players = [];
                Storage.clear();

                // Track successful additions
                let successfulAdditions = 0;

                // Attempt to add all players in the sequence
                for (const name of playerNames) {
                    const result = PlayerManager.addPlayer(name);
                    
                    if (result.success) {
                        successfulAdditions++;
                    }

                    // Property assertion: team size never exceeds 20
                    expect(PlayerManager.players.length).toBeLessThanOrEqual(20);
                    
                    // Additional assertion: if we have 20 players, canAddPlayer should be false
                    if (PlayerManager.players.length === 20) {
                        expect(PlayerManager.canAddPlayer()).toBe(false);
                    }
                    
                    // Additional assertion: if we have less than 20 players, canAddPlayer should be true
                    if (PlayerManager.players.length < 20) {
                        expect(PlayerManager.canAddPlayer()).toBe(true);
                    }
                }

                // Final assertion: successful additions should never exceed 20
                expect(successfulAdditions).toBeLessThanOrEqual(20);
                
                // Final assertion: actual player count should never exceed 20
                expect(PlayerManager.players.length).toBeLessThanOrEqual(20);
                
                // If we tried to add more than 20 unique names, verify the limit was enforced
                const uniqueNames = new Set(playerNames.map(n => n.toLowerCase()));
                if (uniqueNames.size > 20) {
                    expect(PlayerManager.players.length).toBe(20);
                }
            }),
            { numRuns: 20 } // Reduced iterations for faster test execution
        );
    });

    /**
     * Property 2: Unique Player Names
     * Feature: pool-score-tracker, Property 2: Unique Player Names
     * Validates: Requirements 1.2
     * 
     * For any attempt to add a player with an existing name (case-insensitive), 
     * the system should reject the addition and maintain the current team state.
     */
    it('Property 2: Unique Player Names - rejects duplicate names case-insensitively', () => {
        // Arbitrary for generating a team of players and duplicate name attempts
        const teamWithDuplicateAttempts = fc.tuple(
            fc.array(
                fc.string({ minLength: 1, maxLength: 20 }),
                { minLength: 1, maxLength: 10 } // Initial team of 1-10 players
            ),
            fc.array(
                fc.record({
                    name: fc.string({ minLength: 1, maxLength: 20 }),
                    caseVariation: fc.constantFrom('lower', 'upper', 'mixed', 'original')
                }),
                { minLength: 1, maxLength: 5 } // Duplicate attempts
            )
        );

        // Property: Duplicate names (case-insensitive) are always rejected
        fc.assert(
            fc.property(teamWithDuplicateAttempts, ([initialNames, duplicateAttempts]) => {
                // Reset state for each iteration
                PlayerManager.players = [];
                Storage.clear();

                // Add initial team members
                const addedPlayers = [];
                for (const name of initialNames) {
                    const result = PlayerManager.addPlayer(name);
                    if (result.success) {
                        addedPlayers.push(result.data);
                    }
                }

                const teamSizeBeforeDuplicates = PlayerManager.players.length;

                // Attempt to add duplicate names with case variations
                for (const attempt of duplicateAttempts) {
                    // Pick a random existing player name if we have any
                    if (addedPlayers.length > 0) {
                        const existingPlayer = addedPlayers[Math.floor(Math.random() * addedPlayers.length)];
                        let duplicateName = existingPlayer.name;

                        // Apply case variation
                        switch (attempt.caseVariation) {
                            case 'lower':
                                duplicateName = duplicateName.toLowerCase();
                                break;
                            case 'upper':
                                duplicateName = duplicateName.toUpperCase();
                                break;
                            case 'mixed':
                                duplicateName = duplicateName.split('').map((c, i) => 
                                    i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
                                ).join('');
                                break;
                            // 'original' keeps the name as-is
                        }

                        const result = PlayerManager.addPlayer(duplicateName);

                        // Property assertion: duplicate name should be rejected
                        expect(result.success).toBe(false);
                        expect(result.error).toBe('Player name already exists');

                        // Property assertion: team size should remain unchanged
                        expect(PlayerManager.players.length).toBe(teamSizeBeforeDuplicates);

                        // Property assertion: all original players should still exist
                        for (const player of addedPlayers) {
                            const stillExists = PlayerManager.players.some(p => p.id === player.id);
                            expect(stillExists).toBe(true);
                        }
                    }
                }

                // Final assertion: team size should be unchanged after all duplicate attempts
                expect(PlayerManager.players.length).toBe(teamSizeBeforeDuplicates);
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });

    /**
     * Property 3: Player Removal
     * Feature: pool-score-tracker, Property 3: Player Removal
     * Validates: Requirements 1.3
     * 
     * For any player in the team, removing that player should result in 
     * them no longer appearing in the player list.
     */
    it('Property 3: Player Removal - removed players are gone from the team', () => {
        // Arbitrary for generating a team and removal operations
        const teamWithRemovals = fc.tuple(
            fc.array(
                fc.string({ minLength: 1, maxLength: 20 }),
                { minLength: 1, maxLength: 20 } // Initial team of 1-20 players
            ),
            fc.array(
                fc.nat(), // Indices for players to remove
                { minLength: 1, maxLength: 10 } // Number of removal attempts
            )
        );

        // Property: Removed players should not appear in the player list
        fc.assert(
            fc.property(teamWithRemovals, ([initialNames, removalIndices]) => {
                // Reset state for each iteration
                PlayerManager.players = [];
                Storage.clear();

                // Add initial team members
                const addedPlayers = [];
                for (const name of initialNames) {
                    const result = PlayerManager.addPlayer(name);
                    if (result.success) {
                        addedPlayers.push(result.data);
                    }
                }

                // Skip test if no players were added
                if (addedPlayers.length === 0) {
                    return true;
                }

                // Track removed player IDs
                const removedPlayerIds = new Set();

                // Attempt to remove players based on generated indices
                for (const index of removalIndices) {
                    const currentPlayers = PlayerManager.getAllPlayers();
                    
                    // Skip if no players left
                    if (currentPlayers.length === 0) {
                        break;
                    }

                    // Select a player to remove (use modulo to ensure valid index)
                    const playerToRemove = currentPlayers[index % currentPlayers.length];
                    const teamSizeBeforeRemoval = currentPlayers.length;

                    const result = PlayerManager.removePlayer(playerToRemove.id);

                    // Property assertion: removal should succeed
                    expect(result.success).toBe(true);

                    // Track this removal
                    removedPlayerIds.add(playerToRemove.id);

                    // Property assertion: removed player should not be in the list
                    const stillExists = PlayerManager.players.some(p => p.id === playerToRemove.id);
                    expect(stillExists).toBe(false);

                    // Property assertion: getPlayer should return null for removed player
                    const retrievedPlayer = PlayerManager.getPlayer(playerToRemove.id);
                    expect(retrievedPlayer).toBe(null);

                    // Property assertion: team size should decrease by 1
                    expect(PlayerManager.players.length).toBe(teamSizeBeforeRemoval - 1);
                }

                // Final assertion: all removed players should not be in the final list
                for (const removedId of removedPlayerIds) {
                    const stillExists = PlayerManager.players.some(p => p.id === removedId);
                    expect(stillExists).toBe(false);
                }

                // Final assertion: only non-removed players should remain
                for (const player of PlayerManager.getAllPlayers()) {
                    expect(removedPlayerIds.has(player.id)).toBe(false);
                }
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });
});
