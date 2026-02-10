# Põhjalikud vastused manuste haldamise küsimustele

## 1. Kuidas muuta manuste saatmine turvaliseks ja töökindlaks?

Turvaline ja töökindel manuste saatmine nõuab põhjalikku kaitset mitmetel kihtidel:

### Mitmekihiline turvalisus

**1. Kiht: Eelvalidatsioon**
- MIME tüübi kontroll lubatud loendi vastu
- Faili suuruse piirangud enne üleslaadimist
- Failinime puhastamine (kahtlate karakterite eemaldamine)
- Laienduse kontroll (vältida `.exe`, `.bat` jne)

**2. Kiht: Binaarne verifitseerimine**
- Maagiliste numbrite (magic numbers) kontroll
- Vältida MIME tüübi spooferimist (nt. pilt.exe → image.jpg)
- 4-8 baidi binaarse allkirja kontroll

**3. Kiht: Viiruseotsing**
- ClamAV integratsioon asünkroonsel järjekorras
- Skaneerimine on blokeerimatu (ei takista üleslaadimist)
- Nakatunud failid automaatses karantiinis
- Skaneerimistulemused salvestatakse andmebaasi

**4. Kiht: Juurdepääsu kontroll**
- JWT autentimine kõigis operatsioonides
- Rollipõhine autoriseerimine (citizen, official, admin)
- Allkirjastatud URL-id ajapiiranguga (vaikimisi 1 tund)
- IP-põhine kiiruspiirang (kuritarvitamise ennetus)

**5. Kiht: Krüptimine**
- TLS 1.3 ülekandel
- S3 serveripoolne krüptimine (SSE-S3 või SSE-KMS)
- SHA-256 kontrollsummad andmetervikus

### Töökindlus tagatud

**Asünkroonne töötlemine**
```yaml
# Ruuter DSL töövoog - blokeerimatu üleslaadimine
upload_flow:
  - validate_file     # Kiire, sünkroonne
  - queue_scan        # Asünkroonne, ei blokeeri
  - upload_to_s3       # Edasi töödelda
  - create_record      # Tagastab kasutajale kohe
  - background_scan    # Jookseb taustas
```

**Vastupanikvus**
- Multipart upload 100MB+ failidele (automaatne taaskäivitus)
- Katiku pooltaja (Circuit Breaker) S3-Ferry jaoks
- Graceful degradation (skaneerimisjärjekord täis → luba, logi hoiatus)
- Horisontaalne skaleerimine 2-10 replikani
- Podi häirelaksus (Pod Disruption Budget)

**Andmetervitus**
- Kontrollsummad (SHA-256) iga faili kohta
- S3 versioonimine (tagasivõtmine võimalik)
- Andmebaasi transaktsioonid (ACID garantiid)
- Auditilogid kõik operatsioonidest

## 2. Milliseid standardeid soovitate?

### Failiformingi standardid

**MIME tüübid (RFC 2045, RFC 2046)**
```typescript
// Lubatud MIME tüüpide kategooriad
const MIME_WHITELIST = {
  document: [
    'application/pdf',           // PDF (ISO 32000)
    'application/msword',        // Word < 2007
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX (ISO 29500)
    'application/vnd.oasis.opendocument.text', // ODT (ISO 26300)
    'text/plain'                // TXT
  ],
  image: [
    'image/jpeg',               // JPEG (ISO/IEC 10918)
    'image/png',                // PNG (ISO/IEC 15948)
    'image/gif',                // GIF (Compuserve)
    'image/webp',               // WebP (Google)
    'image/svg+xml'             // SVG (W3C)
  ],
  data: [
    'application/json',         // JSON (RFC 8259)
    'application/xml',          // XML (W3C)
    'text/csv'                  // CSV (RFC 4180)
  ]
};
```

**Maagilised numbrid (file command spec)**
```typescript
// Binaarsed allkirjad esimesed 4-8 baiti
const MAGIC_NUMBERS = {
  'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),             // JPEG
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),        // PNG
  'application/zip': Buffer.from([0x50, 0x4b, 0x03, 0x04]),  // ZIP
};
```

### Ülekande standardid

**Multipart Upload (RFC 7578)**
- `multipart/form-data` sisu tüüp
- Piirang: chunk size 5MB (optimeeritud võrgu jaoks)
- Maksimaalne faili suurus: 500MB (seadistatav)
- Parallel upload edastuse optimeerimineks

**S3 API (AWS Signature V4)**
- Presigned URL-id allalaadimiseks
- Serveripoolne krüptimine (SSE-S3)
- Elutsükli poliitikad (auto-archive Glacier 90 päev)
- Versioonimine lubatud (tagasivõtmine)

### Turvalisuse standardid

**Krüptimine**
- TLS 1.3 ülekandel (kohustuslik tootmises)
- SHA-256 kontrollsummad (FIPS 180-4)
- AES-256 krüptimine puhkeral (FIPS 197)

**Autentimise ja autoriseerimise standardid**
- JWT (RFC 7519) - TARA integratsioon
- OAuth 2.0 / OpenID Connect
- X-Road turvalisus (valikuline, Riigi Infokeskus)

**Andmekaitse**
- GDPR (EL 2016/679) - andminimeerimine, õigus unustamisele
- ISO 27001 - infoturve juhtimissüsteem
- ISKE (Eesti infosüsteemi turvalisuse standard)

## 3. Kuidas tagada failide valideerimine ja viiruskontroll?

### Süsteemne lähenemine valideerimisele

**Mitme kihi valideerimine**
```typescript
// 1. Kiht: Põhi kontrollid
function basicValidation(file: Express.Multer.File): ValidationResult {
  const errors = [];

  // Fail on olemas
  if (!file || !file.buffer) {
    errors.push('Fail puudub');
  }

  // Fail ei ole tühi
  if (file.size === 0) {
    errors.push('Fail on tühi');
  }

  // Faili suurus piirangutes
  const maxSize = getMaxSizeForType(file.mimetype);
  if (file.size > maxSize) {
    errors.push(`Fail ületab maksimaalset suurust ${formatBytes(maxSize)}`);
  }

  return { valid: errors.length === 0, errors };
}

// 2. Kiht: MIME tüübi kontroll
function validateMime(mimeType: string): boolean {
  const allowedMimes = Object.values(MIME_WHITELIST).flat();
  return allowedMimes.includes(mimeType);
}

// 3. Kiht: Maagiliste numbrite verifitseerimine
function validateMagicNumber(file: FileMetadata): ValidationResult {
  const magicNumber = MAGIC_NUMBERS[file.mimeType];

  if (!magicNumber) {
    return { valid: true, warnings: ['Magic number ei ole defineeritud'] };
  }

  if (file.buffer.length < magicNumber.length) {
    return { valid: false, errors: ['Fail on liiga lühike'] };
  }

  const fileHeader = file.buffer.subarray(0, magicNumber.length);

  if (!fileHeader.equals(magicNumber)) {
    return {
      valid: false,
      errors: ['Faili binaarne allkiri ei vasta MIME tüüpi'],
      warnings: ['Võimalik MIME tüübi spooferimine']
    };
  }

  return { valid: true };
}

// 4. Kiht: Failinime sanitiseerimine
function sanitizeFilename(filename: string): string {
  // Eemalda ohtlikud karakterid
  const cleanName = filename
    .replace(/[<>:"|?*\x00-\x1f]/g, '')      // Windows keelatud
    .replace(/\.\.[\\/]/g, '')                  // Rännaku ennetus
    .replace(/[^\w\s.-]/g, '_')                // Lubatud: a-z, A-Z, 0-9, _, ., -
    .replace(/\s+/g, '_')                       // Tühikud → alakriipsud
    .substring(0, 200);                        // Pikkuse piirang

  // Kontrolli Windowsi reserveeritud nimed
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  const nameWithoutExt = cleanName.replace(/\.[^.]+$/, '');

  if (reservedNames.test(nameWithoutExt)) {
    return `file_${cleanName}`;
  }

  return cleanName;
}
```

### Viiruseotsingu implementatsioon

**Asünkroonne skaneerimisjärjekord**
```typescript
@Injectable()
export class VirusScanningService {
  private scanQueue: Queue<ScanJob>;
  private clamav: ClamAV;

  async scanFile(fileId: string, buffer: Buffer): Promise<ScanResult> {
    const job: ScanJob = {
      fileId,
      buffer,
      queuedAt: new Date(),
    };

    // Järjekorda lisamine - ei blokeeri kasutajakogemust
    await this.scanQueue.add(job);

    // Tagasta kohe, skaneerimine toimub taustas
    return {
      status: 'pending',
      message: 'Fail on skaneerimisjärjekorras'
    };
  }

  @Process('scan-queue')
  private async processScanJob(job: ScanJob): Promise<void> {
    try {
      const result = await this.clamav.scanBuffer(job.buffer);

      if (result.isInfected) {
        // Karantiin - eemalda juurdepääs
        await this.quarantineFile(job.fileId);
        await this.notifyAdmins(job.fileId, result.viruses);
      }

      // Uuenda andmebaasi
      await this.updateScanStatus(job.fileId, result);

      // Auditilogi
      this.auditLog('scan_complete', job.fileId, result);

    } catch (error) {
      // Skaneerimise vead ei tohiks blokeerida teenust
      this.logger.error(`Scan failed: ${error.message}`);
      await this.updateScanStatus(job.fileId, {
        status: 'scan_failed',
        error: error.message
      });
    }
  }

  private async quarantineFile(fileId: string): Promise<void> {
    // Eemalda faili S3-st
    await this.s3Service.deleteFile(fileId);

    // Märki andmebaasis karantiinis
    await this.db.file_attachments.update({
      where: { id: fileId },
      data: {
        scan_status: 'infected',
        quarantined_at: new Date(),
        is_accessible: false
      }
    });
  }
}
```

**ClamAV integratsioon**
```typescript
@Injectable()
export class ClamavService implements OnModuleInit {
  private clamav: any;

  async onModuleInit() {
    try {
      this.clamav = await NodeClam.init({
        clamdscan: {
          host: this.configService.get('CLAMAV_HOST', 'clamav'),
          port: this.configService.get('CLAMAV_PORT', 3310),
          timeout: this.configService.get('CLAMAV_TIMEOUT', 60000),
        },
        clamscan: {
          path: '/usr/bin/clamscan',
          db: '/var/lib/clamav',
          scanRecursively: true,
        },
      });

      const isInitialized = await this.clamav.init();
      if (!isInitialized) {
        throw new Error('ClamAV initialization failed');
      }

      this.logger.log('ClamAV initialized successfully');
    } catch (error) {
      this.logger.error(`ClamAV init failed: ${error.message}`);
      // Don't throw - service degrades gracefully
    }
  }

  async scanBuffer(buffer: Buffer): Promise<ScanResult> {
    if (!this.clamav) {
      this.logger.warn('ClamAV not available, skipping scan');
      return { isInfected: false, viruses: [], skipped: true };
    }

    const result = await this.clamav.scanBuffer(buffer);

    return {
      isInfected: result.isInfected,
      viruses: result.viruses,
      scannedAt: new Date()
    };
  }
}
```

## 4. Kuidas lahendada manuste hoiustamine ja ligipääs turvaliselt?

### S3-põhine salvestus arhitektuur

```yaml
# Kubernetes Deployment - Failihandler
apiVersion: apps/v1
kind: Deployment
metadata:
  name: file-handler
  namespace: buerokratt-file-storage
spec:
  replicas: 3
  selector:
    matchLabels:
      app: file-handler
  template:
    metadata:
      labels:
        app: file-handler
        version: v1
    spec:
      containers:
      - name: file-handler
        image: ghcr.io/buerokratt/file-handler:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: S3_ENDPOINT_URL
          valueFrom:
            configMapKeyRef:
              name: file-handler-config
              key: s3-endpoint
        - name: S3_DATA_BUCKET_NAME
          valueFrom:
            configMapKeyRef:
              name: file-handler-config
              key: s3-bucket-name
        - name: S3_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: file-handler-secrets
              key: s3-access-key
        - name: S3_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: file-handler-secrets
              key: s3-secret-key
        - name: DB_HOST
          value: "postgres.buerokratt.svc.cluster.local"
        - name: DB_PORT
          value: "5432"
        - name: DB_NAME
          valueFrom:
            secretKeyRef:
              name: file-handler-secrets
              key: db-name
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: file-handler-secrets
              key: db-user
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: file-handler-secrets
              key: db-password
        - name: CLAMAV_HOST
          value: "clamav.buerokratt-file-storage.svc.cluster.local"
        - name: CLAMAV_PORT
          value: "3310"
        - name: ENABLE_VIRUS_SCAN
          value: "true"
        - name: MAX_FILE_SIZE
          value: "524288000"  # 500MB
        - name: CHUNK_SIZE
          value: "5242880"    # 5MB
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: file-handler-secrets
              key: jwt-secret
        - name: SIGNED_URL_EXPIRATION
          value: "3600"  # 1 tund
        resources:
          requests:
            cpu: "200m"
            memory: "256Mi"
          limits:
            cpu: "1000m"
            memory: "512Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
---
# Secret - S3 ja andmebaasi mandaad
apiVersion: v1
kind: Secret
metadata:
  name: file-handler-secrets
  namespace: buerokratt-file-storage
type: Opaque
stringData:
  s3-access-key: "AKIAIOSFODNN7EXAMPLE"
  s3-secret-key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  db-name: "buerokratt_files"
  db-user: "file_handler_user"
  db-password: "change-me-in-production"
  jwt-secret: "generate-256-bit-secret"
---
# Secret - SMTP (kui vajalik meili teavitused)
apiVersion: v1
kind: Secret
metadata:
  name: smtp-secrets
  namespace: buerokratt-file-storage
type: Opaque
stringData:
  smtp-host: "smtp.example.com"
  smtp-port: "587"
  smtp-user: "notifications@example.com"
  smtp-password: "change-me"
  smtp-from: "noreply@buerokratt.ee"
---
# ConfigMap - Seadistus
apiVersion: v1
kind: ConfigMap
metadata:
  name: file-handler-config
  namespace: buerokratt-file-storage
data:
  s3-endpoint: "http://minio.buerokratt.svc.cluster.local:9000"
  s3-bucket-name: "buerokratt-files"
  log-level: "info"
  max-file-size: "524288000"
  chunk-size: "5242880"
  signed-url-expiration: "3600"
  rate-limit-max: "100"
```

### Kubernetes CRD - Failipoliitika

```yaml
# FilePolicy CRD - Turvareeglite definitsioon
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: filepolicies.storage.buerokratt.ee
spec:
  group: storage.buerokratt.ee
  versions:
  - name: v1alpha1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              mimeTypeWhitelist:
                type: object
                additionalProperties:
                  type: array
                  items:
                    type: string
              maxSize:
                type: string
                pattern: '^[0-9]+(KB|MB|GB)$'
              scanEnabled:
                type: boolean
              accessControl:
                type: object
                properties:
                  requireAuthentication:
                    type: boolean
                  allowedRoles:
                    type: array
                    items:
                      type: string
              retention:
                type: object
                properties:
                  days:
                    type: integer
                  autoArchive:
                    type: boolean
  scope: Namespaced
  names:
    plural: filepolicies
    singular: filepolicy
    kind: FilePolicy
---
# Näide: Stiimid failipoliitika
apiVersion: storage.buerokratt.ee/v1alpha1
kind: FilePolicy
metadata:
  name: strict-document-policy
  namespace: buerokratt-file-storage
spec:
  mimeTypeWhitelist:
    document:
      - application/pdf
      - application/vnd.openxmlformats-officedocument.wordprocessingml.document
  maxSize: "10MB"
  scanEnabled: true
  accessControl:
    requireAuthentication: true
    allowedRoles:
      - citizen
      - official
      - admin
  retention:
    days: 365
    autoArchive: true
```

### Allkirjastatud URL-id generatsioon

```typescript
@Injectable()
export class SecureStorageService {
  constructor(
    @InjectS3() private readonly s3: S3Client,
    private configService: ConfigService,
  ) {}

  async generateSignedUrl(
    fileId: string,
    expirationSeconds: number = 3600
  ): Promise<string> {
    // Kontrolli juurdepääsu
    const file = await this.getFileMetadata(fileId);
    if (!file) {
      throw new NotFoundException('Fail ei leitud');
    }

    // Kontrolli, kas fail on puhas
    if (file.scan_status === 'infected') {
      throw new ForbiddenException('Fail on nakatunud');
    }

    // Kontrolli aegumist
    if (file.expires_at && new Date() > file.expires_at) {
      throw new GoneException('Fail on aegunud');
    }

    // Genereeri allkirjastatud URL
    const command = new GetObjectCommand({
      Bucket: this.configService.get('S3_DATA_BUCKET_NAME'),
      Key: file.storage_path,
    });

    const signedUrl = await getSignedUrl(this.s3, command, {
      expiresIn: expirationSeconds,
    });

    // Salvesta allkirja token auditi jaoks
    await this.auditLog('signed_url_generated', fileId, {
      expiration: new Date(Date.now() + expirationSeconds * 1000),
    });

    return signedUrl;
  }

  async uploadWithMultipart(
    file: FileMetadata,
    metadata: UploadMetadata
  ): Promise<UploadResult> {
    const chunkSize = parseInt(process.env.CHUNK_SIZE, 10);
    const totalChunks = Math.ceil(file.size / chunkSize);

    if (file.size > 100 * 1024 * 1024) {
      // Kasuta multipart upload suurtele failile (>100MB)
      return this.uploadMultipart(file, metadata, chunkSize);
    } else {
      // Tavaline upload väiksele failile
      return this.uploadSingle(file, metadata);
    }
  }

  private async uploadMultipart(
    file: FileMetadata,
    metadata: UploadMetadata,
    chunkSize: number
  ): Promise<UploadResult> {
    const multipartUpload = await this.s3.send(new CreateMultipartUploadCommand({
      Bucket: this.configService.get('S3_DATA_BUCKET_NAME'),
      Key: metadata.storagePath,
      Metadata: {
        originalFilename: file.originalName,
        mimeType: file.mimeType,
        uploadedBy: metadata.userId,
        checksum: metadata.checksum,
      },
      ServerSideEncryption: 'AES256', // SSE-S3
    }));

    const uploadPromises = [];
    const totalChunks = Math.ceil(file.size / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.buffer.subarray(start, end);

      uploadPromises.push(
        this.s3.send(new UploadPartCommand({
          Bucket: this.configService.get('S3_DATA_BUCKET_NAME'),
          Key: metadata.storagePath,
          UploadId: multipartUpload.UploadId,
          PartNumber: i + 1,
          Body: chunk,
        }))
      );
    }

    // Oota kõigi tükkide üleslaadimist
    const uploadedParts = await Promise.all(uploadPromises);

    // Lõpeta multipart upload
    const result = await this.s3.send(new CompleteMultipartUploadCommand({
      Bucket: this.configService.get('S3_DATA_BUCKET_NAME'),
      Key: metadata.storagePath,
      UploadId: multipartUpload.UploadId,
      MultipartUpload: {
        Parts: uploadedParts.map((part, index) => ({
          ETag: part.ETag,
          PartNumber: index + 1,
        })),
      },
    }));

    return {
      fileId: metadata.fileId,
      storagePath: metadata.storagePath,
      checksum: metadata.checksum,
      size: file.size,
      mimeType: file.mimeType,
      uploadedAt: new Date(),
    };
  }
}
```

### Võrgupoliitika turvalisus

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: file-handler-netpol
  namespace: buerokratt-file-storage
spec:
  podSelector:
    matchLabels:
      app: file-handler
  policyTypes:
  - Ingress
  - Egress
  ingress:
  # Luba liiklus Ruuterilt
  - from:
    - namespaceSelector:
        matchLabels:
          name: buerokratt
    - podSelector:
        matchLabels:
          app: ruuter
    ports:
    - protocol: TCP
      port: 3000
  egress:
  # Luba PostgreSQLiga
  - to:
    - namespaceSelector:
        matchLabels:
          name: buerokratt
      podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  # Luba ClamAV-ga
  - to:
    - podSelector:
        matchLabels:
          app: clamav
    ports:
    - protocol: TCP
      port: 3310
  # Luba S3-Ferryga
  - to:
    - namespaceSelector:
        matchLabels:
          name: buerokratt
      podSelector:
        matchLabels:
          app: s3-ferry
    ports:
    - protocol: TCP
      port: 3000
  # Luba DNS ja Kubernetes API
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

### Pod Disruption Budget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: file-handler-pdb
  namespace: buerokratt-file-storage
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: file-handler
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: file-handler-hpa
  namespace: buerokratt-file-storage
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: file-handler
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
      - type: Pods
        value: 2
        periodSeconds: 60
```

## Ruuteri DSL Integratsioon

```yaml
# POST /files/upload.yml
declare:
  call: declare
  version: 1.0.0
  description: Laadi fail üles valideerimise ja viiruseotsinguga
  method: post
  accepts: file
  returns: json
  namespace: files
  allowlist:
    body:
    - field: file
      type: file
      description: Fail üleslaadimiseks
    - field: chatId
      type: string
      description: Seotud vestluse ID

# 1. Kiire valideerimine (sünkroonne)
validate_file:
  call: http.post
  args:
    url: "[#FILE_HANDLER]/v1/files/validate"
    headers:
      Content-Type: multipart/form-data
    body:
      file: "[#file]"
  next: queue_scan
  output:
    validation: "[#response]"

# 2. Järjesta skaneerimine (asünkroonne)
queue_scan:
  call: http.post
  args:
    url: "[#FILE_HANDLER]/v1/files/scan"
    headers:
      Content-Type: multipart/form-data
    body:
      file: "[#file]"
  next: upload_storage
  output:
    scanResult: "[#response]"

# 3. Laadi S3-sse
upload_storage:
  call: http.post
  args:
    url: "[#S3_FERRY]/v1/files/create"
    body:
      files:
      - storageAccountId: "[#S3_ACCOUNT_ID]"
        container: "[#S3_BUCKET]"
        fileName: "[#validate:validation.storagePath]"
      content: "[#file:base64]"
  next: create_record
  output:
    upload: "[#response]"

# 4. Loo andmebaasikirje
create_record:
  call: database.query
  args:
    query: |
      INSERT INTO file_attachments (
        id,
        filename,
        original_filename,
        mime_type,
        size_bytes,
        storage_path,
        storage_account_id,
        container,
        checksum,
        chat_id,
        uploaded_by,
        scan_status,
        uploaded_at
      ) VALUES (
        gen_random_uuid(),
        "[#validate:validation.sanitizedFilename]",
        "[#file:originalName]",
        "[#file:mimeType]",
        "[#file:size]",
        "[#upload:storagePath]",
        "[#S3_ACCOUNT_ID]",
        "[#S3_BUCKET]",
        "[#validate:validation.checksum]",
        "[#chatId]",
        "[#userId]",
        CASE
          WHEN "[#scanResult:isInfected]"::boolean THEN 'infected'
          ELSE 'pending'
        END,
        NOW()
      )
      RETURNING *
  next: respond

# 5. Tagasta vastus
respond:
  call: respond.with
  args:
    body:
      fileId: "[#create_record:id]"
      filename: "[#create_record:filename]"
      storagePath: "[#create_record:storage_path]"
      size: "[#create_record:size_bytes]"
      mimeType: "[#create_record:mime_type]"
      scanStatus: "[#create_record:scan_status]"
      uploadedAt: "[#create_record:uploaded_at]"
      message: "Fail üles laaditud edukalt"
```
