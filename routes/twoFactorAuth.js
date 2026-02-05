const express = require('express');
const auth = require('../middleware/auth');
const {
  check2FARequired,
  verify2FA,
  requireSensitive2FA,
  trustDevice,
  validateDeviceTrust,
  log2FAEvent
} = require('../middleware/twoFactorAuthMiddleware');
const { validateRequest } = require('../middleware/inputValidator');
const { twoFactorLimiter, verifyCodeLimiter } = require('../middleware/rateLimiter');
const twoFactorAuthService = require('../services/twoFactorAuthService');
const TwoFactorAuth = require('../models/TwoFactorAuth');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

/**
 * 2FA Routes
 * Issue #503: 2FA Management
 */

/**
 * GET /2fa/status
 * Get 2FA status for current user
 */
router.get('/status', auth, async (req, res) => {
  try {
    const status = await twoFactorAuthService.get2FAStatus(req.user.id);
    res.json(status);
  } catch (error) {
    console.error('Error getting 2FA status:', error);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

/**
 * POST /2fa/setup/initiate
 * Initiate 2FA setup - generate TOTP secret and QR code
 */
router.post('/setup/initiate', auth, twoFactorLimiter, async (req, res) => {
  try {
    const result = await twoFactorAuthService.generateTOTPSecret(
      req.user.id,
      req.user.email
    );

    res.json({
      secret: result.secret,
      qrCode: result.qrCode,
      manualEntryKey: result.manualEntryKey,
      message: 'TOTP secret generated. Scan QR code with your authenticator app.'
    });
  } catch (error) {
    console.error('Error initiating 2FA setup:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate 2FA setup' });
  }
});

/**
 * POST /2fa/setup/verify
 * Verify TOTP code and enable 2FA
 */
router.post('/setup/verify', auth, verifyCodeLimiter, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid TOTP code format' });
    }

    const result = await twoFactorAuthService.verifyAndEnableTOTP(req.user.id, code);

    // Log the action
    await AuditLog.create({
      userId: req.user.id,
      action: '2FA_SETUP_COMPLETED',
      actionType: 'security',
      resourceType: 'TwoFactorAuth',
      details: {
        method: 'totp'
      }
    });

    res.json({
      success: true,
      backupCodes: result.backupCodes,
      message: result.message
    });
  } catch (error) {
    console.error('Error verifying 2FA setup:', error);
    res.status(400).json({ error: error.message || 'Failed to verify TOTP code' });
  }
});

/**
 * POST /2fa/verify
 * Verify 2FA code during login
 */
router.post('/verify', auth, verifyCodeLimiter, verify2FA, trustDevice, async (req, res) => {
  try {
    const response = {
      success: true,
      message: '2FA verification successful'
    };

    if (req.newTrustedDevice) {
      response.deviceAdded = true;
      response.deviceId = req.newTrustedDevice.deviceId;
      response.verificationCode = req.newTrustedDevice.verificationCode;
      response.message += '. Device added to trusted list.';
    }

    res.json(response);
  } catch (error) {
    console.error('Error verifying 2FA:', error);
    res.status(400).json({ error: error.message || 'Failed to verify 2FA code' });
  }
});

/**
 * POST /2fa/disable
 * Disable 2FA for current user
 */
router.post('/disable', auth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const result = await twoFactorAuthService.disableTwoFactorAuth(req.user.id, password);

    res.json(result);
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    res.status(400).json({ error: error.message || 'Failed to disable 2FA' });
  }
});

/**
 * POST /2fa/backup-codes/regenerate
 * Regenerate backup codes
 */
router.post('/backup-codes/regenerate', auth, async (req, res) => {
  try {
    const codes = await twoFactorAuthService.regenerateBackupCodes(req.user.id);

    res.json({
      success: true,
      backupCodes: codes,
      message: 'Backup codes regenerated successfully'
    });
  } catch (error) {
    console.error('Error regenerating backup codes:', error);
    res.status(400).json({ error: error.message || 'Failed to regenerate backup codes' });
  }
});

/**
 * POST /2fa/method/switch
 * Switch 2FA method
 */
router.post('/method/switch', auth, async (req, res) => {
  try {
    const { method } = req.body;

    if (!method) {
      return res.status(400).json({ error: 'Method is required' });
    }

    const result = await twoFactorAuthService.switchTwoFactorMethod(req.user.id, method);

    res.json(result);
  } catch (error) {
    console.error('Error switching 2FA method:', error);
    res.status(400).json({ error: error.message || 'Failed to switch 2FA method' });
  }
});

/**
 * POST /2fa/trusted-devices
 * Add a new trusted device
 */
router.post('/trusted-devices', auth, async (req, res) => {
  try {
    const { deviceName, deviceType, os, browser } = req.body;

    const deviceInfo = {
      fingerprint: req.headers['x-device-fingerprint'] || '',
      name: deviceName || 'Trusted Device',
      type: deviceType || 'unknown',
      os: os || 'Unknown',
      browser: browser || 'Unknown',
      ipAddress: req.ip,
      location: {
        country: req.headers['x-device-country'],
        city: req.headers['x-device-city']
      }
    };

    const result = await twoFactorAuthService.addTrustedDevice(
      req.user.id,
      deviceInfo,
      'email'
    );

    res.json({
      success: true,
      deviceId: result.deviceId,
      message: 'Device added. Check your email for verification code.'
    });
  } catch (error) {
    console.error('Error adding trusted device:', error);
    res.status(400).json({ error: error.message || 'Failed to add trusted device' });
  }
});

/**
 * POST /2fa/trusted-devices/:deviceId/verify
 * Verify trusted device with verification code
 */
router.post('/trusted-devices/:deviceId/verify', auth, verifyCodeLimiter, async (req, res) => {
  try {
    const { verificationCode } = req.body;

    if (!verificationCode) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const result = await twoFactorAuthService.verifyTrustedDevice(
      req.user.id,
      req.params.deviceId,
      verificationCode
    );

    res.json(result);
  } catch (error) {
    console.error('Error verifying trusted device:', error);
    res.status(400).json({ error: error.message || 'Failed to verify trusted device' });
  }
});

/**
 * GET /2fa/trusted-devices
 * Get all trusted devices for current user
 */
router.get('/trusted-devices', auth, async (req, res) => {
  try {
    const devices = await twoFactorAuthService.getTrustedDevices(req.user.id);
    res.json(devices);
  } catch (error) {
    console.error('Error getting trusted devices:', error);
    res.status(500).json({ error: 'Failed to get trusted devices' });
  }
});

/**
 * DELETE /2fa/trusted-devices/:deviceId
 * Remove a trusted device
 */
router.delete('/trusted-devices/:deviceId', auth, async (req, res) => {
  try {
    const result = await twoFactorAuthService.removeTrustedDevice(
      req.user.id,
      req.params.deviceId
    );

    res.json(result);
  } catch (error) {
    console.error('Error removing trusted device:', error);
    res.status(400).json({ error: error.message || 'Failed to remove trusted device' });
  }
});

/**
 * POST /2fa/recovery-email/set
 * Set recovery email
 */
router.post('/recovery-email/set', auth, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id });
    if (!twoFAAuth) {
      return res.status(400).json({ error: '2FA not configured' });
    }

    twoFAAuth.recoveryEmail = email;
    await twoFAAuth.save();

    // Log the action
    await AuditLog.create({
      userId: req.user.id,
      action: '2FA_RECOVERY_EMAIL_SET',
      actionType: 'security',
      resourceType: 'TwoFactorAuth'
    });

    res.json({ success: true, message: 'Recovery email set successfully' });
  } catch (error) {
    console.error('Error setting recovery email:', error);
    res.status(500).json({ error: 'Failed to set recovery email' });
  }
});

/**
 * POST /2fa/recovery-email/send-code
 * Send recovery email verification code
 */
router.post('/recovery-email/send-code', auth, async (req, res) => {
  try {
    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id });
    if (!twoFAAuth || !twoFAAuth.recoveryEmail) {
      return res.status(400).json({ error: 'Recovery email not configured' });
    }

    twoFAAuth.recoveryEmailVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    twoFAAuth.recoveryEmailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
    await twoFAAuth.save();

    // Send email (using your email service)
    // await emailService.sendEmail(...);

    res.json({ success: true, message: 'Verification code sent to recovery email' });
  } catch (error) {
    console.error('Error sending recovery email code:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

/**
 * POST /2fa/backup-codes/download
 * Download backup codes
 */
router.post('/backup-codes/download', auth, async (req, res) => {
  try {
    const twoFAAuth = await TwoFactorAuth.findOne({ userId: req.user.id }).select('+backupCodes');

    if (!twoFAAuth || !twoFAAuth.enabled) {
      return res.status(400).json({ error: '2FA not enabled' });
    }

    const codes = twoFAAuth.backupCodes
      .filter(bc => !bc.used)
      .map(bc => bc.code)
      .join('\n');

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="backup-codes.txt"');
    res.send(`ExpenseFlow Backup Codes\n\n${codes}\n\nKeep these codes safe. Each code can only be used once.`);
  } catch (error) {
    console.error('Error downloading backup codes:', error);
    res.status(500).json({ error: 'Failed to download backup codes' });
  }
});

/**
 * POST /2fa/send-code-email
 * Send 2FA code via email
 */
router.post('/send-code-email', auth, async (req, res) => {
  try {
    const result = await twoFactorAuthService.send2FACodeEmail(req.user.id, req.user.email);
    res.json(result);
  } catch (error) {
    console.error('Error sending 2FA code:', error);
    res.status(500).json({ error: error.message || 'Failed to send 2FA code' });
  }
});

/**
 * GET /2fa/audit-log
 * Get 2FA audit log
 */
router.get('/audit-log', auth, async (req, res) => {
  try {
    const logs = await AuditLog.find({
      userId: req.user.id,
      resourceType: 'TwoFactorAuth'
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(logs);
  } catch (error) {
    console.error('Error getting audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

module.exports = router;
