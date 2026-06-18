const router = require('express').Router();
const character = require('./game-character');
const world = require('./game-world');
const social = require('./game-social');

router.init = function(db) {
    character.init(db);
    world.init(db);
    social.init(db);
};

router.use('/', character);
router.use('/', world);
router.use('/', social);

// Re-export utility attached to character sub-router
router.checkReferralQualification = character.checkReferralQualification;

module.exports = router;
