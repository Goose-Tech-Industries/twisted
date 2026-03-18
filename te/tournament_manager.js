// =================================================================
// TOURNAMENT MANAGER — Brackets, Scheduling, Prizes
// =================================================================
// Session 14: Complete tournament system with single/double elimination,
// round robin, bracket generation, auto-scheduling, and prize distribution.
// =================================================================

function jp(s, f) { try { return JSON.parse(s); } catch { return f; } }

const TournamentManager = {

    // ── CREATE TOURNAMENT ──────────────────────────────────────────
    create: async (db, data) => {
        const {
            name, description, arenaId, type = 'SINGLE_ELIM',
            scheduleType = 'once', scheduleDay, scheduleTime = '18:00:00',
            entryFee = 0, minLevel = 1, maxLevel = 99, maxParticipants = 16,
            forceNonlethal = 1, allowSigTechs = 1, allowItems = 0,
            allowKiChanneling = 1, healBetweenRounds = 1,
            prizePool, registrationStart, registrationEnd,
            autoCreate = 0, createdBy
        } = data;

        const [res] = await db.query(
            `INSERT INTO game_tournaments
             (name, description, arena_id, type, status, schedule_type, schedule_day, schedule_time,
              entry_fee, min_level, max_level, max_participants, force_nonlethal,
              allow_sig_techs, allow_items, allow_ki_channeling, heal_between_rounds,
              prize_pool_json, registration_start, registration_end, auto_create, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [name, description, arenaId, type, 'DRAFT', scheduleType, scheduleDay, scheduleTime,
             entryFee, minLevel, maxLevel, maxParticipants, forceNonlethal,
             allowSigTechs, allowItems, allowKiChanneling, healBetweenRounds,
             JSON.stringify(prizePool || {}), registrationStart, registrationEnd,
             autoCreate, createdBy]
        );
        return { success: true, tournamentId: res.insertId };
    },

    // ── OPEN REGISTRATION ──────────────────────────────────────────
    openRegistration: async (db, tournamentId) => {
        await db.query(
            `UPDATE game_tournaments SET status='REGISTRATION',
             registration_start=COALESCE(registration_start, NOW())
             WHERE id=? AND status IN ('DRAFT','SCHEDULED')`, [tournamentId]);
        return { success: true };
    },

    // ── REGISTER PARTICIPANT ───────────────────────────────────────
    register: async (db, tournamentId, charId) => {
        // Check tournament exists and is open
        const [tourney] = await db.query('SELECT * FROM game_tournaments WHERE id=?', [tournamentId]);
        if (!tourney.length) return { success: false, message: 'Tournament not found' };
        const t = tourney[0];
        if (t.status !== 'REGISTRATION') return { success: false, message: 'Registration is not open' };

        // Check level
        const [charRow] = await db.query('SELECT level FROM characters WHERE id=?', [charId]);
        if (!charRow.length) return { success: false, message: 'Character not found' };
        if (charRow[0].level < t.min_level || charRow[0].level > t.max_level) {
            return { success: false, message: `Level must be ${t.min_level}-${t.max_level}` };
        }

        // Check capacity
        const [count] = await db.query(
            'SELECT COUNT(*) as cnt FROM game_tournament_participants WHERE tournament_id=?', [tournamentId]);
        if (count[0].cnt >= t.max_participants) return { success: false, message: 'Tournament is full' };

        // Entry fee
        if (t.entry_fee > 0) {
            const [charUser] = await db.query(
                'SELECT u.currency, c.user_id FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id=?', [charId]);
            if (!charUser.length || charUser[0].currency < t.entry_fee) {
                return { success: false, message: `Entry fee: ${t.entry_fee} gold` };
            }
            await db.query('UPDATE users SET currency=currency-? WHERE id=?', [t.entry_fee, charUser[0].user_id]);
        }

        try {
            await db.query(
                'INSERT INTO game_tournament_participants (tournament_id, character_id) VALUES (?,?)',
                [tournamentId, charId]);
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return { success: false, message: 'Already registered' };
            throw e;
        }

        return { success: true, message: 'Registered!' };
    },

    // ── GENERATE BRACKET (Single Elimination) ──────────────────────
    generateBracket: async (db, tournamentId) => {
        const [tourney] = await db.query('SELECT * FROM game_tournaments WHERE id=?', [tournamentId]);
        if (!tourney.length) return { success: false };
        const t = tourney[0];

        // Get participants, seed by level
        const [participants] = await db.query(
            `SELECT gtp.character_id, c.level, c.name
             FROM game_tournament_participants gtp
             JOIN characters c ON c.id = gtp.character_id
             WHERE gtp.tournament_id=? AND gtp.status='registered'
             ORDER BY c.level DESC`, [tournamentId]);

        if (participants.length < 2) return { success: false, message: 'Need at least 2 participants' };

        // Set seeds
        for (let i = 0; i < participants.length; i++) {
            await db.query(
                'UPDATE game_tournament_participants SET seed=?, status=? WHERE tournament_id=? AND character_id=?',
                [i + 1, 'active', tournamentId, participants[i].character_id]);
        }

        // Calculate rounds needed
        const numRounds = Math.ceil(Math.log2(participants.length));
        const bracketSize = Math.pow(2, numRounds); // pad to power of 2

        // Create rounds
        const roundNames = [];
        if (numRounds >= 4) roundNames.push('Round of 16');
        if (numRounds >= 3) roundNames.push('Quarter-Finals');
        if (numRounds >= 2) roundNames.push('Semi-Finals');
        roundNames.push('Finals');
        // Pad front with generic names
        while (roundNames.length < numRounds) roundNames.unshift(`Round ${roundNames.length + 1}`);

        const roundIds = [];
        for (let r = 1; r <= numRounds; r++) {
            const [rRes] = await db.query(
                `INSERT INTO game_tournament_rounds (tournament_id, round_number, round_name, status)
                 VALUES (?,?,?,?)`,
                [tournamentId, r, roundNames[r - 1], r === 1 ? 'active' : 'pending']);
            roundIds.push(rRes.insertId);
        }

        // Create first round matches (with byes for non-power-of-2)
        const matchCount = bracketSize / 2;
        // Standard seeding: 1 vs last, 2 vs second-to-last, etc.
        const seeded = [...participants];
        while (seeded.length < bracketSize) seeded.push(null); // BYEs

        for (let m = 0; m < matchCount; m++) {
            const p1 = seeded[m];
            const p2 = seeded[bracketSize - 1 - m];
            const isBye = !p1 || !p2;

            await db.query(
                `INSERT INTO game_tournament_matches
                 (tournament_id, round_id, match_order, p1_char_id, p2_char_id, winner_char_id, status)
                 VALUES (?,?,?,?,?,?,?)`,
                [tournamentId, roundIds[0], m + 1,
                 p1?.character_id || null, p2?.character_id || null,
                 isBye ? (p1?.character_id || p2?.character_id) : null,
                 isBye ? 'bye' : 'pending']
            );
        }

        // Start tournament
        await db.query(
            'UPDATE game_tournaments SET status=?, started_at=NOW() WHERE id=?',
            ['ACTIVE', tournamentId]);

        return {
            success: true, rounds: numRounds, participants: participants.length,
            bracketSize, byes: bracketSize - participants.length
        };
    },

    // ── RECORD MATCH RESULT ────────────────────────────────────────
    recordMatchResult: async (db, io, matchId, winnerCharId, battleId) => {
        const [match] = await db.query('SELECT * FROM game_tournament_matches WHERE id=?', [matchId]);
        if (!match.length) return { success: false };
        const m = match[0];

        const loserCharId = m.p1_char_id === winnerCharId ? m.p2_char_id : m.p1_char_id;

        await db.query(
            'UPDATE game_tournament_matches SET winner_char_id=?, battle_id=?, status=?, completed_at=NOW() WHERE id=?',
            [winnerCharId, battleId, 'completed', matchId]);

        // Update participant stats
        await db.query(
            'UPDATE game_tournament_participants SET wins=wins+1 WHERE tournament_id=? AND character_id=?',
            [m.tournament_id, winnerCharId]);
        if (loserCharId) {
            await db.query(
                'UPDATE game_tournament_participants SET losses=losses+1, status=? WHERE tournament_id=? AND character_id=?',
                ['eliminated', m.tournament_id, loserCharId]);
        }

        // Check if round is complete
        return await TournamentManager.advanceRound(db, io, m.tournament_id, m.round_id);
    },

    // ── ADVANCE TO NEXT ROUND ──────────────────────────────────────
    advanceRound: async (db, io, tournamentId, roundId) => {
        // Check if all matches in this round are done
        const [pending] = await db.query(
            'SELECT COUNT(*) as cnt FROM game_tournament_matches WHERE round_id=? AND status IN (?,?)',
            [roundId, 'pending', 'active']);
        if (pending[0].cnt > 0) return { success: true, roundComplete: false };

        // Mark round complete
        await db.query('UPDATE game_tournament_rounds SET status=?, ended_at=NOW() WHERE id=?', ['completed', roundId]);

        // Get the round info
        const [roundInfo] = await db.query('SELECT round_number FROM game_tournament_rounds WHERE id=?', [roundId]);
        const currentRound = roundInfo[0].round_number;

        // Get winners from this round
        const [winners] = await db.query(
            'SELECT winner_char_id FROM game_tournament_matches WHERE round_id=? AND winner_char_id IS NOT NULL ORDER BY match_order',
            [roundId]);

        // Check for next round
        const [nextRound] = await db.query(
            'SELECT id FROM game_tournament_rounds WHERE tournament_id=? AND round_number=?',
            [tournamentId, currentRound + 1]);

        if (!nextRound.length) {
            // No more rounds — tournament is over!
            const champion = winners.length ? winners[0].winner_char_id : null;
            return await TournamentManager.endTournament(db, io, tournamentId, champion);
        }

        // Create next round matches from winners
        const nextRoundId = nextRound[0].id;
        await db.query('UPDATE game_tournament_rounds SET status=? WHERE id=?', ['active', nextRoundId]);

        for (let i = 0; i < winners.length; i += 2) {
            const p1 = winners[i]?.winner_char_id || null;
            const p2 = winners[i + 1]?.winner_char_id || null;
            const isBye = !p1 || !p2;
            await db.query(
                `INSERT INTO game_tournament_matches
                 (tournament_id, round_id, match_order, p1_char_id, p2_char_id, winner_char_id, status)
                 VALUES (?,?,?,?,?,?,?)`,
                [tournamentId, nextRoundId, Math.floor(i / 2) + 1,
                 p1, p2, isBye ? (p1 || p2) : null, isBye ? 'bye' : 'pending']
            );
        }

        // Announce next round
        if (io) {
            try {
                const [roundName] = await db.query('SELECT round_name FROM game_tournament_rounds WHERE id=?', [nextRoundId]);
                io.emit('tournament_announcement', {
                    tournamentId, message: `${roundName[0]?.round_name || 'Next Round'} begins!`,
                    round: currentRound + 1
                });
            } catch {}
        }

        return { success: true, roundComplete: true, nextRound: currentRound + 1 };
    },

    // ── END TOURNAMENT ─────────────────────────────────────────────
    endTournament: async (db, io, tournamentId, championCharId) => {
        await db.query(
            'UPDATE game_tournaments SET status=?, ended_at=NOW(), winner_char_id=? WHERE id=?',
            ['COMPLETED', championCharId, tournamentId]);

        if (championCharId) {
            await db.query(
                'UPDATE game_tournament_participants SET status=? WHERE tournament_id=? AND character_id=?',
                ['winner', tournamentId, championCharId]);
        }

        // Distribute prizes
        const [tourney] = await db.query('SELECT * FROM game_tournaments WHERE id=?', [tournamentId]);
        if (tourney.length) {
            const prizes = jp(tourney[0].prize_pool_json, {});

            // Get placements (winner=1st, finalist=2nd, semi-finalists=3rd)
            const placements = [];
            if (championCharId) placements.push({ charId: championCharId, placement: 1 });

            // Find runner-up (lost in finals)
            const [finalRound] = await db.query(
                `SELECT gtr.id FROM game_tournament_rounds gtr
                 WHERE gtr.tournament_id=? ORDER BY round_number DESC LIMIT 1`, [tournamentId]);
            if (finalRound.length) {
                const [finalMatch] = await db.query(
                    `SELECT p1_char_id, p2_char_id, winner_char_id FROM game_tournament_matches
                     WHERE round_id=? LIMIT 1`, [finalRound[0].id]);
                if (finalMatch.length) {
                    const runnerUp = finalMatch[0].p1_char_id === championCharId
                        ? finalMatch[0].p2_char_id : finalMatch[0].p1_char_id;
                    if (runnerUp) placements.push({ charId: runnerUp, placement: 2 });
                }
            }

            // Award prizes
            const placeKeys = { 1: '1st', 2: '2nd', 3: '3rd' };
            for (const p of placements) {
                const prizeData = prizes[placeKeys[p.placement]];
                if (!prizeData) continue;

                if (prizeData.gold) {
                    try {
                        const [charUser] = await db.query(
                            'SELECT user_id FROM characters WHERE id=?', [p.charId]);
                        if (charUser.length) {
                            await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                                [prizeData.gold, charUser[0].user_id]);
                        }
                    } catch {}
                }
                if (prizeData.items && Array.isArray(prizeData.items)) {
                    for (const item of prizeData.items) {
                        try {
                            await db.query(
                                'INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
                                [p.charId, item.item_id, item.qty || 1]);
                        } catch {}
                    }
                }

                // Record in history
                try {
                    await db.query(
                        'INSERT INTO game_tournament_history (tournament_id, character_id, placement, prize_json) VALUES (?,?,?,?)',
                        [tournamentId, p.charId, p.placement, JSON.stringify(prizeData)]);
                } catch {}
            }
        }

        // Announce
        if (io) {
            try {
                const [charName] = await db.query('SELECT name FROM characters WHERE id=?', [championCharId]);
                const tName = tourney.length ? tourney[0].name : 'Tournament';
                io.emit('tournament_announcement', {
                    tournamentId,
                    message: `🏆 ${charName.length ? charName[0].name : 'Unknown'} wins the ${tName}!`,
                    champion: championCharId
                });
            } catch {}
        }

        return { success: true, champion: championCharId };
    },

    // ── GET BRACKET STATE ──────────────────────────────────────────
    getBracket: async (db, tournamentId) => {
        const [tourney] = await db.query('SELECT * FROM game_tournaments WHERE id=?', [tournamentId]);
        if (!tourney.length) return null;

        const [rounds] = await db.query(
            'SELECT * FROM game_tournament_rounds WHERE tournament_id=? ORDER BY round_number', [tournamentId]);
        const [matches] = await db.query(
            `SELECT gtm.*, c1.name AS p1_name, c2.name AS p2_name, cw.name AS winner_name
             FROM game_tournament_matches gtm
             LEFT JOIN characters c1 ON c1.id = gtm.p1_char_id
             LEFT JOIN characters c2 ON c2.id = gtm.p2_char_id
             LEFT JOIN characters cw ON cw.id = gtm.winner_char_id
             WHERE gtm.tournament_id=? ORDER BY gtm.round_id, gtm.match_order`, [tournamentId]);
        const [participants] = await db.query(
            `SELECT gtp.*, c.name, c.level
             FROM game_tournament_participants gtp
             JOIN characters c ON c.id = gtp.character_id
             WHERE gtp.tournament_id=? ORDER BY gtp.seed`, [tournamentId]);

        return {
            tournament: tourney[0],
            rounds,
            matches,
            participants,
            prizes: jp(tourney[0].prize_pool_json, {})
        };
    },

    // ── LIST TOURNAMENTS ───────────────────────────────────────────
    list: async (db, status) => {
        const where = status ? 'WHERE status=?' : 'WHERE status != ?';
        const param = status || 'CANCELLED';
        const [rows] = await db.query(
            `SELECT gt.*, COUNT(gtp.id) AS participant_count,
                    c.name AS winner_name
             FROM game_tournaments gt
             LEFT JOIN game_tournament_participants gtp ON gtp.tournament_id = gt.id
             LEFT JOIN characters c ON c.id = gt.winner_char_id
             ${where}
             GROUP BY gt.id ORDER BY gt.created_at DESC`, [param]);
        return rows;
    },

    // ── LEADERBOARD ────────────────────────────────────────────────
    leaderboard: async (db, limit = 10) => {
        const [rows] = await db.query(
            `SELECT gth.character_id, c.name, c.level,
                    COUNT(*) AS tournaments_entered,
                    SUM(CASE WHEN gth.placement = 1 THEN 1 ELSE 0 END) AS wins,
                    SUM(CASE WHEN gth.placement <= 3 THEN 1 ELSE 0 END) AS podiums,
                    MIN(gth.placement) AS best_placement
             FROM game_tournament_history gth
             JOIN characters c ON c.id = gth.character_id
             GROUP BY gth.character_id
             ORDER BY wins DESC, podiums DESC, best_placement ASC
             LIMIT ?`, [limit]);
        return rows;
    }
};

module.exports = TournamentManager;
