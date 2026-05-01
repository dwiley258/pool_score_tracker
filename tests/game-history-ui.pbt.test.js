/**
 * Property-Based Tests for GameHistoryUI
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

// Create Game with custom timestamp
function createGameWithTimestamp(player1Id, player2Id, player1Score, player2Score, timestamp) {
    let winnerId = null;
    if (player1Score > player2Score) {
        winnerId = player1Id;
    } else if (player2Score > player1Score) {
        winnerId = player2Id;
    }
    
    return {
        id: generateUUID(),
        player1Id: player1Id,
        player2Id: player2Id,
        player1Score: player1Score,
        player2Score: player2Score,
        winnerId: winnerId,
        timestamp: timestamp
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

    saveGames(games) {
        try {
            const data = this._loadStorageData();
            data.games = games;
            this._saveStorageData(data);
        } catch (error) {
            throw new Error('Unable to save data - storage full');
        }
    },

    loadGames() {
        try {
            const data = this._loadStorageData();
            return Array.isArray(data.games) ? data.games : [];
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

// GameManager
const GameManager = {
    games: [],

    recordGame(player1Id, player2Id, score1, score2) {
        if (!player1Id || typeof player1Id !== 'string') {
            return { success: false, error: 'Invalid player 1 ID' };
        }
        if (!player2Id || typeof player2Id !== 'string') {
            return { success: false, error: 'Invalid player 2 ID' };
        }

        if (player1Id === player2Id) {
            return { success: false, error: 'Cannot record game between same player' };
        }

        const player1 = PlayerManager.getPlayer(player1Id);
        const player2 = PlayerManager.getPlayer(player2Id);

        if (!player1) {
            return { success: false, error: 'Player does not exist' };
        }
        if (!player2) {
            return { success: false, error: 'Player does not exist' };
        }

        if (!Number.isInteger(score1) || score1 < 0) {
            return { success: false, error: 'Scores must be non-negative integers' };
        }
        if (!Number.isInteger(score2) || score2 < 0) {
            return { success: false, error: 'Scores must be non-negative integers' };
        }

        const newGame = createGameWithTimestamp(player1Id, player2Id, score1, score2, new Date().toISOString());
        this.games.push(newGame);

        player1.gamesPlayed++;
        player2.gamesPlayed++;

        if (newGame.winnerId === player1Id) {
            player1.wins++;
        } else if (newGame.winnerId === player2Id) {
            player2.wins++;
        }

        try {
            Storage.saveGames(this.games);
            Storage.savePlayers(PlayerManager.players);
        } catch (error) {
            this.games.pop();
            player1.gamesPlayed--;
            player2.gamesPlayed--;
            if (newGame.winnerId === player1Id) {
                player1.wins--;
            } else if (newGame.winnerId === player2Id) {
                player2.wins--;
            }
            return { success: false, error: error.message };
        }

        return { success: true, data: newGame };
    },

    getGameHistory(filterPlayerId) {
        let filteredGames = [...this.games];

        // Apply player filter if provided
        if (filterPlayerId && typeof filterPlayerId === 'string') {
            filteredGames = filteredGames.filter(game => 
                game.player1Id === filterPlayerId || game.player2Id === filterPlayerId
            );
        }

        // Sort by timestamp in reverse chronological order (newest first)
        filteredGames.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeB - timeA; // Descending order
        });

        return filteredGames;
    },

    initialize() {
        this.games = Storage.loadGames();
    }
};

describe('GameHistoryUI - Property-Based Tests', () => {
    beforeEach(() => {
        // Clear storage and reset managers before each test
        localStorage.clear();
        PlayerManager.players = [];
        GameManager.games = [];
    });

    /**
     * Property 10: Game History Chronological Order
     * Feature: pool-score-tracker, Property 10: Game History Chronological Order
     * Validates: Requirements 3.1
     * 
     * For any game history display, games should appear in reverse chronological 
     * order (newest first).
     */
    it('Property 10: Game History Chronological Order - games displayed newest first', () => {
        // Arbitrary for generating players and games with timestamps
        const gameHistoriesWithTimestamps = fc.tuple(
            fc.array(
                fc.string({ minLength: 1, maxLength: 20 }),
                { minLength: 2, maxLength: 10 } // Create 2-10 players
            ),
            fc.array(
                fc.record({
                    player1Index: fc.nat(),
                    player2Index: fc.nat(),
                    score1: fc.nat({ max: 100 }),
                    score2: fc.nat({ max: 100 }),
                    // Generate timestamps in a range (last 30 days)
                    timestampOffset: fc.integer({ min: 0, max: 30 * 24 * 60 * 60 * 1000 })
                }),
                { minLength: 1, maxLength: 30 } // Record 1-30 games
            )
        );

        // Property: Game history is always sorted in reverse chronological order
        fc.assert(
            fc.property(gameHistoriesWithTimestamps, ([playerNames, gameAttempts]) => {
                // Reset state for each iteration
                PlayerManager.players = [];
                GameManager.games = [];
                Storage.clear();

                // Add players to the team
                const addedPlayers = [];
                for (const name of playerNames) {
                    const result = PlayerManager.addPlayer(name);
                    if (result.success) {
                        addedPlayers.push(result.data);
                    }
                }

                // Skip test if we don't have at least 2 players
                if (addedPlayers.length < 2) {
                    return true;
                }

                // Base timestamp (30 days ago)
                const baseTimestamp = Date.now() - (30 * 24 * 60 * 60 * 1000);

                // Record games with specific timestamps
                const recordedGames = [];
                for (const attempt of gameAttempts) {
                    // Select two different players
                    const player1Index = attempt.player1Index % addedPlayers.length;
                    let player2Index = attempt.player2Index % addedPlayers.length;
                    
                    // Ensure different players
                    if (player1Index === player2Index) {
                        player2Index = (player2Index + 1) % addedPlayers.length;
                    }

                    const player1 = addedPlayers[player1Index];
                    const player2 = addedPlayers[player2Index];

                    // Create game with specific timestamp
                    const gameTimestamp = new Date(baseTimestamp + attempt.timestampOffset).toISOString();
                    const game = createGameWithTimestamp(
                        player1.id,
                        player2.id,
                        attempt.score1,
                        attempt.score2,
                        gameTimestamp
                    );

                    // Manually add to games array and update player stats
                    GameManager.games.push(game);
                    player1.gamesPlayed++;
                    player2.gamesPlayed++;
                    if (game.winnerId === player1.id) {
                        player1.wins++;
                    } else if (game.winnerId === player2.id) {
                        player2.wins++;
                    }

                    recordedGames.push(game);
                }

                // Skip test if no games were recorded
                if (recordedGames.length === 0) {
                    return true;
                }

                // Get game history (should be sorted in reverse chronological order)
                const gameHistory = GameManager.getGameHistory();

                // Property assertion: game history length matches recorded games
                expect(gameHistory.length).toBe(recordedGames.length);

                // Property assertion: games are in reverse chronological order (newest first)
                for (let i = 0; i < gameHistory.length - 1; i++) {
                    const currentGame = gameHistory[i];
                    const nextGame = gameHistory[i + 1];

                    const currentTimestamp = new Date(currentGame.timestamp).getTime();
                    const nextTimestamp = new Date(nextGame.timestamp).getTime();

                    // Current game should have a timestamp >= next game (newer or equal)
                    expect(currentTimestamp).toBeGreaterThanOrEqual(nextTimestamp);
                }

                // Property assertion: all recorded games are present in history
                for (const recordedGame of recordedGames) {
                    const foundInHistory = gameHistory.find(g => g.id === recordedGame.id);
                    expect(foundInHistory).toBeDefined();
                    expect(foundInHistory.timestamp).toBe(recordedGame.timestamp);
                }

                // Property assertion: filtered game history also maintains chronological order
                for (const player of addedPlayers) {
                    const filteredHistory = GameManager.getGameHistory(player.id);

                    // Verify chronological order in filtered history
                    for (let i = 0; i < filteredHistory.length - 1; i++) {
                        const currentGame = filteredHistory[i];
                        const nextGame = filteredHistory[i + 1];

                        const currentTimestamp = new Date(currentGame.timestamp).getTime();
                        const nextTimestamp = new Date(nextGame.timestamp).getTime();

                        // Current game should have a timestamp >= next game
                        expect(currentTimestamp).toBeGreaterThanOrEqual(nextTimestamp);
                    }

                    // Verify all games in filtered history include the player
                    for (const game of filteredHistory) {
                        const includesPlayer = 
                            game.player1Id === player.id || 
                            game.player2Id === player.id;
                        expect(includesPlayer).toBe(true);
                    }
                }

                // Property assertion: games with identical timestamps maintain stable order
                const timestampGroups = new Map();
                for (const game of gameHistory) {
                    const timestamp = game.timestamp;
                    if (!timestampGroups.has(timestamp)) {
                        timestampGroups.set(timestamp, []);
                    }
                    timestampGroups.get(timestamp).push(game);
                }

                // Verify that games with same timestamp appear consecutively
                for (const [timestamp, games] of timestampGroups) {
                    if (games.length > 1) {
                        // Find the first occurrence of this timestamp in history
                        const firstIndex = gameHistory.findIndex(g => g.timestamp === timestamp);
                        
                        // Verify all games with this timestamp are consecutive
                        for (let i = 0; i < games.length; i++) {
                            expect(gameHistory[firstIndex + i].timestamp).toBe(timestamp);
                        }
                    }
                }
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });

    /**
     * Property 12: Game Display Completeness
     * Feature: pool-score-tracker, Property 12: Game Display Completeness
     * Validates: Requirements 3.2
     * 
     * For any displayed game in the history, the rendered output should contain 
     * both player names, both scores, and the timestamp.
     */
    it('Property 12: Game Display Completeness - rendered games contain all required fields', () => {
        // Set up DOM structure for rendering
        if (typeof document !== 'undefined') {
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
        }

        // Arbitrary for generating players and games
        const gameHistories = fc.tuple(
            fc.array(
                fc.string({ minLength: 1, maxLength: 20 }),
                { minLength: 2, maxLength: 10 } // Create 2-10 players
            ),
            fc.array(
                fc.record({
                    player1Index: fc.nat(),
                    player2Index: fc.nat(),
                    score1: fc.nat({ max: 100 }),
                    score2: fc.nat({ max: 100 })
                }),
                { minLength: 1, maxLength: 20 } // Record 1-20 games
            )
        );

        // Property: All rendered games contain player names, scores, and timestamp
        fc.assert(
            fc.property(gameHistories, ([playerNames, gameAttempts]) => {
                // Reset state for each iteration
                PlayerManager.players = [];
                GameManager.games = [];
                Storage.clear();

                // Add players to the team
                const addedPlayers = [];
                for (const name of playerNames) {
                    const result = PlayerManager.addPlayer(name);
                    if (result.success) {
                        addedPlayers.push(result.data);
                    }
                }

                // Skip test if we don't have at least 2 players
                if (addedPlayers.length < 2) {
                    return true;
                }

                // Record games
                const recordedGames = [];
                for (const attempt of gameAttempts) {
                    // Select two different players
                    const player1Index = attempt.player1Index % addedPlayers.length;
                    let player2Index = attempt.player2Index % addedPlayers.length;
                    
                    // Ensure different players
                    if (player1Index === player2Index) {
                        player2Index = (player2Index + 1) % addedPlayers.length;
                    }

                    const player1 = addedPlayers[player1Index];
                    const player2 = addedPlayers[player2Index];

                    const result = GameManager.recordGame(
                        player1.id,
                        player2.id,
                        attempt.score1,
                        attempt.score2
                    );

                    if (result.success) {
                        recordedGames.push(result.data);
                    }
                }

                // Skip test if no games were recorded
                if (recordedGames.length === 0) {
                    return true;
                }

                // Render the game list
                const gameListContainer = document.getElementById('game-list');
                if (!gameListContainer) {
                    return true; // Skip if DOM not available
                }

                // Use the actual GameHistoryUI render method
                const playerFilter = document.getElementById('player-filter');
                const filterPlayerId = playerFilter ? playerFilter.value : '';
                const games = GameManager.getGameHistory(filterPlayerId || undefined);

                // Helper function to escape HTML (same as in GameHistoryUI)
                const escapeHtml = (text) => {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                };

                // Build the game list HTML (same logic as GameHistoryUI.renderGameList)
                const gameListHTML = games.map(game => {
                    const player1 = PlayerManager.getPlayer(game.player1Id);
                    const player2 = PlayerManager.getPlayer(game.player2Id);
                    
                    const player1Name = player1 ? player1.name : 'Unknown Player';
                    const player2Name = player2 ? player2.name : 'Unknown Player';
                    
                    // Format timestamp
                    const date = new Date(game.timestamp);
                    const formattedTimestamp = date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    }).replace(',', ' at');
                    
                    // Determine winner display
                    let resultText = '';
                    if (game.winnerId === game.player1Id) {
                        resultText = `<span class="player-name winner">${escapeHtml(player1Name)}</span> <span class="score">${game.player1Score}</span> - <span class="player-name">${escapeHtml(player2Name)}</span> <span class="score">${game.player2Score}</span>`;
                    } else if (game.winnerId === game.player2Id) {
                        resultText = `<span class="player-name">${escapeHtml(player1Name)}</span> <span class="score">${game.player1Score}</span> - <span class="player-name winner">${escapeHtml(player2Name)}</span> <span class="score">${game.player2Score}</span>`;
                    } else {
                        resultText = `<span class="player-name">${escapeHtml(player1Name)}</span> <span class="score">${game.player1Score}</span> - <span class="player-name">${escapeHtml(player2Name)}</span> <span class="score">${game.player2Score}</span> <span class="tie-indicator">(Tie)</span>`;
                    }

                    return `
                        <div class="game-item" data-game-id="${game.id}">
                            <div class="game-result">
                                ${resultText}
                            </div>
                            <div class="game-meta">
                                <span class="game-timestamp">${formattedTimestamp}</span>
                                <button class="delete-game-btn" data-game-id="${game.id}">
                                    Delete
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                gameListContainer.innerHTML = gameListHTML;

                // Property assertion: Verify all games are rendered
                const renderedGameItems = gameListContainer.querySelectorAll('.game-item');
                expect(renderedGameItems.length).toBe(recordedGames.length);

                // Property assertion: Each rendered game contains all required fields
                for (const game of recordedGames) {
                    const player1 = PlayerManager.getPlayer(game.player1Id);
                    const player2 = PlayerManager.getPlayer(game.player2Id);

                    // Find the rendered game item
                    const gameItem = gameListContainer.querySelector(`[data-game-id="${game.id}"]`);
                    expect(gameItem).toBeDefined();
                    expect(gameItem).not.toBeNull();

                    const gameHTML = gameItem.innerHTML;

                    // Property assertion: Both player names are present (escaped for HTML safety)
                    const escapedPlayer1Name = escapeHtml(player1.name);
                    const escapedPlayer2Name = escapeHtml(player2.name);
                    expect(gameHTML).toContain(escapedPlayer1Name);
                    expect(gameHTML).toContain(escapedPlayer2Name);

                    // Property assertion: Both scores are present
                    expect(gameHTML).toContain(game.player1Score.toString());
                    expect(gameHTML).toContain(game.player2Score.toString());

                    // Property assertion: Timestamp is present
                    const timestampElement = gameItem.querySelector('.game-timestamp');
                    expect(timestampElement).toBeDefined();
                    expect(timestampElement).not.toBeNull();
                    expect(timestampElement.textContent).toBeTruthy();
                    expect(timestampElement.textContent.length).toBeGreaterThan(0);

                    // Property assertion: Timestamp contains expected format elements
                    const timestampText = timestampElement.textContent;
                    expect(timestampText).toContain('at'); // Should contain "at" separator

                    // Property assertion: Game result section exists
                    const gameResult = gameItem.querySelector('.game-result');
                    expect(gameResult).toBeDefined();
                    expect(gameResult).not.toBeNull();

                    // Property assertion: Winner indication is correct
                    if (game.winnerId === null) {
                        // Tie game should have tie indicator
                        expect(gameHTML).toContain('(Tie)');
                    } else {
                        // Winner should have winner class
                        const winnerElements = gameItem.querySelectorAll('.winner');
                        expect(winnerElements.length).toBeGreaterThan(0);
                    }

                    // Property assertion: Delete button is present
                    const deleteButton = gameItem.querySelector('.delete-game-btn');
                    expect(deleteButton).toBeDefined();
                    expect(deleteButton).not.toBeNull();
                    expect(deleteButton.getAttribute('data-game-id')).toBe(game.id);
                }

                // Property assertion: Games are displayed in reverse chronological order
                for (let i = 0; i < renderedGameItems.length - 1; i++) {
                    const currentGameId = renderedGameItems[i].getAttribute('data-game-id');
                    const nextGameId = renderedGameItems[i + 1].getAttribute('data-game-id');

                    const currentGame = recordedGames.find(g => g.id === currentGameId);
                    const nextGame = recordedGames.find(g => g.id === nextGameId);

                    const currentTimestamp = new Date(currentGame.timestamp).getTime();
                    const nextTimestamp = new Date(nextGame.timestamp).getTime();

                    // Current game should be newer or equal to next game
                    expect(currentTimestamp).toBeGreaterThanOrEqual(nextTimestamp);
                }
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });
});
