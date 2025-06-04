const financeSettingsSchema = `
CREATE TABLE IF NOT EXISTS finance_settings (
    id SERIAL PRIMARY KEY,
    invoice_prefix VARCHAR(3) NOT NULL DEFAULT 'INV',
    financial_year_start_date DATE NOT NULL DEFAULT '2024-04-01',
    financial_year_end_date DATE NOT NULL DEFAULT '2025-03-31',
    gst_percentage DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    last_invoice_number INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_counters (
    id SERIAL PRIMARY KEY,
    financial_year_code VARCHAR(5) NOT NULL,
    prefix VARCHAR(3) NOT NULL,
    last_number INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(financial_year_code, prefix)
);

CREATE OR REPLACE FUNCTION get_next_invoice_number(
    p_financial_year_code VARCHAR(5),
    p_prefix VARCHAR(3)
) RETURNS INTEGER AS $$
DECLARE
    v_next_number INTEGER;
BEGIN
    -- Try to update existing counter
    UPDATE invoice_counters
    SET last_number = last_number + 1,
        updated_at = NOW()
    WHERE financial_year_code = p_financial_year_code
      AND prefix = p_prefix
    RETURNING last_number INTO v_next_number;
    
    -- If no counter exists, create one
    IF v_next_number IS NULL THEN
        INSERT INTO invoice_counters (financial_year_code, prefix, last_number)
        VALUES (p_financial_year_code, p_prefix, 1)
        RETURNING last_number INTO v_next_number;
    END IF;
    
    RETURN v_next_number;
END;
$$ LANGUAGE plpgsql;
`;

module.exports = financeSettingsSchema;