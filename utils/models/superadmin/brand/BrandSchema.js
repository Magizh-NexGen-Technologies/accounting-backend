const brandSettingsSchema = `
CREATE TABLE IF NOT EXISTS brand_settings (
    id SERIAL PRIMARY KEY,
    logo_url TEXT CHECK (length(logo_url) <= 500),
    favicon_url TEXT CHECK (length(favicon_url) <= 500),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_brand_settings_updated_at ON brand_settings;
CREATE TRIGGER update_brand_settings_updated_at
    BEFORE UPDATE ON brand_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one active record
CREATE OR REPLACE FUNCTION check_brand_settings_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM brand_settings) > 1 THEN
        DELETE FROM brand_settings
        WHERE id NOT IN (
            SELECT id
            FROM brand_settings
            ORDER BY updated_at DESC
            LIMIT 1
        );
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Trigger to maintain single active record
DROP TRIGGER IF EXISTS brand_settings_limit ON brand_settings;
CREATE TRIGGER brand_settings_limit
    AFTER INSERT ON brand_settings
    FOR EACH STATEMENT
    EXECUTE FUNCTION check_brand_settings_limit();
`;

module.exports = brandSettingsSchema;