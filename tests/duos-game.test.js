/**
 * Unit tests for Duos (2v2) game support
 * Feature: pool-score-tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    PlayerManager,
    GameManager,
    GroupManager,
    StatisticsCalculator,
    Storage,
    createDuosGame,
    isDuosGame,
    getGameParticipants,
    didPlayerWin,
    isGameTie
} from '../app.js';

describe('Duos (2v2) support', () => {
    let ids;

    beforeEach(async () => {
        await Storage.clear();
        GroupManager.groups = [{ id: 'test-group', name: 'Test', createdAt: new Date().toISOString(), playerIds: [] }];
        GroupManager.currentGroupId = 'test-group';
        PlayerManager.players = [];
        GameManager.games = [];

        ids = {};
        for (const name of ['Alice', 'Bob', 'Carol', 'Dave', 'Eve']) {
            const res = await PlayerManager.addPlayer(name);
            ids[name] = res.data.id;
        }
    });

    describe('createDuosGame', () => {
        it('marks the game as duos and sets winning team', () => {
            expect(createDuosGame(['a', 'b'], ['c', 'd'], 10, 5).winningTeam).toBe(1);
            expect(createDuosGame(['a', 'b'], ['c', 'd'], 3, 9).winningTeam).toBe(2);
            expect(createDuosGame(['a', 'b'], ['c', 'd'], 7, 7).winningTeam).toBe(null);
            expect(createDuosGame(['a', 'b'], ['c', 'd'], 7, 7).type).toBe('duos');
        });
    });

    describe('game helpers', () => {
        it('identifies participants, winners and ties', () => {
            const g = createDuosGame(['a', 'b'], ['c', 'd'], 10, 5);
            expect(isDuosGame(g)).toBe(true);
            expect(getGameParticipants(g).sort()).toEqual(['a', 'b', 'c', 'd']);
            expect(didPlayerWin(g, 'a')).toBe(true);
            expect(didPlayerWin(g, 'c')).toBe(false);
            expect(isGameTie(g)).toBe(false);
            expect(isGameTie(createDuosGame(['a', 'b'], ['c', 'd'], 7, 7))).toBe(true);
        });

        it('treats games without a type as legacy singles', () => {
            const legacy = { player1Id: 'a', player2Id: 'b', winnerId: 'a' };
            expect(isDuosGame(legacy)).toBe(false);
            expect(getGameParticipants(legacy)).toEqual(['a', 'b']);
            expect(didPlayerWin(legacy, 'a')).toBe(true);
        });
    });

    describe('recordDuosGame', () => {
        it('records a valid duos game and updates all four players', async () => {
            const res = await GameManager.recordDuosGame([ids.Alice, ids.Bob], [ids.Carol, ids.Dave], 10, 5);
            expect(res.success).toBe(true);
            ['Alice', 'Bob', 'Carol', 'Dave'].forEach(n => {
                expect(PlayerManager.getPlayer(ids[n]).gamesPlayed).toBe(1);
            });
            expect(PlayerManager.getPlayer(ids.Alice).wins).toBe(1);
            expect(PlayerManager.getPlayer(ids.Bob).wins).toBe(1);
            expect(PlayerManager.getPlayer(ids.Carol).wins).toBe(0);
            expect(PlayerManager.getPlayer(ids.Dave).wins).toBe(0);
        });

        it('rejects teams that are not exactly 2 players', async () => {
            const res = await GameManager.recordDuosGame([ids.Alice], [ids.Carol, ids.Dave], 10, 5);
            expect(res.success).toBe(false);
        });

        it('rejects a player appearing more than once', async () => {
            const res = await GameManager.recordDuosGame([ids.Alice, ids.Alice], [ids.Carol, ids.Dave], 10, 5);
            expect(res.success).toBe(false);
            expect(res.error).toBe('A player cannot appear more than once');
        });

        it('rejects negative scores', async () => {
            const res = await GameManager.recordDuosGame([ids.Alice, ids.Bob], [ids.Carol, ids.Dave], -1, 5);
            expect(res.success).toBe(false);
            expect(res.error).toBe('Scores must be non-negative integers');
        });

        it('rejects unknown players', async () => {
            const res = await GameManager.recordDuosGame([ids.Alice, 'nope'], [ids.Carol, ids.Dave], 10, 5);
            expect(res.success).toBe(false);
            expect(res.error).toBe('Player does not exist');
        });
    });

    describe('statistics with duos games', () => {
        it('counts duos wins and losses per player', async () => {
            await GameManager.recordDuosGame([ids.Alice, ids.Bob], [ids.Carol, ids.Dave], 10, 5);
            const alice = StatisticsCalculator.calculatePlayerStats(ids.Alice, GameManager.games);
            expect(alice.gamesPlayed).toBe(1);
            expect(alice.wins).toBe(1);
            const carol = StatisticsCalculator.calculatePlayerStats(ids.Carol, GameManager.games);
            expect(carol.losses).toBe(1);
        });

        it('mixes singles and duos in the same stats', async () => {
            await GameManager.recordGame(ids.Alice, ids.Bob, 10, 5);
            await GameManager.recordDuosGame([ids.Alice, ids.Carol], [ids.Dave, ids.Eve], 5, 10);
            const alice = StatisticsCalculator.calculatePlayerStats(ids.Alice, GameManager.games);
            expect(alice.gamesPlayed).toBe(2);
            expect(alice.wins).toBe(1);
            expect(alice.losses).toBe(1);
        });
    });

    describe('history filtering with duos', () => {
        it('includes a duos game for any of its participants', async () => {
            await GameManager.recordDuosGame([ids.Alice, ids.Bob], [ids.Carol, ids.Dave], 10, 5);
            expect(GameManager.getGameHistory(ids.Dave).length).toBe(1);
            expect(GameManager.getGameHistory(ids.Eve).length).toBe(0);
        });
    });

    describe('deleting duos games', () => {
        it('reverts stats for all four players', async () => {
            const res = await GameManager.recordDuosGame([ids.Alice, ids.Bob], [ids.Carol, ids.Dave], 10, 5);
            const del = await GameManager.deleteGame(res.data.id);
            expect(del.success).toBe(true);
            ['Alice', 'Bob', 'Carol', 'Dave'].forEach(n => {
                expect(PlayerManager.getPlayer(ids[n]).gamesPlayed).toBe(0);
                expect(PlayerManager.getPlayer(ids[n]).wins).toBe(0);
            });
        });
    });
});
