const organizationSchema = `
CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    organization_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    organization_db VARCHAR(255) NOT NULL,
    admin_email VARCHAR(255) NOT NULL,
    admin_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    phone_number VARCHAR(20),
    subscription_plan VARCHAR(50) NOT NULL,
    user_limit INTEGER DEFAULT 10,
    status VARCHAR(50) DEFAULT 'active',
    enabled_modules JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

`;

module.exports = organizationSchema;
