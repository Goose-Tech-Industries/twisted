// =================================================================
// ASSET MANAGER ROUTES — Upload, browse, assign sprites/sounds
// =================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let db;
router.init = (database) => { db = database; };

// Ensure upload directories exist
const UPLOAD_BASE = path.join(__dirname, '..', 'public', 'assets');
const DIRS = ['sprites', 'portraits', 'tilesets', 'icons', 'backgrounds', 'sounds', 'music', 'effects', 'ui'];
for (const dir of DIRS) {
    const fullPath = path.join(UPLOAD_BASE, dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.body.file_type || 'sprites';
        const dir = DIRS.includes(type) ? type : 'sprites';
        cb(null, path.join(UPLOAD_BASE, dir));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const hash = crypto.randomBytes(8).toString('hex');
        cb(null, `${Date.now()}_${hash}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/png', 'image/gif', 'image/webp', 'image/jpeg',
            'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp3'
        ];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`File type ${file.mimetype} not allowed`));
    }
});

// Auth middleware
async function requireStaff(req, res, next) {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Login required' });
    const [rows] = await db.query('SELECT role FROM users WHERE id=?', [userId]);
    if (!rows.length) return res.status(401).json({ success: false });
    if (!['ADMIN','GM','MOD','STAFF','OWNER'].includes(rows[0].role))
        return res.status(403).json({ success: false, message: 'Staff only' });
    req.staffRole = rows[0].role;
    next();
}

// ── UPLOAD ────────────────────────────────────────────────────────
router.post('/upload', requireStaff, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const fileType = req.body.file_type || 'sprite';
        const dir = DIRS.includes(fileType) ? fileType : 'sprites';
        const fileUrl = `/assets/${dir}/${req.file.filename}`;

        const [result] = await db.query(
            `INSERT INTO game_assets (filename, original_name, file_path, file_url, file_type, mime_type, file_size, tags, category, description, uploaded_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [req.file.filename, req.file.originalname, req.file.path, fileUrl,
             fileType, req.file.mimetype, req.file.size,
             JSON.stringify(req.body.tags ? req.body.tags.split(',').map(t => t.trim()) : []),
             req.body.category || 'general',
             req.body.description || null,
             req.session.userId]
        );

        res.json({
            success: true,
            asset: {
                id: result.insertId,
                filename: req.file.filename,
                url: fileUrl,
                type: fileType,
                size: req.file.size
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── LIST ASSETS ──────────────────────────────────────────────────
router.get('/list', requireStaff, async (req, res) => {
    try {
        const type = req.query.type;
        const category = req.query.category;
        let query = 'SELECT * FROM game_assets WHERE 1=1';
        const params = [];
        if (type) { query += ' AND file_type=?'; params.push(type); }
        if (category) { query += ' AND category=?'; params.push(category); }
        query += ' ORDER BY created_at DESC LIMIT 200';
        const [rows] = await db.query(query, params);
        res.json({ success: true, assets: rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── GET SINGLE ASSET ─────────────────────────────────────────────
router.get('/:id', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM game_assets WHERE id=?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false });
        res.json({ success: true, asset: rows[0] });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── DELETE ASSET ─────────────────────────────────────────────────
router.delete('/:id', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM game_assets WHERE id=?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false });
        // Delete file
        try { fs.unlinkSync(rows[0].file_path); } catch {}
        // Clean up asset references in game entities
        const assetId = parseInt(req.params.id);
        const refTables = [
            { table: 'game_npcs', col: 'icon_asset_id' },
            { table: 'game_items', col: 'icon_asset_id' },
            { table: 'game_skills', col: 'icon_asset_id' },
            { table: 'game_classes', col: 'icon_asset_id' },
            { table: 'game_races', col: 'icon_asset_id' },
        ];
        for (const ref of refTables) {
            await db.query(`UPDATE ?? SET ??=NULL WHERE ??=?`, [ref.table, ref.col, ref.col, assetId]).catch(() => {});
        }
        await db.query('DELETE FROM game_assets WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── ASSIGN ASSET TO ENTITY ───────────────────────────────────────
router.post('/assign', requireStaff, async (req, res) => {
    try {
        const { assetId, entityType, entityId, field } = req.body;
        const tableMap = {
            npc: 'game_npcs', item: 'game_items', skill: 'game_skills',
            class: 'game_classes', race: 'game_races', map: 'game_maps',
            battle_cmd: 'game_battle_commands'
        };
        const table = tableMap[entityType];
        if (!table) return res.status(400).json({ success: false, message: 'Invalid entity type' });

        const column = field || `${entityType === 'npc' ? 'sprite' : 'icon'}_asset_id`;
        await db.query(`UPDATE ?? SET ??=? WHERE id=?`, [table, column, assetId, entityId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
