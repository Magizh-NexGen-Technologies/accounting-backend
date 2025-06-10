const schema = `
CREATE TABLE IF NOT EXISTS bank_accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    account_number VARCHAR(50) NOT NULL UNIQUE,
    initial_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    available_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create or replace function for updated_at
CREATE OR REPLACE FUNCTION update_bank_accounts_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_trigger 
        WHERE tgname = 'update_bank_accounts_updated_at'
    ) THEN
        CREATE TRIGGER update_bank_accounts_updated_at
        BEFORE UPDATE ON bank_accounts
        FOR EACH ROW
        EXECUTE FUNCTION update_bank_accounts_updated_at_column();
    END IF;
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bank_accounts_account_number ON bank_accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_name ON bank_accounts(name);
`;

const createBankAccountsTable = async (client) => {
  try {
    await client.query(schema);
    return true;
  } catch (error) {
    console.error('Error creating bank_accounts table:', error);
    throw error;
  }
};

module.exports = createBankAccountsTable;
