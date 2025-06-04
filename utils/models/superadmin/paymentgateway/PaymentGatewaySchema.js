const schema = `
CREATE TABLE IF NOT EXISTS payment_gateways (
    id SERIAL PRIMARY KEY,
    gateway VARCHAR(50) NOT NULL UNIQUE,
    api_key VARCHAR(255) NOT NULL,
    api_secret VARCHAR(255) NOT NULL,
    is_test_mode BOOLEAN DEFAULT true, 
    webhook_secret VARCHAR(255),
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_gateway CHECK (gateway IN ('razorpay', 'stripe')),
    CONSTRAINT valid_api_key_format CHECK ( 
        (is_test_mode AND api_key LIKE 'rzp_test_%') OR
        (NOT is_test_mode AND api_key LIKE 'rzp_live_%')
    )
);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_gateway ON payment_gateways(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_gateways_is_active ON payment_gateways(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_gateways_created_at ON payment_gateways(created_at DESC);

CREATE TABLE IF NOT EXISTS razorpay_orders (
    id SERIAL PRIMARY KEY, 
    order_id VARCHAR(255) NOT NULL UNIQUE,
    payment_id VARCHAR(255), 
    payment_signature VARCHAR(255),
    amount INTEGER NOT NULL, 
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    receipt VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'created',
    failure_reason VARCHAR(500),
    failure_code VARCHAR(100),
    failure_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_status CHECK (status IN ('created', 'attempted', 'paid', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_razorpay_orders_order_id ON razorpay_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_payment_id ON razorpay_orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_status ON razorpay_orders(status);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_created_at ON razorpay_orders(created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at DESC);`;

module.exports = schema; 