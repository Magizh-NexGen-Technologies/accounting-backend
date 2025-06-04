const express = require('express');
const router = express.Router({ mergeParams: true });

const {postSMTP,getSMTP,putSMTP,testSMTP} = require('../../../controllers/dashboard/EmailSettings/SMTPEmailControllers');

// SMTP routes with organization context
router.post('/', postSMTP);
router.get('/', getSMTP);
router.put('/:id', putSMTP);
router.post('/test', testSMTP);


module.exports = router;    