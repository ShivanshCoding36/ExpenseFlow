# Quick Start: Deploy Backup System (Issue #462)

**Time to Deploy**: 5-10 minutes  
**Difficulty**: Easy  
**Prerequisites**: Node.js, npm, MongoDB

---

## 1. Install Dependencies (1 minute)

```bash
# Already installed, but verify
npm list node-cron

# If not installed
npm install node-cron --save
```

## 2. Create Backup Directory (30 seconds)

```bash
# Create directory structure
mkdir -p ./backups/{local,logs,integrity}

# Set permissions
chmod 755 ./backups
```

## 3. Configure Environment (.env) (1 minute)

Add these lines to your `.env` file:

```bash
# Backup Configuration
BACKUP_DIR=./backups
BACKUP_LOCAL_ENABLED=true

# Optional: AWS S3
AWS_S3_ENABLED=false
# AWS_ACCESS_KEY_ID=xxx
# AWS_SECRET_ACCESS_KEY=xxx
# AWS_REGION=us-east-1
# AWS_S3_BUCKET=your-bucket

# Optional: Google Cloud Storage
GCS_ENABLED=false
# GCS_PROJECT_ID=your-project
# GCS_KEY_FILE=/path/to/key.json
# GCS_BUCKET=your-bucket
```

## 4. Files Already In Place (verify)

The following files have been created and integrated:

```
✅ services/backupService.js         - Backup engine
✅ routes/backups.js                 - API endpoints
✅ server.js                         - Updated with scheduling
✅ BACKUP_SYSTEM.md                  - Complete documentation
✅ BACKUP_SETUP.md                   - Setup guide
✅ tests/backupService.test.js       - Test suite
```

## 5. Start Application (30 seconds)

```bash
npm start
```

**Expected output**:
```
✓ Backup scheduling initialized successfully
  - Daily backups: 2:00 AM UTC
  - Weekly backups: Sundays 3:00 AM UTC
  - Monthly backups: 1st of month 4:00 AM UTC
  - Cleanup: Daily 5:00 AM UTC
```

## 6. Test Manually (1 minute)

### Create a test backup:

```bash
# Replace TOKEN with your admin token
curl -X POST http://localhost:3000/api/backups/create \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### Expected response:
```json
{
  "success": true,
  "message": "Backup created successfully",
  "data": {
    "name": "backup-2024-01-15-120000",
    "size": 245000,
    "destination": ["local"],
    "collections": 12,
    "timestamp": "2024-01-15T12:00:00Z"
  }
}
```

### Check created files:

```bash
ls -la ./backups/local/
```

You should see:
```
backup-2024-01-15-120000.json.gz
backup-2024-01-15-120000.meta.json
```

## 7. Verify Backup (1 minute)

### List all backups:

```bash
curl http://localhost:3000/api/backups \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Get statistics:

```bash
curl http://localhost:3000/api/backups/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Verify integrity:

```bash
curl -X POST http://localhost:3000/api/backups/backup-2024-01-15-120000/verify \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "verified": true,
    "checksum": "abc123def456",
    "size": 245000
  }
}
```

## 8. Check Backup Logs (optional)

```bash
# View backup operations
cat ./backups/logs/backup.log

# Real-time monitoring
tail -f ./backups/logs/backup.log
```

---

## Automated Backup Schedule

Backups are now **automatically scheduled**:

| Type | Time | Retention |
|------|------|-----------|
| Daily | 2:00 AM UTC | 7 days |
| Weekly | Sun 3:00 AM UTC | 4 weeks |
| Monthly | 1st 4:00 AM UTC | Indefinite |
| Cleanup | Daily 5:00 AM UTC | Auto-removes old |

**No additional setup needed** - they run automatically!

---

## Cloud Backup Setup (Optional)

### AWS S3 (5 minutes additional)

1. Create S3 bucket:
```bash
aws s3api create-bucket --bucket expense-flow-backups
```

2. Create IAM user:
```bash
aws iam create-user --user-name expense-flow-backups
aws iam create-access-key --user-name expense-flow-backups
```

3. Update `.env`:
```bash
AWS_S3_ENABLED=true
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=expense-flow-backups
```

4. Test:
```bash
curl -X POST http://localhost:3000/api/backups/create \
  -H "Authorization: Bearer TOKEN"
# Should now show: "destination": ["local", "s3"]
```

### Google Cloud Storage (5 minutes additional)

1. Create bucket:
```bash
gsutil mb gs://expense-flow-backups-gcs
```

2. Create service account:
```bash
gcloud iam service-accounts create expense-flow-backups
gcloud iam service-accounts keys create gcs-key.json \
  --iam-account=expense-flow-backups@PROJECT.iam.gserviceaccount.com
```

3. Update `.env`:
```bash
GCS_ENABLED=true
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILE=./gcs-key.json
GCS_BUCKET=expense-flow-backups-gcs
```

4. Test same as AWS

---

## API Quick Reference

```bash
# Manual backup
POST /api/backups/create

# List backups
GET /api/backups

# View statistics
GET /api/backups/stats

# Verify backup integrity
POST /api/backups/:name/verify

# Restore from backup (admin only, requires confirmation)
POST /api/backups/:name/restore \
  -H "x-confirm-restore: RESTORE_CONFIRMED"

# Apply retention policy
POST /api/backups/apply-retention-policy

# Cleanup old backups
DELETE /api/backups/cleanup
```

---

## Monitoring Checklist

Daily checklist:
- [ ] Check backup logs: `cat ./backups/logs/backup.log`
- [ ] Monitor disk usage: `du -sh ./backups`
- [ ] Verify latest backup: `ls -la ./backups/local/ | tail -1`

Weekly checklist:
- [ ] Test backup verification
- [ ] Check storage statistics
- [ ] Review any error entries in logs

---

## Troubleshooting

### Backup not running
```bash
# Check server started correctly
npm start | grep "Backup scheduling"

# Check logs
cat ./backups/logs/backup.log

# Manual test
curl -X POST http://localhost:3000/api/backups/create
```

### Permission denied error
```bash
chmod 755 ./backups
chmod 777 ./backups/local
chmod 777 ./backups/logs
```

### S3 upload failing
```bash
# Verify credentials
aws s3 ls

# Check bucket exists
aws s3 ls s3://expense-flow-backups/
```

### Backup size too large
```bash
# Reduce retention period
curl -X DELETE http://localhost:3000/api/backups/cleanup \
  -H "Authorization: Bearer TOKEN" \
  -d '{"retentionDays": 3}'
```

---

## Need Help?

1. **Complete documentation**: [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md)
2. **Setup guide**: [BACKUP_SETUP.md](./BACKUP_SETUP.md)
3. **Implementation overview**: [SECURITY_IMPLEMENTATION.md](./SECURITY_IMPLEMENTATION.md)
4. **Test suite**: `npm test -- --testPathPattern=backupService`

---

## Success!

Your backup system is now running and will:

✅ Create daily backups at 2:00 AM UTC  
✅ Create weekly backups every Sunday at 3:00 AM UTC  
✅ Create monthly backups on the 1st at 4:00 AM UTC  
✅ Automatically clean up old backups daily at 5:00 AM UTC  
✅ Store locally with gzip compression (~80% reduction)  
✅ Verify integrity with SHA256 checksums  
✅ Support point-in-time recovery  
✅ Optionally backup to AWS S3 and Google Cloud Storage  

**Disaster recovery is now enabled and automated!**

---

**Next Steps**:
- [ ] Configure cloud backups (S3/GCS) if desired
- [ ] Set up backup monitoring/alerts
- [ ] Test a restore operation monthly
- [ ] Review [SECURITY_IMPLEMENTATION.md](./SECURITY_IMPLEMENTATION.md) for complete overview
