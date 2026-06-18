// =================================================================
// ADMIN PANEL — Thin wrapper mounting sub-routers
// =================================================================
const router = require('express').Router();

const playerRoutes    = require('./admin-players');
const broadcastRoutes = require('./admin-broadcast');
const entityRoutes    = require('./admin-entities');
const settingsRoutes  = require('./admin-settings');

router.use(playerRoutes);
router.use(broadcastRoutes);
router.use(entityRoutes);
router.use(settingsRoutes);

router.init = function(db, io) {
    playerRoutes.init(db, io);
    broadcastRoutes.init(db, io);
    entityRoutes.init(db, io);
    settingsRoutes.init(db, io);
};

module.exports = router;
