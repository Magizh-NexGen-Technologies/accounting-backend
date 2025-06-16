const schema = `
CREATE TABLE IF NOT EXISTS tax_settings (
    id SERIAL PRIMARY KEY,
    tax_name VARCHAR(255) NOT NULL,
    tax_rate DECIMAL(5,2) NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 100),
    tax_type VARCHAR(50) NOT NULL,
    tax_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gst_settings (
    id SERIAL PRIMARY KEY,
    legal_name VARCHAR(255) NOT NULL,
    gstin VARCHAR(15) NOT NULL UNIQUE,
    business_type VARCHAR(50) NOT NULL, 
    state VARCHAR(255) NOT NULL,
    payment_terms JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

module.exports = schema;
