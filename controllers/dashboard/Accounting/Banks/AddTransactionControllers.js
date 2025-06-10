const { connectToOrganizationDB, getOrganizationData } = require('../../../../utils/config/connectOrganization');
const createTransactionTable = require('../../../../utils/models/dashboard/Accounting/Banks/AddTransactionSchema');
const createBankAccountsTable = require('../../../../utils/models/dashboard/Accounting/Banks/AddBanksSchema');

const getTransactions = async (req, res) => {
  const organizationId = req.params.organizationId;
  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) return res.status(404).json({ success: false, message: 'Organization not found' });

    const pool = await connectToOrganizationDB(orgData.organization_db);
    const client = await pool.connect();

    try {
      // Ensure transactions table exists
      await createTransactionTable(client);

      const result = await client.query(`
        SELECT t.*, b.name as bank_name 
        FROM transactions t
        JOIN bank_accounts b ON t.bank_account_id = b.id
        ORDER BY t.date DESC
        LIMIT 50
      `);

      res.json({ success: true, data: result.rows });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

const postTransaction = async (req, res) => {
  const organizationId = req.params.organizationId;
  const { bank_account_id, type, amount, description, date } = req.body;

  // Validation
  if (!bank_account_id || !type || !amount || !date) {
    return res.status(400).json({
      success: false,
      message: 'Bank account, type, amount, and date are required'
    });
  }

  if (type !== 'credit' && type !== 'debit') {
    return res.status(400).json({
      success: false,
      message: 'Transaction type must be either credit or debit'
    });
  }

  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be a positive number'
    });
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid date format' });
  }

  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) return res.status(404).json({ success: false, message: 'Organization not found' });

    const pool = await connectToOrganizationDB(orgData.organization_db);
    const client = await pool.connect();

    try {
      // Ensure transactions table exists
      await createTransactionTable(client);

      // Check if bank account exists
      const bankAccount = await client.query(
        'SELECT * FROM bank_accounts WHERE id = $1',
        [bank_account_id]
      );

      if (bankAccount.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Bank account not found'
        });
      }
      const { name, account_type, account_number } = bankAccount.rows[0];

      // Check sufficient balance for debit transactions
      if (type === 'debit' && parseFloat(bankAccount.rows[0].available_balance) < parseFloat(amount)) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance in the selected account'
        });
      }

      // Start transaction
      await client.query('BEGIN');

      try {
        // Insert transaction with account details
        const transactionResult = await client.query(
          `INSERT INTO transactions 
          (bank_account_id, account_name, account_type, account_number, type, amount, description, date, status) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')
          RETURNING *`,
          [bank_account_id, name, account_type, account_number, type, amount, description, parsedDate]
        );

        // Update bank account balance
        const balanceUpdate = type === 'credit' ? amount : -amount;
        await client.query(
          `UPDATE bank_accounts 
          SET available_balance = available_balance + $1 
          WHERE id = $2`,
          [balanceUpdate, bank_account_id]
        );

        await client.query('COMMIT');

        res.status(201).json({ success: true, data: transactionResult.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error creating transaction:', err);
    res.status(500).json({ success: false, message: 'Failed to create transaction' });
  }
};

module.exports = {
  getTransactions,
  postTransaction
};




