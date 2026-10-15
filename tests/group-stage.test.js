/**
 * Unit tests for the group stage + knockout tournament format.
 * Feature: pool-score-tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    PlayerManager,
    GameManager,
    GroupManager,
    TournamentManager,
    GlobalTournamentManager,
    Storage,
    GROUP_MATCH_FRAMES,
    qualifiersPerGroup,
    groupSizes,
    validateGroupSetup,
    groupName,
    splitIntoGroups,
    generateRoundRobin,
    calculateGroupStandings,
    findBlockingTies,
    seedKnockout
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

async function createGroupTournament(ids, numGroups) {
    const t = (await TournamentManager.createTournament('Cup')).data;
    for (const id of ids) await TournamentManager.addEntrant(t.id, id);
    await TournamentManager.setFormat(t.id, 'groups', numGroups);
    return t;
}

// Play a two-frame group match: 'p1' wins 2-0, 'p2' wins 0-2, 'draw' is 1-1.
async function playGroupMatch(t, group, match, result) {
    const frames = result === 'p1' ? [match.player1Id, match.player1Id]
        : result === 'p2' ? [match.player2Id, match.player2Id]
        : [match.player1Id, match.player2Id];
    for (const w of frames) await TournamentManager.recordGroupFrame(t.id, group.id, match.id, w);
}

// Build a standalone group from [player1, player2, score1, score2] results.
function makeGroup(playerIds, results, playoffs = []) {
    return {
        id: 'g', name: 'Group A', playerIds,
        matches: results.map(([a, b, s1, s2], i) => ({
            id: 'm' + i, player1Id: a, player2Id: b,
            frames: [], player1Score: s1, player2Score: s2, status: 'complete'
        })),
        playoffs
    };
}

const order = group => calculateGroupStandings(group).rows.map(r => r.playerId);

describe('Group stage utilities', () => {
    it('qualifies top 2 from groups of 3+, top 1 from a group of 2', () => {
        expect(qualifiersPerGroup(2)).toBe(1);
        expect(qualifiersPerGroup(3)).toBe(2);
        expect(qualifiersPerGroup(6)).toBe(2);
    });

    it('splits players as evenly as possible', () => {
        expect(groupSizes(7, 3)).toEqual([3, 2, 2]);
        expect(groupSizes(8, 2)).toEqual([4, 4]);
        expect(splitIntoGroups(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'c', 'e'], ['b', 'd']]);
    });

    it('validates group setups', () => {
        expect(validateGroupSetup(4, 2)).toBeNull();
        expect(validateGroupSetup(3, 1)).toBeNull();
        expect(validateGroupSetup(3, 2)).toMatch(/at least 4 players/);
        expect(validateGroupSetup(2, 1)).toMatch(/At least 2 players must reach/);
        expect(validateGroupSetup(6, 0)).toMatch(/at least 1/);
        expect(validateGroupSetup(6, 1.5)).toMatch(/whole number/);
    });

    it('names groups A..Z then AA', () => {
        expect(groupName(0)).toBe('Group A');
        expect(groupName(25)).toBe('Group Z');
        expect(groupName(26)).toBe('Group AA');
    });

    it('generates a full round robin with no repeats', () => {
        const pairs = generateRoundRobin(['a', 'b', 'c', 'd']);
        expect(pairs.length).toBe(6);
        expect(new Set(pairs.map(p => [...p].sort().join())).size).toBe(6);
    });
});

describe('Group standings and tie-breakers', () => {
    it('awards 3 for a win, 1 for a draw, 0 for a loss', () => {
        const g = makeGroup(['A', 'B', 'C'], [['A', 'B', 2, 0], ['A', 'C', 1, 1], ['B', 'C', 2, 0]]);
        const { rows } = calculateGroupStandings(g);
        const byId = Object.fromEntries(rows.map(r => [r.playerId, r]));
        expect(byId.A).toMatchObject({ points: 4, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2 });
        expect(byId.B).toMatchObject({ points: 3, won: 1, lost: 1 });
        expect(byId.C).toMatchObject({ points: 1, drawn: 1, lost: 1 });
        expect(order(g)).toEqual(['A', 'B', 'C']);
    });

    it('uses head-to-head before goal difference', () => {
        // A and B both on 6; B has the better goal difference but A won the meeting.
        const g = makeGroup(['A', 'B', 'C', 'D'], [
            ['A', 'B', 2, 0], ['A', 'C', 2, 0], ['A', 'D', 0, 2],
            ['B', 'C', 5, 0], ['B', 'D', 2, 0], ['C', 'D', 1, 1]
        ]);
        const { rows } = calculateGroupStandings(g);
        expect(rows.find(r => r.playerId === 'B').goalDifference)
            .toBeGreaterThan(rows.find(r => r.playerId === 'A').goalDifference);
        expect(order(g)).toEqual(['A', 'B', 'D', 'C']);
    });

    it('uses a head-to-head mini-league for a three-way tie on points', () => {
        // A, B, C all on 7. Among themselves: A 4, B 3, C 1.
        const g = makeGroup(['A', 'B', 'C', 'D', 'E'], [
            ['A', 'B', 2, 0], ['B', 'C', 2, 0], ['A', 'C', 1, 1],
            ['A', 'D', 2, 0], ['A', 'E', 0, 2],
            ['B', 'D', 2, 0], ['B', 'E', 1, 1],
            ['C', 'D', 2, 0], ['C', 'E', 2, 0],
            ['D', 'E', 2, 0]
        ]);
        const { rows } = calculateGroupStandings(g);
        expect(rows.slice(0, 3).every(r => r.points === 7)).toBe(true);
        expect(order(g)).toEqual(['A', 'B', 'C', 'E', 'D']);
    });

    it('falls back to goal difference, then goals scored', () => {
        // Cyclic results: all on 3 points and 3 head-to-head points.
        const byGd = makeGroup(['A', 'B', 'C'], [['A', 'B', 5, 0], ['B', 'C', 2, 1], ['C', 'A', 2, 1]]);
        expect(order(byGd)).toEqual(['A', 'C', 'B']);

        const byGf = makeGroup(['A', 'B', 'C'], [['A', 'B', 4, 2], ['B', 'C', 2, 0], ['C', 'A', 3, 1]]);
        expect(calculateGroupStandings(byGf).rows.every(r => r.goalDifference === 0)).toBe(true);
        expect(order(byGf)).toEqual(['A', 'B', 'C']);
    });

    it('reports a full tie and whether it blocks qualification', () => {
        const allDraws = makeGroup(['A', 'B', 'C'], [['A', 'B', 1, 1], ['A', 'C', 1, 1], ['B', 'C', 1, 1]]);
        expect(calculateGroupStandings(allDraws).ties.map(t => [...t].sort())).toEqual([['A', 'B', 'C']]);
        expect(findBlockingTies(allDraws).length).toBe(1);

        // C and D are level on everything but both finish below the top 2.
        const lowerTie = makeGroup(['A', 'B', 'C', 'D'], [
            ['A', 'B', 2, 0], ['A', 'C', 2, 0], ['A', 'D', 2, 0],
            ['B', 'C', 2, 0], ['B', 'D', 2, 0], ['C', 'D', 1, 1]
        ]);
        expect(calculateGroupStandings(lowerTie).ties.length).toBe(1);
        expect(findBlockingTies(lowerTie)).toEqual([]);
    });

    it('breaks a remaining tie with playoff rounds in order', () => {
        const results = [['A', 'B', 1, 1], ['A', 'C', 1, 1], ['B', 'C', 1, 1]];
        const cyclic = [
            { round: 1, player1Id: 'A', player2Id: 'B', winnerId: 'A', status: 'complete' },
            { round: 1, player1Id: 'B', player2Id: 'C', winnerId: 'B', status: 'complete' },
            { round: 1, player1Id: 'A', player2Id: 'C', winnerId: 'C', status: 'complete' }
        ];
        expect(findBlockingTies(makeGroup(['A', 'B', 'C'], results, cyclic)).length).toBe(1);

        const decisive = [
            { round: 2, player1Id: 'A', player2Id: 'B', winnerId: 'B', status: 'complete' },
            { round: 2, player1Id: 'B', player2Id: 'C', winnerId: 'B', status: 'complete' },
            { round: 2, player1Id: 'A', player2Id: 'C', winnerId: 'C', status: 'complete' }
        ];
        const g = makeGroup(['A', 'B', 'C'], results, [...cyclic, ...decisive]);
        expect(findBlockingTies(g)).toEqual([]);
        expect(order(g)).toEqual(['B', 'C', 'A']);
    });
});

describe('Knockout seeding', () => {
    // Two 4-player groups where the first-listed player wins every match.
    const ranked = ids => makeGroup(ids, generateRoundRobin(ids).map(([a, b]) => [a, b, 2, 0]));

    it('pairs group winners with runners-up from the other group', () => {
        const seeds = seedKnockout([ranked(['A1', 'A2', 'A3', 'A4']), ranked(['B1', 'B2', 'B3', 'B4'])]);
        expect(seeds).toEqual(['A1', 'B2', 'B1', 'A2']);
    });

    it('gives byes to group winners when the field is not a power of two', () => {
        const seeds = seedKnockout([ranked(['A1', 'A2', 'A3']), ranked(['B1', 'B2', 'B3']), ranked(['C1', 'C2', 'C3'])]);
        expect(seeds.slice(0, 2)).toEqual(['A1', 'B1']); // 6 qualifiers -> 2 byes
        expect(seeds).toHaveLength(6);
        for (let i = 2; i < seeds.length; i += 2) expect(seeds[i][0]).not.toBe(seeds[i + 1][0]);
    });

    it('takes only the winner from a group of 2', () => {
        const seeds = seedKnockout([ranked(['A1', 'A2', 'A3']), ranked(['B1', 'B2'])]);
        expect([...seeds].sort()).toEqual(['A1', 'A2', 'B1']);
    });
});

describe('TournamentManager - group format', () => {
    let ids;

    beforeEach(async () => {
        ids = await setupPlayers(8);
    });

    it('defaults to knockout and keeps the old flow for tournaments with no format', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        expect(t.format).toBe('knockout');
        delete t.format; // simulate a tournament saved before this feature
        for (const id of ids.slice(0, 4)) await TournamentManager.addEntrant(t.id, id);
        const res = await TournamentManager.startTournament(t.id);
        expect(res.success).toBe(true);
        expect(t.stage).toBeNull();
        expect(t.matches.length).toBe(3);
    });

    it('validates and stores the format during setup only', async () => {
        const t = (await TournamentManager.createTournament('Cup')).data;
        expect((await TournamentManager.setFormat(t.id, 'league')).success).toBe(false);
        expect((await TournamentManager.setFormat(t.id, 'groups', 0)).success).toBe(false);
        expect((await TournamentManager.setFormat(t.id, 'groups', 3)).success).toBe(true);
        expect(t.format).toBe('groups');
        expect(t.numGroups).toBe(3);

        for (const id of ids) await TournamentManager.addEntrant(t.id, id);
        await TournamentManager.startTournament(t.id);
        expect((await TournamentManager.setFormat(t.id, 'knockout')).success).toBe(false);
    });

    it('refuses to start when groups would be too small', async () => {
        const t = await createGroupTournament(ids.slice(0, 3), 2);
        const res = await TournamentManager.startTournament(t.id);
        expect(res.success).toBe(false);
        expect(t.status).toBe('setup');
    });

    it('builds groups and round-robin fixtures on start, keeping a previewed draw', async () => {
        const t = await createGroupTournament(ids.slice(0, 7), 2);
        await TournamentManager.randomizeBracket(t.id);
        const preview = t.groups.map(g => [...g.playerIds]);
        expect(preview.map(g => g.length).sort()).toEqual([3, 4]);

        await TournamentManager.startTournament(t.id);
        expect(t.status).toBe('active');
        expect(t.stage).toBe('groups');
        expect(t.groups.map(g => g.playerIds)).toEqual(preview);
        expect(t.groups.map(g => g.matches.length).sort()).toEqual([3, 6]);
        expect(t.matches).toEqual([]);
    });

    it('redraws groups if entrants changed after the preview', async () => {
        const t = await createGroupTournament(ids.slice(0, 6), 2);
        await TournamentManager.randomizeBracket(t.id);
        await TournamentManager.addEntrant(t.id, ids[6]);
        await TournamentManager.startTournament(t.id);
        expect(t.groups.flatMap(g => g.playerIds).sort()).toEqual(ids.slice(0, 7).sort());
    });

    it('records group frames: two frames per match, winner must be in the match', async () => {
        const t = await createGroupTournament(ids.slice(0, 4), 1);
        await TournamentManager.startTournament(t.id);
        const g = t.groups[0];
        const m = g.matches[0];
        const outsider = g.playerIds.find(id => id !== m.player1Id && id !== m.player2Id);

        expect((await TournamentManager.recordGroupFrame(t.id, g.id, m.id, outsider)).success).toBe(false);
        await TournamentManager.recordGroupFrame(t.id, g.id, m.id, m.player1Id);
        expect(m.status).toBe('pending');
        await TournamentManager.recordGroupFrame(t.id, g.id, m.id, m.player2Id);
        expect(m.status).toBe('complete');
        expect(m.frames.length).toBe(GROUP_MATCH_FRAMES);
        expect([m.player1Score, m.player2Score]).toEqual([1, 1]);
        expect((await TournamentManager.recordGroupFrame(t.id, g.id, m.id, m.player1Id)).success).toBe(false);
    });

    it('rejects knockout results during the group stage', async () => {
        const t = await createGroupTournament(ids.slice(0, 4), 2);
        await TournamentManager.startTournament(t.id);
        const res = await TournamentManager.recordGameWin(t.id, 'any', ids[0]);
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/Knockout stage has not started/);
    });

    it('runs groups into a crossover knockout and on to a champion', async () => {
        const t = await createGroupTournament(ids, 2);
        await TournamentManager.startTournament(t.id);

        // Player 1 of each fixture wins, so the round-robin order is the final ranking.
        for (const g of t.groups) {
            for (const m of g.matches) await playGroupMatch(t, g, m, 'p1');
        }
        expect(t.stage).toBe('knockout');
        expect(t.status).toBe('active');

        const [gA, gB] = t.groups;
        const r1 = t.matches.filter(m => m.round === 1).sort((a, b) => a.slot - b.slot);
        expect(r1.map(m => [m.player1Id, m.player2Id])).toEqual([
            [gA.playerIds[0], gB.playerIds[1]],
            [gB.playerIds[0], gA.playerIds[1]]
        ]);
        expect(r1.every(m => m.status === 'ready')).toBe(true);

        // Knockout is best of 3.
        const winSeries = async m => {
            await TournamentManager.recordGameWin(t.id, m.id, m.player1Id);
            await TournamentManager.recordGameWin(t.id, m.id, m.player1Id);
        };
        for (const m of r1) await winSeries(m);
        const final = t.matches.find(m => m.round === 2);
        expect(final.status).toBe('ready');
        await winSeries(final);

        expect(t.status).toBe('complete');
        expect(t.championId).toBe(gA.playerIds[0]);
    });

    it('adds playoff rounds until a three-way tie is broken', async () => {
        const t = await createGroupTournament(ids.slice(0, 3), 1);
        await TournamentManager.startTournament(t.id);
        const g = t.groups[0];
        for (const m of g.matches) await playGroupMatch(t, g, m, 'draw');

        expect(t.stage).toBe('groups');
        expect(g.playoffs.length).toBe(3);
        expect(g.playoffs.every(p => p.round === 1)).toBe(true);

        // Cyclic playoff results leave everyone level, so a second round is added.
        const [x, y, z] = g.playerIds;
        const winnerOf = (p, beats) => beats.find(([w, l]) =>
            (p.player1Id === w && p.player2Id === l) || (p.player1Id === l && p.player2Id === w))[0];
        const cycle = [[x, y], [y, z], [z, x]];
        for (const p of [...g.playoffs]) {
            await TournamentManager.recordPlayoffWin(t.id, g.id, p.id, winnerOf(p, cycle));
        }
        expect(t.stage).toBe('groups');
        expect(g.playoffs.filter(p => p.round === 2).length).toBe(3);

        // Second round is decisive: z > y > x.
        const decisive = [[z, y], [z, x], [y, x]];
        for (const p of g.playoffs.filter(p => p.round === 2)) {
            await TournamentManager.recordPlayoffWin(t.id, g.id, p.id, winnerOf(p, decisive));
        }
        expect(t.stage).toBe('knockout');
        expect(t.matches.length).toBe(1);
        expect([t.matches[0].player1Id, t.matches[0].player2Id].sort()).toEqual([y, z].sort());
        expect(t.matches[0].status).toBe('ready');
    });

    it('gives the top group winners byes when 6 players qualify', async () => {
        ids = await setupPlayers(9);
        const t = await createGroupTournament(ids, 3);
        await TournamentManager.startTournament(t.id);
        for (const g of t.groups) {
            for (const m of g.matches) await playGroupMatch(t, g, m, 'p1');
        }
        expect(t.stage).toBe('knockout');
        const winners = t.groups.map(g => g.playerIds[0]);
        const r1 = t.matches.filter(m => m.round === 1);
        const byes = r1.filter(m => !m.player1Id || !m.player2Id);
        expect(byes.length).toBe(2);
        expect(byes.every(m => winners.includes(m.player1Id))).toBe(true);
        // Bye winners have already advanced into round 2.
        const r2Players = t.matches.filter(m => m.round === 2).flatMap(m => [m.player1Id, m.player2Id]);
        byes.forEach(m => expect(r2Players).toContain(m.player1Id));
    });

    it('does not touch the group leaderboard or player stats', async () => {
        const t = await createGroupTournament(ids.slice(0, 4), 1);
        await TournamentManager.startTournament(t.id);
        const g = t.groups[0];
        await playGroupMatch(t, g, g.matches[0], 'p1');
        expect(GameManager.games.length).toBe(0);
        expect(PlayerManager.players.every(p => p.gamesPlayed === 0 && p.wins === 0)).toBe(true);
    });
});

describe('GlobalTournamentManager - group format', () => {
    beforeEach(async () => {
        await Storage.clear();
        GlobalTournamentManager.tournaments = [];
    });

    it('supports a group stage with ad-hoc named entrants', async () => {
        const t = (await GlobalTournamentManager.createTournament('Open')).data;
        for (const n of ['Ann', 'Bob', 'Cat', 'Dan']) await GlobalTournamentManager.addNamedEntrant(t.id, n);
        await GlobalTournamentManager.setFormat(t.id, 'groups', 2);
        const res = await GlobalTournamentManager.startTournament(t.id);
        expect(res.success).toBe(true);

        for (const g of t.groups) {
            const m = g.matches[0];
            await GlobalTournamentManager.recordGroupFrame(t.id, g.id, m.id, m.player1Id);
            await GlobalTournamentManager.recordGroupFrame(t.id, g.id, m.id, m.player1Id);
        }
        // Each group of 2 sends only its winner -> a single final.
        expect(t.stage).toBe('knockout');
        expect(t.matches.length).toBe(1);
        expect(GlobalTournamentManager.entrantName(t, t.matches[0].player1Id)).not.toBe('Unknown');
    });
});
