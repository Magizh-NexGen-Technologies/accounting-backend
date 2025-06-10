const organizationAdminSchema = `
CREATE TABLE IF NOT EXISTS organization_admins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    organization_db VARCHAR(255) NOT NULL,
    admin_email VARCHAR(255) NOT NULL,
    admin_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    organization_id VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    country VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE, 
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reset_token VARCHAR(255) DEFAULT NULL,
    reset_token_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Create or replace function for updating the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_trigger 
        WHERE tgname = 'update_organization_admins_updated_at'
    ) THEN
        CREATE TRIGGER update_organization_admins_updated_at
        BEFORE UPDATE ON organization_admins
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

-- Update last_login column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'organization_admins' 
        AND column_name = 'last_login'
    ) THEN
        ALTER TABLE organization_admins 
        ALTER COLUMN last_login TYPE TIMESTAMP WITH TIME ZONE 
        USING last_login AT TIME ZONE 'UTC';
    END IF;
END;
$$;
`;

module.exports = organizationAdminSchema;
