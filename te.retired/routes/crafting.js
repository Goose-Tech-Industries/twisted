// =================================================================
// CRAFTING ROUTES
// =================================================================
// GET  /crafting/recipes  — list all recipes this character can see
// POST /crafting/craft    — attempt to craft a recipe
// POST /crafting/learn    — teach a recipe to a character (used by
//                           event_runner for "learn recipe" events
//                           or admin tools)
// =================================================================
const express = require('express');
const router  = express.Router();
let db;
module.exports.init = (database) => { db = database; };

function uid(req) { return req.session?.userId; }

// ── GET available recipes ─────────────────────────────────────────
// Returns all ALWAYS recipes + LEARNED recipes this character knows.
// Also returns each recipe's ingredient list with qty_owned so the
// UI can show which ingredients the player has vs. needs.
router.post('/recipes', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId } = req.body;
        if (!charId) return res.json({ success: false, message: 'charId required.' });

        // Verify ownership
        const [own] = await db.query(
            'SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!own.length) return res.json({ success: false, message: 'Unauthorized.' });

        // Get all active recipes the player can see
        const [recipes] = await db.query(`
            SELECT r.*, gi.name AS result_name, gi.icon AS result_icon,
                   gi.type AS result_type
            FROM game_craft_recipes r
            JOIN game_items gi ON gi.id = r.result_item_id
            WHERE r.is_active = 1
              AND (
                r.unlock_mode = 'ALWAYS'
                OR EXISTS (
                    SELECT 1 FROM character_learned_recipes clr
                    WHERE clr.recipe_id = r.id AND clr.character_id = ?
                )
              )
            ORDER BY r.category, r.level_req, r.name`,
            [charId]
        );

        // Build ingredient details: join with game_items + qty player owns
        const [inventory] = await db.query(
            'SELECT item_id, quantity FROM character_items WHERE character_id=?', [charId]);
        const invMap = {};
        for (const row of inventory) invMap[row.item_id] = row.quantity;

        const enriched = recipes.map(r => {
            let ingredients = [];
            try { ingredients = JSON.parse(r.ingredients_json || '[]'); } catch {}
            const enrichedIngredients = ingredients.map(ing => ({
                item_id:   ing.item_id,
                qty_needed: ing.qty,
                qty_owned:  invMap[ing.item_id] || 0
            }));
            const canCraft = enrichedIngredients.every(i => i.qty_owned >= i.qty_needed);
            return { ...r, ingredients: enrichedIngredients, canCraft };
        });

        // Also load item names for ingredient display
        const allItemIds = [...new Set(enriched.flatMap(r => r.ingredients.map(i => i.item_id)))];
        let itemNames = {};
        if (allItemIds.length) {
            const placeholders = allItemIds.map(() => '?').join(',');
            const [items] = await db.query(
                `SELECT id, name, icon FROM game_items WHERE id IN (${placeholders})`,
                allItemIds);
            for (const it of items) itemNames[it.id] = { name: it.name, icon: it.icon };
        }

        res.json({ success: true, recipes: enriched, itemNames });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// ── POST craft ────────────────────────────────────────────────────
// Validates: player owns ingredients, meets level requirement,
// then consumes ingredients and grants result item.
router.post('/craft', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId, recipeId } = req.body;

        // Verify ownership
        const [own] = await db.query(
            'SELECT id, level FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!own.length) return res.json({ success: false, message: 'Unauthorized.' });
        const charLevel = own[0].level;

        // Load recipe
        const [rows] = await db.query(
            'SELECT * FROM game_craft_recipes WHERE id=? AND is_active=1', [recipeId]);
        if (!rows.length) return res.json({ success: false, message: 'Recipe not found.' });
        const recipe = rows[0];

        // Check level requirement
        if (charLevel < recipe.level_req) {
            return res.json({ success: false,
                message: `Requires level ${recipe.level_req}. You are level ${charLevel}.` });
        }

        // Check recipe is accessible (ALWAYS or LEARNED)
        if (recipe.unlock_mode === 'LEARNED') {
            const [learned] = await db.query(
                'SELECT id FROM character_learned_recipes WHERE character_id=? AND recipe_id=?',
                [charId, recipeId]);
            if (!learned.length)
                return res.json({ success: false, message: 'You have not learned this recipe.' });
        }

        // Parse ingredients
        let ingredients = [];
        try { ingredients = JSON.parse(recipe.ingredients_json || '[]'); } catch {}

        // Check and consume ingredients inside a transaction to prevent race conditions
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Lock inventory rows with FOR UPDATE to prevent concurrent craft duplication
            const [inv] = await conn.query(
                'SELECT item_id, quantity FROM character_items WHERE character_id=? FOR UPDATE', [charId]);
            const invMap = {};
            for (const row of inv) invMap[row.item_id] = row.quantity;

            for (const ing of ingredients) {
                const owned = invMap[ing.item_id] || 0;
                if (owned < ing.qty) {
                    await conn.rollback();
                    conn.release();
                    const [itRow] = await db.query('SELECT name FROM game_items WHERE id=?', [ing.item_id]);
                    const itName = itRow.length ? itRow[0].name : `item #${ing.item_id}`;
                    return res.json({ success: false,
                        message: `Not enough ${itName}. Need ${ing.qty}, have ${owned}.` });
                }
            }

            // All checks pass — consume ingredients
            for (const ing of ingredients) {
                const newQty = invMap[ing.item_id] - ing.qty;
                if (newQty <= 0) {
                    await conn.query(
                        'DELETE FROM character_items WHERE character_id=? AND item_id=?',
                        [charId, ing.item_id]);
                } else {
                    await conn.query(
                        'UPDATE character_items SET quantity=? WHERE character_id=? AND item_id=?',
                        [newQty, charId, ing.item_id]);
                }
            }

            // Grant result item
            await conn.query(`
                INSERT INTO character_items (character_id, item_id, quantity)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
                [charId, recipe.result_item_id, recipe.result_qty]);

            await conn.commit();
            conn.release();
        } catch (txErr) {
            await conn.rollback().catch(() => {});
            conn.release();
            throw txErr;
        }

        // Fetch result item info for the success message
        const [resultItem] = await db.query('SELECT name, icon FROM game_items WHERE id=?',
            [recipe.result_item_id]);
        const rName = resultItem.length ? resultItem[0].name : 'item';
        const rIcon = resultItem.length ? resultItem[0].icon : '📦';

        res.json({
            success: true,
            message: `${rIcon} Crafted: ${recipe.result_qty}x ${rName}!`,
            resultItemId: recipe.result_item_id,
            resultQty: recipe.result_qty
        });

    } catch(e) { res.json({ success: false, message: e.message }); }
});

// ── POST learn recipe ─────────────────────────────────────────────
// Used by event scripts, shops, or admin tools to teach a recipe.
router.post('/learn', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId, recipeId } = req.body;

        // Verify ownership
        const [own] = await db.query(
            'SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!own.length) return res.json({ success: false, message: 'Unauthorized.' });

        // Check recipe exists
        const [rRows] = await db.query('SELECT name FROM game_craft_recipes WHERE id=?', [recipeId]);
        if (!rRows.length) return res.json({ success: false, message: 'Recipe not found.' });

        await db.query(`
            INSERT IGNORE INTO character_learned_recipes (character_id, recipe_id)
            VALUES (?, ?)`, [charId, recipeId]);

        res.json({ success: true, message: `Learned recipe: ${rRows[0].name}` });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
module.exports.init = (database) => { db = database; };
