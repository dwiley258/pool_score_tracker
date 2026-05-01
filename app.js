import { db } from './firebase-config.js';
import { collection, doc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================
// Utility Functions
// ============================================

/**
 * Generates a UUID v4 string
 * @returns {string} A UUID v4 string
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================
// Data Models
// ============================================

/**
 * Player data model
 * @typedef {Object} Player
 * @property {string} id - Unique identifier (UUID)
 * @property {string} name - Player name (unique within team)
 * @property {number} gamesPlayed - Total games count
 * @property {number} wins - Total wins count
 * @property {string} createdAt - Creation timestamp (ISO 8601)
 */

/**
 * Creates a new Player object
 * @param {string} name - The player's name
 * @returns {Player} A new player object
 */
function createPlayer(name) {
    return {
        id: generateUUID(),
        name: name,
        gamesPlayed: 0,
        wins: 0,
        createdAt: new Date().toISOString()
    };
}

/**
 * Game data model
 * @typedef {Object} Game
 * @property {string} id - Unique identifier (UUID)
 * @property {string} player1Id - Reference to Player 1
 * @property {string} player2Id - Reference to Player 2
 * @property {number} player1Score - Non-negative integer score for Player 1
 * @property {number} player2Score - Non-negative integer score for Player 2
 * @property {string|null} winnerId - Reference to winning Player (or null for tie)
 * @property {string} timestamp - Game completion time (ISO 8601)
 */

/**
 * Creates a new Game object
 * @param {string} player1Id - ID of player 1
 * @param {string} player2Id - ID of player 2
 * @param {number} player1Score - Score for player 1
 * @param {number} player2Score - Score for player 2
 * @returns {Game} A new game object
 */
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

// ============================================
// Storage Layer (Firestore)
// ============================================

const Storage = {
    async savePlayer(player) {
        await setDoc(doc(db, "players", player.id), player);
    },

    async savePlayers(players) {
        await Promise.all(players.map(p => this.savePlayer(p)));
    },

    async loadPlayers() {
        const snapshot = await getDocs(collection(db, "players"));
        return snapshot.docs.map(d => d.data());
    },

    async deletePlayer(playerId) {
        await deleteDoc(doc(db, "players", playerId));
    },

    async saveGame(game) {
        await setDoc(doc(db, "games", game.id), game);
    },

    async saveGames(games) {
        await Promise.all(games.map(g => this.saveGame(g)));
    },

    async loadGames() {
        const snapshot = await getDocs(collection(db, "games"));
        return snapshot.docs.map(d => d.data());
    },

    async deleteGame(gameId) {
        await deleteDoc(doc(db, "games", gameId));
    },

    async clear() {
        const players = await getDocs(collection(db, "players"));
        const games = await getDocs(collection(db, "games"));
        await Promise.all([
            ...players.docs.map(d => deleteDoc(d.ref)),
            ...games.docs.map(d => deleteDoc(d.ref))
        ]);
    }
};

// ============================================
// Business Logic - Player Manager
// ============================================

/**
 * PlayerManager handles all player-related operations
 * 
 * AUTO-SAVE: All data-modifying operations (addPlayer, removePlayer) automatically
 * persist changes to local storage immediately. No manual save is required.
 */
const PlayerManager = {
    players: [],

    /**
     * Adds a new player to the team
     * @param {string} name - The player's name
     * @returns {{success: boolean, data?: Player, error?: string}} Result object
     */
    async addPlayer(name) {
        // Validate name is not empty
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return { success: false, error: 'Player name cannot be empty' };
        }

        const trimmedName = name.trim();

        // Check player limit (20 players max)
        if (!this.canAddPlayer()) {
            return { success: false, error: 'Cannot add more than 20 players' };
        }

        // Check for duplicate name (case-insensitive)
        const nameExists = this.players.some(
            player => player.name.toLowerCase() === trimmedName.toLowerCase()
        );

        if (nameExists) {
            return { success: false, error: 'Player name already exists' };
        }

        // Create and add the new player
        const newPlayer = createPlayer(trimmedName);
        this.players.push(newPlayer);

        // Persist to storage
        try {
            await Storage.savePlayer(newPlayer);
        } catch (error) {
            // Rollback on storage failure
            this.players.pop();
            return { success: false, error: error.message };
        }

        return { success: true, data: newPlayer };
    },

    /**
     * Removes a player from the team by ID
     * @param {string} playerId - The player's unique ID
     * @returns {{success: boolean, error?: string}} Result object
     */
    async removePlayer(playerId) {
        if (!playerId || typeof playerId !== 'string') {
            return { success: false, error: 'Invalid player ID' };
        }

        const playerIndex = this.players.findIndex(player => player.id === playerId);

        if (playerIndex === -1) {
            return { success: false, error: 'Player does not exist' };
        }

        // Remove the player
        const removedPlayer = this.players.splice(playerIndex, 1)[0];

        // Persist to storage
        try {
            await Storage.deletePlayer(playerId);
        } catch (error) {
            // Rollback on storage failure
            this.players.splice(playerIndex, 0, removedPlayer);
            return { success: false, error: error.message };
        }

        return { success: true };
    },

    /**
     * Gets a player by ID
     * @param {string} playerId - The player's unique ID
     * @returns {Player|null} The player object or null if not found
     */
    getPlayer(playerId) {
        if (!playerId || typeof playerId !== 'string') {
            return null;
        }

        const player = this.players.find(player => player.id === playerId);
        return player || null;
    },

    /**
     * Gets all players in the team
     * @returns {Player[]} Array of all player objects
     */
    getAllPlayers() {
        return [...this.players]; // Return a copy to prevent external mutations
    },

    /**
     * Checks if a new player can be added (under 20 player limit)
     * @returns {boolean} True if a player can be added, false otherwise
     */
    canAddPlayer() {
        return this.players.length < 20;
    },

    /**
     * Initializes the PlayerManager by loading players from storage
     */
    async initialize() {
        this.players = await Storage.loadPlayers();
    }
};

// ============================================
// Business Logic - Game Manager
// ============================================

/**
 * GameManager handles all game-related operations
 * 
 * AUTO-SAVE: All data-modifying operations (recordGame, deleteGame) automatically
 * persist changes to local storage immediately. Player statistics are also updated
 * and saved automatically. No manual save is required.
 */
const GameManager = {
    games: [],

    /**
     * Records a new game between two players
     * @param {string} player1Id - ID of player 1
     * @param {string} player2Id - ID of player 2
     * @param {number} score1 - Score for player 1
     * @param {number} score2 - Score for player 2
     * @returns {{success: boolean, data?: Game, error?: string}} Result object
     */
    async recordGame(player1Id, player2Id, score1, score2) {
        // Validate player IDs are provided
        if (!player1Id || typeof player1Id !== 'string') {
            return { success: false, error: 'Invalid player 1 ID' };
        }
        if (!player2Id || typeof player2Id !== 'string') {
            return { success: false, error: 'Invalid player 2 ID' };
        }

        // Validate players are different
        if (player1Id === player2Id) {
            return { success: false, error: 'Cannot record game between same player' };
        }

        // Validate both players exist
        const player1 = PlayerManager.getPlayer(player1Id);
        const player2 = PlayerManager.getPlayer(player2Id);

        if (!player1) {
            return { success: false, error: 'Player does not exist' };
        }
        if (!player2) {
            return { success: false, error: 'Player does not exist' };
        }

        // Validate scores are non-negative integers
        if (!Number.isInteger(score1) || score1 < 0) {
            return { success: false, error: 'Scores must be non-negative integers' };
        }
        if (!Number.isInteger(score2) || score2 < 0) {
            return { success: false, error: 'Scores must be non-negative integers' };
        }

        // Create the game
        const newGame = createGame(player1Id, player2Id, score1, score2);
        this.games.push(newGame);

        // Update player statistics
        player1.gamesPlayed++;
        player2.gamesPlayed++;

        if (newGame.winnerId === player1Id) {
            player1.wins++;
        } else if (newGame.winnerId === player2Id) {
            player2.wins++;
        }

        // Persist to storage
        try {
            await Storage.saveGame(newGame);
            await Storage.savePlayer(player1);
            await Storage.savePlayer(player2);
        } catch (error) {
            // Rollback on storage failure
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

    /**
     * Deletes a game by ID
     * @param {string} gameId - The game's unique ID
     * @returns {{success: boolean, error?: string}} Result object
     */
    async deleteGame(gameId) {
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
            await Storage.deleteGame(gameId);
            if (player1) await Storage.savePlayer(player1);
            if (player2) await Storage.savePlayer(player2);
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

    /**
     * Gets a game by ID
     * @param {string} gameId - The game's unique ID
     * @returns {Game|null} The game object or null if not found
     */
    getGameById(gameId) {
        if (!gameId || typeof gameId !== 'string') {
            return null;
        }

        const game = this.games.find(game => game.id === gameId);
        return game || null;
    },

    /**
     * Gets game history with optional player filtering
     * @param {string} [filterPlayerId] - Optional player ID to filter games
     * @returns {Game[]} Array of game objects in reverse chronological order
     */
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

    /**
     * Initializes the GameManager by loading games from storage
     */
    async initialize() {
        this.games = await Storage.loadGames();
    }
};

// ============================================
// Business Logic - Statistics Calculator
// ============================================

/**
 * PlayerStats data structure
 * @typedef {Object} PlayerStats
 * @property {number} gamesPlayed - Total games played
 * @property {number} wins - Total wins
 * @property {number} losses - Total losses
 * @property {number} ties - Total ties
 * @property {number} winPercentage - Win percentage (0-100, rounded to 2 decimals)
 */

/**
 * LeaderboardEntry data structure
 * @typedef {Object} LeaderboardEntry
 * @property {Player} player - The player object
 * @property {PlayerStats} stats - The player's statistics
 * @property {number} rank - The player's rank on the leaderboard
 */

/**
 * StatisticsCalculator handles all statistics calculation operations
 */
const StatisticsCalculator = {
    /**
     * Calculates statistics for a specific player based on game history
     * @param {string} playerId - The player's unique ID
     * @param {Game[]} games - Array of all games
     * @returns {PlayerStats} The calculated statistics for the player
     */
    calculatePlayerStats(playerId, games) {
        const stats = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            winPercentage: 0
        };

        // Filter games where this player participated
        const playerGames = games.filter(game => 
            game.player1Id === playerId || game.player2Id === playerId
        );

        stats.gamesPlayed = playerGames.length;

        // Count wins, losses, and ties
        playerGames.forEach(game => {
            if (game.winnerId === playerId) {
                stats.wins++;
            } else if (game.winnerId === null) {
                stats.ties++;
            } else {
                stats.losses++;
            }
        });

        // Calculate win percentage
        if (stats.gamesPlayed > 0) {
            stats.winPercentage = parseFloat(((stats.wins / stats.gamesPlayed) * 100).toFixed(2));
        }

        return stats;
    },

    /**
     * Generates a leaderboard with all players sorted by performance
     * @param {Player[]} players - Array of all players
     * @returns {LeaderboardEntry[]} Array of leaderboard entries sorted by rank
     */
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
    },

    /**
     * Recalculates all player statistics based on current game history
     * Updates the player objects in PlayerManager with accurate stats
     * @param {Player[]} players - Array of all players
     * @param {Game[]} games - Array of all games
     */
    async recalculateAllStats(players, games) {
        players.forEach(player => {
            const stats = this.calculatePlayerStats(player.id, games);
            player.gamesPlayed = stats.gamesPlayed;
            player.wins = stats.wins;
        });

        await Storage.savePlayers(players);
    }
};

// ============================================
// UI Components - Player Management
// ============================================

/**
 * PlayerManagementUI handles the player management interface
 */
const PlayerManagementUI = {
    /**
     * Initializes the player management UI
     */
    initialize() {
        this.setupEventListeners();
        this.render();
    },

    /**
     * Sets up event listeners for player management
     */
    setupEventListeners() {
        const addPlayerForm = document.getElementById('add-player-form');
        
        if (addPlayerForm) {
            addPlayerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAddPlayer();
            });
        }
    },

    /**
     * Handles adding a new player
     */
    async handleAddPlayer() {
        const input = document.getElementById('player-name-input');
        const playerName = input.value.trim();

        if (!playerName) {
            this.showFeedback('Player name cannot be empty', 'error');
            return;
        }

        // Add player using PlayerManager
        const result = await PlayerManager.addPlayer(playerName);

        if (result.success) {
            this.showFeedback(`Player "${playerName}" added successfully!`, 'success');
            input.value = ''; // Clear input
            this.render(); // Re-render the player list
            
            // Update GameRecordingUI if it exists
            if (typeof GameRecordingUI !== 'undefined' && GameRecordingUI.render) {
                GameRecordingUI.render();
            }
        } else {
            this.showFeedback(result.error, 'error');
        }
    },

    /**
     * Handles removing a player
     * @param {string} playerId - The player's unique ID
     * @param {string} playerName - The player's name (for feedback message)
     */
    async handleRemovePlayer(playerId, playerName) {
        if (!confirm(`Are you sure you want to remove ${playerName}?`)) {
            return;
        }

        const result = await PlayerManager.removePlayer(playerId);

        if (result.success) {
            this.showFeedback(`Player "${playerName}" removed successfully!`, 'success');
            this.render(); // Re-render the player list
            
            // Update GameRecordingUI if it exists
            if (typeof GameRecordingUI !== 'undefined' && GameRecordingUI.render) {
                GameRecordingUI.render();
            }
        } else {
            this.showFeedback(result.error, 'error');
        }
    },

    /**
     * Renders the player list and count
     */
    render() {
        this.renderPlayerList();
        this.renderPlayerCount();
    },

    /**
     * Renders the player list with remove buttons
     */
    renderPlayerList() {
        const playerListContainer = document.getElementById('player-list');
        
        if (!playerListContainer) {
            return;
        }

        const players = PlayerManager.getAllPlayers();

        if (players.length === 0) {
            playerListContainer.innerHTML = '<p style="color: #777; text-align: center; padding: 20px;">No players added yet. Add your first player above!</p>';
            return;
        }

        // Sort players alphabetically by name for consistent display
        const sortedPlayers = [...players].sort((a, b) => 
            a.name.localeCompare(b.name)
        );

        // Clear the container
        playerListContainer.innerHTML = '';

        // Build the player list using DOM methods for safety
        sortedPlayers.forEach(player => {
            // Create player item container
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            playerItem.setAttribute('data-player-id', player.id);

            // Create player name span
            const playerNameSpan = document.createElement('span');
            playerNameSpan.className = 'player-name';
            playerNameSpan.textContent = player.name; // Safe - uses textContent

            // Create remove button
            const removeButton = document.createElement('button');
            removeButton.className = 'remove-player-btn';
            removeButton.textContent = 'Remove';
            removeButton.setAttribute('data-player-id', player.id);
            // Escape the player name for the attribute to prevent XSS in attributes
            removeButton.setAttribute('data-player-name', this.escapeHtml(player.name));

            // Add click event listener
            removeButton.addEventListener('click', () => {
                this.handleRemovePlayer(player.id, player.name);
            });

            // Append elements
            playerItem.appendChild(playerNameSpan);
            playerItem.appendChild(removeButton);
            playerListContainer.appendChild(playerItem);
        });
    },

    /**
     * Renders the player count display (X/20)
     */
    renderPlayerCount() {
        const playerCountContainer = document.getElementById('player-count');
        
        if (!playerCountContainer) {
            return;
        }

        const playerCount = PlayerManager.players.length;
        const maxPlayers = 20;
        const canAddMore = PlayerManager.canAddPlayer();

        playerCountContainer.innerHTML = `Players: ${playerCount}/${maxPlayers}`;

        // Disable the add player button if at limit
        const addPlayerForm = document.getElementById('add-player-form');
        const submitButton = addPlayerForm ? addPlayerForm.querySelector('button[type="submit"]') : null;
        
        if (submitButton) {
            submitButton.disabled = !canAddMore;
            
            if (!canAddMore) {
                submitButton.title = 'Maximum player limit reached';
            } else {
                submitButton.title = '';
            }
        }
    },

    /**
     * Shows feedback message to the user
     * @param {string} message - The feedback message
     * @param {string} type - The feedback type ('success' or 'error')
     */
    showFeedback(message, type) {
        const feedbackContainer = document.getElementById('player-feedback');
        
        if (!feedbackContainer) {
            return;
        }

        feedbackContainer.textContent = message;
        feedbackContainer.className = `feedback ${type}`;

        // Auto-dismiss success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                feedbackContainer.className = 'feedback';
                feedbackContainer.textContent = '';
            }, 3000);
        }
    },

    /**
     * Escapes HTML to prevent XSS attacks
     * @param {string} text - The text to escape
     * @returns {string} The escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================
// UI Components - Game Recording
// ============================================

/**
 * GameRecordingUI handles the game recording interface
 */
const GameRecordingUI = {
    /**
     * Initializes the game recording UI
     */
    initialize() {
        this.setupEventListeners();
        this.render();
    },

    /**
     * Sets up event listeners for game recording
     */
    setupEventListeners() {
        const recordGameForm = document.getElementById('record-game-form');
        
        if (recordGameForm) {
            recordGameForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRecordGame();
            });
        }
    },

    /**
     * Handles recording a new game
     */
    async handleRecordGame() {
        const player1Select = document.getElementById('player1-select');
        const player2Select = document.getElementById('player2-select');
        const player1ScoreInput = document.getElementById('player1-score');
        const player2ScoreInput = document.getElementById('player2-score');

        const player1Id = player1Select.value;
        const player2Id = player2Select.value;
        const score1 = parseInt(player1ScoreInput.value, 10);
        const score2 = parseInt(player2ScoreInput.value, 10);

        // Validate inputs
        if (!player1Id || !player2Id) {
            this.showFeedback('Please select both players', 'error');
            return;
        }

        if (isNaN(score1) || isNaN(score2)) {
            this.showFeedback('Please enter valid scores', 'error');
            return;
        }

        // Record game using GameManager
        const result = await GameManager.recordGame(player1Id, player2Id, score1, score2);

        if (result.success) {
            const player1 = PlayerManager.getPlayer(player1Id);
            const player2 = PlayerManager.getPlayer(player2Id);
            
            let winnerText = '';
            if (result.data.winnerId === player1Id) {
                winnerText = ` - ${player1.name} wins!`;
            } else if (result.data.winnerId === player2Id) {
                winnerText = ` - ${player2.name} wins!`;
            } else {
                winnerText = ' - It\'s a tie!';
            }

            this.showFeedback(`Game recorded successfully${winnerText}`, 'success');
            
            // Reset form
            player1Select.value = '';
            player2Select.value = '';
            player1ScoreInput.value = '';
            player2ScoreInput.value = '';

            // Update other UI components if they exist
            if (typeof PlayerManagementUI !== 'undefined' && PlayerManagementUI.render) {
                PlayerManagementUI.render();
            }
            if (typeof GameHistoryUI !== 'undefined' && GameHistoryUI.render) {
                GameHistoryUI.render();
            }
            if (typeof LeaderboardUI !== 'undefined' && LeaderboardUI.render) {
                LeaderboardUI.render();
            }
        } else {
            this.showFeedback(result.error, 'error');
        }
    },

    /**
     * Renders the game recording form (populates player dropdowns)
     */
    render() {
        this.renderPlayerDropdowns();
    },

    /**
     * Renders the player dropdowns with current players
     */
    renderPlayerDropdowns() {
        const player1Select = document.getElementById('player1-select');
        const player2Select = document.getElementById('player2-select');

        if (!player1Select || !player2Select) {
            return;
        }

        const players = PlayerManager.getAllPlayers();

        // Sort players alphabetically for consistent display
        const sortedPlayers = [...players].sort((a, b) => 
            a.name.localeCompare(b.name)
        );

        // Build options HTML
        const optionsHTML = sortedPlayers.map(player => 
            `<option value="${player.id}">${this.escapeHtml(player.name)}</option>`
        ).join('');

        // Update both dropdowns
        player1Select.innerHTML = '<option value="">Select Player 1</option>' + optionsHTML;
        player2Select.innerHTML = '<option value="">Select Player 2</option>' + optionsHTML;

        // Disable form if less than 2 players
        const recordGameForm = document.getElementById('record-game-form');
        const submitButton = recordGameForm ? recordGameForm.querySelector('button[type="submit"]') : null;

        if (players.length < 2) {
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.title = 'Need at least 2 players to record a game';
            }
            player1Select.disabled = true;
            player2Select.disabled = true;
        } else {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.title = '';
            }
            player1Select.disabled = false;
            player2Select.disabled = false;
        }
    },

    /**
     * Shows feedback message to the user
     * @param {string} message - The feedback message
     * @param {string} type - The feedback type ('success' or 'error')
     */
    showFeedback(message, type) {
        const feedbackContainer = document.getElementById('game-feedback');
        
        if (!feedbackContainer) {
            return;
        }

        feedbackContainer.textContent = message;
        feedbackContainer.className = `feedback ${type}`;

        // Auto-dismiss success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                feedbackContainer.className = 'feedback';
                feedbackContainer.textContent = '';
            }, 3000);
        }
    },

    /**
     * Escapes HTML to prevent XSS attacks
     * @param {string} text - The text to escape
     * @returns {string} The escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================
// UI Components - Game History
// ============================================

/**
 * GameHistoryUI handles the game history interface
 */
const GameHistoryUI = {
    /**
     * Initializes the game history UI
     */
    initialize() {
        this.setupEventListeners();
        this.render();
    },

    /**
     * Sets up event listeners for game history
     */
    setupEventListeners() {
        const playerFilter = document.getElementById('player-filter');
        
        if (playerFilter) {
            playerFilter.addEventListener('change', () => {
                this.render();
            });
        }
    },

    /**
     * Handles deleting a game
     * @param {string} gameId - The game's unique ID
     */
    async handleDeleteGame(gameId) {
        const game = GameManager.getGameById(gameId);
        
        if (!game) {
            return;
        }

        const player1 = PlayerManager.getPlayer(game.player1Id);
        const player2 = PlayerManager.getPlayer(game.player2Id);
        const player1Name = player1 ? player1.name : 'Unknown';
        const player2Name = player2 ? player2.name : 'Unknown';

        if (!confirm(`Are you sure you want to delete this game?\n${player1Name} vs ${player2Name}`)) {
            return;
        }

        const result = await GameManager.deleteGame(gameId);

        if (result.success) {
            this.render();
            
            // Update other UI components if they exist
            if (typeof PlayerManagementUI !== 'undefined' && PlayerManagementUI.render) {
                PlayerManagementUI.render();
            }
            if (typeof LeaderboardUI !== 'undefined' && LeaderboardUI.render) {
                LeaderboardUI.render();
            }
        }
    },

    /**
     * Renders the game history UI
     */
    render() {
        this.renderPlayerFilter();
        this.renderGameList();
    },

    /**
     * Renders the player filter dropdown
     */
    renderPlayerFilter() {
        const playerFilter = document.getElementById('player-filter');
        
        if (!playerFilter) {
            return;
        }

        const players = PlayerManager.getAllPlayers();
        
        // Sort players alphabetically for consistent display
        const sortedPlayers = [...players].sort((a, b) => 
            a.name.localeCompare(b.name)
        );

        // Build options HTML
        const optionsHTML = sortedPlayers.map(player => 
            `<option value="${player.id}">${this.escapeHtml(player.name)}</option>`
        ).join('');

        // Preserve current selection
        const currentValue = playerFilter.value;
        playerFilter.innerHTML = '<option value="">All Players</option>' + optionsHTML;
        
        // Restore selection if it still exists
        if (currentValue && players.some(p => p.id === currentValue)) {
            playerFilter.value = currentValue;
        }
    },

    /**
     * Renders the game list in reverse chronological order
     */
    renderGameList() {
        const gameListContainer = document.getElementById('game-list');
        
        if (!gameListContainer) {
            return;
        }

        const playerFilter = document.getElementById('player-filter');
        const filterPlayerId = playerFilter ? playerFilter.value : '';

        // Get filtered game history (already sorted in reverse chronological order)
        const games = GameManager.getGameHistory(filterPlayerId || undefined);

        if (games.length === 0) {
            if (filterPlayerId) {
                gameListContainer.innerHTML = '<p style="color: #777; text-align: center; padding: 20px;">No games found for this player.</p>';
            } else {
                gameListContainer.innerHTML = '<p style="color: #777; text-align: center; padding: 20px;">No games recorded yet. Record your first game above!</p>';
            }
            return;
        }

        // Build the game list HTML
        const gameListHTML = games.map(game => {
            const player1 = PlayerManager.getPlayer(game.player1Id);
            const player2 = PlayerManager.getPlayer(game.player2Id);
            
            const player1Name = player1 ? player1.name : 'Unknown Player';
            const player2Name = player2 ? player2.name : 'Unknown Player';
            
            // Format timestamp
            const formattedTimestamp = this.formatTimestamp(game.timestamp);
            
            // Determine winner display
            let resultClass = '';
            let resultText = '';
            
            if (game.winnerId === game.player1Id) {
                resultClass = 'winner';
                resultText = `<span class="player-name ${resultClass}">${this.escapeHtml(player1Name)}</span> <span class="score">${game.player1Score}</span> - <span class="player-name">${this.escapeHtml(player2Name)}</span> <span class="score">${game.player2Score}</span>`;
            } else if (game.winnerId === game.player2Id) {
                resultClass = 'winner';
                resultText = `<span class="player-name">${this.escapeHtml(player1Name)}</span> <span class="score">${game.player1Score}</span> - <span class="player-name ${resultClass}">${this.escapeHtml(player2Name)}</span> <span class="score">${game.player2Score}</span>`;
            } else {
                // Tie
                resultText = `<span class="player-name">${this.escapeHtml(player1Name)}</span> <span class="score">${game.player1Score}</span> - <span class="player-name">${this.escapeHtml(player2Name)}</span> <span class="score">${game.player2Score}</span> <span class="tie-indicator">(Tie)</span>`;
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

        // Add event listeners to delete buttons
        const deleteButtons = gameListContainer.querySelectorAll('.delete-game-btn');
        deleteButtons.forEach(button => {
            button.addEventListener('click', () => {
                const gameId = button.getAttribute('data-game-id');
                this.handleDeleteGame(gameId);
            });
        });
    },

    /**
     * Formats a timestamp for display
     * @param {string} timestamp - ISO 8601 timestamp string
     * @returns {string} Formatted timestamp
     */
    formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return 'Invalid date';
            }

            // Format: "Jan 15, 2024 at 3:45 PM"
            const options = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            };

            return date.toLocaleString('en-US', options).replace(',', ' at');
        } catch (error) {
            console.error('Error formatting timestamp:', error);
            return 'Unknown date';
        }
    },

    /**
     * Escapes HTML to prevent XSS attacks
     * @param {string} text - The text to escape
     * @returns {string} The escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================
// UI Components - Leaderboard
// ============================================

/**
 * LeaderboardUI handles the leaderboard interface
 */
const LeaderboardUI = {
    /**
     * Initializes the leaderboard UI
     */
    initialize() {
        this.render();
    },

    /**
     * Renders the leaderboard with player statistics
     */
    render() {
        const leaderboardContainer = document.getElementById('leaderboard-table');
        
        if (!leaderboardContainer) {
            return;
        }

        const players = PlayerManager.getAllPlayers();

        if (players.length === 0) {
            leaderboardContainer.innerHTML = '<p style="color: #777; text-align: center; padding: 20px;">No players yet. Add players to see the leaderboard!</p>';
            return;
        }

        // Generate leaderboard using StatisticsCalculator
        const leaderboard = StatisticsCalculator.generateLeaderboard(players);

        // Build the table HTML
        let tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Games</th>
                        <th>Wins</th>
                        <th>Win %</th>
                    </tr>
                </thead>
                <tbody>
        `;

        leaderboard.forEach(entry => {
            // Add top-three class for ranks 1-3
            const rowClass = entry.rank <= 3 ? 'top-three' : '';
            
            tableHTML += `
                <tr class="${rowClass}" data-player-id="${entry.player.id}">
                    <td>${entry.rank}</td>
                    <td>${this.escapeHtml(entry.player.name)}</td>
                    <td>${entry.stats.gamesPlayed}</td>
                    <td>${entry.stats.wins}</td>
                    <td>${entry.stats.winPercentage}%</td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
        `;

        leaderboardContainer.innerHTML = tableHTML;
    },

    /**
     * Escapes HTML to prevent XSS attacks
     * @param {string} text - The text to escape
     * @returns {string} The escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================
// Application Initialization
// ============================================

/**
 * Main application object that manages initialization and global state
 */
const PoolScoreTrackerApp = {
    /**
     * Initializes the entire application
     * Loads data from Firestore and sets up all UI components
     */
    async initialize() {
        try {
            console.log('Initializing Pool Score Tracker...');
            
            // Step 1: Load data from Firestore
            await this.loadData();
            
            // Step 2: Initialize all UI components
            this.initializeUI();
            
            console.log('Pool Score Tracker initialized successfully');
            console.log(`Loaded ${PlayerManager.players.length} players and ${GameManager.games.length} games`);
            
        } catch (error) {
            console.error('Failed to initialize Pool Score Tracker:', error);
            this.showInitializationError(error);
        }
    },

    /**
     * Loads all data from Firestore
     */
    async loadData() {
        await PlayerManager.initialize();
        await GameManager.initialize();
        console.log('Data loaded from Firestore');
    },

    /**
     * Initializes all UI components
     */
    initializeUI() {
        try {
            // Initialize each UI component
            PlayerManagementUI.initialize();
            GameRecordingUI.initialize();
            GameHistoryUI.initialize();
            LeaderboardUI.initialize();
            
            console.log('UI components initialized');
        } catch (error) {
            console.error('Error initializing UI components:', error);
            throw new Error('Failed to initialize user interface');
        }
    },

    /**
     * Sets up global event listeners for the application
     */
    setupGlobalEventListeners() {
        console.log('Global event listeners set up');
    },

    /**
     * Reloads data from Firestore and refreshes all UI components
     */
    async reloadData() {
        try {
            await PlayerManager.initialize();
            await GameManager.initialize();
            this.refreshAllUI();
            console.log('Data reloaded successfully');
        } catch (error) {
            console.error('Error reloading data:', error);
        }
    },

    /**
     * Refreshes all UI components to reflect current data state
     * Called after data changes or reloads
     */
    refreshAllUI() {
        try {
            PlayerManagementUI.render();
            GameRecordingUI.render();
            GameHistoryUI.render();
            LeaderboardUI.render();
            
            console.log('All UI components refreshed');
        } catch (error) {
            console.error('Error refreshing UI:', error);
        }
    },

    /**
     * Shows an initialization error to the user
     * @param {Error} error - The error that occurred
     */
    showInitializationError(error) {
        const container = document.querySelector('.container');
        
        if (container) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'initialization-error';
            errorDiv.style.cssText = 'background: #f44336; color: white; padding: 20px; margin: 20px; border-radius: 4px; text-align: center;';
            errorDiv.innerHTML = `
                <h2>Initialization Error</h2>
                <p>Failed to initialize the application: ${error.message}</p>
                <p>Please refresh the page or clear your browser's local storage.</p>
                <button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px; cursor: pointer;">
                    Reload Page
                </button>
            `;
            
            container.insertBefore(errorDiv, container.firstChild);
        }
    },

    /**
     * Clears all application data (for testing or reset purposes)
     * WARNING: This will delete all players and games!
     */
    async clearAllData() {
        if (confirm('Are you sure you want to clear ALL data? This cannot be undone!')) {
            await Storage.clear();
            PlayerManager.players = [];
            GameManager.games = [];
            this.refreshAllUI();
            console.log('All data cleared');
        }
    }
};

// Initialize on DOM load (browser environment)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        PoolScoreTrackerApp.initialize();
    });
}

// Make app available globally for debugging
if (typeof window !== 'undefined') {
    window.PoolScoreTrackerApp = PoolScoreTrackerApp;
}

// Export for testing (ES modules)
export {
    generateUUID,
    createPlayer,
    createGame,
    Storage,
    PlayerManager,
    GameManager,
    StatisticsCalculator,
    PlayerManagementUI,
    GameRecordingUI,
    GameHistoryUI,
    LeaderboardUI,
    PoolScoreTrackerApp
};
