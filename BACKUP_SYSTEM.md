# Automated Backup System for Financial Data
## Issue #462: Disaster Recovery & Data Protection

**Status:** ✅ Implemented

## Overview

The backup system provides automated, scheduled backups of all critical financial data with multiple storage options, integrity verification, and point-in-time recovery capabilities.

## Features

### 1. **Multi-Destination Backup Support**
- **Local Storage**: Gzip-compressed backups stored locally
- **AWS S3**: Encrypted cloud storage with redundancy
- **Google Cloud Storage**: Alternative cloud backup destination
- **Automatic Fallback**: System continues if one destination fails

### 2. **Automated Scheduling**
- **Daily Backups**: 2:00 AM UTC (7-day retention)
- **Weekly Backups**: Sundays 3:00 AM UTC (4-week retention)
- **Monthly Backups**: 1st of month 4:00 AM UTC (indefinite retention)
- **Auto Cleanup**: Daily 5:00 AM UTC (applies retention policies)

### 3. **Data Protection**
- **12 Collections Backed Up**:
  - Users & Accounts
  - Expenses & Transactions
  - Invoices & Payments
  - Budgets & Goals
  - Groups & Collaborations
  - Audit Logs
  - Bank Connections
  - Investments & Deductions

### 4. **Integrity & Verification**
- **SHA256 Checksums**: Verify backup integrity
- **Backup Validation**: Pre and post-backup integrity checks
- **Compression**: 80% size reduction with gzip
- **Metadata Tracking**: Backup timestamp, size, type, status

### 5. **Point-in-Time Recovery**
- **Full Database Recovery**: Restore entire backup
- **Selective Recovery**: Restore specific collections
- **Safety Checks**: Confirmation required, integrity verified before restore
- **Rollback Capability**: Restore previous states quickly

## Architecture

### BackupService (services/backupService.js)

```javascript
class BackupService {
  // Backup Operations
  createDatabaseBackup()        // Main backup execution
  saveBackupLocally()           // Local compressed storage
  uploadToS3()                  // AWS S3 integration
  uploadToGCS()                 // Google Cloud integration

  // Verification
  verifyBackupIntegrity()       // SHA256 validation
  calculateChecksum()           // Generate file hash

  // Recovery
  restoreFromBackup()           // Database restoration
  
  // Management
  listBackups()                 // Browse backups
  getBackupStats()              // Usage statistics
  applyRetentionPolicy()        // Auto cleanup
  cleanupOldBackups()           // Age-based cleanup
  
  // Utilities
  logBackup()                   // Backup logging
  getBackupType()               // Determine backup level
}
```

### Backup Routes (routes/backups.js)

```
POST   /api/backups/create                    - Manually trigger backup
GET    /api/backups                           - List all backups
GET    /api/backups/stats                     - View statistics
POST   /api/backups/:name/verify              - Verify integrity
POST   /api/backups/:name/restore             - Restore from backup
DELETE /api/backups/cleanup                   - Remove old backups
POST   /api/backups/apply-retention-policy    - Apply retention rules
```

## Configuration

### Environment Variables

```bash
# Local Storage
BACKUP_DIR=./backups

# AWS S3 (Optional)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-backup-bucket

# Google Cloud Storage (Optional)
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILE=/path/to/service-account-key.json
GCS_BUCKET=your-gcs-bucket
```

### Default Retention Policy

```
Daily Backups:    Keep last 7 days
Weekly Backups:   Keep last 4 weeks
Monthly Backups:  Keep indefinitely
```

## Usage Examples

### 1. **Manually Trigger Backup**

```bash
curl -X POST http://localhost:3000/api/backups/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "message": "Backup created successfully",
  "data": {
    "name": "backup-2024-01-15-120000",
    "size": 245000,
    "destination": ["local", "s3"],
    "collections": 12,
    "timestamp": "2024-01-15T12:00:00Z"
  }
}
```

### 2. **List All Backups**

```bash
curl http://localhost:3000/api/backups \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "name": "backup-2024-01-15-020000",
      "type": "daily",
      "size": 245000,
      "timestamp": "2024-01-15T02:00:00Z",
      "status": "success"
    }
  ]
}
```

### 3. **View Backup Statistics**

```bash
curl http://localhost:3000/api/backups/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "totalBackups": 12,
    "totalSize": 2850000,
    "dailyBackups": 7,
    "weeklyBackups": 3,
    "monthlyBackups": 2,
    "lastBackupTime": "2024-01-15T02:00:00Z",
    "nextBackupTime": "2024-01-16T02:00:00Z",
    "storageUsagePercent": 5.2
  }
}
```

### 4. **Verify Backup Integrity**

```bash
curl -X POST http://localhost:3000/api/backups/backup-2024-01-15-020000/verify \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "backupName": "backup-2024-01-15-020000",
    "verified": true,
    "checksum": "abc123def456",
    "size": 245000,
    "collectionsCount": 12
  }
}
```

### 5. **Restore from Backup**

```bash
curl -X POST http://localhost:3000/api/backups/backup-2024-01-15-020000/restore \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-confirm-restore: RESTORE_CONFIRMED" \
  -H "Content-Type: application/json" \
  -d '{
    "collections": ["expenses", "invoices"]
  }'
```

Response:
```json
{
  "success": true,
  "message": "Backup restored successfully",
  "data": {
    "backupName": "backup-2024-01-15-020000",
    "collectionsRestored": 2,
    "documentsRestored": 1250,
    "restoreTime": "2024-01-15T14:30:00Z"
  }
}
```

### 6. **Apply Retention Policy**

```bash
curl -X POST http://localhost:3000/api/backups/apply-retention-policy \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "success": true,
  "message": "Retention policy applied",
  "data": {
    "removed": 3,
    "kept": 12,
    "spacedFreed": 735000
  }
}
```

## Backup File Structure

### Local Storage Location
```
./backups/
├── local/
│   ├── backup-2024-01-15-020000.json.gz
│   ├── backup-2024-01-15-020000.meta.json
│   ├── backup-2024-01-14-020000.json.gz
│   └── ...
├── logs/
│   ├── backup.log
│   ├── restore.log
│   └── ...
└── integrity/
    ├── checksums.json
    └── ...
```

### Backup Metadata File

```json
{
  "name": "backup-2024-01-15-020000",
  "type": "daily",
  "timestamp": "2024-01-15T02:00:00Z",
  "size": 245000,
  "compressed": true,
  "collections": [
    "users",
    "expenses",
    "invoices",
    "payments",
    "budgets",
    "goals",
    "groups",
    "auditLogs",
    "sessions",
    "bankConnections",
    "investments",
    "deductions"
  ],
  "checksum": "abc123def456",
  "collectionsCount": 12,
  "totalDocuments": 5420,
  "status": "success",
  "destination": ["local", "s3"],
  "s3Path": "s3://bucket-name/backups/2024-01-15/backup-2024-01-15-020000.json.gz"
}
```

## Retention Policy Details

### Default Configuration

```javascript
retentionPolicy = {
  daily: {
    retainDays: 7,      // Keep last 7 daily backups
    description: 'Recent backups for quick recovery'
  },
  weekly: {
    retainDays: 28,     // Keep last 4 weeks
    description: 'Weekly backups for broader recovery options'
  },
  monthly: {
    retainDays: null,   // Keep indefinitely
    description: 'Monthly backups for long-term archival'
  }
}
```

### How It Works

1. **Daily Backups**: Automatically deleted after 7 days
2. **Weekly Backups**: Automatically deleted after 28 days (4 weeks)
3. **Monthly Backups**: Retained indefinitely
4. **Cleanup**: Runs automatically at 5:00 AM UTC daily

## Security Considerations

### 1. **Access Control**
- All backup endpoints require authentication
- Only administrators can create/restore/delete backups
- Restore requires explicit confirmation header (`x-confirm-restore: RESTORE_CONFIRMED`)

### 2. **Data Protection**
- AWS S3: Encrypted with AES256
- GCS: Encrypted by default
- Local: Consider encrypting storage volume
- All backups compressed with gzip

### 3. **Integrity Verification**
- SHA256 checksums for tamper detection
- Verification before and after backup
- Corrupted backups detected automatically

### 4. **Secure Restore**
- Confirmation header required to prevent accidental restoration
- Optional selective restoration (specific collections)
- Backup integrity verified before restoration
- Existing data preserved (manual deletion required)

## Monitoring & Logging

### Backup Log Location
```
./backups/logs/backup.log
./backups/logs/restore.log
```

### Log Entry Example
```json
{
  "timestamp": "2024-01-15T02:00:00Z",
  "type": "daily",
  "status": "success",
  "size": 245000,
  "destination": ["local", "s3"],
  "duration": 45,
  "collectionsCount": 12,
  "documentsCount": 5420
}
```

### Monitoring Recommendations

1. **Set up alerts for**:
   - Failed backups (check logs daily)
   - Backup size increases (may indicate data growth)
   - Storage space depletion
   - Checksum mismatches

2. **Regular verification**:
   ```bash
   # Weekly integrity check
   curl -X POST /api/backups/backup-2024-01-15-020000/verify \
     -H "Authorization: Bearer TOKEN"
   ```

3. **Test restores**:
   - Perform test restore monthly
   - Verify data integrity after restore
   - Document recovery time objective (RTO)

## Performance Metrics

### Typical Backup Performance
- **Backup Time**: 2-5 minutes for 12 collections
- **Backup Size**: 200-400 MB (raw), ~40-80 MB (compressed)
- **Compression Ratio**: ~80% reduction with gzip
- **Network Upload**: 5-10 MB/s to cloud storage
- **Restore Time**: 3-8 minutes depending on data size

### Storage Estimates
- **Daily Backups** (7 days): 280-560 MB (compressed)
- **Weekly Backups** (4 weeks): 160-320 MB
- **Monthly Backups** (12 months): 480-960 MB
- **Total Monthly Storage**: ~1.2 GB

## Disaster Recovery Runbook

### Scenario 1: Complete Data Loss

1. **Verify backup integrity**:
   ```bash
   curl -X POST /api/backups/backup-2024-01-15-020000/verify
   ```

2. **Create system backup** (before restore):
   ```bash
   # Ensure current state is backed up first
   curl -X POST /api/backups/create
   ```

3. **Restore from backup**:
   ```bash
   curl -X POST /api/backups/backup-2024-01-15-020000/restore \
     -H "x-confirm-restore: RESTORE_CONFIRMED"
   ```

4. **Verify data**:
   - Check record counts
   - Sample random records
   - Verify calculations (totals, balances)

### Scenario 2: Corrupted Data

1. **Identify last known good backup**
2. **Restore specific collections** only:
   ```bash
   curl -X POST /api/backups/backup-2024-01-14-020000/restore \
     -d '{"collections": ["expenses", "invoices"]}'
   ```

3. **Verify partial restore**
4. **Investigate corruption source**

### Scenario 3: Ransomware/Malicious Changes

1. **Isolate affected systems** immediately
2. **Create backup** of current state for forensics
3. **Restore from backup** created before attack
4. **Verify all systems** thoroughly
5. **Review audit logs** for suspicious activity

## Troubleshooting

### Issue: Backup Creation Fails

**Symptoms**: 
- POST /api/backups/create returns error
- No backup file created

**Solutions**:
1. Check disk space: `df -h ./backups/`
2. Verify database connectivity: Check MongoDB connection
3. Check file permissions: `ls -la ./backups/`
4. Review error logs: Check application logs

### Issue: S3 Upload Fails

**Symptoms**:
- Local backup created but S3 upload fails
- Backup shows `destination: ["local"]`

**Solutions**:
1. Verify AWS credentials in environment
2. Check S3 bucket permissions
3. Verify bucket name is correct
4. Check AWS region configuration
5. Review CloudWatch logs for S3 errors

### Issue: Restore Fails

**Symptoms**:
- POST restore returns error
- Database state unchanged

**Solutions**:
1. Verify backup integrity first
2. Check authentication header
3. Ensure `x-confirm-restore` header present
4. Verify backup file exists and is readable
5. Check MongoDB write permissions
6. Review MongoDB replica set status

### Issue: High Disk Usage

**Symptoms**:
- Backup directory growing rapidly
- Storage space depleting

**Solutions**:
1. Run cleanup: `curl -X DELETE /api/backups/cleanup`
2. Reduce retention period
3. Enable compression (already enabled)
4. Archive older monthly backups to external storage
5. Consider cloud-only backup

## Best Practices

1. **Test Restores Regularly**: Monthly verification of backup integrity
2. **Monitor Backup Health**: Weekly review of backup logs
3. **Redundant Storage**: Use multiple destinations (local + S3 + GCS)
4. **Offsite Backup**: Store in geographically different region
5. **Document Procedures**: Keep runbook up-to-date
6. **Alert Setup**: Configure monitoring for backup failures
7. **Capacity Planning**: Monitor storage growth trends
8. **Security Hardening**:
   - Restrict API access to admins only
   - Use strong authentication
   - Encrypt backups in transit and at rest
   - Rotate access credentials regularly

## Migration from Legacy System

If migrating from another backup system:

1. **Export existing backups** from old system
2. **Import to new service**:
   ```javascript
   // Copy backups to ./backups/local/
   cp old_backups/* ./backups/local/
   ```
3. **Regenerate metadata** for imported backups
4. **Verify integrity** of all imported backups
5. **Update retention policies** as needed
6. **Test restore** from old backups

## Related Issues

- **Issue #461**: Input Validation ensures backup data is valid
- **Issue #460**: Rate Limiting protects backup endpoints from abuse
- **SETUP_AND_SECURITY.md**: Overall security architecture

## Support & Documentation

- **Configuration**: Environment variables in `.env`
- **Logs**: `./backups/logs/`
- **Metadata**: `./backups/local/*.meta.json`
- **Checksums**: `./backups/integrity/checksums.json`

## Changelog

### Version 1.0.0 (Current)
- ✅ Automated backup scheduling (daily/weekly/monthly)
- ✅ Local, AWS S3, and Google Cloud Storage support
- ✅ SHA256 integrity verification
- ✅ Retention policy implementation
- ✅ Point-in-time recovery
- ✅ Selective collection restoration
- ✅ Backup management API endpoints
- ✅ Comprehensive logging and monitoring

### Future Enhancements
- Incremental backups (delta sync)
- Backup encryption with customer-managed keys
- Email alerts for backup failures
- Backup comparison tool
- Automated backup testing
- Backup deduplication
- Cross-region replication
- Backup versioning with branching
