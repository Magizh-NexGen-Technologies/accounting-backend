const schema = `
CREATE TABLE IF NOT EXISTS purchase_settings (
    id SERIAL PRIMARY KEY,
    po_prefix VARCHAR(10) NOT NULL,
    bill_prefix VARCHAR(10) NOT NULL,
    financial_year_start_date DATE NOT NULL,
    financial_year_end_date DATE NOT NULL,
    financial_year_code VARCHAR(10) NOT NULL,
    default_purchase_tax NUMERIC(5,2),
    tax_rates INTEGER[],
    payment_terms TEXT[],
    vendor_categories TEXT[],
    selected_category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_number_counters (
    id SERIAL PRIMARY KEY,
    type VARCHAR(10) NOT NULL, -- 'PO' or 'BILL'
    financial_year_code VARCHAR(10) NOT NULL,
    prefix VARCHAR(10) NOT NULL,
    last_number INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, financial_year_code, prefix)
); 
`;

module.exports = schema;
