const jwt = require('jsonwebtoken');
const pool = require('../../utils/config/connectDB');
const { connectToOrganizationDB } = require('../../utils/config/connectOrganization');

/**
 * Middleware to authenticate JWT token
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  console.log('Auth header:', authHeader);

  if (!authHeader) {
    console.error('No authorization header found');
    return res.status(401).json({
      success: false,
      message: 'Access token is required'
    });
  }

  const token = authHeader.split(' ')[1];
  console.log('Extracted token:', token);

  if (!token) {
    console.error('No token found in authorization header');
    return res.status(401).json({
      success: false,
      message: 'Access token is required'
    });
  }

  try {
    console.log('Verifying token with secret:', process.env.JWT_SECRET);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);
    
    // Add additional validation for token expiry
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      console.error('Token has expired');
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

/**
 * Middleware to check if user has admin role
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
const isAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

/**
 * Middleware to check if user has superadmin role
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
const isSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'SuperAdmin access required'
    });
  }
  next();
};

/**
 * Middleware to verify organization access
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
const verifyOrganizationAccess = async (req, res, next) => {
  const { organizationId } = req.params;
  const { userId, role } = req.user;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      message: 'Organization ID is required'
    });
  }

  try {
    // Superadmins have access to all organizations
    if (role === 'superadmin') {
      return next();
    }

    const client = await pool.connect();
    
    try {
      // Check if user belongs to the organization
      const result = await client.query(
        'SELECT * FROM organization_admins WHERE id = $1 AND organization_id = $2',
        [userId, organizationId]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this organization'
        });
      }

      // Get organization details
      const orgResult = await client.query(
        'SELECT * FROM organizations WHERE organization_id = $1',
        [organizationId]
      );

      if (orgResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Organization not found'
        });
      }

      // Add organization context to request
      req.organization = orgResult.rows[0];
      next();
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Organization access verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify organization access',
      error: error.message
    });
  }
};

/**
 * Middleware to verify active organization status
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
const verifyActiveOrganization = async (req, res, next) => {
  const { organizationId } = req.params;

  try {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM organizations WHERE organization_id = $1 AND status = $2',
        [organizationId, 'active']
      );

      if (result.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Organization is not active'
        });
      }

      next();
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Organization status verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify organization status',
      error: error.message
    });
  }
};

/**
 * Middleware to verify active user status
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
const verifyActiveUser = async (req, res, next) => {
  const { userId, role } = req.user;

  try {
    const client = await pool.connect();
    
    try {
      if (role === 'superadmin') {
        const result = await client.query(
          'SELECT * FROM superadmins WHERE id = $1 AND is_active = true',
          [userId]
        );

        if (result.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'Your account is not active'
          });
        }
      } else {
        const result = await client.query(
          'SELECT * FROM organization_admins WHERE id = $1 AND is_active = true',
          [userId]
        );

        if (result.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'Your account is not active'
          });
        }
      }

      next();
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('User status verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify user status',
      error: error.message
    });
  }
};

module.exports = {
  authenticateToken,
  isAdmin,
  isSuperAdmin,
  verifyOrganizationAccess,
  verifyActiveOrganization,
  verifyActiveUser
};
