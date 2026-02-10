# Manuste lahenduse juurutamisjuhis

See juhis pakub samm-sammulised juhised turvalise manuste lahenduse juurutamiseks Bürokrattis.

## Sisukord

1. [Eeltingimused](#eeltingimused)
2. [Paigaldamine](#paigaldamine)
3. [Seadistamine](#seadistamine)
4. [Juurutamine](#juurutamine)
5. [Testimine](#testimine)
6. [Monitooring](#monitooring)
7. [Probleemide lahendamine](#probleemide-lahendamine)

## Eeltingimused

### Vajalikud komponendid

- Kubernetesi klaster (v1.24+)
- kubectl seadistatud
- Helm 3.x
- PostgreSQLi andmebaas (olemasolev Bürokratti juurutamine)
- S3-ühilduv salvestus (MinIO/AWS S3/Azure Blob)
- Olemasolev S3-Ferry juurutamine
- Olemasolev TIM (identiteedihaldus) juurutamine
- Olemasolev Ruuteri juurutamine

### Ressursinõuded

- **Failihandler**:
  - CPU: 200m - 1000m podi kohta
  - Mälu: 256Mi - 512Mi podi kohta
  - Replikad: 3-10 (automaatne skaleerimine)

- **ClamAV**:
  - CPU: 500m - 2000m podi kohta
  - Mälu: 512Mi - 2Gi podi kohta
  - Replikad: 1

- **Salvestus**: Sõltub kasutusest (soovitatav: 100GB+)

## Paigaldamine

### 1. samm: Rakenda kohandatud ressursi definitsioonid

```bash
# Rakenda FilePolicy CRD
kubectl apply -f crd/filepolicy.crd.yaml

# Rakenda FileAttachment CRD
kubectl apply -f crd/fileattachment.crd.yaml

# Kinnita, et CRD-d on paigaldatud
kubectl get crd | grep storage.buerokratt.ee
```

### 2. samm: Loo nimeruum

```bash
kubectl create namespace buerokratt-file-storage
```

### 3. samm: Loo saladused

```bash
# Genereeri turvalised paroolid
DB_PASSWORD=$(openssl rand -base64 32)
S3_SECRET_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)

# Loo salajane võti
kubectl create secret generic file-handler-secrets \
  --from-literal=db-name=byk \
  --from-literal=db-user=byk \
  --from-literal=db-password="$DB_PASSWORD" \
  --from-literal=s3-access-key=your-access-key \
  --from-literal=s3-secret-key="$S3_SECRET_KEY" \
  --from-literal=jwt-secret="$JWT_SECRET" \
  --namespace=buerokratt-file-storage
```

### 4. samm: Rakenda konfiguratsioon

```bash
# Rakenda ConfigMap
kubectl apply -f k8s/configmap-file-handler.yaml \
  --namespace=buerokratt-file-storage

# Redigeeri ConfigMap oma keskkonna jaoks
kubectl edit configmap file-handler-config \
  --namespace=buerokratt-file-storage
```

### 5. samm: Juuruta ClamAV

```bash
kubectl apply -f k8s/deployment-clamav.yaml \
  --namespace=buerokratt-file-storage

# Oota, kuni ClamAV on valmis
kubectl wait --for=condition=ready pod -l app=clamav \
  --namespace=buerokratt-file-storage --timeout=300s
```

### 6. samm: Juuruta Failihandler

```bash
# Rakenda kõik failihandleri ressursid
kubectl apply -f k8s/deployment-file-handler.yaml \
  --namespace=buerokratt-file-storage

kubectl apply -f k8s/service-file-handler.yaml \
  --namespace=buerokratt-file-storage

kubectl apply -f k8s/hpa-file-handler.yaml \
  --namespace=buerokratt-file-storage

kubectl apply -f k8s/poddisruptionbudget-file-handler.yaml \
  --namespace=buerokratt-file-storage

# Oota juurutamist
kubectl wait --for=condition=available deployment/file-handler \
  --namespace=buerokratt-file-storage --timeout=300s
```

### 7. samm: Rakenda Ingress (valikuline)

```bash
# Ainult juhul, kui väline juurdepääs on vajalik
kubectl apply -f k8s/ingress-file-handler.yaml \
  --namespace=buerokratt-file-storage
```

### 8. samm: Juuruta DSL failid Ruuterisse

```bash
# Kopeeri DSL failid Ruuteri DSL kataloogi
kubectl cp DSL/ \
  $(kubectl get pod -l app=ruuter -n buerokratt -o jsonpath='{.items[0].metadata.name}'):/DSL/ \
  --namespace=buerokratt

# Laadi Ruuteri DSL-id uuesti
kubectl exec -n buerokratt \
  $(kubectl get pod -l app=ruuter -n buerokratt -o jsonpath='{.items[0].metadata.name}') \
  -- curl -X POST http://localhost:8080/reload-dsls
```

### 9. samm: Rakenda failipoliitikad

```bash
# Rakenda vaikimisi failipoliitikad
kubectl apply -f crd/filepolicy-example.yaml \
  --namespace=buerokratt-file-storage

# Kontrolli poliitikaid
kubectl get filepolicies --namespace=buerokratt-file-storage
```

### 10. samm: Loo andmebaasi skeem

```bash
# Ühendu PostgreSQLiga
kubectl exec -n buerokratt \
  $(kubectl get pod -l app=postgres -n buerokratt -o jsonpath='{.items[0].metadata.name}') \
  -- psql -U byk -d byk

# Käivita skeem (SOLUTION_ARCHITECTURE.md failist)
\i file-attachments-schema.sql
```

## Seadistamine

### Keskkonnamuutujad

Redigeeri `k8s/configmap-file-handler.yaml` seadistamiseks:

- `s3-endpoint`: S3-ühilduva salvestuse otspunkt
- `s3-bucket-name`: Ämberi nimi faili salvestamiseks
- `max-file-size`: Maksimaalne üleslaadimise suurus
- `rate-limit-max`: Päringute piir minutis

### Failipoliitika seadistamine

Rakenda kohandatud `FilePolicy` ressursid kontrollimaks:

- Lubatud MIME tüübid
- Faili suuruse piirangud
- Viiruseotsingu nõuded
- Juurdepääsu kontroll
- Säilituspoliitikad

Näide:

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

## Juurutamine

### Kontrolli juurutamist

```bash
# Kontrolli, kas kõik podid töötavad
kubectl get pods --namespace=buerokratt-file-storage

# Kontrolli teenuseid
kubectl get svc --namespace=buerokratt-file-storage

# Kontrolli HPA-d
kubectl get hpa --namespace=buerokratt-file-storage

# Kontrolli tervist
kubectl exec -n buerokratt-file-storage \
  $(kubectl get pod -l app=file-handler -o jsonpath='{.items[0].metadata.name}') \
  -- curl http://localhost:3000/health
```

### Oodatav väljund

```
NAME                            READY   STATUS    RESTARTS   AGE
clamav-7d9f8b6c-xk2pq           1/1     Running   0          5m
file-handler-6c8d9b7f4-abc123   1/1     Running   0          3m
file-handler-6c8d9b7f4-def456   1/1     Running   0          3m
file-handler-6c8d9b7f4-ghi789   1/1     Running   0          3m
```

## Testimine

### 1. Tervisekontroll

```bash
curl http://file-handler.buerokratt-file-storage.svc.cluster.local:3000/health
```

### 2. Laadi fail üles Ruuteri DSL-i kaudu

```bash
curl -X POST \
  http://ruuter.buerokratt.svc.cluster.local:8080/files/upload \
  -H "Authorization: Bearer <jwt-loot>" \
  -F "file=@test-document.pdf" \
  -F "chatId=test-chat-123"
```

### 3. Valideeri fail

```bash
curl -X POST \
  http://file-handler.buerokratt-file-storage.svc.cluster.local:3000/v1/files/validate \
  -F "file=@test-document.pdf"
```

### 4. Hanki faili metaandmed

```bash
curl -X GET \
  http://ruuter.buerokratt.svc.cluster.local:8080/files/download?fileId=<file-id> \
  -H "Authorization: Bearer <jwt-loot>"
```

### 5. Loetle manused

```bash
kubectl get fileattachments --namespace=buerokratt-file-storage
```

## Monitooring

### Metrikad

Failihandler pakub meetrikaid `/metrics` otspunktis (saab lisada Prometheusi adapteriga):

- Üleslaadimise edukus
- Viiruse tuvastamise määr
- Salvestusruumi kasutus
- API reaktsiooniahel

### Logimine

```bash
# Vaata failihandleri logisid
kubectl logs -f -l app=file-handler --namespace=buerokratt-file-storage

# Vaata ClamAVi logisid
kubectl logs -f -l app=clamav --namespace=buerokratt-file-storage
```

### Häired

Seadistake Prometheusi häired:

- Kõrge viiruse tuvastamise määr (> 5%)
- S3 üleslaadimise ebaõnnestumised (> 10% veamäär)
- Vähe kettaruumi (< 20% vaba)
- API latentsus > 5s (p95)

## Probleemide lahendamine

### Levinud probleemid

#### 1. ClamAV ei ole valmis

**Sümptom**: Failihandleri logid näitavad "ClamAV not initialized"

**Lahendus**:
```bash
# Kontrolli ClamAV podi olekut
kubectl get pods -l app=clamav --namespace=buerokratt-file-storage

# Kontrolli ClamAVi logisid
kubectl logs -l app=clamav --namespace=buerokratt-file-storage

# Taaskäivita ClamAV
kubectl rollout restart deployment/clamav --namespace=buerokratt-file-storage
```

#### 2. S3 ühendus ebaõnnestus

**Sümptom**: "Failed to create file" vead

**Lahendus**:
```bash
# Kontrolli S3-Ferry kättesaadavust
kubectl exec -n buerokratt-file-storage \
  $(kubectl get pod -l app=file-handler -o jsonpath='{.items[0].metadata.name}') \
  -- curl http://s3-ferry:3000/v1/storage-accounts

# Kontrolli S3 mandaate
kubectl get secret file-handler-secrets \
  --namespace=buerokratt-file-storage \
  --template={{.data.s3-access-key}} | base64 -d
```

#### 3. Andmebaasi ühenduse vead

**Sümptom**: "Failed to create file record"

**Lahendus**:
```bash
# Kontrolli andmebaasi ühenduvust
kubectl exec -n buerokratt-file-storage \
  $(kubectl get pod -l app=file-handler -o jsonpath='{.items[0].metadata.name}') \
  -- pg_isready -h postgres.buerokratt.svc.cluster.local -p 5432

# Kontrolli andmebaasi skeemi
kubectl exec -n buerokratt postgres-0 \
  -- psql -U byk -d byk -c "\dt file_attachments"
```

#### 4. Kõrge mälu kasutus

**Sümptom**: Podid saavad OOMKilled

**Lahendus**:
```bash
# Suurenda mälu piiranguid
kubectl edit deployment file-handler --namespace=buerokratt-file-storage

# Või skaleeri üles replikad
kubectl scale deployment file-handler --replicas=5 --namespace=buerokratt-file-storage
```

### Silumisrežiim

Luba silumislogimine:

```bash
kubectl edit configmap file-handler-config --namespace=buerokratt-file-storage

# Seadistage: log-level: "debug"

# Taaskäivita podid
kubectl rollout restart deployment/file-handler --namespace=buerokratt-file-storage
```

## Turvalisuskalutused


### Võrgupoliitikad

Rakenda võrgupoliitikad liikluse piiramiseks:

```bash
kubectl apply -f k8s/network-policy.yaml
```

## Varundamine ja taastamine

### Andmebaasi varundamine

```bash
# Varunda manuste metaandmed
kubectl exec -n buerokratt postgres-0 -- \
  pg_dump -U byk -d byk -t file_attachments > file_attachments_backup.sql
```

### Salvestuse varundamine

Seadistage S3 versioonimine ja elutsükli poliitikad automaatseks varundamiseks.

## Uuendused

### Rolliv uuendus

```bash
# Uuenda pilti
kubectl set image deployment/file-handler \
  file-handler=ghcr.io/buerokratt/file-handler:1.1.0 \
  --namespace=buerokratt-file-storage

# Monitoeri rollimist
kubectl rollout status deployment/file-handler --namespace=buerokratt-file-storage
```

### Tagasivõtmine

```bash
kubectl rollout undo deployment/file-handler --namespace=buerokratt-file-storage
```

## Tugi

Probleemide korral:

1. Kontrolli logisid: `kubectl logs -l app=file-handler --namespace=buerokratt-file-storage`
2. Kontrolli tervist: `kubectl get pods --namespace=buerokratt-file-storage`
3. Vaadake seda juhendit
4. Kontrollige SOLUTION_ARCHITECTURE.md disaini detailide jaoks

## Lisad

### A. Täielik faililoetelu

```
File-Storage/
├── SOLUTION_ARCHITECTURE.md          # Arhitektuuri dokumentatsioon
├── DEPLOYMENT_GUIDE.md               # See fail
├── README.md                         # Projekti ülevaade
├── file-handler/                     # Failihandleri teenus
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
├── DSL/                              # Ruuteri DSL töövoogud
│   ├── POST/
│   │   └── files/
│   │       ├── upload.yml
│   │       ├── validate.yml
│   │       └── delete.yml
│   └── GET/
│       └── files/
│           └── download.yml
├── k8s/                              # Kubernetesi manifestid
│   ├── deployment-file-handler.yaml
│   ├── service-file-handler.yaml
│   ├── deployment-clamav.yaml
│   ├── configmap-file-handler.yaml
│   ├── secret-file-handler.yaml
│   ├── hpa-file-handler.yaml
│   ├── poddisruptionbudget-file-handler.yaml
│   └── ingress-file-handler.yaml
└── crd/                              # Kohandatud ressursid
    ├── filepolicy.crd.yaml
    ├── filepolicy-example.yaml
    ├── fileattachment.crd.yaml
    └── fileattachment-example.yaml
```

### B. Pordi viide

| Teenus | Port | Protokoll | Kirjeldus |
|---------|------|----------|-----------|
| file-handler | 3000 | HTTP | API otspunkt |
| clamav | 3310 | TCP | Viiruseotsing |
| postgres | 5432 | TCP | Andmebaas |
| s3-ferry | 3000 | HTTP | Salvestusteenus |
| ruuter | 8080 | HTTP | DSL ruuter |

### C. Vaikimisi ressursi piirangud

| Komponent | CPU taotlus | CPU piirang | Mälu taotlus | Mälu piirang |
|-----------|-------------|-----------|--------------|--------------|
| file-handler | 200m | 1000m | 256Mi | 512Mi |
| clamav | 500m | 2000m | 512Mi | 2Gi |
