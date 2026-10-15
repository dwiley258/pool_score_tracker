/**
 * Unit tests for the Tournament feature (single-elimination, best-of-3)
 * Feature: pool-score-tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    PlayerManager,
    GameManager,
    GroupManager,
    TournamentManager,
    StatisticsCalculator,
    Storage,
    generateBracket,
    shuffleArray,
    nextPowerOfTwo,
    TOURNAMENT_WINS_NEEDED
} from '../app.js';

async function setupPlayers(n) {
    await Storage.clear();
    GroupManager.groups = [{ id: 'test-group', name: 'Test', createdAt: new Date().toISOString(), playerIds: [] }];
    GroupManager.currentGroupId = 'test-group';
    PlayerManager.players = [];
    GameManager.games = [];
    TournamentManager.tournaments = [];
    const ids = [];
    for (let i = 0; i < n; i++) {
        ids.push((await PlayerManager.addPlayer('P' + i)).data.id);
    }
    return ids;
}

// Win a best-of-3 match for a given player (player1 or player2).
async function winMatch(tId, match, winner) {
    if (winner === 'p1') {
        await TournamentManager.recordMatchGame(tId, match.id, 10, 1);
        await TournamentManager.recordMatchGame(tId, match.id, 10, 2);
    } else {
        await TournamentManager.recordMatchGame(tId, match.id, 1, 10);
        await TournamentManager.recordMatchGame(tId, match.id, 2, 10);
    }
}

describe('Bracket utilities', () => {
    it('nextPowerOfTwo rounds up', () => {
        expect(nextPowerOfTwo(2)).toBe(2);
        expect(nextPowerOfTwo(3)).toBe(4);
        expect(nextPowerOfTwo(5)).toBe(8);
        expect(nextPowerOfTwo(8)).toBe(8);
    });

    it('shuffleArray keeps all elements', () => {
        const arr = ['a', 'b', 'c', 'd', 'e'];
        const s = shuffleArray(arr, () => 0.5);
        expect(s.length).toBe(5);
        expect([...s].sort()).toEqual([...arr].sort());
    });

    it('builds a 4-player bracket with 3 matches over 2 rounds', () => {
        const b = generateBracket(['1', '2', '3', '4']);
        expect(b.length).toBe(3);
        expect(b.filter(m => m.round === 1).length).toBe(2);
        expect(b.filter(m => m.round === 2).length).toBe(1);
        const final = b.find(m => m.round === 2);
        expect(b.filter(m => m.round === 1).every(m => m.nextMatchId === final.id)).toBe(true);
    });

    it('builds an 8-player bracket with 7 matches over 3 rounds', () => {
        const b = generateBracket(['1', '2', '3', '4', '5', '6', '7', '8']);
        expect(b.length).toBe(7);
        expect(b.filter(m => m.round === 1).length).toBe(4);
        expect(b.filter(m => m.round === 2).length).toBe(2);
        expect(b.filter(m => m.round === 3).length).toBe(1);
    });

    it('distributes byes for non-power-of-two counts', () => {
        const b = generateBracket(['1', '2', '3', '4', '5']);
        expect(b.length).toBe(7); // size-8 bracket
        const r1 = b.filter(m => m.round === 1);
        const byes = r1.filter(m => !m.player1Id || !m.player2Id);
        expect(byes.length).toBe(3);
        // no fully-empty matches in round 1
        expect(r1.every(m => m.player1Id || m.player2Id)).toBe(true);
    });
});

describe('TournamentManager', () => {
    let ids;

    beforeEach(async () => {
        ids = await setupPlayers(4);
    });

    it('best-of-3 requires two game wins', () => {
        expect(TOURNAMENT_WINS_NEEDED).toBe(2);
    });

    it('creates a tournament in setup status', async () => {
        const res = await TournamentManager.createTournament('Cup');
        expect(res.success).toBe(true);
        expect(res.data.status).toBe('setup');
        expect(res.data.groupId).toBe('test-group');
    });

    it('rejects empty tournament names', async () => {
        const res = await TournamentManager.createTournament('   ');
        expect(res.success).toBe(false);
    });

    it('adds and removes entrants during setup', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        await TournamentManager.addEntrant(t.id, ids[0]);
        await TournamentManager.addEntrant(t.id, ids[1]);
        expect(t.playerIds.length).toBe(2);
        await TournamentManager.removeEntrant(t.id, ids[0]);
        expect(t.playerIds).toEqual([ids[1]]);
    });

    it('rejects duplicate entrants', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        await TournamentManager.addEntrant(t.id, ids[0]);
        const dup = await TournamentManager.addEntrant(t.id, ids[0]);
        expect(dup.success).toBe(false);
    });

    it('locks entrants once started', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        expect(t.status).toBe('active');
        const res = await TournamentManager.addEntrant(t.id, ids[0]);
        expect(res.success).toBe(false);
    });

    it('will not start with fewer than 2 players', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        await TournamentManager.addEntrant(t.id, ids[0]);
        const res = await TournamentManager.startTournament(t.id);
        expect(res.success).toBe(false);
    });

    it('marks round-1 matches ready after start', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const r1 = t.matches.filter(m => m.round === 1);
        expect(r1.every(m => m.status === 'ready')).toBe(true);
    });

    it('does not decide a match after a single game', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const match = t.matches.filter(m => m.round === 1)[0];
        await TournamentManager.recordMatchGame(t.id, match.id, 10, 5);
        expect(match.status).toBe('ready');
        expect(match.winnerId).toBe(null);
    });

    it('decides a match after two game wins', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const match = t.matches.filter(m => m.round === 1)[0];
        await winMatch(t.id, match, 'p1');
        expect(match.status).toBe('complete');
        expect(match.winnerId).toBe(match.player1Id);
    });

    it('rejects tie games', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const match = t.matches.filter(m => m.round === 1)[0];
        const res = await TournamentManager.recordMatchGame(t.id, match.id, 7, 7);
        expect(res.success).toBe(false);
    });

    it('rejects negative scores', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const match = t.matches.filter(m => m.round === 1)[0];
        const res = await TournamentManager.recordMatchGame(t.id, match.id, -1, 5);
        expect(res.success).toBe(false);
    });

    it('advances winners into the correct next-round slot', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const r1 = t.matches.filter(m => m.round === 1).sort((a, b) => a.slot - b.slot);
        await winMatch(t.id, r1[0], 'p1');
        await winMatch(t.id, r1[1], 'p2');
        const final = t.matches.find(m => m.round === 2);
        expect(final.player1Id).toBe(r1[0].winnerId);
        expect(final.player2Id).toBe(r1[1].winnerId);
        expect(final.status).toBe('ready');
    });

    it('completes the tournament and records the champion', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const r1 = t.matches.filter(m => m.round === 1).sort((a, b) => a.slot - b.slot);
        await winMatch(t.id, r1[0], 'p1');
        await winMatch(t.id, r1[1], 'p1');
        const final = t.matches.find(m => m.round === 2);
        await winMatch(t.id, final, 'p1');
        expect(t.status).toBe('complete');
        expect(t.championId).toBe(final.winnerId);
        expect(t.completedAt).toBeTruthy();
    });

    it('auto-advances byes when fewer than a power of two enter', async () => {
        ids = await setupPlayers(3);
        const t = (await TournamentManager.createTournament('Small')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const r1 = t.matches.filter(m => m.round === 1);
        const completedByes = r1.filter(m => m.status === 'complete');
        expect(completedByes.length).toBeGreaterThanOrEqual(1);
    });

    it('records a full series result in one step (e.g. 2-1) and advances the winner', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const r1 = t.matches.filter(m => m.round === 1).sort((a, b) => a.slot - b.slot);

        const res = await TournamentManager.recordMatchResult(t.id, r1[0].id, 2, 1);
        expect(res.success).toBe(true);
        expect(r1[0].status).toBe('complete');
        expect(r1[0].winnerId).toBe(r1[0].player1Id);
        expect(r1[0].player1Wins).toBe(2);
        expect(r1[0].player2Wins).toBe(1);

        const final = t.matches.find(m => m.round === 2);
        expect(final.player1Id).toBe(r1[0].winnerId);
    });

    it('accepts a 2-0 sweep', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const match = t.matches.filter(m => m.round === 1)[0];
        const res = await TournamentManager.recordMatchResult(t.id, match.id, 0, 2);
        expect(res.success).toBe(true);
        expect(match.winnerId).toBe(match.player2Id);
    });

    it('rejects series results that are tied or not exactly a best-of-3 win', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const match = t.matches.filter(m => m.round === 1)[0];
        expect((await TournamentManager.recordMatchResult(t.id, match.id, 1, 1)).success).toBe(false);
        expect((await TournamentManager.recordMatchResult(t.id, match.id, 2, 2)).success).toBe(false);
        expect((await TournamentManager.recordMatchResult(t.id, match.id, 3, 1)).success).toBe(false);
        expect((await TournamentManager.recordMatchResult(t.id, match.id, -1, 2)).success).toBe(false);
    });

    it('records games incrementally across sessions until the series is won', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const match = t.matches.filter(m => m.round === 1)[0];

        // Game 1 — player1 wins
        await TournamentManager.recordMatchGame(t.id, match.id, 10, 5);
        expect(match.status).toBe('ready');
        expect(match.player1Wins).toBe(1);
        expect(match.games.length).toBe(1);

        // Game 2 (later) — player2 wins, series levelled
        await TournamentManager.recordMatchGame(t.id, match.id, 3, 9);
        expect(match.status).toBe('ready');
        expect(match.player1Wins).toBe(1);
        expect(match.player2Wins).toBe(1);
        expect(match.games.length).toBe(2);

        // Game 3 (later still) — decider
        await TournamentManager.recordMatchGame(t.id, match.id, 10, 7);
        expect(match.status).toBe('complete');
        expect(match.winnerId).toBe(match.player1Id);
        expect(match.games.length).toBe(3);

        // No further games accepted once decided
        const after = await TournamentManager.recordMatchGame(t.id, match.id, 10, 1);
        expect(after.success).toBe(false);
    });

    it('records a game win at a time and advances the winner after two wins', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const match = t.matches.filter(m => m.round === 1)[0];

        // One game win — not enough to decide.
        await TournamentManager.recordGameWin(t.id, match.id, match.player1Id);
        expect(match.status).toBe('ready');
        expect(match.player1Wins).toBe(1);
        expect(match.winnerId).toBe(null);

        // Second win for the same player completes the match.
        await TournamentManager.recordGameWin(t.id, match.id, match.player1Id);
        expect(match.status).toBe('complete');
        expect(match.winnerId).toBe(match.player1Id);
        expect(match.player1Wins).toBe(2);

        // Winner advanced to the next round.
        const final = t.matches.find(m => m.round === 2);
        expect([final.player1Id, final.player2Id]).toContain(match.player1Id);

        // No further wins accepted once decided.
        const after = await TournamentManager.recordGameWin(t.id, match.id, match.player1Id);
        expect(after.success).toBe(false);
    });

    it('rejects a game win for a player not in the match', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const match = t.matches.filter(m => m.round === 1)[0];
        const outsider = ids.find(id => id !== match.player1Id && id !== match.player2Id);
        const res = await TournamentManager.recordGameWin(t.id, match.id, outsider);
        expect(res.success).toBe(false);
    });

    it('deletes a tournament', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        const res = await TournamentManager.deleteTournament(t.id);
        expect(res.success).toBe(true);
        expect(TournamentManager.getTournament(t.id)).toBe(null);
    });

    it('lists tournaments newest first', async () => {
        const a = (await TournamentManager.createTournament('A')).data;
        a.createdAt = new Date('2024-01-01T00:00:00Z').toISOString();
        const b = (await TournamentManager.createTournament('B')).data;
        b.createdAt = new Date('2024-06-01T00:00:00Z').toISOString();
        const all = TournamentManager.getAllTournaments();
        expect(all[0].name).toBe('B');
        expect(all[1].name).toBe('A');
    });
});

describe('Tournament isolation from leaderboard', () => {
    it('does not change player win/game stats', async () => {
        const ids = await setupPlayers(4);
        const t = (await TournamentManager.createTournament('Cup')).data;
        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        const r1 = t.matches.filter(m => m.round === 1).sort((a, b) => a.slot - b.slot);
        await winMatch(t.id, r1[0], 'p1');
        await winMatch(t.id, r1[1], 'p1');
        const final = t.matches.find(m => m.round === 2);
        await winMatch(t.id, final, 'p1');

        // No player should have any recorded games/wins from the tournament.
        PlayerManager.getAllPlayers().forEach(p => {
            expect(p.gamesPlayed).toBe(0);
            expect(p.wins).toBe(0);
        });
        // Leaderboard reflects only regular games (none here).
        const leaderboard = StatisticsCalculator.generateLeaderboard(PlayerManager.getAllPlayers());
        expect(leaderboard.every(e => e.stats.gamesPlayed === 0)).toBe(true);
        // And the game history is untouched by tournaments.
        expect(GameManager.getGameHistory().length).toBe(0);
    });
});
