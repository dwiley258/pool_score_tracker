/**
 * Simple Node.js test for PlayerManager
 */

// Mock localStorage
global.localStorage = {
    store: {},
    getItem(key) {
        return this.store[key] || null;
    },
    setItem(key, value) {
        this.store[key] = value.toString();
    },
    removeItem(key) {
        delete this.store[key];
    },
    clear() {
        this.store = {};
    }
};

// Mock document for DOMContentLoaded
global.document = {
    addEventListener() {}
};

// Load app.js
require('../app.js');

// Test utilities
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected} but got ${actual}`);
    }
}

function test(description, testFn) {
    try {
        testFn();
        console.log(`✓ ${description}`);
        return true;
    } catch (error) {
        console.log(`✗ ${description}`);
        console.log(`  Error: ${error.message}`);
        return false;
    }
}

// Run tests
console.log('Running PlayerManager tests...\n');

let passed = 0;
let failed = 0;

// Clear and reset
localStorage.clear();
PlayerManager.players = [];

// Test 1
if (test('Should add a player with a unique name', () => {
    const result = PlayerManager.addPlayer('Alice');
    assert(result.success, 'addPlayer should return success');
    assert(result.data, 'addPlayer should return player data');
    assertEquals(result.data.name, 'Alice', 'Player name should be Alice');
    assertEquals(PlayerManager.players.length, 1, 'Should have 1 player');
})) passed++; else failed++;

// Test 2
PlayerManager.players = [];
if (test('Should reject duplicate player names (case-insensitive)', () => {
    PlayerManager.addPlayer('Bob');
    const result = PlayerManager.addPlayer('bob');
    assert(!result.success, 'Should fail to add duplicate name');
    assertEquals(result.error, 'Player name already exists', 'Should return correct error');
    assertEquals(PlayerManager.players.length, 1, 'Should still have only 1 player');
})) passed++; else failed++;

// Test 3
PlayerManager.players = [];
if (test('Should reject empty player names', () => {
    const result = PlayerManager.addPlayer('');
    assert(!result.success, 'Should fail to add empty name');
    assertEquals(PlayerManager.players.length, 0, 'Should have 0 players');
})) passed++; else failed++;

// Test 4
PlayerManager.players = [];
if (test('Should enforce 20 player limit', () => {
    for (let i = 1; i <= 20; i++) {
        PlayerManager.addPlayer(`Player${i}`);
    }
    assertEquals(PlayerManager.players.length, 20, 'Should have 20 players');
    assert(!PlayerManager.canAddPlayer(), 'canAddPlayer should return false');
    
    const result = PlayerManager.addPlayer('Player21');
    assert(!result.success, 'Should fail to add 21st player');
    assertEquals(result.error, 'Cannot add more than 20 players', 'Should return correct error');
})) passed++; else failed++;

// Test 5
PlayerManager.players = [];
if (test('Should remove a player by ID', () => {
    const addResult = PlayerManager.addPlayer('Charlie');
    const playerId = addResult.data.id;
    
    const removeResult = PlayerManager.removePlayer(playerId);
    assert(removeResult.success, 'removePlayer should return success');
    assertEquals(PlayerManager.players.length, 0, 'Should have 0 players after removal');
})) passed++; else failed++;

// Test 6
PlayerManager.players = [];
if (test('Should return error for non-existent player', () => {
    const result = PlayerManager.removePlayer('non-existent-id');
    assert(!result.success, 'Should fail to remove non-existent player');
    assertEquals(result.error, 'Player does not exist', 'Should return correct error');
})) passed++; else failed++;

// Test 7
PlayerManager.players = [];
if (test('Should return player by ID', () => {
    const addResult = PlayerManager.addPlayer('David');
    const playerId = addResult.data.id;
    
    const player = PlayerManager.getPlayer(playerId);
    assert(player !== null, 'Should return a player');
    assertEquals(player.name, 'David', 'Should return correct player');
})) passed++; else failed++;

// Test 8
if (test('Should return null for non-existent player', () => {
    const player = PlayerManager.getPlayer('non-existent-id');
    assertEquals(player, null, 'Should return null');
})) passed++; else failed++;

// Test 9
PlayerManager.players = [];
if (test('Should return all players', () => {
    PlayerManager.addPlayer('Eve');
    PlayerManager.addPlayer('Frank');
    
    const allPlayers = PlayerManager.getAllPlayers();
    assertEquals(allPlayers.length, 2, 'Should return 2 players');
})) passed++; else failed++;

// Test 10
PlayerManager.players = [];
if (test('Should return a copy of players array', () => {
    PlayerManager.addPlayer('Grace');
    
    const allPlayers = PlayerManager.getAllPlayers();
    allPlayers.push({ id: 'fake', name: 'Fake' });
    
    assertEquals(PlayerManager.players.length, 1, 'Original array should not be modified');
})) passed++; else failed++;

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
