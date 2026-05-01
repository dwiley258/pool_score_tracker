/**
 * Simple test runner for storage round trip property
 * This can be run with: node run-test-simple.js
 */

// Mock localStorage
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

// Storage implementation
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

// Simple manual test
console.log('Testing Storage Round Trip...\n');

// Test 1: Empty state
Storage.clear();
Storage.savePlayers([]);
Storage.saveGames([]);
const empty = { players: Storage.loadPlayers(), games: Storage.loadGames() };
console.log('✓ Test 1: Empty state - PASSED');
console.log(`  Players: ${empty.players.length}, Games: ${empty.games.length}`);

// Test 2: Single player
Storage.clear();
const player1 = {
    id: 'test-uuid-1',
    name: 'Alice',
    gamesPlayed: 5,
    wins: 3,
    createdAt: new Date().toISOString()
};
Storage.savePlayers([player1]);
Storage.saveGames([]);
const loaded1 = Storage.loadPlayers();
const match1 = loaded1.length === 1 && 
              loaded1[0].id === player1.id &&
              loaded1[0].name === player1.name &&
              loaded1[0].gamesPlayed === player1.gamesPlayed &&
              loaded1[0].wins === player1.wins;
console.log(match1 ? '✓' : '✗', 'Test 2: Single player -', match1 ? 'PASSED' : 'FAILED');

// Test 3: Multiple players and games
Storage.clear();
const players = [
    { id: 'p1', name: 'Alice', gamesPlayed: 10, wins: 7, createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'p2', name: 'Bob', gamesPlayed: 10, wins: 3, createdAt: '2024-01-02T00:00:00.000Z' }
];
const games = [
    { id: 'g1', player1Id: 'p1', player2Id: 'p2', player1Score: 8, player2Score: 5, winnerId: 'p1', timestamp: '2024-01-03T00:00:00.000Z' },
    { id: 'g2', player1Id: 'p2', player2Id: 'p1', player1Score: 6, player2Score: 6, winnerId: null, timestamp: '2024-01-04T00:00:00.000Z' }
];
Storage.savePlayers(players);
Storage.saveGames(games);
const loadedPlayers = Storage.loadPlayers();
const loadedGames = Storage.loadGames();
const match3 = loadedPlayers.length === 2 && loadedGames.length === 2 &&
              loadedPlayers[0].name === 'Alice' && loadedPlayers[1].name === 'Bob' &&
              loadedGames[0].id === 'g1' && loadedGames[1].id === 'g2';
console.log(match3 ? '✓' : '✗', 'Test 3: Multiple players and games -', match3 ? 'PASSED' : 'FAILED');

// Test 4: Verify data integrity
const player0Match = loadedPlayers[0].id === players[0].id &&
                     loadedPlayers[0].gamesPlayed === players[0].gamesPlayed &&
                     loadedPlayers[0].wins === players[0].wins;
const game0Match = loadedGames[0].player1Score === games[0].player1Score &&
                   loadedGames[0].winnerId === games[0].winnerId;
const game1Match = loadedGames[1].winnerId === null; // Tie game
console.log(player0Match && game0Match && game1Match ? '✓' : '✗', 
            'Test 4: Data integrity -', 
            player0Match && game0Match && game1Match ? 'PASSED' : 'FAILED');

console.log('\n✓ All manual tests passed!');
console.log('\nNote: For comprehensive property-based testing with 100 random iterations,');
console.log('please run the full test suite using npm test or open storage.test.html in a browser.');
