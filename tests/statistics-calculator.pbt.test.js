/**
 * Property-Based Tests for StatisticsCalculator
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

// Create Game
function createGame(player1Id, player2Id, player1Score, player2Score) {
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
        timestamp: new Date().toISOString()
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

        const newGame = createGame(player1Id, player2Id, score1, score2);
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

    deleteGame(gameId) {
        if (!gameId || typeof gameId !== 'string') {
            return { success: false, error: 'Invalid game ID' };
        }

        const gameIndex = this.games.findIndex(game => game.id === gameId);

        if (gameIndex === -1) {
            return { success: false, error: 'Game does not exist' };
        }

        const game = this.games[gameIndex];

        // Get the players involved
        const player1 = PlayerManager.getPlayer(game.player1Id);
        const player2 = PlayerManager.getPlayer(game.player2Id);

        // Store original stats for rollback
        const originalStats = {
            player1: player1 ? { gamesPlayed: player1.gamesPlayed, wins: player1.wins } : null,
            player2: player2 ? { gamesPlayed: player2.gamesPlayed, wins: player2.wins } : null
        };

        // Update player statistics (decrement)
        if (player1) {
            player1.gamesPlayed--;
            if (game.winnerId === player1.id) {
                player1.wins--;
            }
        }

        if (player2) {
            player2.gamesPlayed--;
            if (game.winnerId === player2.id) {
                player2.wins--;
            }
        }

        // Remove the game
        const removedGame = this.games.splice(gameIndex, 1)[0];

        // Persist to storage
        try {
            Storage.saveGames(this.games);
            if (player1 || player2) {
                Storage.savePlayers(PlayerManager.players);
            }
        } catch (error) {
            // Rollback on storage failure
            this.games.splice(gameIndex, 0, removedGame);
            if (player1 && originalStats.player1) {
                player1.gamesPlayed = originalStats.player1.gamesPlayed;
                player1.wins = originalStats.player1.wins;
            }
            if (player2 && originalStats.player2) {
                player2.gamesPlayed = originalStats.player2.gamesPlayed;
                player2.wins = originalStats.player2.wins;
            }
            return { success: false, error: error.message };
        }

        return { success: true };
    },

    initialize() {
        this.games = Storage.loadGames();
    }
};

// StatisticsCalculator
const StatisticsCalculator = {
    calculatePlayerStats(playerId, games) {
        const stats = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            winPercentage: 0
        };

        const playerGames = games.filter(game => 
            game.player1Id === playerId || game.player2Id === playerId
        );

        stats.gamesPlayed = playerGames.length;

        playerGames.forEach(game => {
            if (game.winnerId === playerId) {
                stats.wins++;
            } else if (game.winnerId === null) {
                stats.ties++;
            } else {
                stats.losses++;
            }
        });

        if (stats.gamesPlayed > 0) {
            stats.winPercentage = parseFloat(((stats.wins / stats.gamesPlayed) * 100).toFixed(2));
        }

        return stats;
    },

    generateLeaderboard(players) {
        const games = GameManager.games;
        
        // Calculate stats for each player
        const entries = players.map(player => {
            const stats = this.calculatePlayerStats(player.id, games);
            return {
                player: player,
                stats: stats,
                rank: 0 // Will be assigned after sorting
            };
        });

        // Sort by win percentage (descending), then by total wins (descending)
        entries.sort((a, b) => {
            // First compare by win percentage
            if (b.stats.winPercentage !== a.stats.winPercentage) {
                return b.stats.winPercentage - a.stats.winPercentage;
            }
            // If win percentages are equal, compare by total wins
            return b.stats.wins - a.stats.wins;
        });

        // Assign ranks
        entries.forEach((entry, index) => {
            entry.rank = index + 1;
        });

        return entries;
    }
};

describe('StatisticsCalculator - Property-Based Tests', () => {
    beforeEach(() => {
        // Clear storage and reset managers before each test
        localStorage.clear();
        PlayerManager.players = [];
        GameManager.games = [];
    });

    /**
     * Property 6: Statistics Consistency - Wins
     * Feature: pool-score-tracker, Property 6: Statistics Consistency - Wins
     * Validates: Requirements 2.4, 4.2
     * 
     * For any player, their stored wins count should equal the number of games 
     * in the game history where they were the winner.
     */
    it('Property 6: Statistics Consistency - Wins - stored wins match actual wins', () => {
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
                { minLength: 1, maxLength: 30 } // Record 1-30 games
            )
        );

        // Property: Player wins count matches actual wins in game history
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

                    // Record the game
                    GameManager.recordGame(
                        player1.id,
                        player2.id,
                        attempt.score1,
                        attempt.score2
                    );
                }

                // Verify wins consistency for each player
                for (const player of addedPlayers) {
                    // Count actual wins from game history
                    const actualWins = GameManager.games.filter(game => 
                        game.winnerId === player.id
                    ).length;

                    // Property assertion: stored wins should match actual wins
                    expect(player.wins).toBe(actualWins);

                    // Property assertion: calculatePlayerStats should also match
                    const calculatedStats = StatisticsCalculator.calculatePlayerStats(
                        player.id, 
                        GameManager.games
                    );
                    expect(calculatedStats.wins).toBe(actualWins);

                    // Property assertion: stored wins should match calculated wins
                    expect(player.wins).toBe(calculatedStats.wins);
                }

                // Additional verification: sum of all wins should not exceed total games
                const totalWins = addedPlayers.reduce((sum, player) => sum + player.wins, 0);
                const totalGames = GameManager.games.length;
                
                // Each game has at most 1 winner (ties have no winner)
                expect(totalWins).toBeLessThanOrEqual(totalGames);

                // Verify that wins + ties for all players equals 2 * total games
                // (each game involves 2 players)
                const totalParticipations = addedPlayers.reduce(
                    (sum, player) => sum + player.gamesPlayed, 
                    0
                );
                expect(totalParticipations).toBe(totalGames * 2);
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });

    /**
     * Property 7: Statistics Consistency - Games Played
     * Feature: pool-score-tracker, Property 7: Statistics Consistency - Games Played
     * Validates: Requirements 2.4, 4.1
     * 
     * For any player, their stored gamesPlayed count should equal the number of games 
     * in the game history where they participated.
     */
    it('Property 7: Statistics Consistency - Games Played - stored games played match actual participation', () => {
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
                { minLength: 1, maxLength: 30 } // Record 1-30 games
            )
        );

        // Property: Player gamesPlayed count matches actual participation in game history
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

                    // Record the game
                    GameManager.recordGame(
                        player1.id,
                        player2.id,
                        attempt.score1,
                        attempt.score2
                    );
                }

                // Verify games played consistency for each player
                for (const player of addedPlayers) {
                    // Count actual games played from game history
                    const actualGamesPlayed = GameManager.games.filter(game => 
                        game.player1Id === player.id || game.player2Id === player.id
                    ).length;

                    // Property assertion: stored gamesPlayed should match actual participation
                    expect(player.gamesPlayed).toBe(actualGamesPlayed);

                    // Property assertion: calculatePlayerStats should also match
                    const calculatedStats = StatisticsCalculator.calculatePlayerStats(
                        player.id, 
                        GameManager.games
                    );
                    expect(calculatedStats.gamesPlayed).toBe(actualGamesPlayed);

                    // Property assertion: stored gamesPlayed should match calculated gamesPlayed
                    expect(player.gamesPlayed).toBe(calculatedStats.gamesPlayed);
                }

                // Additional verification: sum of all gamesPlayed should equal 2 * total games
                // (each game involves exactly 2 players)
                const totalGamesPlayed = addedPlayers.reduce(
                    (sum, player) => sum + player.gamesPlayed, 
                    0
                );
                const totalGames = GameManager.games.length;
                expect(totalGamesPlayed).toBe(totalGames * 2);

                // Verify that wins + losses + ties equals gamesPlayed for each player
                for (const player of addedPlayers) {
                    const calculatedStats = StatisticsCalculator.calculatePlayerStats(
                        player.id, 
                        GameManager.games
                    );
                    const sumOfOutcomes = calculatedStats.wins + calculatedStats.losses + calculatedStats.ties;
                    expect(sumOfOutcomes).toBe(calculatedStats.gamesPlayed);
                }
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });

    /**
     * Property 9: Leaderboard Ordering
     * Feature: pool-score-tracker, Property 9: Leaderboard Ordering
     * Validates: Requirements 4.4, 4.5
     * 
     * For any leaderboard, players should be ordered by win percentage descending, 
     * with ties broken by total wins descending.
     */
    it('Property 9: Leaderboard Ordering - correct sorting with tie-breaking', () => {
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
                { minLength: 1, maxLength: 30 } // Record 1-30 games
            )
        );

        // Property: Leaderboard is sorted by win percentage desc, then by wins desc
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

                    // Record the game
                    GameManager.recordGame(
                        player1.id,
                        player2.id,
                        attempt.score1,
                        attempt.score2
                    );
                }

                // Generate leaderboard
                const leaderboard = StatisticsCalculator.generateLeaderboard(addedPlayers);

                // Property assertion: leaderboard should have same number of players
                expect(leaderboard.length).toBe(addedPlayers.length);

                // Property assertion: verify correct ordering
                for (let i = 0; i < leaderboard.length - 1; i++) {
                    const current = leaderboard[i];
                    const next = leaderboard[i + 1];

                    // Current player should have higher or equal win percentage
                    if (current.stats.winPercentage !== next.stats.winPercentage) {
                        // If win percentages differ, current should be higher
                        expect(current.stats.winPercentage).toBeGreaterThan(next.stats.winPercentage);
                    } else {
                        // If win percentages are equal, current should have more or equal wins
                        expect(current.stats.wins).toBeGreaterThanOrEqual(next.stats.wins);
                    }
                }

                // Property assertion: ranks should be sequential starting from 1
                leaderboard.forEach((entry, index) => {
                    expect(entry.rank).toBe(index + 1);
                });

                // Property assertion: all players should be in the leaderboard
                const leaderboardPlayerIds = new Set(leaderboard.map(entry => entry.player.id));
                addedPlayers.forEach(player => {
                    expect(leaderboardPlayerIds.has(player.id)).toBe(true);
                });

                // Property assertion: verify stats consistency in leaderboard
                leaderboard.forEach(entry => {
                    const calculatedStats = StatisticsCalculator.calculatePlayerStats(
                        entry.player.id,
                        GameManager.games
                    );
                    expect(entry.stats.gamesPlayed).toBe(calculatedStats.gamesPlayed);
                    expect(entry.stats.wins).toBe(calculatedStats.wins);
                    expect(entry.stats.winPercentage).toBe(calculatedStats.winPercentage);
                });
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });

    /**
     * Property 8: Win Percentage Calculation
     * Feature: pool-score-tracker, Property 8: Win Percentage Calculation
     * Validates: Requirements 4.3
     * 
     * For any player with at least one game played, their win percentage should equal 
     * (wins / gamesPlayed) * 100, rounded to two decimal places.
     */
    it('Property 8: Win Percentage Calculation - win percentage formula is correct', () => {
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
                { minLength: 1, maxLength: 30 } // Record 1-30 games
            )
        );

        // Property: Win percentage equals (wins / gamesPlayed) * 100, rounded to 2 decimals
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

                    // Record the game
                    GameManager.recordGame(
                        player1.id,
                        player2.id,
                        attempt.score1,
                        attempt.score2
                    );
                }

                // Verify win percentage calculation for each player
                for (const player of addedPlayers) {
                    const calculatedStats = StatisticsCalculator.calculatePlayerStats(
                        player.id, 
                        GameManager.games
                    );

                    // Property assertion: if player has played games, verify win percentage formula
                    if (calculatedStats.gamesPlayed > 0) {
                        const expectedWinPercentage = parseFloat(
                            ((calculatedStats.wins / calculatedStats.gamesPlayed) * 100).toFixed(2)
                        );
                        
                        // Verify calculated win percentage matches the formula
                        expect(calculatedStats.winPercentage).toBe(expectedWinPercentage);

                        // Additional verification: win percentage should be between 0 and 100
                        expect(calculatedStats.winPercentage).toBeGreaterThanOrEqual(0);
                        expect(calculatedStats.winPercentage).toBeLessThanOrEqual(100);

                        // Verify win percentage is rounded to 2 decimal places
                        const decimalPlaces = (calculatedStats.winPercentage.toString().split('.')[1] || '').length;
                        expect(decimalPlaces).toBeLessThanOrEqual(2);
                    } else {
                        // If no games played, win percentage should be 0
                        expect(calculatedStats.winPercentage).toBe(0);
                    }
                }

                // Additional verification: players with 100% wins should have winPercentage = 100
                for (const player of addedPlayers) {
                    const calculatedStats = StatisticsCalculator.calculatePlayerStats(
                        player.id, 
                        GameManager.games
                    );

                    if (calculatedStats.gamesPlayed > 0 && calculatedStats.wins === calculatedStats.gamesPlayed) {
                        expect(calculatedStats.winPercentage).toBe(100);
                    }

                    // Players with 0 wins should have winPercentage = 0
                    if (calculatedStats.gamesPlayed > 0 && calculatedStats.wins === 0) {
                        expect(calculatedStats.winPercentage).toBe(0);
                    }
                }
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });
});

    /**
     * Property 14: Game Deletion Updates Statistics
     * Feature: pool-score-tracker, Property 14: Game Deletion Updates Statistics
     * Validates: Requirements 3.5
     * 
     * For any game deletion, the affected players' statistics (wins and gamesPlayed) 
     * should be recalculated to match the remaining game history.
     */
    it('Property 14: Game Deletion Updates Statistics - statistics are recalculated correctly after deletion', () => {
        // Arbitrary for generating players, games, and deletions
        const gameHistoriesWithDeletions = fc.tuple(
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
                { minLength: 2, maxLength: 30 } // Record 2-30 games
            ),
            fc.array(
                fc.nat(),
                { minLength: 1, maxLength: 10 } // Delete 1-10 games
            )
        );

        // Property: After game deletion, player statistics match the remaining game history
        fc.assert(
            fc.property(gameHistoriesWithDeletions, ([playerNames, gameAttempts, deletionIndices]) => {
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

                    // Record the game
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

                // Delete random games
                const gamesToDelete = [];
                for (const deleteIndex of deletionIndices) {
                    const gameIndex = deleteIndex % recordedGames.length;
                    const gameToDelete = recordedGames[gameIndex];
                    
                    // Only delete if not already marked for deletion
                    if (!gamesToDelete.find(g => g.id === gameToDelete.id)) {
                        gamesToDelete.push(gameToDelete);
                    }
                }

                // Perform deletions
                for (const gameToDelete of gamesToDelete) {
                    // Get players before deletion
                    const player1 = PlayerManager.getPlayer(gameToDelete.player1Id);
                    const player2 = PlayerManager.getPlayer(gameToDelete.player2Id);

                    // Store stats before deletion
                    const player1StatsBefore = player1 ? {
                        gamesPlayed: player1.gamesPlayed,
                        wins: player1.wins
                    } : null;
                    const player2StatsBefore = player2 ? {
                        gamesPlayed: player2.gamesPlayed,
                        wins: player2.wins
                    } : null;

                    // Delete the game
                    const deleteResult = GameManager.deleteGame(gameToDelete.id);

                    // Property assertion: deletion should succeed
                    expect(deleteResult.success).toBe(true);

                    // Property assertion: player1 stats should be decremented correctly
                    if (player1 && player1StatsBefore) {
                        expect(player1.gamesPlayed).toBe(player1StatsBefore.gamesPlayed - 1);
                        
                        if (gameToDelete.winnerId === player1.id) {
                            expect(player1.wins).toBe(player1StatsBefore.wins - 1);
                        } else {
                            expect(player1.wins).toBe(player1StatsBefore.wins);
                        }
                    }

                    // Property assertion: player2 stats should be decremented correctly
                    if (player2 && player2StatsBefore) {
                        expect(player2.gamesPlayed).toBe(player2StatsBefore.gamesPlayed - 1);
                        
                        if (gameToDelete.winnerId === player2.id) {
                            expect(player2.wins).toBe(player2StatsBefore.wins - 1);
                        } else {
                            expect(player2.wins).toBe(player2StatsBefore.wins);
                        }
                    }
                }

                // Final verification: all player statistics should match the remaining game history
                for (const player of addedPlayers) {
                    // Calculate expected stats from remaining games
                    const calculatedStats = StatisticsCalculator.calculatePlayerStats(
                        player.id,
                        GameManager.games
                    );

                    // Property assertion: stored gamesPlayed matches calculated gamesPlayed
                    expect(player.gamesPlayed).toBe(calculatedStats.gamesPlayed);

                    // Property assertion: stored wins matches calculated wins
                    expect(player.wins).toBe(calculatedStats.wins);

                    // Property assertion: stats are consistent with actual game history
                    const actualGamesPlayed = GameManager.games.filter(game =>
                        game.player1Id === player.id || game.player2Id === player.id
                    ).length;
                    expect(player.gamesPlayed).toBe(actualGamesPlayed);

                    const actualWins = GameManager.games.filter(game =>
                        game.winnerId === player.id
                    ).length;
                    expect(player.wins).toBe(actualWins);
                }

                // Additional verification: sum of all gamesPlayed should equal 2 * remaining games
                const totalGamesPlayed = addedPlayers.reduce(
                    (sum, player) => sum + player.gamesPlayed,
                    0
                );
                const remainingGames = GameManager.games.length;
                expect(totalGamesPlayed).toBe(remainingGames * 2);

                // Additional verification: sum of all wins should not exceed remaining games
                const totalWins = addedPlayers.reduce(
                    (sum, player) => sum + player.wins,
                    0
                );
                expect(totalWins).toBeLessThanOrEqual(remainingGames);

                // Additional verification: verify statistics are persisted correctly
                const storedPlayers = Storage.loadPlayers();
                for (const player of addedPlayers) {
                    const storedPlayer = storedPlayers.find(p => p.id === player.id);
                    expect(storedPlayer).toBeDefined();
                    expect(storedPlayer.gamesPlayed).toBe(player.gamesPlayed);
                    expect(storedPlayer.wins).toBe(player.wins);
                }
            }),
            { numRuns: 100 } // Run 100 iterations as specified in design
        );
    });
