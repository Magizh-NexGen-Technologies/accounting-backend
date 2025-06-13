const { Pool } = require('pg');
require('dotenv').config();
const pool = require('./connectDB');
const OrganizationSchema = require('../models/superadmin/organization/organizationSchema');
const OrganizationAdminSchema = require('../models/superadmin/organization/organizationAdminSchema');

// Cache to store organization database connections
const connectionCache = new Map();

/**
 * Creates a new database connection to a tenant's organization database
 * @param {string} orgDbName - The database name for the organization 
 * @returns {Pool} PostgreSQL connection pool for the organization database
 */
const connectToOrganizationDB = async (orgDbName) => {
  // Check if connection already exists in cache 
  if (connectionCache.has(orgDbName)) {
    return connectionCache.get(orgDbName);
  }

  // Create a new connection string by replacing the database name in the main connection string
  const mainConnectionString = process.env.DATABASE_URL;
  
  // Extract parts of the connection string
  const urlPattern = /^(postgres(?:ql)?:\/\/[^:]+:[^@]+@[^:]+(?::\d+)?)\/([^?]+)(.*)$/;
  const matches = mainConnectionString.match(urlPattern);
  
  if (!matches) {
    throw new Error('Invalid database connection string format');
  }
  
  const [, baseUrl, , queryParams] = matches;
  const orgConnectionString = `${baseUrl}/${orgDbName}${queryParams || ''}`;

  // Create a new connection pool for this organization
  const orgPool = new Pool({
    connectionString: orgConnectionString,
    // ssl: {
    //   rejectUnauthorized: false // Required for DigitalOcean PostgreSQL
    // }
  });
 
  try {
    // Test the connection
    await orgPool.query('SELECT NOW()');
    console.log(`✅ Connected to organization database: ${orgDbName}`);
    
    // Cache the connection for future use
    connectionCache.set(orgDbName, orgPool);
    
    return orgPool;
  } catch (error) {
    console.error(`❌ Error connecting to organization database ${orgDbName}:`, error);
    throw error;
  }
};

/**
 * Gets organization data by ID or database name
 * @param {string|number} identifier - The organization ID or database name
 * @returns {object} Organization data
 */
const getOrganizationData = async (identifier) => {
  const client = await pool.connect();
  try {
    // First try to find by organization_id
    const orgResult = await client.query(
      'SELECT * FROM organizations WHERE organization_id = $1',
      [identifier]
    );

    if (orgResult.rows.length > 0) {
      return orgResult.rows[0];
    }

    // If not found by organization_id, try by organization_db
    const dbResult = await client.query(
      'SELECT * FROM organizations WHERE organization_db = $1',
      [identifier]
    );

    if (dbResult.rows.length > 0) {
      return dbResult.rows[0];
    }

    return null;
  } catch (error) {
    console.error('Error getting organization data:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Creates a new database for an organization
 * @param {string} orgDbName - The database name to create
 * @param {object} orgData - The organization data to store
 * @returns {boolean} - Success status
 */
const createOrganizationDB = async (orgDbName, orgData) => {
  let client = null;
  
  try {
    // Acquire a client from the pool
    client = await pool.connect();
    
    // Create the new database
    await client.query(`CREATE DATABASE "${orgDbName}"`);
    console.log(`✅ Created organization database: ${orgDbName}`);
    
    // Release the client back to the pool
    client.release();
    client = null;
    
    // Create a slight delay to ensure the database is fully created
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Connect to the new database to verify it was created successfully
    const orgPool = await connectToOrganizationDB(orgDbName);
    console.log(`✅ Verified connection to organization database: ${orgDbName}`);

    // Create organization table in the tenant database using the schema
    await orgPool.query(OrganizationSchema);
    console.log(`✅ Created organizations table in tenant database: ${orgDbName}`);

    // Create organization_admins table in the tenant database using the schema
    await orgPool.query(OrganizationAdminSchema);
    console.log(`✅ Created organization_admins table in tenant database: ${orgDbName}`);

    // Insert organization data into the tenant database
    if (orgData) {
      const {
        organization_id,
        name,
        slug,
        organization_db,
        admin_email,
        admin_name,
        phone_number,
        subscription_plan,
        user_limit,
        status,
        enabled_modules
      } = orgData;

      await orgPool.query(
        `INSERT INTO organizations 
          (organization_id, name, slug, organization_db, admin_email, admin_name, phone_number,
          subscription_plan, user_limit, status, enabled_modules) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          organization_id,
          name,
          slug,
          organization_db,
          admin_email,
          admin_name,
          phone_number,
          subscription_plan,
          user_limit,
          status || 'active',
          JSON.stringify(enabled_modules || [])
        ]
      );
      
      console.log(`✅ Saved organization data to tenant database: ${orgDbName}`);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error creating organization database ${orgDbName}:`, error);
    throw error;
  } finally {
    // Only release the client if it exists and hasn't been released yet
    if (client !== null) {
      client.release();
    }
  }
};

module.exports = {
  connectToOrganizationDB,
  createOrganizationDB,
  getOrganizationData
};
