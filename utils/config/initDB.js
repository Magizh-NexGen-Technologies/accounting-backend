const pool = require('./connectDB');
const initSuperAdmins = require('./initSuperAdmin');
const initSMTP = require('./initSMTP');
const paymentGatewaySchema = require('../models/superadmin/paymentgateway/PaymentGatewaySchema');
const subscriptionSchema = require('../models/superadmin/subscriptionplan/SubscriptionSchema');
const brandSettingsSchema = require('../models/superadmin/brand/BrandSchema');
const freetrialSchema = require('../models/superadmin/freetrial/FreeTrialSchema');
const financeSettingsSchema = require('../models/superadmin/finance/financeSchema');
const organizationSchema = require('../models/superadmin/organization/organizationSchema');
const superadminSchema = require('../models/superadmin/superadminSchema');
const organizationAdminSchema = require('../models/superadmin/organization/organizationAdminSchema');
const OTPSchema = require('../models/auth/OTPSchema');
const LoginSchema = require('../models/auth/LoginSchema');

async function initializeDatabase(retryCount = 0) {
  const MAX_RETRIES = 3; 
  const client = await pool.connect();
  
  try {
    // Set transaction isolation level to serializable to prevent concurrent schema modifications
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    
    // Add advisory lock to prevent concurrent schema modifications
    await client.query('SELECT pg_advisory_xact_lock(1)');
     
    // Create all required tables
    await client.query(superadminSchema);
    await initSMTP();
    await client.query(paymentGatewaySchema); 
    await client.query(subscriptionSchema);
    await client.query(brandSettingsSchema);
    await client.query(freetrialSchema);
    await client.query(financeSettingsSchema);
    await client.query(organizationSchema);
    await client.query(organizationAdminSchema);
    await client.query(OTPSchema);
    await client.query(LoginSchema);
    await client.query('COMMIT');
    console.log('✅ Database tables initialized successfully');

    // Initialize superadmins after tables are created
    await initSuperAdmins();
    
  } catch (error) {
    await client.query('ROLLBACK');
    
    // Handle concurrent update errors
    if ((error.code === 'XX000' || error.code === '42P07') && retryCount < MAX_RETRIES) {
      console.log(`Retrying database initialization (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
      return initializeDatabase(retryCount + 1);
    }
    
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = initializeDatabase;
 