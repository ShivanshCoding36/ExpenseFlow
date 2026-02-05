const TwoFactorAuth = require('../models/TwoFactorAuth');
const TrustedDevice = require('../models/TrustedDevice');
const twoFactorAuthService = require('../services/twoFactorAuthService');
const AuditLog = require('../models/AuditLog');

/**
 * 2FA Middleware
 * Issue #503: 2FA Management
 * Middleware for verifying 2FA requirements and device trust
 */

/**
 * Check if 2FA is required for the user
 */
const check2FARequired = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id });

    if (twoFAAuth && twoFAAuth.enabled) {
      // Check if device is trusted
      const fingerprint = req.headers['x-device-fingerprint'] || '';
      if (fingerprint) {
        const shouldSkip = await twoFactorAuthService.shouldSkip2FA(
          req.user.id,
          fingerprint
        );

        if (shouldSkip) {
          // Update trusted device usage
          const device = await TrustedDevice.findOne({
            userId: req.user.id,
            fingerprint
          });
          if (device) {
            device.updateLastUsed(req.ip);
            await device.save();
          }
          return next();
        }
      }

      // 2FA verification required
      req.session.require2FA = true;
      return res.status(403).json({
        error: '2FA verification required',
        code: 'REQUIRE_2FA',
        twoFactorId: req.sessionID
      });
    }

    next();
  } catch (error) {
    console.error('Error in 2FA check middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify 2FA code middleware
 */
const verify2FA = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { code, method } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Missing 2FA code' });
    }

    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id });

    if (!twoFAAuth || !twoFAAuth.enabled) {
      return res.status(400).json({ error: '2FA not enabled' });
    }

    try {
      let verified = false;

      // Verify based on method
      if (twoFAAuth.method === 'totp' || method === 'totp') {
        verified = await twoFactorAuthService.verifyTOTPCode(req.user.id, code);
      } else if (twoFAAuth.method === 'backup-codes' || method === 'backup-codes') {
        verified = await twoFactorAuthService.verifyBackupCode(req.user.id, code);
      } else if (twoFAAuth.method === 'email' || method === 'email') {
        verified = await twoFactorAuthService.verify2FACodeEmail(req.user.id, code);
      }

      if (!verified) {
        return res.status(400).json({ error: 'Invalid code' });
      }

      req.user.verified2FA = true;
      req.session.verified2FA = true;

      next();
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  } catch (error) {
    console.error('Error verifying 2FA:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Require 2FA verification for sensitive actions
 */
const requireSensitive2FA = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id });

    if (twoFAAuth && twoFAAuth.enabled && twoFAAuth.requireForSensitiveActions) {
      if (!req.session.verified2FA && !req.user.verified2FA) {
        return res.status(403).json({
          error: '2FA verification required for this action',
          code: 'REQUIRE_2FA_SENSITIVE'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Error in sensitive 2FA middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Trust device middleware
 */
const trustDevice = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { trustDevice: shouldTrust } = req.body;

    if (shouldTrust && req.user.verified2FA) {
      const deviceInfo = {
        fingerprint: req.headers['x-device-fingerprint'] || '',
        name: req.headers['x-device-name'] || 'Trusted Device',
        type: req.headers['x-device-type'] || 'unknown',
        os: req.headers['x-device-os'] || 'Unknown',
        browser: req.headers['x-device-browser'] || 'Unknown',
        ipAddress: req.ip,
        location: {
          country: req.headers['x-device-country'],
          city: req.headers['x-device-city']
        }
      };

      try {
        const result = await twoFactorAuthService.addTrustedDevice(
          req.user.id,
          deviceInfo,
          'manual'
        );
        req.newTrustedDevice = result;
      } catch (error) {
        console.error('Error adding trusted device:', error);
      }
    }

    next();
  } catch (error) {
    console.error('Error in trust device middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Validate device trust status
 */
const validateDeviceTrust = async (req, res, next) => {
  try {
    const fingerprint = req.headers['x-device-fingerprint'];
    if (!fingerprint) {
      return next();
    }

    const device = await TrustedDevice.findOne({
      userId: req.user?.id,
      fingerprint,
      isActive: true
    });

    if (device && !device.isTrustExpired() && device.isVerified) {
      req.device = device;
      req.isDeviceTrusted = true;
    } else {
      req.isDeviceTrusted = false;
    }

    next();
  } catch (error) {
    console.error('Error validating device trust:', error);
    next();
  }
};

/**
 * Log security event for 2FA
 */
const log2FAEvent = (action) => {
  return async (req, res, next) => {
    try {
      if (req.user && req.user.id) {
        await AuditLog.create({
          userId: req.user.id,
          action: action,
          actionType: 'security',
          resourceType: 'TwoFactorAuth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
      }
      next();
    } catch (error) {
      console.error('Error logging 2FA event:', error);
      next();
    }
  };
};

module.exports = {
  check2FARequired,
  verify2FA,
  requireSensitive2FA,
  trustDevice,
  validateDeviceTrust,
  log2FAEvent
};
