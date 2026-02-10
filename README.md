# Turvaline manuste lahendus Bürokratile

## Ülevaade

See lahendus pakub kõikehõlmavat, turvalist ja skaleeritavat manuste haldamissüsteemi, mis on spetsiaalselt loodud Bürokstacki arhitektuurile. See realiseerib ettevõtteklassi turvalisuse omadused, sealhulgas viiruseotsingu, faili valideerimise, S3-ühilduva salvestuse ja sujuva integratsiooni Ruuteri DSL töövoogudega.

## Peamised funktsioonid

✅ **Turvalisus esikohal**
- MIME tüübi valideerimine koos maagiliste numbrite kontrolliga
- ClamAVi viiruseotsing koos karantiiniga
- Allkirjastatud URL-id turvaliseks juurdepääsuks
- JWT autentimise integratsioon
- Rollipõhine juurdepääsu kontroll
- Põhjalik auditilogimine

✅ **Skaleeritavus**
- Horisontaalne podi automaatne skaleerimine (2-10 replikat)
- Mitmeosaline üleslaadimine suurte failide jaoks (>100MB)
- S3-ühilduv salvestus (MinIO/AWS/Azure)
- Asünkroonne viiruseotsingu järjekord
- Olekuta teenuse disain

✅ **Bürokstacki integratsioon**
- Ruuteri DSL töövoogud failioperatsioonideks
- S3-Ferry integratsioon salvestuse abstraktsiooniks
- TIMi (TARA) autentimise tugi
- OpenSearchi auditilogimine
- PostgreSQLi metaandmete salvestus

✅ **Tootmisvalmis**
- Kubernetesi juurutamismanifestid
- Kohandatud ressursi definitsioonid (FilePolicy, FileAttachment)
- Töökorras kontrollid ja sondid
- Ressursipiirangud ja HPA
- Võrgupoliitika ja RBAC
- Põhjalik monitooring

## Arhitektuur

```
┌─────────────────────────────────────────────────────────────┐
│                     Kliendirakendused                       │
│              (Vestlusvidin, Backoffice GUI)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Ruuteri ruuter                       │
│              (DSL: valideeri → skaneeri → laadi üles → salvesta)        └────────┬────────────────────────────────────────┬───────────┘
         │                                        │
         ▼                                        ▼
┌──────────────────────┐              ┌──────────────────────┐
│   Failihandler       │              │    S3-Ferry          │
│   - Valideerimine    │              │    - Salvestus       │
│   - Viiruseotsing    │              │    - Abstraktsioon   │
│   - Üleslaadimise loogika    │              │    - Multipart       │
└────────┬─────────────┘              └──────────┬───────────┘
         │                                       │
         ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│      ClamAV          │              │   S3 Salvestus       │
│   - Viiruseotsing    │              │   - MinIO/AWS/Azure  │
│   - Karantiin        │              │   - Elutsükli poliitika │
└──────────────────────┘              └──────────────────────┘

         │
         ▼
┌──────────────────────┐
│   PostgreSQL         │
│   - Faili metaandmed │
│   - Auditilogid      │
└──────────────────────┘
```

## Kiirstarter

### Eeltingimused

- Kubernetesi klaster (v1.24+)
- kubectl seadistatud
- Olemasolev Bürokratti juurutamine (Ruuter, TIM, Resql, S3-Ferry)
- PostgreSQLi andmebaas
- S3-ühilduv salvestus

### Paigaldamine

1. **Rakenda CRD-d**
   ```bash
   kubectl apply -f crd/filepolicy.crd.yaml
   kubectl apply -f crd/fileattachment.crd.yaml
   ```

2. **Loo nimeruum**
   ```bash
   kubectl create namespace buerokratt-file-storage
   ```

3. **Juuruta komponendid**
   ```bash
   # Juuruta ClamAV
   kubectl apply -f k8s/deployment-clamav.yaml -n buerokratt-file-storage

   # Juuruta Failihandler
   kubectl apply -f k8s/ -n buerokratt-file-storage
   ```

4. **Juuruta DSL-ud Ruuterisse**
   ```bash
   kubectl cp DSL/ $(kubectl get pod -l app=ruuter -n buerokratt -o jsonpath='{.items[0].metadata.name}'):/DSL/
   ```

Üksikasjalikud juhised leiate [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) failist.

## Kasutamine

### Laadi fail üles DSL-i kaudu

```yaml
# POST /files/upload (Ruuteri DSL)
- content: |
    curl -X POST \
      http://ruuter.buerokratt.ee/files/upload \
      -H "Authorization: Bearer <jwt-loot>" \
      -F "file=@document.pdf" \
      -F "chatId=chat-123"
```

### Valideeri fail

```yaml
# POST /files/validate
- content: |
    curl -X POST \
      http://ruuter.buerokratt.ee/files/validate \
      -F "file=@document.pdf"
```

### Laadi fail alla

```yaml
# GET /files/download?fileId=uuid
- content: |
    curl -X GET \
      http://ruuter.buerokratt.ee/files/download?fileId=<uuid> \
      -H "Authorization: Bearer <jwt-loot>"
```

## Turvalisus

### Faili valideerimine
- **MIME tüübi lubatud loend**: Ainult lubatud tüübid aktsepteeritakse
- **Maagiliste numbrite kinnitamine**: Binaarse allkirja kontroll
- **Faili suuruse piirangud**: Seadistatav kategooria kaupa
- **Failinime puhastamine**: Rännaku ennetus

### Viiruseotsing
- **ClamAVi integratsioon**: Reaalaja skaneerimine
- **Asünkroonne töötlemine**: Blokeerimatu järjekord
- **Automaatne karantiin**: Nakatunud failid isoleeritakse
- **Skaneri tulemused**: Salvestatud andmebaasi auditi jaoks

### Juurdepääsu kontroll
- **JWT autentimine**: Nõutav kõigis operatsioonides
- **TIMi integratsioon**: Kasutaja identiteedi kinnitamine
- **Allkirjastatud URL-id**: Ajapiiranguga juurdepääsuload (vaikimisi 1 tund)
- **Rollipõhine juurdepääs**: Erinevad õigused rolli kaupa

## Seadistamine

### Failipoliitikad

Kasutage `FilePolicy` CRD-d turvareeglite määramiseks:

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

### Keskkonnamuutujad

Seadistage `k8s/configmap-file-handler.yaml` kaudu:

| Muutuja | Kirjeldus | Vaikimisi |
|---------|----------|-----------|
| S3_ENDPOINT_URL | S3 otspunkt | http://minio:9000 |
| S3_DATA_BUCKET_NAME | Ämberi nimi | buerokratt-files |
| MAX_FILE_SIZE | Maks üleslaadimise suurus | 500MB |
| CHUNK_SIZE | Multiparti tüki suurus | 5MB |
| ENABLE_VIRUS_SCAN | ClamAV lubamine | true |
| RATE_LIMIT_MAX | Päringuid minutis | 100 |

## Monitooring

### Töökorras kontroll

```bash
curl http://file-handler:3000/health
```

Vastus:
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

### Logid

```bash
# Failihandleri logid
kubectl logs -f -l app=file-handler -n buerokratt-file-storage

# ClamAVi logid
kubectl logs -f -l app=clamav -n buerokratt-file-storage
```

## Dokumentatsioon

- **[SOLUTION_ARCHITECTURE.md](SOLUTION_ARCHITECTURE.md)**: Täielik arhitektuuri ülevaade
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**: Samm-sammulised juurutamisjuhised
- **[file-handler/README.md](file-handler/README.md)**: Failihandleri teenuse dokumentatsioon

## Standardid ja protokollid

### Toetatud MIME tüübid
- **Dokumendid**: PDF, DOCX, DOC, ODT, RTF
- **Pildid**: JPG, PNG, GIF, WebP, SVG
- **Arhiivid**: ZIP, TAR, GZ (suurusepiirangutega)
- **Andmed**: JSON, XML, CSV

### S3 API standardid
- Mitmeosaline üleslaadimine failide jaoks > 100MB
- Eel-allkirjastatud URL-id AWS Signature V4-ga
- Serveripoolne krüptimine (SSE-S3/SSE-KMS)
- Elutsükli poliitikad automaatseks koristuseks

### Turvalisuse standardid
- TLS 1.3 krüptimiseks ülekandel
- SHA-256 faili kontrollsummade jaoks
- GDPR-õppususkäsitluse arvestused
- ISO 27001 turvalisuse parimad praktikad

## Järgimine

### GDPR
- Andmete minimeerimine (ainult vajalikud metaandmed)
- Õigus kustutamisele (fail + metaandmed)
- Andmete portatiivsus (eksportimisfunktsioon)
- Nõusoleku jälgimine

### Eesti standardid
- X-Roadi ühilduvus (valikuline)
- ID-kaardi integratsioon (TIMi kaudu)
- Digitaalallkirja tugi

## Tugi ja probleemide lahendamine

### Levinud probleemid

1. **ClamAV ei ole valmis**: Kontrollige `kubectl get pods -l app=clamav`
2. **S3 ühendus ebaõnnestus**: Kontrollige S3-Ferry kättesaadavust
3. **Andmebaasi vead**: Kontrollige ühendusstringi ja skeemi

### Silumisrežiim

Lubage silumislogimine:
```bash
kubectl edit configmap file-handler-config
# Seadistage: log-level: "debug"
kubectl rollout restart deployment/file-handler
```

## Näited

### Näide 1: Laadi vestlusmanus üles

```bash
curl -X POST \
  http://ruuter.buerokratt.ee/files/upload \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@invoice.pdf" \
  -F "chatId=chat-session-123"
```

Vastus:
```json
{
  "fileId": "uuid-1234-5678",
  "filename": "invoice.pdf",
  "size": 1048576,
  "mimeType": "application/pdf",
  "scanStatus": "clean",
  "uploadedAt": "2025-02-09T12:00:00Z",
  "message": "Fail üles laaditud edukalt"
}
```

### Näide 2: Loo failipoliitika

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
