const pool = require('../../config/connectDB');

const createTables = async () => {
    const client = await pool.connect();
    try {
        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE,
                password VARCHAR(255),
                name VARCHAR(255),
                role VARCHAR(50) DEFAULT 'user',
                organization_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create organizations table
        await client.query(`
            CREATE TABLE IF NOT EXISTS organizations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                email VARCHAR(255) UNIQUE,
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create otps table
        await client.query(`
            CREATE TABLE IF NOT EXISTS otps (
                id SERIAL PRIMARY KEY,
                identifier VARCHAR(255) NOT NULL,
                otp VARCHAR(6) NOT NULL,
                expiry_time TIMESTAMP NOT NULL,
                is_used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add foreign key constraint
        await client.query(`
            ALTER TABLE users
            ADD CONSTRAINT fk_organization
            FOREIGN KEY (organization_id)
            REFERENCES organizations(id)
            ON DELETE SET NULL;
        `);

        console.log('Database tables created successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    } finally {
        client.release();
    }
};

const initializeDatabase = async () => {
    try {
        await createTables();
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
};

const otpSchema = `
CREATE TABLE IF NOT EXISTS otps (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    expiry_time TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

module.exports = otpSchema;
