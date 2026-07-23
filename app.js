import { db } from './firebase-config.js';
import { collection, doc, getDocs, setDoc, deleteDoc } from "firebase/firestore";

// ============================================
// Utility Functions
// ============================================

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

function createPlayer(name) {
    return {
        id: generateUUID(),
        name: name,
        gamesPlayed: 0,
        wins: 0,
        createdAt: new Date().toISOString()
    };
}

function createGame(player1Id, player2Id, player1Score, player2Score) {
    let winnerId = null;
    if (player1Score > player2Score) winnerId = player1Id;
    else if (player2Score > player1Score) winnerId = player2Id;
    
    return {
        id: generateUUID(),
        type: 'singles',
        player1Id, player2Id,
        player1Score, player2Score,
        winnerId,
        timestamp: new Date().toISOString()
    };
}

function createDuosGame(team1, team2, team1Score, team2Score) {
    let winningTeam = null;
    if (team1Score > team2Score) winningTeam = 1;
    else if (team2Score > team1Score) winningTeam = 2;

    return {
        id: generateUUID(),
        type: 'duos',
        team1: [...team1],
        team2: [...team2],
        team1Score, team2Score,
        winningTeam,
        timestamp: new Date().toISOString()
    };
}

// ---- Game helpers (work for both singles and duos) ----

// A game without an explicit `type` is treated as legacy singles.
function isDuosGame(game) {
    return game && game.type === 'duos';
}

function getGameParticipants(game) {
    if (isDuosGame(game)) return [...game.team1, ...game.team2];
    return [game.player1Id, game.player2Id];
}

function gameInvolvesPlayer(game, playerId) {
    return getGameParticipants(game).includes(playerId);
}

function didPlayerWin(game, playerId) {
    if (isDuosGame(game)) {
        if (game.winningTeam === 1) return game.team1.includes(playerId);
        if (game.winningTeam === 2) return game.team2.includes(playerId);
        return false;
    }
    return game.winnerId === playerId;
}

function isGameTie(game) {
    if (isDuosGame(game)) return game.winningTeam === null;
    return game.winnerId === null;
}

// ============================================
// Storage Layer (Firestore) - Group-scoped
// ============================================

const Storage = {
    // Groups
    async loadGroups() {
        const snapshot = await getDocs(collection(db, "groups"));
        return snapshot.docs.map(d => d.data());
    },
    async saveGroup(group) {
        await setDoc(doc(db, "groups", group.id), group);
    },
    async deleteGroup(groupId) {
        await deleteDoc(doc(db, "groups", groupId));
    },

    // Players (global)
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

    // Games (scoped to group)
    async saveGame(groupId, game) {
        await setDoc(doc(db, "groups", groupId, "games", game.id), game);
    },
    async loadGames(groupId) {
        const snapshot = await getDocs(collection(db, "groups", groupId, "games"));
        return snapshot.docs.map(d => d.data());
    },
    async deleteGame(groupId, gameId) {
        await deleteDoc(doc(db, "groups", groupId, "games", gameId));
    },

    async clear() {
        const players = await getDocs(collection(db, "players"));
        const groups = await getDocs(collection(db, "groups"));
        await Promise.all([
            ...players.docs.map(d => deleteDoc(d.ref)),
            ...groups.docs.map(d => deleteDoc(d.ref))
        ]);
    }
};

// ============================================
// Business Logic - Group Manager
// ============================================

const GroupManager = {
    groups: [],
    currentGroupId: null,

    async initialize() {
        this.groups = await Storage.loadGroups();
    },

    async createGroup(name) {
        const group = { id: generateUUID(), name: name.trim(), createdAt: new Date().toISOString(), playerIds: [] };
        this.groups.push(group);
        await Storage.saveGroup(group);
        return group;
    },

    async deleteGroup(groupId) {
        const idx = this.groups.findIndex(g => g.id === groupId);
        if (idx === -1) return { success: false, error: 'Group not found' };
        this.groups.splice(idx, 1);
        await Storage.deleteGroup(groupId);
        return { success: true };
    },

    async selectGroup(groupId) {
        this.currentGroupId = groupId;
        const group = this.groups.find(g => g.id === groupId);
        const allPlayers = await Storage.loadPlayers();
        PlayerManager.players = allPlayers.filter(p => group.playerIds.includes(p.id));
        GameManager.games = await Storage.loadGames(groupId);
    },

    getCurrentGroup() {
        return this.groups.find(g => g.id === this.currentGroupId);
    },

    async addPlayerToGroup(playerId) {
        const group = this.getCurrentGroup();
        if (!group.playerIds.includes(playerId)) {
            group.playerIds.push(playerId);
            await Storage.saveGroup(group);
        }
    },

    async removePlayerFromGroup(playerId) {
        const group = this.getCurrentGroup();
        group.playerIds = group.playerIds.filter(id => id !== playerId);
        await Storage.saveGroup(group);
    }
};

// ============================================
// Business Logic - Player Manager
// ============================================

const PlayerManager = {
    players: [],

    async addPlayer(name) {
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return { success: false, error: 'Player name cannot be empty' };
        }
        const trimmedName = name.trim();
        if (!this.canAddPlayer()) {
            return { success: false, error: 'Cannot add more than 20 players in this group' };
        }
        // Check if already in this group
        const inGroup = this.players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase());
        if (inGroup) {
            return { success: false, error: 'Player already in this group' };
        }

        try {
            // Check if player exists globally
            const allPlayers = await Storage.loadPlayers();
            const existing = allPlayers.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());

            if (existing) {
                // Add existing player to this group
                this.players.push(existing);
                await GroupManager.addPlayerToGroup(existing.id);
                return { success: true, data: existing };
            } else {
                // Create new player
                const newPlayer = createPlayer(trimmedName);
                this.players.push(newPlayer);
                await Storage.savePlayer(newPlayer);
                await GroupManager.addPlayerToGroup(newPlayer.id);
                return { success: true, data: newPlayer };
            }
        } catch (error) {
            this.players.pop();
            return { success: false, error: error.message };
        }
    },

    async removePlayer(playerId) {
        if (!playerId || typeof playerId !== 'string') {
            return { success: false, error: 'Invalid player ID' };
        }
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) {
            return { success: false, error: 'Player does not exist' };
        }

        const removedPlayer = this.players.splice(playerIndex, 1)[0];
        try {
            await GroupManager.removePlayerFromGroup(playerId);
        } catch (error) {
            this.players.splice(playerIndex, 0, removedPlayer);
            return { success: false, error: error.message };
        }
        return { success: true };
    },

    getPlayer(playerId) {
        if (!playerId || typeof playerId !== 'string') return null;
        return this.players.find(p => p.id === playerId) || null;
    },

    getAllPlayers() {
        return [...this.players];
    },

    canAddPlayer() {
        return this.players.length < 20;
    },

    async initialize() {
        this.players = await Storage.loadPlayers();
    }
};

// ============================================
// Business Logic - Game Manager
// ============================================

const GameManager = {
    games: [],

    async recordGame(player1Id, player2Id, score1, score2) {
        if (!player1Id || !player2Id) return { success: false, error: 'Invalid player ID' };
        if (player1Id === player2Id) return { success: false, error: 'Cannot record game between same player' };
        const player1 = PlayerManager.getPlayer(player1Id);
        const player2 = PlayerManager.getPlayer(player2Id);
        if (!player1 || !player2) return { success: false, error: 'Player does not exist' };
        if (!Number.isInteger(score1) || score1 < 0 || !Number.isInteger(score2) || score2 < 0) {
            return { success: false, error: 'Scores must be non-negative integers' };
        }

        const newGame = createGame(player1Id, player2Id, score1, score2);
        this.games.push(newGame);
        player1.gamesPlayed++;
        player2.gamesPlayed++;
        if (newGame.winnerId === player1Id) player1.wins++;
        else if (newGame.winnerId === player2Id) player2.wins++;

        try {
            await Storage.saveGame(GroupManager.currentGroupId, newGame);
            await Storage.savePlayer(player1);
            await Storage.savePlayer(player2);
        } catch (error) {
            this.games.pop();
            player1.gamesPlayed--;
            player2.gamesPlayed--;
            if (newGame.winnerId === player1Id) player1.wins--;
            else if (newGame.winnerId === player2Id) player2.wins--;
            return { success: false, error: error.message };
        }
        return { success: true, data: newGame };
    },

    async recordDuosGame(team1, team2, score1, score2) {
        if (!Array.isArray(team1) || !Array.isArray(team2) || team1.length !== 2 || team2.length !== 2) {
            return { success: false, error: 'Each team must have exactly 2 players' };
        }
        const ids = [...team1, ...team2];
        if (ids.some(id => !id)) return { success: false, error: 'Invalid player ID' };
        if (new Set(ids).size !== 4) return { success: false, error: 'A player cannot appear more than once' };

        const players = ids.map(id => PlayerManager.getPlayer(id));
        if (players.some(p => !p)) return { success: false, error: 'Player does not exist' };
        if (!Number.isInteger(score1) || score1 < 0 || !Number.isInteger(score2) || score2 < 0) {
            return { success: false, error: 'Scores must be non-negative integers' };
        }

        const newGame = createDuosGame(team1, team2, score1, score2);
        this.games.push(newGame);
        players.forEach(p => p.gamesPlayed++);
        players.forEach(p => { if (didPlayerWin(newGame, p.id)) p.wins++; });

        try {
            await Storage.saveGame(GroupManager.currentGroupId, newGame);
            await Promise.all(players.map(p => Storage.savePlayer(p)));
        } catch (error) {
            this.games.pop();
            players.forEach(p => p.gamesPlayed--);
            players.forEach(p => { if (didPlayerWin(newGame, p.id)) p.wins--; });
            return { success: false, error: error.message };
        }
        return { success: true, data: newGame };
    },

    async deleteGame(gameId) {
        if (!gameId || typeof gameId !== 'string') return { success: false, error: 'Invalid game ID' };
        const gameIndex = this.games.findIndex(g => g.id === gameId);
        if (gameIndex === -1) return { success: false, error: 'Game does not exist' };

        const game = this.games[gameIndex];
        const participants = getGameParticipants(game)
            .map(id => PlayerManager.getPlayer(id))
            .filter(Boolean);
        const origStats = participants.map(p => ({ id: p.id, gamesPlayed: p.gamesPlayed, wins: p.wins }));

        participants.forEach(p => { p.gamesPlayed--; if (didPlayerWin(game, p.id)) p.wins--; });
        const removedGame = this.games.splice(gameIndex, 1)[0];

        try {
            await Storage.deleteGame(GroupManager.currentGroupId, gameId);
            await Promise.all(participants.map(p => Storage.savePlayer(p)));
        } catch (error) {
            this.games.splice(gameIndex, 0, removedGame);
            origStats.forEach(o => {
                const p = PlayerManager.getPlayer(o.id);
                if (p) { p.gamesPlayed = o.gamesPlayed; p.wins = o.wins; }
            });
            return { success: false, error: error.message };
        }
        return { success: true };
    },

    getGameById(gameId) {
        if (!gameId || typeof gameId !== 'string') return null;
        return this.games.find(g => g.id === gameId) || null;
    },

    getGameHistory(filterPlayerId) {
        let filtered = [...this.games];
        if (filterPlayerId && typeof filterPlayerId === 'string') {
            filtered = filtered.filter(g => gameInvolvesPlayer(g, filterPlayerId));
        }
        filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return filtered;
    },

    async initialize() {
        this.games = await Storage.loadGames(GroupManager.currentGroupId);
    }
};

// ============================================
// Business Logic - Statistics Calculator
// ============================================

const StatisticsCalculator = {
    calculatePlayerStats(playerId, games) {
        const stats = { gamesPlayed: 0, wins: 0, losses: 0, ties: 0, winPercentage: 0 };
        const playerGames = games.filter(g => gameInvolvesPlayer(g, playerId));
        stats.gamesPlayed = playerGames.length;
        playerGames.forEach(g => {
            if (didPlayerWin(g, playerId)) stats.wins++;
            else if (isGameTie(g)) stats.ties++;
            else stats.losses++;
        });
        if (stats.gamesPlayed > 0) {
            stats.winPercentage = parseFloat(((stats.wins / stats.gamesPlayed) * 100).toFixed(2));
        }
        return stats;
    },

    generateLeaderboard(players) {
        const games = GameManager.games;
        const entries = players.map(player => ({
            player,
            stats: this.calculatePlayerStats(player.id, games),
            rank: 0
        }));
        entries.sort((a, b) => b.stats.winPercentage !== a.stats.winPercentage
            ? b.stats.winPercentage - a.stats.winPercentage
            : b.stats.wins - a.stats.wins);
        entries.forEach((e, i) => { e.rank = i + 1; });
        return entries;
    },

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

const PlayerManagementUI = {
    _bound: false,
    initialize() { this.setupEventListeners(); this.render(); },

    setupEventListeners() {
        if (this._bound) return;
        this._bound = true;
        const form = document.getElementById('add-player-form');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleAddPlayer(); });
    },

    async handleAddPlayer() {
        const input = document.getElementById('player-name-input');
        const result = await PlayerManager.addPlayer(input.value);
        if (result.success) {
            this.showFeedback(`Player "${input.value.trim()}" added!`, 'success');
            input.value = '';
            this.render();
            GameRecordingUI.render();
        } else {
            this.showFeedback(result.error, 'error');
        }
    },

    async handleRemovePlayer(playerId, playerName) {
        if (!confirm(`Remove ${playerName}?`)) return;
        const result = await PlayerManager.removePlayer(playerId);
        if (result.success) { this.render(); GameRecordingUI.render(); }
    },

    render() {
        const container = document.getElementById('player-list');
        if (!container) return;
        const players = PlayerManager.getAllPlayers();
        if (players.length === 0) {
            container.innerHTML = '<p style="color:#777;text-align:center;padding:20px;">No players added yet.</p>';
        } else {
            container.innerHTML = '';
            [...players].sort((a, b) => a.name.localeCompare(b.name)).forEach(player => {
                const item = document.createElement('div');
                item.className = 'player-item';
                const span = document.createElement('span');
                span.className = 'player-name';
                span.textContent = player.name;
                const btn = document.createElement('button');
                btn.className = 'remove-player-btn';
                btn.textContent = 'Remove';
                btn.addEventListener('click', () => this.handleRemovePlayer(player.id, player.name));
                item.appendChild(span);
                item.appendChild(btn);
                container.appendChild(item);
            });
        }
        const countEl = document.getElementById('player-count');
        if (countEl) countEl.innerHTML = `Players: ${PlayerManager.players.length}/20`;
        const submitBtn = document.querySelector('#add-player-form button[type="submit"]');
        if (submitBtn) submitBtn.disabled = !PlayerManager.canAddPlayer();
    },

    showFeedback(message, type) {
        const el = document.getElementById('player-feedback');
        if (!el) return;
        el.textContent = message;
        el.className = `feedback ${type}`;
        if (type === 'success') setTimeout(() => { el.className = 'feedback'; el.textContent = ''; }, 3000);
    }
};

// ============================================
// UI Components - Game Recording
// ============================================

const GameRecordingUI = {
    _bound: false,
    mode: 'singles',
    initialize() { this.setupEventListeners(); this.render(); },

    setupEventListeners() {
        if (this._bound) return;
        this._bound = true;
        const form = document.getElementById('record-game-form');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleRecordGame(); });
        document.querySelectorAll('input[name="game-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.setMode(e.target.value));
        });
    },

    setMode(mode) {
        this.mode = mode === 'duos' ? 'duos' : 'singles';
        const singlesEl = document.getElementById('singles-fields');
        const duosEl = document.getElementById('duos-fields');
        if (singlesEl) singlesEl.style.display = this.mode === 'singles' ? '' : 'none';
        if (duosEl) duosEl.style.display = this.mode === 'duos' ? '' : 'none';
        this.render();
    },

    async handleRecordGame() {
        if (this.mode === 'duos') return this.handleRecordDuosGame();

        const p1Select = document.getElementById('player1-select');
        const p2Select = document.getElementById('player2-select');
        const s1Input = document.getElementById('player1-score');
        const s2Input = document.getElementById('player2-score');
        const result = await GameManager.recordGame(p1Select.value, p2Select.value, parseInt(s1Input.value, 10), parseInt(s2Input.value, 10));
        if (result.success) {
            this.showFeedback('Game recorded!', 'success');
            p1Select.value = ''; p2Select.value = ''; s1Input.value = ''; s2Input.value = '';
            PlayerManagementUI.render(); GameHistoryUI.render(); LeaderboardUI.render();
        } else {
            this.showFeedback(result.error, 'error');
        }
    },

    async handleRecordDuosGame() {
        const t1a = document.getElementById('team1-player1-select');
        const t1b = document.getElementById('team1-player2-select');
        const t2a = document.getElementById('team2-player1-select');
        const t2b = document.getElementById('team2-player2-select');
        const s1Input = document.getElementById('team1-score');
        const s2Input = document.getElementById('team2-score');
        const result = await GameManager.recordDuosGame(
            [t1a.value, t1b.value],
            [t2a.value, t2b.value],
            parseInt(s1Input.value, 10),
            parseInt(s2Input.value, 10)
        );
        if (result.success) {
            this.showFeedback('Duos game recorded!', 'success');
            [t1a, t1b, t2a, t2b, s1Input, s2Input].forEach(el => { el.value = ''; });
            PlayerManagementUI.render(); GameHistoryUI.render(); LeaderboardUI.render();
        } else {
            this.showFeedback(result.error, 'error');
        }
    },

    render() {
        const players = [...PlayerManager.getAllPlayers()].sort((a, b) => a.name.localeCompare(b.name));
        const opts = players.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

        const p1 = document.getElementById('player1-select');
        const p2 = document.getElementById('player2-select');
        if (p1 && p2) {
            p1.innerHTML = '<option value="">Select Player 1</option>' + opts;
            p2.innerHTML = '<option value="">Select Player 2</option>' + opts;
            const disabled = players.length < 2;
            p1.disabled = disabled;
            p2.disabled = disabled;
        }

        const duosSelects = [
            ['team1-player1-select', 'Team 1 - Player 1'],
            ['team1-player2-select', 'Team 1 - Player 2'],
            ['team2-player1-select', 'Team 2 - Player 1'],
            ['team2-player2-select', 'Team 2 - Player 2']
        ];
        const duosDisabled = players.length < 4;
        duosSelects.forEach(([id, label]) => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = `<option value="">${label}</option>` + opts;
                el.disabled = duosDisabled;
            }
        });

        const btn = document.querySelector('#record-game-form button[type="submit"]');
        if (btn) btn.disabled = this.mode === 'duos' ? duosDisabled : players.length < 2;
    },

    showFeedback(message, type) {
        const el = document.getElementById('game-feedback');
        if (!el) return;
        el.textContent = message;
        el.className = `feedback ${type}`;
        if (type === 'success') setTimeout(() => { el.className = 'feedback'; el.textContent = ''; }, 3000);
    }
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// UI Components - Game History
// ============================================

const GameHistoryUI = {
    _bound: false,
    initialize() { this.setupEventListeners(); this.render(); },

    setupEventListeners() {
        if (this._bound) return;
        this._bound = true;
        const filter = document.getElementById('player-filter');
        if (filter) filter.addEventListener('change', () => this.render());
    },

    async handleDeleteGame(gameId) {
        const game = GameManager.getGameById(gameId);
        if (!game) return;
        let label;
        if (isDuosGame(game)) {
            const names = game.team1.concat(game.team2).map(id => {
                const p = PlayerManager.getPlayer(id);
                return p ? p.name : 'Unknown';
            });
            label = `${names[0]} & ${names[1]} vs ${names[2]} & ${names[3]}`;
        } else {
            const p1 = PlayerManager.getPlayer(game.player1Id);
            const p2 = PlayerManager.getPlayer(game.player2Id);
            label = `${p1 ? p1.name : 'Unknown'} vs ${p2 ? p2.name : 'Unknown'}`;
        }
        if (!confirm(`Delete game: ${label}?`)) return;
        const result = await GameManager.deleteGame(gameId);
        if (result.success) { this.render(); PlayerManagementUI.render(); LeaderboardUI.render(); }
    },

    render() {
        this.renderPlayerFilter();
        this.renderGameList();
    },

    renderPlayerFilter() {
        const filter = document.getElementById('player-filter');
        if (!filter) return;
        const players = [...PlayerManager.getAllPlayers()].sort((a, b) => a.name.localeCompare(b.name));
        const currentValue = filter.value;
        filter.innerHTML = '<option value="">All Players</option>' + players.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
        if (currentValue && players.some(p => p.id === currentValue)) filter.value = currentValue;
    },

    renderGameList() {
        const container = document.getElementById('game-list');
        if (!container) return;
        const filterPlayerId = document.getElementById('player-filter')?.value || '';
        const games = GameManager.getGameHistory(filterPlayerId || undefined);

        if (games.length === 0) {
            container.innerHTML = '<p style="color:#777;text-align:center;padding:20px;">No games recorded yet.</p>';
            return;
        }

        container.innerHTML = games.map(game => {
            const ts = this.formatTimestamp(game.timestamp);
            const resultText = isDuosGame(game) ? this.renderDuosResult(game) : this.renderSinglesResult(game);
            return `<div class="game-item" data-game-id="${game.id}"><div class="game-result">${resultText}</div><div class="game-meta"><span class="game-timestamp">${ts}</span><button class="delete-game-btn" data-game-id="${game.id}">Delete</button></div></div>`;
        }).join('');

        container.querySelectorAll('.delete-game-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleDeleteGame(btn.getAttribute('data-game-id')));
        });
    },

    renderSinglesResult(game) {
        const p1 = PlayerManager.getPlayer(game.player1Id);
        const p2 = PlayerManager.getPlayer(game.player2Id);
        const p1Name = p1 ? p1.name : 'Unknown';
        const p2Name = p2 ? p2.name : 'Unknown';
        if (game.winnerId === game.player1Id) {
            return `<span class="player-name winner">${escapeHtml(p1Name)}</span> <span class="score">${game.player1Score}</span> - <span class="player-name">${escapeHtml(p2Name)}</span> <span class="score">${game.player2Score}</span>`;
        } else if (game.winnerId === game.player2Id) {
            return `<span class="player-name">${escapeHtml(p1Name)}</span> <span class="score">${game.player1Score}</span> - <span class="player-name winner">${escapeHtml(p2Name)}</span> <span class="score">${game.player2Score}</span>`;
        }
        return `<span class="player-name">${escapeHtml(p1Name)}</span> <span class="score">${game.player1Score}</span> - <span class="player-name">${escapeHtml(p2Name)}</span> <span class="score">${game.player2Score}</span> <span class="tie-indicator">(Tie)</span>`;
    },

    renderDuosResult(game) {
        const nameOf = id => {
            const p = PlayerManager.getPlayer(id);
            return escapeHtml(p ? p.name : 'Unknown');
        };
        const team1Class = game.winningTeam === 1 ? 'team-name winner' : 'team-name';
        const team2Class = game.winningTeam === 2 ? 'team-name winner' : 'team-name';
        const team1 = `<span class="${team1Class}">${nameOf(game.team1[0])} &amp; ${nameOf(game.team1[1])}</span>`;
        const team2 = `<span class="${team2Class}">${nameOf(game.team2[0])} &amp; ${nameOf(game.team2[1])}</span>`;
        const tie = game.winningTeam === null ? ' <span class="tie-indicator">(Tie)</span>' : '';
        return `<span class="duos-badge">2v2</span> ${team1} <span class="score">${game.team1Score}</span> - ${team2} <span class="score">${game.team2Score}</span>${tie}`;
    },

    formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return 'Invalid date';
            return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        } catch { return 'Unknown date'; }
    }
};

// ============================================
// UI Components - Leaderboard
// ============================================

const LeaderboardUI = {
    initialize() { this.render(); },

    render() {
        const container = document.getElementById('leaderboard-table');
        if (!container) return;
        const players = PlayerManager.getAllPlayers();
        if (players.length === 0) {
            container.innerHTML = '<p style="color:#777;text-align:center;padding:20px;">No players yet.</p>';
            return;
        }
        const leaderboard = StatisticsCalculator.generateLeaderboard(players);
        container.innerHTML = `<table><thead><tr><th>Rank</th><th>Player</th><th>Games</th><th>Wins</th><th>Win %</th></tr></thead><tbody>${leaderboard.map(e => `<tr class="${e.rank <= 3 ? 'top-three' : ''}"><td>${e.rank}</td><td>${escapeHtml(e.player.name)}</td><td>${e.stats.gamesPlayed}</td><td>${e.stats.wins}</td><td>${e.stats.winPercentage}%</td></tr>`).join('')}</tbody></table>`;
    }
};

// ============================================
// UI Components - Group Selection
// ============================================

const GroupSelectUI = {
    _bound: false,
    initialize() {
        this.setupEventListeners();
        this.render();
    },

    setupEventListeners() {
        if (this._bound) return;
        this._bound = true;
        const form = document.getElementById('create-group-form');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleCreateGroup(); });
        const backBtn = document.getElementById('back-to-groups');
        if (backBtn) backBtn.addEventListener('click', () => PoolScoreTrackerApp.showGroupSelect());
    },

    async handleCreateGroup() {
        const input = document.getElementById('group-name-input');
        const name = input.value.trim();
        if (!name) return;
        await GroupManager.createGroup(name);
        input.value = '';
        this.render();
    },

    async handleDeleteGroup(groupId, groupName) {
        if (!confirm(`Delete group "${groupName}"? This will remove all games in this group.`)) return;
        await GroupManager.deleteGroup(groupId);
        this.render();
    },

    render() {
        const container = document.getElementById('group-list');
        if (!container) return;
        const groups = GroupManager.groups;
        if (groups.length === 0) {
            container.innerHTML = '<p style="color:#777;text-align:center;padding:20px;">No groups yet. Create one above!</p>';
            return;
        }
        container.innerHTML = '';
        [...groups].sort((a, b) => a.name.localeCompare(b.name)).forEach(group => {
            const item = document.createElement('div');
            item.className = 'group-item';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'group-name';
            nameSpan.textContent = group.name;
            const btnContainer = document.createElement('div');
            btnContainer.className = 'group-item-actions';
            const selectBtn = document.createElement('button');
            selectBtn.textContent = 'Open';
            selectBtn.addEventListener('click', () => PoolScoreTrackerApp.openGroup(group.id));
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'delete-group-btn';
            deleteBtn.addEventListener('click', () => this.handleDeleteGroup(group.id, group.name));
            btnContainer.appendChild(selectBtn);
            btnContainer.appendChild(deleteBtn);
            item.appendChild(nameSpan);
            item.appendChild(btnContainer);
            container.appendChild(item);
        });
    },

    showFeedback(message, type) {
        const el = document.getElementById('group-feedback');
        if (!el) return;
        el.textContent = message;
        el.className = `feedback ${type}`;
        if (type === 'success') setTimeout(() => { el.className = 'feedback'; el.textContent = ''; }, 3000);
    }
};

// ============================================
// Application Initialization
// ============================================

const PoolScoreTrackerApp = {
    async initialize() {
        try {
            await GroupManager.initialize();
            GroupSelectUI.initialize();
            this.showGroupSelect();
        } catch (error) {
            console.error('Failed to initialize:', error);
        }
    },

    showGroupSelect() {
        document.getElementById('group-select-view').style.display = '';
        document.getElementById('main-app').style.display = 'none';
        GroupSelectUI.render();
    },

    async openGroup(groupId) {
        await GroupManager.selectGroup(groupId);
        const group = GroupManager.getCurrentGroup();
        document.getElementById('group-select-view').style.display = 'none';
        document.getElementById('main-app').style.display = '';
        document.getElementById('current-group-name').textContent = group.name;
        this.initializeUI();
    },

    initializeUI() {
        PlayerManagementUI.initialize();
        GameRecordingUI.initialize();
        GameHistoryUI.initialize();
        LeaderboardUI.initialize();
    },

    refreshAllUI() {
        PlayerManagementUI.render();
        GameRecordingUI.render();
        GameHistoryUI.render();
        LeaderboardUI.render();
    },

    async clearAllData() {
        if (confirm('Are you sure you want to clear ALL data? This cannot be undone!')) {
            await Storage.clear();
            PlayerManager.players = [];
            GameManager.games = [];
            GroupManager.groups = [];
            GroupManager.currentGroupId = null;
            this.showGroupSelect();
            GroupSelectUI.render();
        }
    }
};

// Initialize on DOM load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => PoolScoreTrackerApp.initialize());
}

if (typeof window !== 'undefined') {
    window.PoolScoreTrackerApp = PoolScoreTrackerApp;
}

export {
    generateUUID, createPlayer, createGame, createDuosGame,
    isDuosGame, getGameParticipants, gameInvolvesPlayer, didPlayerWin, isGameTie,
    Storage,
    GroupManager, PlayerManager, GameManager, StatisticsCalculator,
    PlayerManagementUI, GameRecordingUI, GameHistoryUI, LeaderboardUI,
    GroupSelectUI, PoolScoreTrackerApp
};
