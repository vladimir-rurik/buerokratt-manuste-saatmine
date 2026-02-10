# Secure File Attachment Solution for Bürokratt

## Overview

This solution provides a comprehensive, secure, and scalable file attachment handling system specifically designed for the Bürokstack architecture. It implements enterprise-grade security features including virus scanning, file validation, S3-compatible storage, and seamless integration with Ruuter DSL workflows.

## Key Features

✅ **Security First**
- MIME type validation with magic number verification
- ClamAV virus scanning with quarantine
- Signed URLs for secure file access
- JWT authentication integration
- Role-based access control
- Comprehensive audit logging

✅ **Scalability**
- Horizontal pod autoscaling (2-10 replicas)
- Multipart upload for large files (>100MB)
- S3-compatible storage (MinIO/AWS/Azure)
- Async virus scanning queue
- Stateless service design

✅ **Bürokstack Integration**
- Ruuter DSL workflows for file operations
- S3-Ferry integration for storage abstraction
- TIM (TARA) authentication support
- OpenSearch audit logging
- PostgreSQL metadata storage

✅ **Production Ready**
- Kubernetes deployment manifests
- Custom Resource Definitions (FilePolicy, FileAttachment)
- Health checks and probes
- Resource limits and HPA
- Network policies and RBAC
- Comprehensive monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                     │
│              (Chat Widget, Backoffice GUI)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Ruuter Router                        │
│              (DSL: validate → scan → upload → store)        │
└────────┬────────────────────────────────────────┬───────────┘
         │                                        │
         ▼                                        ▼
┌──────────────────────┐              ┌──────────────────────┐
│   File Handler       │              │    S3-Ferry          │
│   - Validation       │              │    - Storage         │
│   - Virus Scan       │              │    - Abstraction     │
│   - Upload Logic     │              │    - Multipart       │
└────────┬─────────────┘              └──────────┬───────────┘
         │                                       │
         ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│      ClamAV          │              │   S3 Storage         │
│   - Virus Scanning   │              │   - MinIO/AWS/Azure  │
│   - Quarantine       │              │   - Lifecycle Policy │
└──────────────────────┘              └──────────────────────┘

         │
         ▼
┌──────────────────────┐
│   PostgreSQL         │
│   - File Metadata    │
│   - Audit Logs       │
└──────────────────────┘
```

## Quick Start

### Prerequisites

- Kubernetes cluster (v1.24+)
- kubectl configured
- Existing Bürokratt deployment (Ruuter, TIM, Resql, S3-Ferry)
- PostgreSQL database
- S3-compatible storage

### Installation

1. **Apply CRDs**
   ```bash
   kubectl apply -f crd/filepolicy.crd.yaml
   kubectl apply -f crd/fileattachment.crd.yaml
   ```

2. **Create Namespace**
   ```bash
   kubectl create namespace buerokratt-file-storage
   ```

3. **Deploy Components**
   ```bash
   # Deploy ClamAV
   kubectl apply -f k8s/deployment-clamav.yaml -n buerokratt-file-storage

   # Deploy File Handler
   kubectl apply -f k8s/ -n buerokratt-file-storage
   ```

4. **Deploy DSLs to Ruuter**
   ```bash
   kubectl cp DSL/ $(kubectl get pod -l app=ruuter -n buerokratt -o jsonpath='{.items[0].metadata.name}'):/DSL/
   ```

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.

## Usage

### Upload File via DSL

```yaml
# POST /files/upload (Ruuter DSL)
- content: |
    curl -X POST \
      http://ruuter.buerokratt.ee/files/upload \
      -H "Authorization: Bearer <jwt-token>" \
      -F "file=@document.pdf" \
      -F "chatId=chat-123"
```

### Validate File

```yaml
# POST /files/validate
- content: |
    curl -X POST \
      http://ruuter.buerokratt.ee/files/validate \
      -F "file=@document.pdf"
```

### Download File

```yaml
# GET /files/download?fileId=uuid
- content: |
    curl -X GET \
      http://ruuter.buerokratt.ee/files/download?fileId=<uuid> \
      -H "Authorization: Bearer <jwt-token>"
```

## Security Features

### File Validation
- **MIME Type Whitelist**: Only allowed types accepted
- **Magic Number Verification**: Binary signature checking
- **File Size Limits**: Configurable per category
- **Filename Sanitization**: Path traversal prevention

### Virus Scanning
- **ClamAV Integration**: Real-time scanning
- **Async Processing**: Non-blocking queue
- **Automatic Quarantine**: Infected files isolated
- **Scan Results**: Stored in database for audit

### Access Control
- **JWT Authentication**: Required for all operations
- **TIM Integration**: User identity verification
- **Signed URLs**: Time-limited access tokens (1 hour default)
- **Role-Based Access**: Different permissions per role

## Configuration

### File Policies

Use `FilePolicy` CRD to define security rules:

```yaml
apiVersion: storage.buerokratt.ee/v1alpha1
kind: FilePolicy
metadata:
  name: chat-attachments
spec:
  mimeTypeWhitelist:
    document:
      - application/pdf
      - application/msword
    image:
      - image/jpeg
      - image/png
  maxSize: "50MB"
  scanEnabled: true
  accessControl:
    requireAuthentication: true
    allowedRoles:
      - citizen
      - official
```

### Environment Variables

Configure via `k8s/configmap-file-handler.yaml`:

| Variable | Description | Default |
|----------|-------------|---------|
| S3_ENDPOINT_URL | S3 endpoint | http://minio:9000 |
| S3_DATA_BUCKET_NAME | Bucket name | buerokratt-files |
| MAX_FILE_SIZE | Max upload size | 500MB |
| CHUNK_SIZE | Multipart chunk size | 5MB |
| ENABLE_VIRUS_SCAN | Enable ClamAV | true |
| RATE_LIMIT_MAX | Requests per minute | 100 |

## Monitoring

### Health Check

```bash
curl http://file-handler:3000/health
```

Response:
```json
{
  "status": "healthy",
  "services": {
    "database": { "status": "up" },
    "clamav": { "status": "up", "version": "ClamAV 0.103.0" },
    "storage": { "status": "up", "accounts": ["s3-default"] }
  }
}
```

### Logs

```bash
# File Handler logs
kubectl logs -f -l app=file-handler -n buerokratt-file-storage

# ClamAV logs
kubectl logs -f -l app=clamav -n buerokratt-file-storage
```

## Documentation

- **[SOLUTION_ARCHITECTURE.md](SOLUTION_ARCHITECTURE.md)**: Complete architecture overview
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**: Step-by-step deployment instructions
- **[file-handler/README.md](file-handler/README.md)**: File Handler service documentation

## Standards and Protocols

### MIME Types Supported
- **Documents**: PDF, DOCX, DOC, ODT, RTF
- **Images**: JPG, PNG, GIF, WebP, SVG
- **Archives**: ZIP, TAR, GZ (with size limits)
- **Data**: JSON, XML, CSV

### S3 API Standards
- Multipart upload for files > 100MB
- Presigned URLs with AWS Signature V4
- Server-side encryption (SSE-S3/SSE-KMS)
- Lifecycle policies for automatic cleanup

### Security Standards
- TLS 1.3 for encryption in transit
- SHA-256 for file checksums
- GDPR compliance considerations
- ISO 27001 security best practices

## Compliance

### GDPR
- Data minimization (only required metadata)
- Right to deletion (file + metadata)
- Data portability (export functionality)
- Consent tracking

### Estonian Standards
- X-Road compatibility (optional)
- ID card integration (via TIM)
- Digital signature support

## Support and Troubleshooting

### Common Issues

1. **ClamAV Not Ready**: Check `kubectl get pods -l app=clamav`
2. **S3 Connection Failed**: Verify S3-Ferry accessibility
3. **Database Errors**: Check connection string and schema

### Debug Mode

Enable debug logging:
```bash
kubectl edit configmap file-handler-config
# Set: log-level: "debug"
kubectl rollout restart deployment/file-handler
```

## Examples

### Example 1: Upload Chat Attachment

```bash
curl -X POST \
  http://ruuter.buerokratt.ee/files/upload \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@invoice.pdf" \
  -F "chatId=chat-session-123"
```

Response:
```json
{
  "fileId": "uuid-1234-5678",
  "filename": "invoice.pdf",
  "size": 1048576,
  "mimeType": "application/pdf",
  "scanStatus": "clean",
  "uploadedAt": "2025-02-09T12:00:00Z",
  "message": "File uploaded successfully"
}
```

### Example 2: Create File Policy

```bash
kubectl apply -f - <<EOF
apiVersion: storage.buerokratt.ee/v1alpha1
kind: FilePolicy
metadata:
  name: strict-policy
spec:
  maxSize: "10MB"
  mimeTypeWhitelist:
    document:
      - application/pdf
  scanEnabled: true
  accessControl:
    allowedRoles:
      - official
EOF
```
