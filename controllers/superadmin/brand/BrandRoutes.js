const pool = require('../../../utils/config/connectDB');
const path = require('path');
const fs = require('fs').promises;
const brandSettingsSchema = require('../../../utils/models/superadmin/brand/BrandSchema');

// Helper function to delete old files
const deleteOldFile = async (filePath) => {
    if (!filePath) return;
    try {
        const absolutePath = path.join(__dirname, '../../../public', filePath);
        await fs.access(absolutePath);
        await fs.unlink(absolutePath);
    } catch (error) {
        console.error('Error deleting old file:', error);
    }
};

exports.getBrand = async (req, res) => { 
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(`
            SELECT id, logo_url, favicon_url, updated_at, created_at
            FROM brand_settings
            WHERE id = (SELECT id FROM brand_settings ORDER BY created_at DESC LIMIT 1)
            FOR UPDATE;
        `);

        await client.query('COMMIT');
        
        const settings = result.rows[0] || {
            id: null,
            logo_url: '',
            favicon_url: '',
            updated_at: new Date(),
            created_at: new Date()
        };

        if (settings.logo_url) {
            settings.logo_url = `${req.protocol}://${req.get('host')}${settings.logo_url}`;
        }
        if (settings.favicon_url) {
            const protocol =
                req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production'
                    ? 'https'
                    : req.protocol;
            settings.favicon_url = `${protocol}://${req.get('host')}${settings.favicon_url}`;
        }

        res.json(settings);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error fetching brand settings:', error);
        res.status(500).json({ error: 'Failed to fetch brand settings' });
    } finally {
        client.release();
    }
};

exports.postBrand = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get existing record to clean up old files
        const existingResult = await client.query('SELECT logo_url, favicon_url FROM brand_settings ORDER BY created_at DESC LIMIT 1');
        const existingRecord = existingResult.rows[0];

        // Process file uploads
        const logo_url = req.files?.logo ? `/branding-image/${path.basename(req.files.logo[0].path)}` : null;
        const favicon_url = req.files?.favicon ? `/branding-image/${path.basename(req.files.favicon[0].path)}` : null;

        // Clean up old files if new ones are uploaded
        if (logo_url && existingRecord?.logo_url) {
            await deleteOldFile(existingRecord.logo_url);
        }
        if (favicon_url && existingRecord?.favicon_url) {
            await deleteOldFile(existingRecord.favicon_url);
        }

        const result = await client.query(`
            INSERT INTO brand_settings (logo_url, favicon_url)
            VALUES ($1, $2)
            RETURNING id, logo_url, favicon_url, updated_at, created_at;
        `, [
            logo_url || req.body.logo_url,
            favicon_url || req.body.favicon_url
        ]);

        await client.query('COMMIT');

        const settings = result.rows[0];
        if (settings.logo_url) {
            settings.logo_url = `${req.protocol}://${req.get('host')}${settings.logo_url}`;
        }
        if (settings.favicon_url) {
            const protocol =
                req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production'
                    ? 'https'
                    : req.protocol;
            settings.favicon_url = `${protocol}://${req.get('host')}${settings.favicon_url}`;
        }

        res.json(settings);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating brand settings:', error);
        res.status(500).json({ error: 'Failed to update brand settings' });
    } finally {
        client.release();
    }
};

exports.putBrand = async (req, res) => {
    const client = await pool.connect();
    const { id } = req.params;

    try {
        await client.query('BEGIN');

        // Get existing record
        const existingResult = await client.query('SELECT logo_url, favicon_url FROM brand_settings WHERE id = $1', [id]);
        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Brand settings not found' });
        }

        const existingRecord = existingResult.rows[0];
        
        // Process file uploads
        const logo_url = req.files?.logo ? `/branding-image/${path.basename(req.files.logo[0].path)}` : null;
        const favicon_url = req.files?.favicon ? `/branding-image/${path.basename(req.files.favicon[0].path)}` : null;

        // Clean up old files if new ones are uploaded
        if (logo_url && existingRecord.logo_url) {
            await deleteOldFile(existingRecord.logo_url);
        }
        if (favicon_url && existingRecord.favicon_url) {
            await deleteOldFile(existingRecord.favicon_url);
        }

        const result = await client.query(`
            UPDATE brand_settings
            SET logo_url = COALESCE($1, logo_url),
                favicon_url = COALESCE($2, favicon_url),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING id, logo_url, favicon_url, updated_at, created_at;
        `, [
            logo_url || req.body.logo_url || existingRecord.logo_url,
            favicon_url || req.body.favicon_url || existingRecord.favicon_url,
            id
        ]);

        await client.query('COMMIT');

        const settings = result.rows[0];
        if (settings.logo_url) {
            settings.logo_url = `${req.protocol}://${req.get('host')}${settings.logo_url}`;
        }
        if (settings.favicon_url) {
            const protocol =
                req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production'
                    ? 'https'
                    : req.protocol;
            settings.favicon_url = `${protocol}://${req.get('host')}${settings.favicon_url}`;
        }

        res.json(settings);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating brand settings:', error);
        res.status(500).json({ error: 'Failed to update brand settings' });
    } finally {
        client.release();
    }
};
