const express = require('express');
const router = express.Router({ mergeParams: true });

const {postBankAccounts,getBankAccounts,putBankAccounts} = require('../../../controllers/dashboard/Accounting/Banks/AddBanksControllers');

// SMTP routes with organization context
router.post('/', postBankAccounts);
router.get('/', getBankAccounts);
router.put('/:id', putBankAccounts);


module.exports = router;    