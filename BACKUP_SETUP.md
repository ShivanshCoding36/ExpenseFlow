# Backup System Setup & Configuration Guide
## Issue #462: Automated Backup for Financial Data

This guide provides step-by-step instructions for configuring and deploying the automated backup system.

## Table of Contents
1. [Quick Start](#quick-start)
2. [Local Backup Setup](#local-backup-setup)
3. [AWS S3 Configuration](#aws-s3-configuration)
4. [Google Cloud Storage Setup](#google-cloud-storage-setup)
5. [Docker Deployment](#docker-deployment)
6. [Monitoring & Alerts](#monitoring--alerts)
7. [Troubleshooting](#troubleshooting)

## Quick Start

### 1. Install Dependencies

The backup system requires `node-cron` for scheduling. Verify it's installed:

```bash
npm install node-cron --save
```

### 2. Create Backup Directory

```bash
mkdir -p ./backups/{local,logs,integrity}
chmod 755 ./backups
```

### 3. Set Environment Variables

Create or update `.env`:

```bash
# Backup Configuration
BACKUP_DIR=./backups
BACKUP_DESTINATIONS=local,s3  # Options: local, s3, gcs

# Local Storage
BACKUP_LOCAL_ENABLED=true
BACKUP_LOCAL_RETENTION_DAYS=7

# For AWS S3 (optional)
AWS_S3_ENABLED=false
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-expense-flow-backups

# For Google Cloud Storage (optional)
GCS_ENABLED=false
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILE=/path/to/service-account-key.json
GCS_BUCKET=your-gcs-bucket
```

### 4. Start the Application

```bash
npm start
```

You should see backup scheduling messages:
```
✓ Backup scheduling initialized successfully
  - Daily backups: 2:00 AM UTC
  - Weekly backups: Sundays 3:00 AM UTC
  - Monthly backups: 1st of month 4:00 AM UTC
  - Cleanup: Daily 5:00 AM UTC
```

## Local Backup Setup

### Basic Configuration

```env
BACKUP_DIR=./backups
BACKUP_LOCAL_ENABLED=true
```

### Directory Structure

```
./backups/
├── local/                    # Backup files
│   ├── backup-2024-01-15-020000.json.gz
│   ├── backup-2024-01-15-020000.meta.json
│   └── ...
├── logs/                     # Operation logs
│   ├── backup.log
│   ├── restore.log
│   └── scheduler.log
└── integrity/                # Integrity checks
    ├── checksums.json
    └── ...
```

### Storage Requirements

- **Typical backup size**: 200-400 MB (raw), ~40-80 MB (compressed)
- **Retention policy**:
  - Daily: 7 backups × 80 MB = 560 MB
  - Weekly: 4 backups × 80 MB = 320 MB
  - Monthly: 12 backups × 80 MB = 960 MB
- **Total monthly estimate**: ~1.8 GB

### Optimization Tips

1. **Mount fast storage**:
   ```bash
   # Use SSD for better performance
   mount /dev/ssd1 /backups
   ```

2. **Set up automatic cleanup**:
   - Configured by default (5:00 AM UTC daily)
   - Manual cleanup: `curl -X DELETE /api/backups/cleanup`

3. **Monitor disk usage**:
   ```bash
   df -h ./backups
   du -sh ./backups
   ```

## AWS S3 Configuration

### 1. Create S3 Bucket

```bash
aws s3api create-bucket \
  --bucket expense-flow-backups \
  --region us-east-1
```

### 2. Create IAM User for Backups

```bash
# Create user
aws iam create-user --user-name expense-flow-backups

# Create access key
aws iam create-access-key --user-name expense-flow-backups
```

Note: Save the access key ID and secret key.

### 3. Attach S3 Policy

Create `s3-backup-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::expense-flow-backups",
        "arn:aws:s3:::expense-flow-backups/*"
      ]
    }
  ]
}
```

Attach policy:

```bash
aws iam put-user-policy \
  --user-name expense-flow-backups \
  --policy-name S3BackupPolicy \
  --policy-document file://s3-backup-policy.json
```

### 4. Configure Environment Variables

```env
AWS_S3_ENABLED=true
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
AWS_S3_BUCKET=expense-flow-backups
```

### 5. Test S3 Connection

```bash
# Verify S3 access
aws s3 ls s3://expense-flow-backups/

# Trigger test backup
curl -X POST http://localhost:3000/api/backups/create \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### 6. S3 Lifecycle Policy (Optional)

Set up automatic archival to Glacier:

```json
{
  "Rules": [
    {
      "Id": "ArchiveOldBackups",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```

Apply:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket expense-flow-backups \
  --lifecycle-configuration file://lifecycle.json
```

## Google Cloud Storage Setup

### 1. Create GCS Bucket

```bash
gsutil mb gs://expense-flow-backups-gcs
```

### 2. Create Service Account

```bash
gcloud iam service-accounts create expense-flow-backups \
  --display-name="ExpenseFlow Backup Service"

# Get project ID
export PROJECT_ID=$(gcloud config get-value project)
```

### 3. Grant Permissions

```bash
gsutil iam ch \
  serviceAccount:expense-flow-backups@${PROJECT_ID}.iam.gserviceaccount.com:objectAdmin \
  gs://expense-flow-backups-gcs
```

### 4. Create Service Account Key

```bash
gcloud iam service-accounts keys create ./gcs-key.json \
  --iam-account=expense-flow-backups@${PROJECT_ID}.iam.gserviceaccount.com
```

### 5. Configure Environment Variables

```env
GCS_ENABLED=true
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILE=/path/to/gcs-key.json
GCS_BUCKET=expense-flow-backups-gcs
```

### 6. Test GCS Connection

```bash
# Verify GCS access
gsutil ls -h gs://expense-flow-backups-gcs/

# Trigger test backup
curl -X POST http://localhost:3000/api/backups/create \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

## Docker Deployment

### 1. Update Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy application files
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Create backup directory
RUN mkdir -p ./backups/{local,logs,integrity}

# Set backup permissions
RUN chmod 755 ./backups

# Expose port
EXPOSE 3000

# Volume for backups
VOLUME ["/app/backups"]

CMD ["npm", "start"]
```

### 2. Update docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/expenseflow
      - BACKUP_DIR=/app/backups
      - BACKUP_LOCAL_ENABLED=true
      - AWS_S3_ENABLED=true
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_REGION=us-east-1
      - AWS_S3_BUCKET=expense-flow-backups
    volumes:
      - ./backups:/app/backups
      - ./uploads:/app/uploads
    depends_on:
      - mongo
    networks:
      - expense-network

  mongo:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    networks:
      - expense-network

volumes:
  mongo_data:

networks:
  expense-network:
```

### 3. Deploy with Docker Compose

```bash
# Start services
docker-compose up -d

# Verify backup service is running
docker-compose logs app | grep "Backup scheduling"

# Manual backup test
docker-compose exec app npm test -- --testPathPattern=backup
```

## Monitoring & Alerts

### 1. Log Monitoring

```bash
# Watch backup logs in real-time
tail -f ./backups/logs/backup.log

# Check backup status
grep "success" ./backups/logs/backup.log | wc -l
grep "failed" ./backups/logs/backup.log
```

### 2. Health Check Endpoint (Optional)

Add this to your monitoring:

```bash
curl http://localhost:3000/api/backups/stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### 3. Set Up CloudWatch Alarms (AWS)

```bash
# Create alarm for S3 upload failures
aws cloudwatch put-metric-alarm \
  --alarm-name backup-upload-failures \
  --alarm-description "Alert when backup upload fails" \
  --metric-name UploadFailures \
  --namespace ExpenseFlow/Backup \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold
```

### 4. Email Notifications (Optional)

Add SNS integration to backupService.js:

```javascript
const AWS = require('aws-sdk');
const sns = new AWS.SNS();

async function notifyBackupStatus(status, error = null) {
  await sns.publish({
    TopicArn: process.env.SNS_TOPIC_ARN,
    Subject: `Backup Status: ${status}`,
    Message: error ? `Backup failed: ${error}` : 'Backup completed successfully'
  }).promise();
}
```

### 5. Datadog Integration (Optional)

```javascript
const StatsD = require('node-statsd').StatsD;
const dogstatsd = new StatsD();

// Log backup metrics
dogstatsd.histogram('backup.duration', duration);
dogstatsd.gauge('backup.size', size);
dogstatsd.increment(`backup.${status}`);
```

## Troubleshooting

### Issue: "Cannot find module 'node-cron'"

**Solution**:
```bash
npm install node-cron --save
npm ci --production
```

### Issue: Backup directory permission denied

**Solution**:
```bash
# Fix permissions
sudo chown -R $USER:$USER ./backups
chmod -R 755 ./backups

# In Docker
RUN chmod 755 ./backups
```

### Issue: S3 upload fails with "Access Denied"

**Solution**:
1. Verify IAM policy is attached
2. Check AWS credentials in environment
3. Verify S3 bucket name is correct
4. Check bucket region matches AWS_REGION

```bash
aws s3api head-bucket --bucket expense-flow-backups --region us-east-1
```

### Issue: GCS upload fails with "Not Found"

**Solution**:
1. Verify bucket exists
2. Check service account key file path
3. Verify service account has permissions
4. Check project ID is correct

```bash
gsutil ls gs://expense-flow-backups-gcs/
```

### Issue: Backup file corrupted

**Solution**:
1. Verify backup integrity
2. Check disk space during backup
3. Review application logs for errors
4. Try restoring from previous backup

```bash
# Check integrity
curl -X POST http://localhost:3000/api/backups/backup-name/verify \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Issue: High memory usage during backup

**Solution**:
1. Increase Node.js heap size:
   ```bash
   NODE_OPTIONS="--max_old_space_size=4096" npm start
   ```

2. Reduce collection size (archive old data)
3. Enable incremental backups (future feature)

### Issue: Cron jobs not running

**Solution**:
1. Verify cron is initialized after DB connection
2. Check server logs for initialization messages
3. Ensure MongoDB is connected
4. Verify timezone configuration

```bash
# Check if cron jobs are scheduled
docker-compose logs app | grep "Backup scheduling"
```

## Performance Tuning

### 1. Optimize Backup Timing

Adjust backup times in server.js based on your timezone:

```javascript
// Change UTC times to your timezone
cron.schedule('0 2 * * *', ..., { timezone: 'America/New_York' });
```

### 2. Parallel Backups

For multiple environments, stagger backup times:

```
Environment 1: 2:00 AM UTC (Daily)
Environment 2: 3:30 AM UTC (Daily)
Environment 3: 5:00 AM UTC (Daily)
```

### 3. Compression Level

Adjust gzip compression (trade off speed vs size):

```javascript
// In backupService.js
const gzipOptions = { level: 6 }; // 0-9, default 6
```

### 4. Network Optimization

For cloud uploads:
- Use CloudFront for caching
- Enable multipart upload for large files
- Implement connection pooling

## Security Hardening

### 1. Backup Encryption

All cloud destinations support encryption:
- **S3**: Server-side encryption with AES-256 (enabled by default)
- **GCS**: Customer-managed encryption keys (CMEK)
- **Local**: Consider full-disk encryption

### 2. Access Control

Restrict backup API access:

```javascript
// In backupRoutes middleware
router.use((req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
});
```

### 3. Credential Management

Use AWS Secrets Manager or GCP Secret Manager:

```bash
# Store credentials securely
aws secretsmanager create-secret --name expenseflow/backup \
  --secret-string file://credentials.json
```

### 4. Audit Logging

Enable CloudTrail for S3 operations:

```bash
aws cloudtrail create-trail --name backup-trail \
  --s3-bucket-name expense-flow-backups-audit
```

## Compliance & Regulatory

### GDPR Compliance

- Backups contain PII, ensure encryption
- Implement right to deletion (retention policies)
- Document data processing in privacy policy
- Enable audit logging

### SOC 2 Compliance

- Maintain backup audit logs
- Implement access controls
- Test restores regularly
- Document disaster recovery procedures

## Related Documentation

- [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md) - Complete feature documentation
- [SETUP_AND_SECURITY.md](./SETUP_AND_SECURITY.md) - Security configuration
- [INPUT_VALIDATION.md](./INPUT_VALIDATION.md) - Data validation (relates to backup integrity)
- [RATE_LIMITING.md](./RATE_LIMITING.md) - API protection (relates to backup endpoints)

## Support

For issues or questions:
1. Check logs: `./backups/logs/`
2. Review documentation: [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md)
3. Test connection: `curl /api/backups/stats`
4. Run test suite: `npm test -- --testPathPattern=backup`

---

**Last Updated**: 2024-01-15
**Status**: Production Ready
**Version**: 1.0.0
