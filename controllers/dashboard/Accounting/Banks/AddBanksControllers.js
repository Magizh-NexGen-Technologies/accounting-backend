const { connectToOrganizationDB, getOrganizationData } = require('../../../../utils/config/connectOrganization');
const createBankAccountsTable = require('../../../../utils/models/dashboard/Accounting/Banks/AddBanksSchema');

const getBankAccounts = async (req, res) => {
  const organizationId = req.params.organizationId;
  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) return res.status(404).json({ success: false, message: 'Organization not found' });
    
    const pool = await connectToOrganizationDB(orgData.organization_db);
    const client = await pool.connect();
    
    try {
      // Ensure bank_accounts table exists
      await createBankAccountsTable(client);
      
      const result = await client.query(`
        SELECT * FROM bank_accounts 
        ORDER BY name ASC
      `);
      res.json({ success: true, data: result.rows });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error fetching bank accounts:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch bank accounts' });
  }
};

const postBankAccounts = async (req, res) => {
  const organizationId = req.params.organizationId;
  const { name, accountType, accountNumber, initialBalance } = req.body;

  // Validation
  if (!name || !accountType || !accountNumber) {
    return res.status(400).json({ 
      success: false, 
      message: 'Name, account type, and account number are required' 
    });
  }

  if (isNaN(initialBalance) || initialBalance < 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Initial balance must be a non-negative number' 
    });
  }

  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) return res.status(404).json({ success: false, message: 'Organization not found' });
    
    const pool = await connectToOrganizationDB(orgData.organization_db);
    const client = await pool.connect();
    
    try {
      // Ensure bank_accounts table exists
      await createBankAccountsTable(client);

      // Check if account number already exists
      const existingAccount = await client.query(
        'SELECT id FROM bank_accounts WHERE account_number = $1',
        [accountNumber]
      );

      if (existingAccount.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Account number already exists'
        });
      }

      // Start transaction
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO bank_accounts 
        (name, account_type, account_number, initial_balance, available_balance) 
        VALUES ($1, $2, $3, $4, $4) 
        RETURNING *`,
        [name, accountType, accountNumber, initialBalance]
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error creating bank account:', err);
    res.status(500).json({ success: false, message: 'Failed to create bank account' });
  }
};

const putBankAccounts = async (req, res) => {
  const { id, organizationId } = req.params;
  const { name, accountType, accountNumber, initialBalance, availableBalance } = req.body;

  // Validation
  if (!name || !accountType || !accountNumber) {
    return res.status(400).json({ 
      success: false, 
      message: 'Name, account type, and account number are required' 
    });
  }

  if (isNaN(initialBalance) || initialBalance < 0 || isNaN(availableBalance) || availableBalance < 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Balances must be non-negative numbers' 
    });
  }

  try {
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) return res.status(404).json({ success: false, message: 'Organization not found' });
    
    const pool = await connectToOrganizationDB(orgData.organization_db);
    const client = await pool.connect();
    
    try {
      // Ensure bank_accounts table exists
      await createBankAccountsTable(client);

      // Check if account exists
      const existingAccount = await client.query(
        'SELECT id FROM bank_accounts WHERE id = $1',
        [id]
      );

      if (existingAccount.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Bank account not found'
        });
      }

      // Check if new account number conflicts with other accounts
      const duplicateAccount = await client.query(
        'SELECT id FROM bank_accounts WHERE account_number = $1 AND id != $2',
        [accountNumber, id]
      );

      if (duplicateAccount.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Account number already exists'
        });
      }

      // Start transaction
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE bank_accounts 
        SET name = $1, 
            account_type = $2, 
            account_number = $3, 
            initial_balance = $4, 
            available_balance = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6 
        RETURNING *`,
        [name, accountType, accountNumber, initialBalance, availableBalance, id]
      );

      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error updating bank account:', err);
    res.status(500).json({ success: false, message: 'Failed to update bank account' });
  }
};

module.exports = { getBankAccounts, postBankAccounts, putBankAccounts };




