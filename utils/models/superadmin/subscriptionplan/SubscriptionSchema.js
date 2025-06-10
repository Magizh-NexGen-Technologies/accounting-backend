const subscriptionSchema = `
-- Create subscription_plans table if it doesn't exist
CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP')),
    interval VARCHAR(20) NOT NULL CHECK (interval IN ('monthly', 'yearly')),
    features JSONB NOT NULL DEFAULT '[]',
    user_limit INTEGER NOT NULL DEFAULT 0 CHECK (user_limit >= 0),
    modules JSONB NOT NULL DEFAULT '[]',
    is_popular BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT false,
    razorpay_plan_id VARCHAR(100) UNIQUE,
    gst_percentage DECIMAL(5,2) DEFAULT NULL,
    gst_amount DECIMAL(10,2) DEFAULT NULL,
    total_amount DECIMAL(10,2) DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_modules CHECK (jsonb_typeof(modules) = 'array'),
    CONSTRAINT valid_features CHECK (jsonb_typeof(features) = 'array'),
    CONSTRAINT unique_popular_per_interval CHECK (
        (is_popular = true AND interval = 'monthly') OR
        (is_popular = true AND interval = 'yearly') OR
        is_popular = false
    )
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscription_plans_interval ON subscription_plans(interval);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_published ON subscription_plans(is_published);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_popular ON subscription_plans(is_popular);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_created_at ON subscription_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_razorpay_plan_id ON subscription_plans(razorpay_plan_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_subscription_plans_updated_at') THEN
        CREATE TRIGGER update_subscription_plans_updated_at
        BEFORE UPDATE ON subscription_plans
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
`;

module.exports = subscriptionSchema;
 