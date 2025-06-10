const schema = `
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    work_phone VARCHAR(20),
    mobile VARCHAR(20),
    door_no VARCHAR(50),
    city VARCHAR(100),
    state VARCHAR(100),
    district VARCHAR(100),
    country VARCHAR(100),
    bank_details JSONB,
    status VARCHAR(20) DEFAULT 'active',
    balance DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendors_vendor_id ON vendors(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendors_email ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendors_display_name ON vendors(display_name);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
`;

module.exports = schema;
