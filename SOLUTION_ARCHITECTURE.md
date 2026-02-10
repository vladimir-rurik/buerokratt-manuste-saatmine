# Secure File Attachment Solution for Bürokratt

## Executive Summary

This document describes a comprehensive, secure file attachment handling solution designed specifically for the Bürokstack architecture using Ruuter DSL orchestration.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Application                          │
│                    (Chat Widget, Backoffice GUI)                    │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ HTTPS (multipart/form-data)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Ruuter Router                               │
│  (DSL: validate-file → scan-virus → upload-s3 → create-record)      │
└───────────────────┬───────────────────────────┬─────────────────────┘
                    │                           │
                    │                           │
        ┌───────────▼──────────┐   ┌────────────▼──────────────────┐
        │  File Handler Service│   │      S3-Ferry Service         │
        │  (Validation Logic)  │   │   (Storage Abstraction)       │
        └───────────┬──────────┘   └───────────┬───────────────────┘
                    │                          │
                    │                          │
        ┌───────────▼──────────┐   ┌───────────▼────────────────────┐
        │  ClamAV Scanner      │   │  S3-Compatible Storage         │
        │  (Virus Scanning)    │   │  (MinIO/AWS S3/Azure Blob)     │
        └──────────────────────┘   └────────────────────────────────┘

                    │
                    ▼
        ┌───────────────────────┐
        │  Resql Database       │
        │  (File Metadata)      │
        └───────────────────────┘
```

## Core Components

### 1. File Handler Service (`file-handler`)

**Purpose**: Central service for file validation, security checks, and upload orchestration.

**Technology Stack**:
- Node.js with NestJS (matches S3-Ferry architecture)
- TypeScript for type safety
- Multer for multipart upload handling
- ClamAV for virus scanning
- AWS S3 SDK for storage operations

**Key Features**:
- MIME type validation (whitelist-based)
- File size limits (configurable per file type)
- Virus scanning integration
- Chunked upload support for large files
- Signed URL generation for secure access
- Audit logging for all operations

### 2. Ruuter DSL Workflows

**DSL Files**:
- `POST/files/upload.yml` - Main upload workflow
- `POST/files/validate.yml` - Validation workflow
- `POST/files/scan.yml` - Virus scanning workflow
- `GET/files/download.yml` - Secure download with signed URLs
- `POST/files/delete.yml` - File deletion workflow

### 3. Storage Layer

**S3-Ferry Integration**:
- Reuses existing S3-Ferry service for multi-cloud compatibility
- Supports MinIO (on-premises), AWS S3, and Azure Blob Storage
- Implements S3 Lifecycle Policies for automatic cleanup
- Multipart upload for files > 100MB
- Server-side encryption (SSE-S3 or SSE-KMS)

### 4. Security Measures

#### 4.1 File Validation
- **MIME Type Whitelist**: Only allowed types accepted
- **Magic Number Verification**: Binary signature verification
- **File Size Limits**: Configurable per MIME type
- **Filename Sanitization**: Prevent path traversal attacks

#### 4.2 Virus Scanning
- **ClamAV Integration**: Open-source antivirus engine
- **Async Scanning**: Non-blocking scan queue
- **Quarantine**: Infected files isolated automatically
- **Scan Results**: Stored in database for audit

#### 4.3 Access Control
- **JWT Authentication**: Required for all operations
- **TIM Integration**: User identity verification
- **Signed URLs**: Time-limited access tokens
- **Role-Based Access**: Different permissions per user role

#### 4.4 Rate Limiting
- **Per-User Limits**: Prevent abuse
- **Flow Control**: Token bucket algorithm
- **IP-Based Throttling**: DDoS protection

## Standards and Protocols

### MIME Types
Supported file types with validation:
- Documents: `.pdf`, `.docx`, `.doc`, `.odt`, `.rtf`
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Archives: `.zip`, `.tar`, `.gz` (with size limits)
- Data: `.json`, `.xml`, `.csv`

### S3 API Standards
- **Multipart Upload**: For files > 100MB
- **Presigned URLs**: AWS Signature V4
- **Versioning**: Enabled for file history
- **Lifecycle Rules**: Automatic archive/delete

### File Size Limits
- Default: 50MB per file
- Max: 500MB (configurable)
- Chunk size: 5MB for multipart uploads

## Integration with Existing Architecture

### Ruuter DSL Integration

The solution follows Ruuter's DSL patterns:

```yaml
# File upload DSL example
declare:
  call: declare
  version: 1.0.0
  description: Upload file with validation and virus scanning
  method: post
  accepts: file
  returns: json
  namespace: files
  allowlist:
    body:
    - field: file
      type: file
      description: File to upload
    - field: chatId
      type: string
      description: Associated chat session ID

validate_file:
  call: http.post
  args:
    url: "[#FILE_HANDLER]/validate"
    # ... validation logic
  next: scan_file

scan_file:
  call: http.post
  args:
    url: "[#FILE_HANDLER]/scan"
    # ... virus scanning
  next: upload_to_s3

upload_to_s3:
  call: http.post
  args:
    url: "[#S3_FERRY]/v1/files/create"
    # ... upload logic
  next: create_record
```

### Database Schema (Resql)

```sql
CREATE TABLE file_attachments (
    id UUID PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    storage_account_id VARCHAR(100) NOT NULL,
    container VARCHAR(100) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    chat_id UUID REFERENCES chats(id),
    uploaded_by VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    scan_status VARCHAR(20) NOT NULL, -- pending, scanning, clean, infected
    scan_result TEXT,
    access_count INT DEFAULT 0,
    last_accessed_at TIMESTAMP,
    expires_at TIMESTAMP,
    signed_url_token VARCHAR(500),
    metadata JSONB
);

CREATE INDEX idx_file_attachments_chat_id ON file_attachments(chat_id);
CREATE INDEX idx_file_attachments_uploaded_by ON file_attachments(uploaded_by);
CREATE INDEX idx_file_attachments_scan_status ON file_attachments(scan_status);
```

## Deployment Architecture

### Kubernetes Components

1. **file-handler Deployment**:
   - Replicas: 3 (horizontal scaling)
   - Resources: CPU 500m, Memory 512Mi
   - Probes: Liveness and readiness

2. **clamav Deployment**:
   - DaemonSet for scanning
   - Freshclam sidecar for virus database updates

3. **Secrets**:
   - S3 credentials
   - JWT signing keys
   - Database credentials

4. **ConfigMaps**:
   - MIME type whitelist
   - File size limits
   - Rate limiting rules

## Security Best Practices

### 1. Defense in Depth
- Multiple validation layers
- Virus scanning at multiple stages
- Network isolation (private cluster communication)
- Secrets management with Kubernetes Secrets

### 2. Principle of Least Privilege
- Minimal S3 permissions (write-only for upload)
- Role-based access control
- Time-limited signed URLs

### 3. Audit and Monitoring
- All file operations logged
- Scan results tracked
- Access patterns monitored
- Alerts on suspicious activity

### 4. Data Protection
- Encryption in transit (TLS 1.3)
- Encryption at rest (S3 SSE)
- PII scanning with Presidio (optional)
- GDPR compliance considerations

## Performance Considerations

### Scalability
- Stateless file-handler service
- Horizontal pod autoscaling (2-10 replicas)
- S3 handles unlimited storage
- Async virus scanning queue

### Reliability
- Multipart upload with retry
- Circuit breaker for S3-Ferry
- Graceful degradation (scan queue full)
- Health checks and auto-restart

### Cost Optimization
- S3 lifecycle policies (move to Glacier after 90 days)
- Automatic cleanup of expired files
- Efficient chunk size (5MB)
- CDN caching for static assets

## Compliance and Standards

### ISO 27001
- Risk assessment for file handling
- Security policies documented
- Incident response procedures

### GDPR
- Data minimization (only required metadata)
- Right to deletion
- Data portability (export functionality)
- Consent tracking

### Estonian Information System Security
- X-Road compatibility (optional)
- Estonian ID card integration
- Digital signature support

## Testing Strategy

### Unit Tests
- MIME type validation
- File size checks
- Filename sanitization
- Signed URL generation

### Integration Tests
- S3-Ferry integration
- ClamAV scanning
- Ruuter DSL execution
- Database operations

### E2E Tests
- Full upload workflow
- Virus detection and quarantine
- Download with signed URLs
- Cleanup and expiration

## Monitoring and Observability

### Metrics
- Upload success rate
- Virus detection rate
- Storage utilization
- API response times

### Logging
- Structured JSON logs
- Correlation IDs (trace requests)
- Error tracking
- Audit trail

### Alerts
- High virus detection rate
- S3 upload failures
- Disk space low
- API errors > 5%
