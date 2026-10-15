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
// Tournament Model + Bracket Utilities
// ============================================

const TOURNAMENT_WINS_NEEDED = 2; // best-of-3

function createTournament(name, groupId) {
    return {
        id: generateUUID(),
        name: name.trim(),
        groupId,
        status: 'setup', // 'setup' | 'active' | 'complete'
        // 'knockout' = straight single elimination; 'groups' = round-robin group
        // stage feeding a single-elimination knockout. A missing format (older
        // tournaments) is treated as 'knockout'.
        format: 'knockout',
        stage: null, // format 'groups' only: 'groups' | 'knockout' once active
        numGroups: 2,
        groups: [], // [{ id, name, playerIds, matches, playoffs }]
        playerIds: [],
        // Ad-hoc entrant records ({ id, name }) for group-less tournaments where
        // there is no shared player pool. Group-scoped tournaments leave this empty
        // and resolve names via PlayerManager.
        participants: [],
        matches: [],
        championId: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null
    };
}

function createMatch(round, slot, player1Id, player2Id) {
    return {
        id: generateUUID(),
        round,
        slot,
        player1Id: player1Id || null,
        player2Id: player2Id || null,
        // Per-game scores for a best-of-3 series.
        games: [], // [{ player1Score, player2Score, winnerId }]
        player1Wins: 0,
        player2Wins: 0,
        winnerId: null,
        nextMatchId: null,
        status: 'pending' // 'pending' | 'ready' | 'complete'
    };
}

// Fisher-Yates shuffle (returns a new array).
function shuffleArray(array, rng = Math.random) {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function nextPowerOfTwo(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

// Build a single-elimination bracket from the given (already ordered) player IDs.
// Byes are represented as null player slots; a player facing a null opponent
// in round 1 auto-advances when the tournament starts.
function generateBracket(playerIds) {
    const count = playerIds.length;
    if (count < 2) return [];

    const size = nextPowerOfTwo(count);
    const totalRounds = Math.log2(size);
    const numByes = size - count;

    const matches = [];
    const roundMatches = []; // roundMatches[r] = array of matches in round r (0-indexed)

    // Round 1: give the first `numByes` players a bye (single-player match that
    // auto-advances), then pair the remaining players against each other. This
    // guarantees no degenerate empty matches and a valid power-of-two bracket.
    const firstRound = [];
    const numFirstRoundMatches = size / 2;
    let playerIdx = 0;
    for (let slot = 0; slot < numFirstRoundMatches; slot++) {
        let p1 = null, p2 = null;
        if (slot < numByes) {
            // Bye match: one real player, no opponent.
            p1 = playerIds[playerIdx++];
        } else {
            p1 = playerIds[playerIdx++];
            p2 = playerIds[playerIdx++];
        }
        const m = createMatch(1, slot, p1, p2);
        firstRound.push(m);
        matches.push(m);
    }
    roundMatches.push(firstRound);

    // Subsequent rounds
    for (let r = 1; r < totalRounds; r++) {
        const prev = roundMatches[r - 1];
        const current = [];
        for (let slot = 0; slot < prev.length / 2; slot++) {
            const m = createMatch(r + 1, slot, null, null);
            current.push(m);
            matches.push(m);
        }
        // Link previous round winners to this round.
        prev.forEach((pm, i) => { pm.nextMatchId = current[Math.floor(i / 2)].id; });
        roundMatches.push(current);
    }

    return matches;
}

// A game within a tournament match must have a decisive winner (no ties in best-of-3).
function createTournamentGame(player1Id, player2Id, player1Score, player2Score) {
    let winnerId = null;
    if (player1Score > player2Score) winnerId = player1Id;
    else if (player2Score > player1Score) winnerId = player2Id;
    return { player1Score, player2Score, winnerId };
}

// ============================================
// Group Stage Utilities
// ============================================

// Each group match is two frames: 2-0 is a win, 1-1 a draw. Frames count as goals.
const GROUP_MATCH_FRAMES = 2;
const GROUP_POINTS = { win: 3, draw: 1, loss: 0 };

function isGroupFormat(t) {
    return !!t && t.format === 'groups';
}

// Groups of 3+ send their top 2 through; a group of 2 sends only its winner.
function qualifiersPerGroup(groupSize) {
    return groupSize >= 3 ? 2 : 1;
}

// Sizes produced when dealing playerCount players into numGroups groups.
function groupSizes(playerCount, numGroups) {
    const sizes = [];
    for (let g = 0; g < numGroups; g++) {
        sizes.push(Math.floor(playerCount / numGroups) + (g < playerCount % numGroups ? 1 : 0));
    }
    return sizes;
}

// Returns an error message, or null if playerCount can be split into numGroups.
function validateGroupSetup(playerCount, numGroups) {
    if (!Number.isInteger(numGroups) || numGroups < 1) {
        return 'Number of groups must be a whole number of at least 1';
    }
    if (playerCount < numGroups * 2) {
        return `${numGroups} group${numGroups === 1 ? '' : 's'} need at least ${numGroups * 2} players (2 per group)`;
    }
    const qualifiers = groupSizes(playerCount, numGroups).reduce((s, n) => s + qualifiersPerGroup(n), 0);
    if (qualifiers < 2) return 'At least 2 players must reach the knockout stage';
    return null;
}

// "Group A" ... "Group Z", "Group AA", ...
function groupName(index) {
    let s = '';
    let n = index;
    do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return `Group ${s}`;
}

// Deal the (already ordered) players into numGroups buckets; sizes differ by at most one.
function splitIntoGroups(playerIds, numGroups) {
    const buckets = Array.from({ length: numGroups }, () => []);
    playerIds.forEach((id, i) => buckets[i % numGroups].push(id));
    return buckets;
}

// Every player plays every other player in the group once.
function generateRoundRobin(playerIds) {
    const pairs = [];
    for (let i = 0; i < playerIds.length; i++) {
        for (let j = i + 1; j < playerIds.length; j++) pairs.push([playerIds[i], playerIds[j]]);
    }
    return pairs;
}

function createGroupMatch(player1Id, player2Id) {
    return {
        id: generateUUID(),
        player1Id,
        player2Id,
        frames: [], // [{ winnerId }]
        player1Score: 0,
        player2Score: 0,
        status: 'pending' // 'pending' | 'complete'
    };
}

// A single-frame decider used only to separate players level on every tie-breaker.
function createPlayoffMatch(round, player1Id, player2Id) {
    return {
        id: generateUUID(),
        round,
        player1Id,
        player2Id,
        winnerId: null,
        status: 'pending'
    };
}

function buildGroups(playerIds, numGroups) {
    return splitIntoGroups(playerIds, numGroups).map((ids, i) => ({
        id: generateUUID(),
        name: groupName(i),
        playerIds: ids,
        matches: generateRoundRobin(ids).map(([a, b]) => createGroupMatch(a, b)),
        playoffs: []
    }));
}

function applyGroupResult(row, goalsFor, goalsAgainst) {
    row.played++;
    row.goalsFor += goalsFor;
    row.goalsAgainst += goalsAgainst;
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    if (goalsFor > goalsAgainst) { row.won++; row.points += GROUP_POINTS.win; }
    else if (goalsFor === goalsAgainst) { row.drawn++; row.points += GROUP_POINTS.draw; }
    else { row.lost++; row.points += GROUP_POINTS.loss; }
}

// Standings for one group, ranked by: points, head-to-head points among the
// players level on points, goal difference, goals scored, then playoff wins.
// Returns { rows, ties } where ties lists groups of player ids still level on
// every criterion.
function calculateGroupStandings(group) {
    const rows = new Map(group.playerIds.map(id => [id, {
        playerId: id, played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        headToHead: 0, playoffWins: [] // playoffWins[r] = wins in playoff round r+1
    }]));
    const completed = group.matches.filter(m => m.status === 'complete');
    completed.forEach(m => {
        const a = rows.get(m.player1Id);
        const b = rows.get(m.player2Id);
        if (!a || !b) return;
        applyGroupResult(a, m.player1Score, m.player2Score);
        applyGroupResult(b, m.player2Score, m.player1Score);
    });

    // Head-to-head and playoff wins are only computed among players level on points.
    const byPoints = new Map();
    rows.forEach(r => {
        if (!byPoints.has(r.points)) byPoints.set(r.points, []);
        byPoints.get(r.points).push(r);
    });
    byPoints.forEach(cluster => {
        if (cluster.length < 2) return;
        const ids = new Set(cluster.map(r => r.playerId));
        completed.forEach(m => {
            if (!ids.has(m.player1Id) || !ids.has(m.player2Id)) return;
            if (m.player1Score > m.player2Score) rows.get(m.player1Id).headToHead += GROUP_POINTS.win;
            else if (m.player2Score > m.player1Score) rows.get(m.player2Id).headToHead += GROUP_POINTS.win;
            else {
                rows.get(m.player1Id).headToHead += GROUP_POINTS.draw;
                rows.get(m.player2Id).headToHead += GROUP_POINTS.draw;
            }
        });
        (group.playoffs || []).forEach(p => {
            if (!p.winnerId || !ids.has(p.player1Id) || !ids.has(p.player2Id)) return;
            const rec = rows.get(p.winnerId).playoffWins;
            rec[p.round - 1] = (rec[p.round - 1] || 0) + 1;
        });
    });

    // Playoff rounds compare one at a time, so a later round only reorders
    // players who were still level after the earlier ones.
    const maxRound = Math.max(0, ...(group.playoffs || []).map(p => p.round));
    const key = r => {
        const k = [r.points, r.headToHead, r.goalDifference, r.goalsFor];
        for (let i = 0; i < maxRound; i++) k.push(r.playoffWins[i] || 0);
        return k;
    };
    const compare = (a, b) => {
        const ka = key(a), kb = key(b);
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
        return 0;
    };
    const sorted = [...rows.values()].sort(compare);
    sorted.forEach((r, i) => { r.position = i + 1; });

    const ties = [];
    let i = 0;
    while (i < sorted.length) {
        let j = i + 1;
        while (j < sorted.length && compare(sorted[i], sorted[j]) === 0) j++;
        if (j - i > 1) ties.push(sorted.slice(i, j).map(r => r.playerId));
        i = j;
    }
    return { rows: sorted, ties };
}

// Ties that change who qualifies or who finishes first/second. Ties entirely
// below the qualifying places don't matter.
function findBlockingTies(group) {
    const { rows, ties } = calculateGroupStandings(group);
    const q = qualifiersPerGroup(group.playerIds.length);
    const positionOf = id => rows.find(r => r.playerId === id).position;
    return ties.filter(ids => ids.some(id => positionOf(id) <= q));
}

// True when a previewed group draw still matches the entrants and group count
// (entrants may have been added or removed since the draw).
function isGroupDrawCurrent(t) {
    const groups = t.groups || [];
    if (groups.length !== t.numGroups) return false;
    const drawn = groups.flatMap(g => g.playerIds);
    return drawn.length === t.playerIds.length && t.playerIds.every(id => drawn.includes(id));
}

function isGroupMatchesComplete(group) {
    return group.matches.every(m => m.status === 'complete');
}

function hasPendingPlayoffs(group) {
    return (group.playoffs || []).some(p => p.status !== 'complete');
}

// Order the qualifiers for generateBracket: group winners first (so they take
// any byes), then each remaining seed is paired with the lowest-ranked
// remaining opponent from a different group where possible.
function seedKnockout(groups) {
    const winners = [];
    const runnersUp = [];
    groups.forEach((g, gi) => {
        const { rows } = calculateGroupStandings(g);
        const q = qualifiersPerGroup(g.playerIds.length);
        rows.slice(0, q).forEach((r, pos) => (pos === 0 ? winners : runnersUp).push({ id: r.playerId, group: gi }));
    });
    const seeds = [...winners, ...runnersUp];
    const numByes = nextPowerOfTwo(seeds.length) - seeds.length;
    const order = seeds.slice(0, numByes).map(s => s.id);
    const rest = seeds.slice(numByes);
    while (rest.length) {
        const top = rest.shift();
        let idx = -1;
        for (let k = rest.length - 1; k >= 0; k--) {
            if (rest[k].group !== top.group) { idx = k; break; }
        }
        if (idx === -1) idx = rest.length - 1;
        const [opponent] = rest.splice(idx, 1);
        order.push(top.id, opponent.id);
    }
    return order;
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

    // Tournaments (scoped to group)
    async saveTournament(groupId, tournament) {
        await setDoc(doc(db, "groups", groupId, "tournaments", tournament.id), tournament);
    },
    async loadTournaments(groupId) {
        const snapshot = await getDocs(collection(db, "groups", groupId, "tournaments"));
        return snapshot.docs.map(d => d.data());
    },
    async deleteTournament(groupId, tournamentId) {
        await deleteDoc(doc(db, "groups", groupId, "tournaments", tournamentId));
    },

    // Global tournaments (not tied to any group)
    async saveGlobalTournament(tournament) {
        await setDoc(doc(db, "tournaments", tournament.id), tournament);
    },
    async loadGlobalTournaments() {
        const snapshot = await getDocs(collection(db, "tournaments"));
        return snapshot.docs.map(d => d.data());
    },
    async deleteGlobalTournament(tournamentId) {
        await deleteDoc(doc(db, "tournaments", tournamentId));
    },

    async clear() {
        const players = await getDocs(collection(db, "players"));
        const groups = await getDocs(collection(db, "groups"));
        const globalTournaments = await getDocs(collection(db, "tournaments"));
        await Promise.all([
            ...players.docs.map(d => deleteDoc(d.ref)),
            ...groups.docs.map(d => deleteDoc(d.ref)),
            ...globalTournaments.docs.map(d => deleteDoc(d.ref))
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
        TournamentManager.tournaments = await Storage.loadTournaments(groupId);
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
// Business Logic - Tournament Manager
// ============================================

// Factory that builds a tournament manager bound to a storage "scope". The
// bracket/series logic is identical for group-scoped and group-less (global)
// tournaments; only persistence and how entrants are resolved differ.
//
// scope: {
//   load()            -> Promise<tournament[]>
//   save(tournament)  -> Promise<void>
//   remove(id)        -> Promise<void>
//   newTournament(name) -> tournament
//   entrantName(t, id)  -> string   // resolve an entrant id to a display name
// }
function createTournamentManager(scope) {
    return {
        tournaments: [],

        async initialize() {
            this.tournaments = await scope.load();
        },

        getTournament(tournamentId) {
            return this.tournaments.find(t => t.id === tournamentId) || null;
        },

        // Newest first; used for the results/history list.
        getAllTournaments() {
            return [...this.tournaments].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
        },

        // Resolve an entrant id to a display name within a tournament.
        entrantName(t, id) {
            return scope.entrantName(t, id);
        },

        async createTournament(name) {
            if (!name || typeof name !== 'string' || name.trim() === '') {
                return { success: false, error: 'Tournament name cannot be empty' };
            }
            const tournament = scope.newTournament(name);
            this.tournaments.push(tournament);
            try {
                await scope.save(tournament);
            } catch (error) {
                this.tournaments.pop();
                return { success: false, error: error.message };
            }
            return { success: true, data: tournament };
        },

        async deleteTournament(tournamentId) {
            const idx = this.tournaments.findIndex(t => t.id === tournamentId);
            if (idx === -1) return { success: false, error: 'Tournament not found' };
            const removed = this.tournaments.splice(idx, 1)[0];
            try {
                await scope.remove(tournamentId);
            } catch (error) {
                this.tournaments.splice(idx, 0, removed);
                return { success: false, error: error.message };
            }
            return { success: true };
        },

        // Group-scoped entrants reference an existing global player by id.
        async addEntrant(tournamentId, playerId) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (t.status !== 'setup') return { success: false, error: 'Cannot change entrants after the tournament has started' };
            if (!PlayerManager.getPlayer(playerId)) return { success: false, error: 'Player does not exist' };
            if (t.playerIds.includes(playerId)) return { success: false, error: 'Player already entered' };
            t.playerIds.push(playerId);
            return this._persist(t);
        },

        // Group-less entrants are ad-hoc names with no shared player pool.
        async addNamedEntrant(tournamentId, name) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (t.status !== 'setup') return { success: false, error: 'Cannot change entrants after the tournament has started' };
            if (!name || typeof name !== 'string' || name.trim() === '') {
                return { success: false, error: 'Entrant name cannot be empty' };
            }
            const trimmed = name.trim();
            if (!Array.isArray(t.participants)) t.participants = [];
            if (t.participants.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
                return { success: false, error: 'An entrant with that name already exists' };
            }
            const participant = { id: generateUUID(), name: trimmed };
            t.participants.push(participant);
            t.playerIds.push(participant.id);
            return this._persist(t);
        },

        async removeEntrant(tournamentId, playerId) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (t.status !== 'setup') return { success: false, error: 'Cannot change entrants after the tournament has started' };
            t.playerIds = t.playerIds.filter(id => id !== playerId);
            if (Array.isArray(t.participants)) {
                t.participants = t.participants.filter(p => p.id !== playerId);
            }
            return this._persist(t);
        },

        async randomizeBracket(tournamentId) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (t.status !== 'setup') return { success: false, error: 'Bracket is locked' };
            if (t.playerIds.length < 2) return { success: false, error: 'Need at least 2 players' };
            if (isGroupFormat(t)) {
                const err = validateGroupSetup(t.playerIds.length, t.numGroups);
                if (err) return { success: false, error: err };
                t.groups = buildGroups(shuffleArray(t.playerIds), t.numGroups);
                return this._persist(t);
            }
            t.matches = generateBracket(shuffleArray(t.playerIds));
            return this._persist(t);
        },

        // Choose between straight knockout and group stage + knockout (setup only).
        async setFormat(tournamentId, format, numGroups) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (t.status !== 'setup') return { success: false, error: 'Cannot change format after the tournament has started' };
            if (format !== 'knockout' && format !== 'groups') return { success: false, error: 'Unknown tournament format' };
            if (format === 'groups') {
                const n = numGroups === undefined ? (t.numGroups || 2) : numGroups;
                if (!Number.isInteger(n) || n < 1) {
                    return { success: false, error: 'Number of groups must be a whole number of at least 1' };
                }
                t.numGroups = n;
            }
            t.format = format;
            // Any previous draw no longer applies.
            t.groups = [];
            t.matches = [];
            return this._persist(t);
        },

        async startTournament(tournamentId) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (t.status !== 'setup') return { success: false, error: 'Tournament already started' };
            if (t.playerIds.length < 2) return { success: false, error: 'Need at least 2 players' };

            if (isGroupFormat(t)) {
                const err = validateGroupSetup(t.playerIds.length, t.numGroups);
                if (err) return { success: false, error: err };
                if (!isGroupDrawCurrent(t)) t.groups = buildGroups(shuffleArray(t.playerIds), t.numGroups);
                t.matches = [];
                t.status = 'active';
                t.stage = 'groups';
                t.startedAt = new Date().toISOString();
                this._checkGroupStageComplete(t);
                return this._persist(t);
            }

            if (!t.matches.length) t.matches = generateBracket(shuffleArray(t.playerIds));

            t.status = 'active';
            t.startedAt = new Date().toISOString();
            this._resolveByesAndReadiness(t);
            return this._persist(t);
        },

        // Records one frame of a two-frame group match.
        async recordGroupFrame(tournamentId, groupId, matchId, winnerId) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (!isGroupFormat(t) || t.status !== 'active' || t.stage !== 'groups') {
                return { success: false, error: 'Group stage is not in progress' };
            }
            const group = t.groups.find(g => g.id === groupId);
            if (!group) return { success: false, error: 'Group not found' };
            const match = group.matches.find(m => m.id === matchId);
            if (!match) return { success: false, error: 'Match not found' };
            if (match.status === 'complete') return { success: false, error: 'Match already decided' };
            if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
                return { success: false, error: 'Winner must be one of the two players in this match' };
            }

            match.frames.push({ winnerId });
            if (winnerId === match.player1Id) match.player1Score++;
            else match.player2Score++;
            if (match.frames.length >= GROUP_MATCH_FRAMES) match.status = 'complete';

            this._checkGroupStageComplete(t);
            return this._persist(t);
        },

        // Records the winner of a single-frame playoff between players level on
        // every group tie-breaker.
        async recordPlayoffWin(tournamentId, groupId, playoffId, winnerId) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (!isGroupFormat(t) || t.status !== 'active' || t.stage !== 'groups') {
                return { success: false, error: 'Group stage is not in progress' };
            }
            const group = t.groups.find(g => g.id === groupId);
            if (!group) return { success: false, error: 'Group not found' };
            const playoff = (group.playoffs || []).find(p => p.id === playoffId);
            if (!playoff) return { success: false, error: 'Playoff not found' };
            if (playoff.status === 'complete') return { success: false, error: 'Playoff already decided' };
            if (winnerId !== playoff.player1Id && winnerId !== playoff.player2Id) {
                return { success: false, error: 'Winner must be one of the two players in this playoff' };
            }

            playoff.winnerId = winnerId;
            playoff.status = 'complete';
            this._checkGroupStageComplete(t);
            return this._persist(t);
        },

        // Records one game of a match's best-of-3 series.
        async recordMatchGame(tournamentId, matchId, score1, score2) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (t.status !== 'active') return { success: false, error: 'Tournament is not active' };
            if (isGroupFormat(t) && t.stage !== 'knockout') return { success: false, error: 'Knockout stage has not started yet' };

            const match = t.matches.find(m => m.id === matchId);
            if (!match) return { success: false, error: 'Match not found' };
            if (match.status === 'complete') return { success: false, error: 'Match already decided' };
            if (!match.player1Id || !match.player2Id) return { success: false, error: 'Match is not ready' };
            if (!Number.isInteger(score1) || score1 < 0 || !Number.isInteger(score2) || score2 < 0) {
                return { success: false, error: 'Scores must be non-negative integers' };
            }
            if (score1 === score2) return { success: false, error: 'A tournament game cannot end in a tie' };

            const game = createTournamentGame(match.player1Id, match.player2Id, score1, score2);
            match.games.push(game);
            if (game.winnerId === match.player1Id) match.player1Wins++;
            else if (game.winnerId === match.player2Id) match.player2Wins++;

            if (match.player1Wins >= TOURNAMENT_WINS_NEEDED || match.player2Wins >= TOURNAMENT_WINS_NEEDED) {
                match.winnerId = match.player1Wins > match.player2Wins ? match.player1Id : match.player2Id;
                match.status = 'complete';
                this._advanceWinner(t, match);
                this._checkCompletion(t);
            }
            return this._persist(t);
        },

        // Records a single game win for one player in a match's best-of-3 series,
        // without needing point scores. Use this to add a win at a time (e.g. when
        // the two games of a series are played on different days). Once a player
        // reaches the win threshold the match completes and the winner advances.
        async recordGameWin(tournamentId, matchId, winnerId) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (t.status !== 'active') return { success: false, error: 'Tournament is not active' };
            if (isGroupFormat(t) && t.stage !== 'knockout') return { success: false, error: 'Knockout stage has not started yet' };

            const match = t.matches.find(m => m.id === matchId);
            if (!match) return { success: false, error: 'Match not found' };
            if (match.status === 'complete') return { success: false, error: 'Match already decided' };
            if (!match.player1Id || !match.player2Id) return { success: false, error: 'Match is not ready' };
            if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
                return { success: false, error: 'Winner must be one of the two players in this match' };
            }

            match.games.push({ winnerId });
            if (winnerId === match.player1Id) match.player1Wins++;
            else match.player2Wins++;

            if (match.player1Wins >= TOURNAMENT_WINS_NEEDED || match.player2Wins >= TOURNAMENT_WINS_NEEDED) {
                match.winnerId = match.player1Wins > match.player2Wins ? match.player1Id : match.player2Id;
                match.status = 'complete';
                this._advanceWinner(t, match);
                this._checkCompletion(t);
            }
            return this._persist(t);
        },

        // Records the full best-of-3 series result in one step by entering games won
        // per player (e.g. 2 and 1). The player who reaches the win threshold takes
        // the match and advances.
        async recordMatchResult(tournamentId, matchId, wins1, wins2) {
            const t = this.getTournament(tournamentId);
            if (!t) return { success: false, error: 'Tournament not found' };
            if (t.status !== 'active') return { success: false, error: 'Tournament is not active' };
            if (isGroupFormat(t) && t.stage !== 'knockout') return { success: false, error: 'Knockout stage has not started yet' };

            const match = t.matches.find(m => m.id === matchId);
            if (!match) return { success: false, error: 'Match not found' };
            if (match.status === 'complete') return { success: false, error: 'Match already decided' };
            if (!match.player1Id || !match.player2Id) return { success: false, error: 'Match is not ready' };
            if (!Number.isInteger(wins1) || wins1 < 0 || !Number.isInteger(wins2) || wins2 < 0) {
                return { success: false, error: 'Scores must be non-negative integers' };
            }
            if (wins1 === wins2) return { success: false, error: 'A best-of-3 match cannot end in a tie' };
            const maxWins = Math.max(wins1, wins2);
            const minWins = Math.min(wins1, wins2);
            if (maxWins !== TOURNAMENT_WINS_NEEDED || minWins >= TOURNAMENT_WINS_NEEDED) {
                return { success: false, error: `The winner must reach exactly ${TOURNAMENT_WINS_NEEDED} game wins (best of ${TOURNAMENT_WINS_NEEDED * 2 - 1})` };
            }

            match.player1Wins = wins1;
            match.player2Wins = wins2;
            match.winnerId = wins1 > wins2 ? match.player1Id : match.player2Id;
            match.status = 'complete';
            this._advanceWinner(t, match);
            this._checkCompletion(t);
            return this._persist(t);
        },

        // ---- internal helpers ----

        // Called after every group-stage result. Once a group's matches are done,
        // any tie affecting qualification/seeding gets a round of single-frame
        // playoffs (repeated until broken). When every group is settled, the
        // qualifiers are seeded into a best-of-3 knockout bracket.
        _checkGroupStageComplete(t) {
            if (!isGroupFormat(t) || t.stage !== 'groups') return;
            let allSettled = true;
            t.groups.forEach(g => {
                if (!Array.isArray(g.playoffs)) g.playoffs = [];
                if (!isGroupMatchesComplete(g) || hasPendingPlayoffs(g)) { allSettled = false; return; }
                const blocking = findBlockingTies(g);
                if (!blocking.length) return;
                allSettled = false;
                const round = Math.max(0, ...g.playoffs.map(p => p.round)) + 1;
                blocking.forEach(ids => {
                    generateRoundRobin(ids).forEach(([a, b]) => g.playoffs.push(createPlayoffMatch(round, a, b)));
                });
            });
            if (!allSettled) return;

            t.stage = 'knockout';
            t.matches = generateBracket(seedKnockout(t.groups));
            this._resolveByesAndReadiness(t);
            this._checkCompletion(t);
        },

        _resolveByesAndReadiness(t) {
            // Repeatedly auto-advance byes (a match with exactly one player) until stable.
            let changed = true;
            while (changed) {
                changed = false;
                t.matches.forEach(m => {
                    if (m.status === 'complete') return;
                    const hasP1 = !!m.player1Id;
                    const hasP2 = !!m.player2Id;
                    if (hasP1 && hasP2) {
                        if (m.status !== 'ready') { m.status = 'ready'; changed = true; }
                    } else if (hasP1 !== hasP2) {
                        // Exactly one player present -> bye (only auto-advance in the first round,
                        // or once a real opponent can no longer appear).
                        const soleWinner = hasP1 ? m.player1Id : m.player2Id;
                        if (m.round === 1) {
                            m.winnerId = soleWinner;
                            m.status = 'complete';
                            this._advanceWinner(t, m);
                            changed = true;
                        }
                    }
                });
            }
        },

        _advanceWinner(t, match) {
            if (!match.nextMatchId || !match.winnerId) return;
            const next = t.matches.find(m => m.id === match.nextMatchId);
            if (!next) return;
            // Fill the correct slot based on the source match's slot parity.
            if (match.slot % 2 === 0) next.player1Id = match.winnerId;
            else next.player2Id = match.winnerId;
            if (next.player1Id && next.player2Id) next.status = 'ready';
            // Handle a downstream bye that becomes decidable.
            this._resolveByesAndReadiness(t);
        },

        _checkCompletion(t) {
            const final = t.matches.reduce((a, b) => (b.round > a.round ? b : a), t.matches[0]);
            if (final && final.status === 'complete') {
                t.status = 'complete';
                t.championId = final.winnerId;
                t.completedAt = new Date().toISOString();
            }
        },

        async _persist(t) {
            try {
                await scope.save(t);
            } catch (error) {
                return { success: false, error: error.message };
            }
            return { success: true, data: t };
        }
    };
}

// Group-scoped tournaments live under groups/{groupId}/tournaments and draw
// entrants from the group's player pool.
const TournamentManager = createTournamentManager({
    load: () => Storage.loadTournaments(GroupManager.currentGroupId),
    save: (t) => Storage.saveTournament(GroupManager.currentGroupId, t),
    remove: (id) => Storage.deleteTournament(GroupManager.currentGroupId, id),
    newTournament: (name) => createTournament(name, GroupManager.currentGroupId),
    entrantName: (t, id) => {
        const p = PlayerManager.getPlayer(id);
        return p ? p.name : 'Unknown';
    }
});

// Group-less tournaments live in a top-level tournaments collection and use
// ad-hoc named entrants stored on the tournament itself.
const GlobalTournamentManager = createTournamentManager({
    load: () => Storage.loadGlobalTournaments(),
    save: (t) => Storage.saveGlobalTournament(t),
    remove: (id) => Storage.deleteGlobalTournament(id),
    newTournament: (name) => createTournament(name, null),
    entrantName: (t, id) => {
        const p = (t.participants || []).find(x => x.id === id);
        return p ? p.name : 'Unknown';
    }
});


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
// UI Components - Tournament
// ============================================

const createTournamentUI = (config) => ({
    // config: {
    //   manager, mode: 'group'|'global',
    //   containerId, formId, nameInputId, feedbackId
    // }
    ...config,
    _bound: false,
    selectedId: null,

    initialize() {
        this.setupEventListeners();
        this.selectedId = null;
        this.render();
    },

    setupEventListeners() {
        if (this._bound) return;
        this._bound = true;
        const form = document.getElementById(this.formId);
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleCreate(); });
    },

    // Display name for an entrant id within a tournament (group pool or ad-hoc).
    nameOf(t, id) {
        if (!id) return null;
        return this.manager.entrantName(t, id);
    },

    async handleCreate() {
        const input = document.getElementById(this.nameInputId);
        const result = await this.manager.createTournament(input.value);
        if (result.success) {
            input.value = '';
            this.selectedId = result.data.id;
            this.render();
        } else {
            this.showFeedback(result.error, 'error');
        }
    },

    async handleDelete(id, name) {
        if (!confirm(`Delete tournament "${name}"?`)) return;
        const result = await this.manager.deleteTournament(id);
        if (result.success) {
            if (this.selectedId === id) this.selectedId = null;
            this.render();
        }
    },

    open(id) { this.selectedId = id; this.render(); },
    backToList() { this.selectedId = null; this.render(); },

    async handleAddEntrant(playerId) {
        const r = await this.manager.addEntrant(this.selectedId, playerId);
        if (!r.success) this.showFeedback(r.error, 'error');
        this.render();
    },

    async handleAddNamedEntrant() {
        const input = document.getElementById(`${this.feedbackId}-entrant-input`);
        if (!input) return;
        const r = await this.manager.addNamedEntrant(this.selectedId, input.value);
        if (r.success) input.value = '';
        else this.showFeedback(r.error, 'error');
        this.render();
        const again = document.getElementById(`${this.feedbackId}-entrant-input`);
        if (again) again.focus();
    },

    async handleRemoveEntrant(playerId) {
        const r = await this.manager.removeEntrant(this.selectedId, playerId);
        if (!r.success) this.showFeedback(r.error, 'error');
        this.render();
    },

    async handleRandomize() {
        const r = await this.manager.randomizeBracket(this.selectedId);
        if (!r.success) this.showFeedback(r.error, 'error');
        this.render();
    },

    async handleStart() {
        const r = await this.manager.startTournament(this.selectedId);
        if (!r.success) this.showFeedback(r.error, 'error');
        this.render();
    },

    async handleRecordGameWin(matchId, winnerId) {
        const r = await this.manager.recordGameWin(this.selectedId, matchId, winnerId);
        if (!r.success) this.showFeedback(r.error, 'error');
        this.render();
    },

    async handleSetFormat(format) {
        const r = await this.manager.setFormat(this.selectedId, format);
        if (!r.success) this.showFeedback(r.error, 'error');
        this.render();
    },

    async handleSetNumGroups() {
        const input = document.getElementById(`${this.feedbackId}-num-groups`);
        if (!input) return;
        const r = await this.manager.setFormat(this.selectedId, 'groups', parseInt(input.value, 10));
        if (!r.success) this.showFeedback(r.error, 'error');
        this.render();
    },

    async handleRecordGroupFrame(groupId, matchId, winnerId) {
        const r = await this.manager.recordGroupFrame(this.selectedId, groupId, matchId, winnerId);
        if (!r.success) this.showFeedback(r.error, 'error');
        this.render();
    },

    async handleRecordPlayoffWin(groupId, playoffId, winnerId) {
        const r = await this.manager.recordPlayoffWin(this.selectedId, groupId, playoffId, winnerId);
        if (!r.success) this.showFeedback(r.error, 'error');
        this.render();
    },

    statusLabel(t) {
        if (t.status === 'complete') return 'Complete';
        if (t.status === 'setup') return 'Setup';
        if (isGroupFormat(t)) return t.stage === 'knockout' ? 'Knockout' : 'Group stage';
        return 'In progress';
    },

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        if (this.selectedId && this.manager.getTournament(this.selectedId)) {
            this.renderDetail(container, this.manager.getTournament(this.selectedId));
        } else {
            this.selectedId = null;
            this.renderList(container);
        }
    },

    renderList(container) {
        const tournaments = this.manager.getAllTournaments();
        const active = tournaments.filter(t => t.status !== 'complete');
        const completed = tournaments.filter(t => t.status === 'complete');

        const activeHtml = active.length
            ? active.map(t => `
                <div class="tournament-item" data-id="${t.id}">
                    <div class="tournament-item-info">
                        <span class="tournament-name">${escapeHtml(t.name)}</span>
                        <span class="tournament-status status-${t.status}">${this.statusLabel(t)}</span>
                        <span class="tournament-meta">${t.playerIds.length} players${isGroupFormat(t) ? ` · ${t.numGroups} group${t.numGroups === 1 ? '' : 's'}` : ''}</span>
                    </div>
                    <div class="tournament-item-actions">
                        <button data-action="open" data-id="${t.id}">${t.status === 'active' ? 'Continue' : 'Set up'}</button>
                        <button class="delete-tournament-btn" data-action="delete" data-id="${t.id}" data-name="${escapeHtml(t.name)}">Delete</button>
                    </div>
                </div>`).join('')
            : '<p style="color:#777;text-align:center;padding:15px;">No tournaments in progress.</p>';

        const completedHtml = completed.length
            ? completed.map(t => `
                <div class="tournament-item completed" data-id="${t.id}">
                    <div class="tournament-item-info">
                        <span class="tournament-name">${escapeHtml(t.name)}</span>
                        <span class="tournament-champion">🏆 ${escapeHtml(this.nameOf(t, t.championId) || 'Unknown')}</span>
                        <span class="tournament-meta">${this.formatDate(t.completedAt)}</span>
                    </div>
                    <div class="tournament-item-actions">
                        <button data-action="open" data-id="${t.id}">View bracket</button>
                        <button class="delete-tournament-btn" data-action="delete" data-id="${t.id}" data-name="${escapeHtml(t.name)}">Delete</button>
                    </div>
                </div>`).join('')
            : '<p style="color:#777;text-align:center;padding:15px;">No completed tournaments yet.</p>';

        container.innerHTML = `
            <div class="tournament-list-section">
                <h3>Active</h3>
                ${activeHtml}
            </div>
            <div class="tournament-list-section">
                <h3>Results history</h3>
                ${completedHtml}
            </div>`;

        container.querySelectorAll('button[data-action]').forEach(btn => {
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            if (action === 'open') btn.addEventListener('click', () => this.open(id));
            else if (action === 'delete') btn.addEventListener('click', () => this.handleDelete(id, btn.getAttribute('data-name')));
        });
    },

    renderDetail(container, t) {
        if (t.status === 'setup') this.renderSetup(container, t);
        else this.renderBracketView(container, t);
    },

    renderSetup(container, t) {
        const entrants = t.playerIds;

        const entrantsHtml = entrants.length
            ? entrants.map(id => {
                const name = this.nameOf(t, id) || 'Unknown';
                return `<div class="entrant-item"><span>${escapeHtml(name)}</span><button data-action="remove-entrant" data-id="${id}">Remove</button></div>`;
            }).join('')
            : '<p style="color:#777;padding:10px;">No players entered yet.</p>';

        // Group tournaments pick from the group's player pool; global tournaments
        // add ad-hoc named entrants via a text field.
        let addPanel;
        if (this.mode === 'global') {
            addPanel = `
                <div>
                    <h4>Add entrant</h4>
                    <div class="add-entrant-form">
                        <input type="text" id="${this.feedbackId}-entrant-input" placeholder="Entrant name" maxlength="40">
                        <button data-action="add-named-entrant">+ Add</button>
                    </div>
                </div>`;
        } else {
            const available = PlayerManager.getAllPlayers()
                .filter(p => !entrants.includes(p.id))
                .sort((a, b) => a.name.localeCompare(b.name));
            const availableHtml = available.length
                ? available.map(p => `<button class="add-entrant-btn" data-action="add-entrant" data-id="${p.id}">+ ${escapeHtml(p.name)}</button>`).join('')
                : '<p style="color:#777;padding:10px;">All players entered.</p>';
            addPanel = `
                <div>
                    <h4>Add players</h4>
                    <div class="available-list">${availableHtml}</div>
                </div>`;
        }

        const groupMode = isGroupFormat(t);
        const groupError = groupMode ? validateGroupSetup(entrants.length, t.numGroups) : null;
        const canStart = entrants.length >= 2 && !groupError;

        let formatHint = '';
        if (groupMode) {
            if (groupError) {
                formatHint = `<p class="format-hint error">${escapeHtml(groupError)}</p>`;
            } else {
                const sizes = groupSizes(entrants.length, t.numGroups);
                const qualifiers = sizes.reduce((s, n) => s + qualifiersPerGroup(n), 0);
                formatHint = `<p class="format-hint">Group sizes: ${sizes.join(', ')} · ${qualifiers} player${qualifiers === 1 ? '' : 's'} reach the knockout</p>`;
            }
        }
        const formatPanel = `
            <div class="format-panel">
                <h4>Format</h4>
                <div class="format-toggle" role="radiogroup" aria-label="Tournament format">
                    <label>
                        <input type="radio" name="${this.feedbackId}-format" data-action="set-format" value="knockout" ${groupMode ? '' : 'checked'}>
                        <span>Knockout</span>
                    </label>
                    <label>
                        <input type="radio" name="${this.feedbackId}-format" data-action="set-format" value="groups" ${groupMode ? 'checked' : ''}>
                        <span>Group stage + knockout</span>
                    </label>
                </div>
                ${groupMode ? `
                    <div class="num-groups-row">
                        <label for="${this.feedbackId}-num-groups">Number of groups:</label>
                        <input type="number" id="${this.feedbackId}-num-groups" min="1" step="1" value="${t.numGroups}">
                    </div>
                    <p class="format-hint">Group matches are ${GROUP_MATCH_FRAMES} frames (win 3 pts, draw 1, loss 0). Top 2 per group go through (top 1 from a group of 2), then best-of-${TOURNAMENT_WINS_NEEDED * 2 - 1} knockout.</p>` : ''}
                ${formatHint}
            </div>`;

        let preview = '';
        if (groupMode && t.groups && t.groups.length && isGroupDrawCurrent(t)) {
            preview = `<h4 style="margin-top:20px;">Groups preview</h4><div class="groups-grid">${t.groups.map(g => `
                <div class="group-card">
                    <div class="group-card-title">${escapeHtml(g.name)}</div>
                    ${g.playerIds.map(id => `<div class="group-preview-player">${escapeHtml(this.nameOf(t, id) || 'Unknown')}</div>`).join('')}
                </div>`).join('')}</div>`;
        } else if (!groupMode && t.matches.length) {
            preview = `<h4 style="margin-top:20px;">Bracket preview</h4>${this.renderBracket(t)}`;
        }

        container.innerHTML = `
            <div class="tournament-detail">
                <div class="tournament-detail-header">
                    <button class="back-btn-inline" data-action="back">← Tournaments</button>
                    <h3>${escapeHtml(t.name)} <span class="tournament-status status-setup">Setup</span></h3>
                </div>
                ${formatPanel}
                <div class="setup-grid">
                    <div>
                        <h4>Entrants (${entrants.length})</h4>
                        <div class="entrant-list">${entrantsHtml}</div>
                    </div>
                    ${addPanel}
                </div>
                <div class="setup-actions">
                    <button data-action="randomize" ${canStart ? '' : 'disabled'}>🎲 ${groupMode ? 'Randomize groups' : 'Randomize bracket'}</button>
                    <button data-action="start" ${canStart ? '' : 'disabled'}>Start tournament</button>
                </div>
                ${preview}
                <div id="${this.feedbackId}" class="feedback"></div>
            </div>`;

        this.bindDetailActions(container);
    },

    renderBracketView(container, t) {
        const champName = t.championId ? this.nameOf(t, t.championId) : null;
        const champBanner = t.status === 'complete'
            ? `<div class="champion-banner">🏆 Champion: ${escapeHtml(champName || 'Unknown')}</div>`
            : '';
        container.innerHTML = `
            <div class="tournament-detail">
                <div class="tournament-detail-header">
                    <button class="back-btn-inline" data-action="back">← Tournaments</button>
                    <h3>${escapeHtml(t.name)} <span class="tournament-status status-${t.status}">${this.statusLabel(t)}</span></h3>
                </div>
                ${champBanner}
                ${this.renderTournamentBody(t)}
                <div id="${this.feedbackId}" class="feedback"></div>
            </div>`;
        this.bindDetailActions(container);
    },

    renderTournamentBody(t) {
        if (!isGroupFormat(t)) return this.renderBracket(t);
        const inGroups = t.stage === 'groups';
        const groupsHtml = `<div class="groups-grid">${(t.groups || []).map(g => this.renderGroup(t, g, inGroups)).join('')}</div>`;
        if (inGroups) return `<h4 class="stage-title">Group stage</h4>${groupsHtml}`;
        return `
            <h4 class="stage-title">Knockout</h4>
            ${this.renderBracket(t)}
            <details class="group-results">
                <summary>Group stage results</summary>
                ${groupsHtml}
            </details>`;
    },

    renderGroup(t, g, editable) {
        const name = id => escapeHtml(this.nameOf(t, id) || 'Unknown');
        const { rows } = calculateGroupStandings(g);
        const q = qualifiersPerGroup(g.playerIds.length);
        const decided = isGroupMatchesComplete(g) && !hasPendingPlayoffs(g) && !findBlockingTies(g).length;
        const fmtGd = n => (n > 0 ? `+${n}` : `${n}`);

        const table = `
            <table class="standings-table">
                <thead>
                    <tr><th>#</th><th>Player</th><th title="Played">P</th><th title="Won">W</th><th title="Drawn">D</th><th title="Lost">L</th><th title="Frames won">GF</th><th title="Frames lost">GA</th><th title="Frame difference">GD</th><th title="Points">Pts</th></tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr class="${r.position <= q ? 'qualifying' : ''}">
                            <td>${r.position}</td><td class="standings-name">${name(r.playerId)}</td>
                            <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
                            <td>${r.goalsFor}</td><td>${r.goalsAgainst}</td><td>${fmtGd(r.goalDifference)}</td><td class="standings-pts">${r.points}</td>
                        </tr>`).join('')}
                </tbody>
            </table>`;

        const fixtures = g.matches.map(m => {
            const done = m.status === 'complete';
            const controls = editable && !done ? `
                <div class="fixture-actions">
                    <button data-action="group-frame" data-group="${g.id}" data-id="${m.id}" data-winner="${m.player1Id}">${name(m.player1Id)} won a frame</button>
                    <button data-action="group-frame" data-group="${g.id}" data-id="${m.id}" data-winner="${m.player2Id}">${name(m.player2Id)} won a frame</button>
                </div>` : '';
            const progress = done ? '' : ` <span class="fixture-progress">(${m.frames.length}/${GROUP_MATCH_FRAMES} frames)</span>`;
            return `
                <div class="fixture status-${m.status}">
                    <div class="fixture-line">
                        <span class="fixture-player">${name(m.player1Id)}</span>
                        <span class="fixture-score">${m.frames.length ? `${m.player1Score} – ${m.player2Score}` : 'vs'}</span>
                        <span class="fixture-player right">${name(m.player2Id)}</span>
                    </div>${progress}
                    ${controls}
                </div>`;
        }).join('');

        const playoffs = (g.playoffs || []).length ? `
            <div class="playoffs">
                <div class="playoffs-title">Tie-break playoffs</div>
                ${g.playoffs.map(p => {
                    const done = p.status === 'complete';
                    return `
                        <div class="fixture status-${p.status}">
                            <div class="fixture-line">
                                <span class="fixture-player ${done && p.winnerId === p.player1Id ? 'winner' : ''}">${name(p.player1Id)}</span>
                                <span class="fixture-score">${done ? `Winner: ${name(p.winnerId)}` : `Round ${p.round}`}</span>
                                <span class="fixture-player right ${done && p.winnerId === p.player2Id ? 'winner' : ''}">${name(p.player2Id)}</span>
                            </div>
                            ${editable && !done ? `
                                <div class="fixture-actions">
                                    <button data-action="playoff-win" data-group="${g.id}" data-id="${p.id}" data-winner="${p.player1Id}">${name(p.player1Id)} won</button>
                                    <button data-action="playoff-win" data-group="${g.id}" data-id="${p.id}" data-winner="${p.player2Id}">${name(p.player2Id)} won</button>
                                </div>` : ''}
                        </div>`;
                }).join('')}
            </div>` : '';

        return `
            <div class="group-card">
                <div class="group-card-title">${escapeHtml(g.name)}${decided ? ' <span class="group-decided">✓ decided</span>' : ''}</div>
                ${table}
                <div class="fixtures">${fixtures}</div>
                ${playoffs}
            </div>`;
    },

    renderBracket(t) {
        const rounds = [...new Set(t.matches.map(m => m.round))].sort((a, b) => a - b);
        const roundNames = this.roundLabels(rounds.length);
        const columns = rounds.map((round, ri) => {
            const matches = t.matches.filter(m => m.round === round).sort((a, b) => a.slot - b.slot);
            const matchesHtml = matches.map(m => this.renderMatch(t, m)).join('');
            return `<div class="bracket-round"><div class="bracket-round-title">${roundNames[ri]}</div>${matchesHtml}</div>`;
        }).join('');
        return `<div class="bracket">${columns}</div>`;
    },

    renderMatch(t, m) {
        const nameOf = id => {
            if (!id) return '<span class="bracket-tbd">—</span>';
            return escapeHtml(this.nameOf(t, id) || 'Unknown');
        };
        const p1Win = m.winnerId && m.winnerId === m.player1Id;
        const p2Win = m.winnerId && m.winnerId === m.player2Id;
        const isBye = m.status === 'complete' && (!m.player1Id || !m.player2Id);

        let footer = '';
        const gamesLogHtml = () => {
            if (!m.games || !m.games.length) return '';
            const lines = m.games.map((g, i) => {
                const w = escapeHtml(this.nameOf(t, g.winnerId) || 'Unknown');
                return `<span class="game-line">G${i + 1}: ${w}</span>`;
            }).join('');
            return `<div class="match-games-log">${lines}</div>`;
        };

        if (m.status === 'ready' && t.status === 'active') {
            footer = `
                <div class="match-entry win-entry">
                    <button data-action="game-win" data-id="${m.id}" data-winner="${m.player1Id}">${nameOf(m.player1Id)} won a game</button>
                    <button data-action="game-win" data-id="${m.id}" data-winner="${m.player2Id}">${nameOf(m.player2Id)} won a game</button>
                </div>
                <div class="match-series">Best of ${TOURNAMENT_WINS_NEEDED * 2 - 1} · series ${m.player1Wins}–${m.player2Wins} · first to ${TOURNAMENT_WINS_NEEDED} wins</div>
                ${gamesLogHtml()}`;
        } else if (m.status === 'complete' && !isBye) {
            footer = `<div class="match-series">Final ${m.player1Wins}–${m.player2Wins}</div>${gamesLogHtml()}`;
        } else if (isBye) {
            footer = `<div class="match-series">Bye</div>`;
        }

        return `
            <div class="bracket-match status-${m.status}">
                <div class="bracket-player ${p1Win ? 'winner' : ''}">
                    <span class="bp-name">${nameOf(m.player1Id)}</span>
                    <span class="bp-wins">${m.player1Id ? m.player1Wins : ''}</span>
                </div>
                <div class="bracket-player ${p2Win ? 'winner' : ''}">
                    <span class="bp-name">${nameOf(m.player2Id)}</span>
                    <span class="bp-wins">${m.player2Id ? m.player2Wins : ''}</span>
                </div>
                ${footer}
            </div>`;
    },

    roundLabels(numRounds) {
        // Label rounds from the end: Final, Semifinals, Quarterfinals, then Round N.
        const labels = new Array(numRounds);
        for (let i = 0; i < numRounds; i++) {
            const fromEnd = numRounds - 1 - i;
            if (fromEnd === 0) labels[i] = 'Final';
            else if (fromEnd === 1) labels[i] = 'Semifinals';
            else if (fromEnd === 2) labels[i] = 'Quarterfinals';
            else labels[i] = `Round ${i + 1}`;
        }
        return labels;
    },

    bindDetailActions(container) {
        container.querySelectorAll('button[data-action]').forEach(btn => {
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            switch (action) {
                case 'back': btn.addEventListener('click', () => this.backToList()); break;
                case 'add-entrant': btn.addEventListener('click', () => this.handleAddEntrant(id)); break;
                case 'add-named-entrant': btn.addEventListener('click', () => this.handleAddNamedEntrant()); break;
                case 'remove-entrant': btn.addEventListener('click', () => this.handleRemoveEntrant(id)); break;
                case 'randomize': btn.addEventListener('click', () => this.handleRandomize()); break;
                case 'start': btn.addEventListener('click', () => this.handleStart()); break;
                case 'game-win': btn.addEventListener('click', () => this.handleRecordGameWin(id, btn.getAttribute('data-winner'))); break;
                case 'group-frame': btn.addEventListener('click', () => this.handleRecordGroupFrame(btn.getAttribute('data-group'), id, btn.getAttribute('data-winner'))); break;
                case 'playoff-win': btn.addEventListener('click', () => this.handleRecordPlayoffWin(btn.getAttribute('data-group'), id, btn.getAttribute('data-winner'))); break;
            }
        });
        container.querySelectorAll('input[data-action="set-format"]').forEach(radio => {
            radio.addEventListener('change', () => { if (radio.checked) this.handleSetFormat(radio.value); });
        });
        const numGroupsInput = container.querySelector(`#${this.feedbackId}-num-groups`);
        if (numGroupsInput) numGroupsInput.addEventListener('change', () => this.handleSetNumGroups());
        // Allow pressing Enter in the named-entrant field.
        const entrantInput = container.querySelector(`#${this.feedbackId}-entrant-input`);
        if (entrantInput) {
            entrantInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.handleAddNamedEntrant(); }
            });
        }
    },

    formatDate(timestamp) {
        try {
            const d = new Date(timestamp);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch { return ''; }
    },

    showFeedback(message, type) {
        const el = document.getElementById(this.feedbackId);
        if (!el) return;
        el.textContent = message;
        el.className = `feedback ${type}`;
        if (type === 'success') setTimeout(() => { el.className = 'feedback'; el.textContent = ''; }, 3000);
    }
});

// Group-scoped tournament UI (inside a group's main app view).
const TournamentUI = createTournamentUI({
    manager: TournamentManager,
    mode: 'group',
    containerId: 'tournament-content',
    formId: 'create-tournament-form',
    nameInputId: 'tournament-name-input',
    feedbackId: 'tournament-feedback'
});

// Group-less tournament UI (on the home / group-select view).
const GlobalTournamentUI = createTournamentUI({
    manager: GlobalTournamentManager,
    mode: 'global',
    containerId: 'global-tournament-content',
    formId: 'create-global-tournament-form',
    nameInputId: 'global-tournament-name-input',
    feedbackId: 'global-tournament-feedback'
});

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
            await GlobalTournamentManager.initialize();
            GlobalTournamentUI.initialize();
            this.showGroupSelect();
        } catch (error) {
            console.error('Failed to initialize:', error);
        }
    },

    showGroupSelect() {
        document.getElementById('group-select-view').style.display = '';
        document.getElementById('main-app').style.display = 'none';
        GroupSelectUI.render();
        GlobalTournamentUI.render();
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
        TournamentUI.initialize();
    },

    refreshAllUI() {
        PlayerManagementUI.render();
        GameRecordingUI.render();
        GameHistoryUI.render();
        LeaderboardUI.render();
        TournamentUI.render();
    },

    async clearAllData() {
        if (confirm('Are you sure you want to clear ALL data? This cannot be undone!')) {
            await Storage.clear();
            PlayerManager.players = [];
            GameManager.games = [];
            TournamentManager.tournaments = [];
            GlobalTournamentManager.tournaments = [];
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
    createTournament, createMatch, shuffleArray, nextPowerOfTwo, generateBracket,
    TOURNAMENT_WINS_NEEDED,
    GROUP_MATCH_FRAMES, GROUP_POINTS, isGroupFormat, qualifiersPerGroup, groupSizes, validateGroupSetup,
    groupName, splitIntoGroups, generateRoundRobin, buildGroups, calculateGroupStandings,
    findBlockingTies, isGroupDrawCurrent, seedKnockout,
    Storage,
    GroupManager, PlayerManager, GameManager, TournamentManager, GlobalTournamentManager, StatisticsCalculator,
    PlayerManagementUI, GameRecordingUI, GameHistoryUI, LeaderboardUI,
    GroupSelectUI, TournamentUI, GlobalTournamentUI, PoolScoreTrackerApp
};
