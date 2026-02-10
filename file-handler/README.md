# File Handler Service

Secure file attachment handling service for Bürokratt with validation, virus scanning, and S3-compatible storage.

## Features

- **File Validation**: MIME type verification, magic number checking, size limits
- **Virus Scanning**: ClamAV integration for malware detection
- **Secure Storage**: S3-compatible storage via S3-Ferry service
- **Multipart Upload**: Support for large files (>100MB)
- **Signed URLs**: Time-limited secure access tokens
- **Rate Limiting**: Per-user throttling (configurable)
- **Audit Logging**: Complete operation tracking
- **Kubernetes Ready**: Deployment manifests included

## Technology Stack

- **Framework**: NestJS with TypeScript
- **Storage**: AWS S3 SDK (via S3-Ferry)
- **Virus Scanning**: ClamAV
- **Database**: PostgreSQL
- **Documentation**: Swagger/OpenAPI

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- ClamAV (clamd)
- S3-compatible storage (MinIO/AWS S3/Azure Blob)
- S3-Ferry service

## Development

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Running Locally

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

### Linting

```bash
# Run linter
npm run lint

# Auto-fix issues
npm run lint:fix
```

## API Documentation

Once running, access Swagger documentation at:
```
http://localhost:3000/documentation
```

## API Endpoints

### Upload File
```http
POST /v1/files/upload
Content-Type: multipart/form-data

{
  "file": <binary>,
  "chatId": "optional-chat-id"
}
```

### Validate File (without upload)
```http
POST /v1/files/validate
Content-Type: multipart/form-data

{
  "file": <binary>
}
```

### Get File Metadata
```http
GET /v1/files/:fileId
Authorization: Bearer <jwt-token>
```

### Delete File
```http
DELETE /v1/files/:fileId
Authorization: Bearer <jwt-token>
```

### Health Check
```http
GET /v1/files/health
```

## Security Features

### File Validation
- MIME type whitelist
- Magic number verification
- File size limits
- Filename sanitization
- Path traversal prevention

### Virus Scanning
- ClamAV integration
- Async scanning queue
- Quarantine for infected files
- Scan result logging

### Access Control
- JWT authentication required
- User permission checks
- Signed URLs for downloads
- Audit logging for all operations

## Docker

### Build Image

```bash
docker build -t file-handler:latest .
```

### Run Container

```bash
docker run -p 3000:3000 \
  -e DB_HOST=postgres \
  -e CLAMAV_HOST=clamav \
  -e S3_FERRY_URL=http://s3-ferry:3000 \
  file-handler:latest
```

## Kubernetes Deployment

See `k8s/` directory for deployment manifests:

```bash
kubectl apply -f k8s/
```

## Environment Variables

See `.env.example` for all available configuration options.

## Monitoring

### Metrics
- Upload success rate
- Virus detection rate
- Storage utilization
- API response times

### Logging
- Structured JSON logs
- Correlation IDs
- Error tracking
- Audit trail

