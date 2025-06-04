const schema = `
CREATE TABLE IF NOT EXISTS superadmins (  
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) DEFAULT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone_number VARCHAR(20) DEFAULT NULL,
    password VARCHAR(255) DEFAULT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    tax_id VARCHAR(50) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    city VARCHAR(100) DEFAULT NULL,
    state VARCHAR(100) DEFAULT NULL,
    postal_code VARCHAR(20) DEFAULT NULL,
    country VARCHAR(100) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    reset_token VARCHAR(255) DEFAULT NULL,
    reset_token_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create or replace function for updating the updated_at column
CREATE OR REPLACE FUNCTION update_superadmin_updated_at_column() 
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
        WHERE tgname = 'update_superadmins_updated_at'
    ) THEN
        CREATE TRIGGER update_superadmins_updated_at
        BEFORE UPDATE ON superadmins
        FOR EACH ROW
        EXECUTE FUNCTION update_superadmin_updated_at_column();
    END IF;
END;
$$;

-- Add last_login column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'superadmins' 
        AND column_name = 'last_login'
    ) THEN
        ALTER TABLE superadmins ADD COLUMN last_login TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    END IF;
END;
$$;
`;

module.exports = schema;