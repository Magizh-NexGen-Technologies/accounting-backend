const jwt = require('jsonwebtoken');
const pool = require('../../utils/config/connectDB');
const { connectToOrganizationDB } = require('../../utils/config/connectOrganization');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/**
 * Middleware to authenticate JWT token
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function 
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes'
  }
});

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check token expiry
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }

    // Check if token is blacklisted
    const isBlacklisted = await checkTokenBlacklist(token);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token is no longer valid'
      });
    }

    // Add user info to request
    req.user = decoded;
    next();
  } catch (error) {
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
const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { userId, role } = req.user;
    
    // Check user status
    const userStatus = await checkUserStatus(userId, role);
    if (!userStatus.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account is not active'
      });
    }

    if (role !== 'admin' && role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying admin status'
    });
  }
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
