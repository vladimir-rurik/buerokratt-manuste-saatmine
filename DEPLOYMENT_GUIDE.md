# File Attachment Solution - Deployment Guide

This guide provides step-by-step instructions for deploying the secure file attachment solution in Bürokratt.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Deployment](#deployment)
5. [Testing](#testing)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Components

- Kubernetes cluster (v1.24+)
- kubectl configured
- Helm 3.x
- PostgreSQL database (existing Bürokratt deployment)
- S3-compatible storage (MinIO/AWS S3/Azure Blob)
- Existing S3-Ferry deployment
- Existing TIM (identity management) deployment
- Existing Ruuter deployment

### Resource Requirements

- **File Handler**:
  - CPU: 200m - 1000m per pod
  - Memory: 256Mi - 512Mi per pod
  - Replicas: 3-10 (auto-scaling)

- **ClamAV**:
  - CPU: 500m - 2000m per pod
  - Memory: 512Mi - 2Gi per pod
  - Replicas: 1

- **Storage**: Depends on usage (recommended: 100GB+)

## Installation

### Step 1: Apply Custom Resource Definitions

```bash
# Apply FilePolicy CRD
kubectl apply -f crd/filepolicy.crd.yaml

# Apply FileAttachment CRD
kubectl apply -f crd/fileattachment.crd.yaml

# Verify CRDs are installed
kubectl get crd | grep storage.buerokratt.ee
```

### Step 2: Create Namespace

```bash
kubectl create namespace buerokratt-file-storage
```

### Step 3: Create Secrets

```bash
# Generate secure passwords
DB_PASSWORD=$(openssl rand -base64 32)
S3_SECRET_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)

# Create secret
kubectl create secret generic file-handler-secrets \
  --from-literal=db-name=byk \
  --from-literal=db-user=byk \
  --from-literal=db-password="$DB_PASSWORD" \
  --from-literal=s3-access-key=your-access-key \
  --from-literal=s3-secret-key="$S3_SECRET_KEY" \
  --from-literal=jwt-secret="$JWT_SECRET" \
  --namespace=buerokratt-file-storage
```

### Step 4: Apply Configuration

```bash
# Apply ConfigMap
kubectl apply -f k8s/configmap-file-handler.yaml \
  --namespace=buerokratt-file-storage

# Edit ConfigMap for your environment
kubectl edit configmap file-handler-config \
  --namespace=buerokratt-file-storage
```

### Step 5: Deploy ClamAV

```bash
kubectl apply -f k8s/deployment-clamav.yaml \
  --namespace=buerokratt-file-storage

# Wait for ClamAV to be ready
kubectl wait --for=condition=ready pod -l app=clamav \
  --namespace=buerokratt-file-storage --timeout=300s
```

### Step 6: Deploy File Handler

```bash
# Apply all file-handler resources
kubectl apply -f k8s/deployment-file-handler.yaml \
  --namespace=buerokratt-file-storage

kubectl apply -f k8s/service-file-handler.yaml \
  --namespace=buerokratt-file-storage

kubectl apply -f k8s/hpa-file-handler.yaml \
  --namespace=buerokratt-file-storage

kubectl apply -f k8s/poddisruptionbudget-file-handler.yaml \
  --namespace=buerokratt-file-storage

# Wait for deployment
kubectl wait --for=condition=available deployment/file-handler \
  --namespace=buerokratt-file-storage --timeout=300s
```

### Step 7: Apply Ingress (optional)

```bash
# Only if external access is needed
kubectl apply -f k8s/ingress-file-handler.yaml \
  --namespace=buerokratt-file-storage
```

### Step 8: Deploy DSL Files to Ruuter

```bash
# Copy DSL files to Ruuter's DSL directory
kubectl cp DSL/ \
  $(kubectl get pod -l app=ruuter -n buerokratt -o jsonpath='{.items[0].metadata.name}'):/DSL/ \
  --namespace=buerokratt

# Reload Ruuter DSLs
kubectl exec -n buerokratt \
  $(kubectl get pod -l app=ruuter -n buerokratt -o jsonpath='{.items[0].metadata.name}') \
  -- curl -X POST http://localhost:8080/reload-dsls
```

### Step 9: Apply File Policies

```bash
# Apply default file policies
kubectl apply -f crd/filepolicy-example.yaml \
  --namespace=buerokratt-file-storage

# Verify policies
kubectl get filepolicies --namespace=buerokratt-file-storage
```

### Step 10: Create Database Schema

```bash
# Connect to PostgreSQL
kubectl exec -n buerokratt \
  $(kubectl get pod -l app=postgres -n buerokratt -o jsonpath='{.items[0].metadata.name}') \
  -- psql -U byk -d byk

# Execute schema (from SOLUTION_ARCHITECTURE.md)
\i file-attachments-schema.sql
```

## Configuration

### Environment Variables

Edit the `k8s/configmap-file-handler.yaml` to configure:

- `s3-endpoint`: S3-compatible storage endpoint
- `s3-bucket-name`: Bucket name for file storage
- `max-file-size`: Maximum upload size
- `rate-limit-max`: Requests per minute limit

### File Policy Configuration

Apply custom `FilePolicy` resources to control:

- Allowed MIME types
- File size limits
- Virus scanning requirements
- Access control
- Retention policies

Example:

```bash
kubectl apply -f - <<EOF
apiVersion: storage.buerokratt.ee/v1alpha1
kind: FilePolicy
metadata:
  name: custom-policy
  namespace: buerokratt-file-storage
spec:
  mimeTypeWhitelist:
    document:
      - application/pdf
  maxSize: "10MB"
  scanEnabled: true
  accessControl:
    requireAuthentication: true
    allowedRoles:
      - official
EOF
```

## Deployment

### Verify Deployment

```bash
# Check all pods are running
kubectl get pods --namespace=buerokratt-file-storage

# Check services
kubectl get svc --namespace=buerokratt-file-storage

# Check HPA
kubectl get hpa --namespace=buerokratt-file-storage

# Check health
kubectl exec -n buerokratt-file-storage \
  $(kubectl get pod -l app=file-handler -o jsonpath='{.items[0].metadata.name}') \
  -- curl http://localhost:3000/health
```

### Expected Output

```
NAME                            READY   STATUS    RESTARTS   AGE
clamav-7d9f8b6c-xk2pq           1/1     Running   0          5m
file-handler-6c8d9b7f4-abc123   1/1     Running   0          3m
file-handler-6c8d9b7f4-def456   1/1     Running   0          3m
file-handler-6c8d9b7f4-ghi789   1/1     Running   0          3m
```

## Testing

### 1. Health Check

```bash
curl http://file-handler.buerokratt-file-storage.svc.cluster.local:3000/health
```

### 2. Upload File via Ruuter DSL

```bash
curl -X POST \
  http://ruuter.buerokratt.svc.cluster.local:8080/files/upload \
  -H "Authorization: Bearer <jwt-token>" \
  -F "file=@test-document.pdf" \
  -F "chatId=test-chat-123"
```

### 3. Validate File

```bash
curl -X POST \
  http://file-handler.buerokratt-file-storage.svc.cluster.local:3000/v1/files/validate \
  -F "file=@test-document.pdf"
```

### 4. Get File Metadata

```bash
curl -X GET \
  http://ruuter.buerokratt.svc.cluster.local:8080/files/download?fileId=<file-id> \
  -H "Authorization: Bearer <jwt-token>"
```

### 5. List File Attachments

```bash
kubectl get fileattachments --namespace=buerokratt-file-storage
```

## Monitoring

### Metrics

File Handler exposes metrics at `/metrics` (can be added with Prometheus adapter):

- Upload success rate
- Virus detection rate
- Storage utilization
- API response times

### Logging

```bash
# View file handler logs
kubectl logs -f -l app=file-handler --namespace=buerokratt-file-storage

# View ClamAV logs
kubectl logs -f -l app=clamav --namespace=buerokratt-file-storage
```

### Alerts

Configure Prometheus alerts for:

- High virus detection rate (> 5%)
- S3 upload failures (> 10% error rate)
- Low disk space (< 20% free)
- API latency > 5s (p95)

## Troubleshooting

### Common Issues

#### 1. ClamAV Not Ready

**Symptom**: File handler logs show "ClamAV not initialized"

**Solution**:
```bash
# Check ClamAV pod status
kubectl get pods -l app=clamav --namespace=buerokratt-file-storage

# Check ClamAV logs
kubectl logs -l app=clamav --namespace=buerokratt-file-storage

# Restart ClamAV
kubectl rollout restart deployment/clamav --namespace=buerokratt-file-storage
```

#### 2. S3 Connection Failed

**Symptom**: "Failed to create file" errors

**Solution**:
```bash
# Verify S3-Ferry is accessible
kubectl exec -n buerokratt-file-storage \
  $(kubectl get pod -l app=file-handler -o jsonpath='{.items[0].metadata.name}') \
  -- curl http://s3-ferry:3000/v1/storage-accounts

# Check S3 credentials
kubectl get secret file-handler-secrets \
  --namespace=buerokratt-file-storage \
  --template={{.data.s3-access-key}} | base64 -d
```

#### 3. Database Connection Errors

**Symptom**: "Failed to create file record"

**Solution**:
```bash
# Check database connectivity
kubectl exec -n buerokratt-file-storage \
  $(kubectl get pod -l app=file-handler -o jsonpath='{.items[0].metadata.name}') \
  -- pg_isready -h postgres.buerokratt.svc.cluster.local -p 5432

# Verify database schema
kubectl exec -n buerokratt postgres-0 \
  -- psql -U byk -d byk -c "\dt file_attachments"
```

#### 4. High Memory Usage

**Symptom**: Pods getting OOMKilled

**Solution**:
```bash
# Increase memory limits
kubectl edit deployment file-handler --namespace=buerokratt-file-storage

# Or scale up replicas
kubectl scale deployment file-handler --replicas=5 --namespace=buerokratt-file-storage
```

### Debug Mode

Enable debug logging:

```bash
kubectl edit configmap file-handler-config --namespace=buerokratt-file-storage

# Set: log-level: "debug"

# Restart pods
kubectl rollout restart deployment/file-handler --namespace=buerokratt-file-storage
```

## Security Considerations

### Production Checklist

- [ ] Change all default passwords
- [ ] Enable TLS for all services
- [ ] Configure network policies
- [ ] Enable pod security policies
- [ ] Set up RBAC correctly
- [ ] Enable audit logging
- [ ] Configure backup strategy
- [ ] Set up disaster recovery
- [ ] Regular security updates

### Network Policies

Apply network policies to restrict traffic:

```bash
kubectl apply -f k8s/network-policy.yaml
```

## Backup and Recovery

### Database Backup

```bash
# Backup file attachments metadata
kubectl exec -n buerokratt postgres-0 -- \
  pg_dump -U byk -d byk -t file_attachments > file_attachments_backup.sql
```

### Storage Backup

Configure S3 versioning and lifecycle policies for automatic backup.

## Upgrades

### Rolling Upgrade

```bash
# Update image
kubectl set image deployment/file-handler \
  file-handler=ghcr.io/buerokratt/file-handler:1.1.0 \
  --namespace=buerokratt-file-storage

# Monitor rollout
kubectl rollout status deployment/file-handler --namespace=buerokratt-file-storage
```

### Rollback

```bash
kubectl rollout undo deployment/file-handler --namespace=buerokratt-file-storage
```

## Support

For issues or questions:

1. Check logs: `kubectl logs -l app=file-handler --namespace=buerokratt-file-storage`
2. Check health: `kubectl get pods --namespace=buerokratt-file-storage`
3. Review this guide
4. Check SOLUTION_ARCHITECTURE.md for design details

## Appendix

### A. Complete File List

```
File-Storage/
├── SOLUTION_ARCHITECTURE.md          # Architecture documentation
├── DEPLOYMENT_GUIDE.md               # This file
├── README.md                         # Project overview
├── file-handler/                     # File Handler service
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   └── modules/
│   │       ├── files/
│   │       ├── clamav/
│   │       ├── storage/
│   │       ├── database/
│   │       └── health/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env.example
├── DSL/                              # Ruuter DSL workflows
│   ├── POST/
│   │   └── files/
│   │       ├── upload.yml
│   │       ├── validate.yml
│   │       └── delete.yml
│   └── GET/
│       └── files/
│           └── download.yml
├── k8s/                              # Kubernetes manifests
│   ├── deployment-file-handler.yaml
│   ├── service-file-handler.yaml
│   ├── deployment-clamav.yaml
│   ├── configmap-file-handler.yaml
│   ├── secret-file-handler.yaml
│   ├── hpa-file-handler.yaml
│   ├── poddisruptionbudget-file-handler.yaml
│   └── ingress-file-handler.yaml
└── crd/                              # Custom Resources
    ├── filepolicy.crd.yaml
    ├── filepolicy-example.yaml
    ├── fileattachment.crd.yaml
    └── fileattachment-example.yaml
```

### B. Port Reference

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| file-handler | 3000 | HTTP | API endpoint |
| clamav | 3310 | TCP | Virus scanning |
| postgres | 5432 | TCP | Database |
| s3-ferry | 3000 | HTTP | Storage service |
| ruuter | 8080 | HTTP | DSL router |

### C. Default Resource Limits

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| file-handler | 200m | 1000m | 256Mi | 512Mi |
| clamav | 500m | 2000m | 512Mi | 2Gi |

