const schema = `
CREATE TABLE IF NOT EXISTS login_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    organization_id VARCHAR(255) NOT NULL,
    token TEXT NOT NULL,
    role VARCHAR(50) NOT NULL,
    login_method VARCHAR(20) NOT NULL DEFAULT 'email', -- 'email', 'phone', or 'google'
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
); 

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_login_sessions_token ON login_sessions(token);
CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_organization_id ON login_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_login_method ON login_sessions(login_method);

-- Create or replace function for updating the last_activity column
CREATE OR REPLACE FUNCTION update_last_activity_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_trigger 
        WHERE tgname = 'update_login_sessions_last_activity'
    ) THEN
        CREATE TRIGGER update_login_sessions_last_activity
        BEFORE UPDATE ON login_sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_last_activity_column();
    END IF;
END;
$$;

-- Add login_method column if it doesn't exist
DO $$
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'login_sessions' 
        AND column_name = 'login_method'
    ) THEN
        ALTER TABLE login_sessions ADD COLUMN login_method VARCHAR(20) NOT NULL DEFAULT 'email';
    END IF;
END;
$$;
`;

module.exports = schema;
