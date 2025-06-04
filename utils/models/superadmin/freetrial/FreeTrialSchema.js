const freetrialSchema = `
CREATE TABLE IF NOT EXISTS free_trial (
    id SERIAL PRIMARY KEY,
    trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0 AND trial_days <= 90),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;

module.exports = freetrialSchema;