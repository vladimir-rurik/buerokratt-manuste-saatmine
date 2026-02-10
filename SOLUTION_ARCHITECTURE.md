# Turvaline manuste lahendus Bürokratile

## Täitev ülevaade

See dokument kirjeldab kõikehõlmavat, turvalist manuste haldamise lahendust, mis on spetsiaalselt loodud Bürokstacki arhitektuurile kasutades Ruuteri DSL orkestreerimist.

## Arhitektuuri ülevaade

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Kliendirakendus                            │
│                    (Vestlusvidin, Backoffice GUI)                  │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ HTTPS (multipart/form-data)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Ruuteri ruuter                             │
│  (DSL: validate-file → scan-virus → upload-s3 → create-record)     │
└───────────────────┬───────────────────────────┬─────────────────────┘
                    │                           │
                    │                           │
        ┌───────────▼──────────┐   ┌────────────▼──────────────────┐
        │  Failihandleri teenus│   │      S3-Ferry teenus         │
        │  (Valideerimisloogika)│   │   (Salvestuse abstraktsioon) │
        └───────────┬──────────┘   └───────────┬───────────────────┘
                    │                          │
                    │                          │
        ┌───────────▼──────────┐   ┌───────────▼────────────────────┐
        │  ClamAVi skänner     │   │  S3-ühilduv salvestus         │
        │  (Viiruseotsing)     │   │  (MinIO/AWS S3/Azure Blob)    │
        └──────────────────────┘   └────────────────────────────────┘

                    │
                    ▼
        ┌───────────────────────┐
        │  Resqli andmebaas      │
        │  (Faili metaandmed)    │
        └───────────────────────┘
```

## Põhikomponendid

### 1. Failihandleri teenus (`file-handler`)

**Eesmärk**: Keskne teenus faili valideerimiseks, turvakontrollideks ja üleslaadimise orkestreerimiseks.

**Tehnoloogiakomplekt**:
- Node.js koos NestJS-ga (vastab S3-Ferry arhitektuurile)
- TypeScript tüübitohutuse tagamiseks
- Multer mitmeosalise üleslaadimise käsitlemiseks
- ClamAV viiruseotsinguks
- AWS S3 SDK salvestusoperatsioonideks

**Peamised funktsioonid**:
- MIME tüübi valideerimine (lubatud loendi põhjal)
- Faili suuruse piirangud (seadistatav faili tüübi kaupa)
- Viiruseotsingu integratsioon
- Tükkides üleslaadimise tugi suurtele failidele
- Allkirjastatud URLide genereerimine turvaliseks juurdepääsuks
- Auditilogimine kõigile operatsioonidele

### 2. Ruuteri DSL töövoogud

**DSL failid**:
- `POST/files/upload.yml` - Peamine üleslaadimise töövoog
- `POST/files/validate.yml` - Valideerimise töövoog
- `POST/files/scan.yml` - Viiruseotsingu töövoog
- `GET/files/download.yml` - Turvaline allalaadimine allkirjastatud URL-idega
- `POST/files/delete.yml` - Faili kustutamise töövoog

### 3. Salvestuskiht

**S3-Ferry integratsioon**:
- Kasutab olemasolevat S3-Ferry teenust mitmupilve ühilduvuseks
- Toetab MinIO-d (kohapeal), AWS S3-d ja Azure Blob Storage'i
- Realiseerib S3 elutsükli poliitikad automaatseks koristamiseks
- Mitmeosaline üleslaadimine failide jaoks > 100MB
- Serveripoolne krüptimine (SSE-S3 või SSE-KMS)

### 4. Turvameetmed

#### 4.1 Faili valideerimine
- **MIME tüübi lubatud loend**: Ainult lubatud tüübid aktsepteeritakse
- **Maagiliste numbrite kinnitamine**: Binaarse allkirja verifitseerimine
- **Faili suuruse piirangud**: Seadistatav MIME tüübi kaupa
- **Failinime puhastamine**: Rännaku rünnakute ennetus

#### 4.2 Viiruseotsing
- **ClamAV integratsioon**: Avatud lähtekoodiga antivirusmootor
- **Asünkroonne skaneerimine**: Blokeerimatu skaneerimisjärjekord
- **Karantiin**: Nakatunud failid isoleeritakse automaatselt
- **Skaneri tulemused**: Salvestatud andmebaasi auditi jaoks

#### 4.3 Juurdepääsu kontroll
- **JWT autentimine**: Nõutav kõigis operatsioonides
- **TIM integratsioon**: Kasutaja identiteedi verifitseerimine
- **Allkirjastatud URL-id**: Ajapiiranguga juurdepääsuload
- **Rollipõhine juurdepääs**: Erinevad õigused kasutajarolli kaupa

#### 4.4 Kiiruspiirang
- **Kasutajapõhised piirangud**: Kuritarvitamise ennetus
- **Voo kontroll**: Token ämbri algoritm
- **IP-põhine piiramine**: DDoS kaitse

## Standardid ja protokollid

### MIME tüübid
Toetatud failitüübid valideerimisega:
- Dokumendid: `.pdf`, `.docx`, `.doc`, `.odt`, `.rtf`
- Pildid: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Arhiivid: `.zip`, `.tar`, `.gz` (suurusepiirangutega)
- Andmed: `.json`, `.xml`, `.csv`

### S3 API standardid
- **Mitmeosaline üleslaadimine**: Failide jaoks > 100MB
- **Eel-allkirjastatud URL-id**: AWS Signature V4
- **Versioonimine**: Lubatud faili ajaloole
- **Elutsükli reeglid**: Automaatne arhiveerimine/kustutamine

### Faili suuruse piirangud
- Vaikimisi: 50MB faili kohta
- Maksimaalselt: 500MB (seadistatav)
- Tüki suurus: 5MB mitmeosalise üleslaadimise korral

## Integratsioon olemasoleva arhitektuuriga

### Ruuteri DSL integratsioon

Lahendus järgib Ruuteri DSL mustreid:

```yaml
# Faili üleslaadimise DSL näide
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
      description: Seotud vestluse sessiooni ID

validate_file:
  call: http.post
  args:
    url: "[#FILE_HANDLER]/validate"
    # ... valideerimisloogika
  next: scan_file

scan_file:
  call: http.post
  args:
    url: "[#FILE_HANDLER]/scan"
    # ... viiruseotsing
  next: upload_to_s3

upload_to_s3:
  call: http.post
  args:
    url: "[#S3_FERRY]/v1/files/create"
    # ... üleslaadimise loogika
  next: create_record
```

### Andmebaasi skeem (Resql)

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

## Juurutamise arhitektuur

### Kubernetesi komponendid

1. **file-handleri juurutamine**:
   - Replikad: 3 (horisontaalne skaleerimine)
   - Ressursid: CPU 500m, Mälu 512Mi
   - Sondid: Elusolek ja valmidus

2. **clamavi juurutamine**:
   - DaemonSet skaneerimiseks
   - Freshclam kõrvalprotsess viiruseandmebaasi uuendusteks

3. **Saladused**:
   - S3 mandaadid
   - JWT allkirjastamise võtmed
   - Andmebaasi mandaadid

4. **Konfiguratsioonikaardid**:
   - MIME tüübi lubatud loend
   - Faili suuruse piirangud
   - Kiiruspiirangu reeglid

## Turvalisuse parimad praktikad

### 1. Kaitse sügavuses
- Mitu valideerimiskihti
- Viiruseotsing mitmes etapis
- Võrgu isoleerimine (privaatne klasterkommunikatsioon)
- Saladuste haldamine Kubernetesi Secretidega

### 2. Väikseima õiguse põhimõte
- Minimaalsed S3 õigused (kirjutamisõigus ainult üleslaadimiseks)
- Rollipõhine juurdepääsu kontroll
- Ajapiiranguga allkirjastatud URL-id

### 3. Audit ja monitooring
- Kõik failioperatsioonid logitud
- Skaneerimistulemused jälgitavad
- Juurdepääsu mustrad monitoreeritakse
- Häired kahtlastest tegevustest

### 4. Andmekaitse
- Krüptimine ülekandel (TLS 1.3)
- Krüptimine puhkeral (S3 SSE)
- PII skaneerimine Presidioga (valikuline)
- GDPR-õppuskäsitluse arvestused

## Jõudluskalutused

### Skaleeritavus
- Olekuta failihandleri teenus
- Horisontaalne podi automaatne skaleerimine (2-10 replikat)
- S3 hooldab piiramatut salvestust
- Asünkroonne viiruseotsingu järjekord

### Usaldusväärsus
- Mitmeosaline üleslaadimine uuestikatsemisega
- Katkestaja S3-Ferry jaoks
   graceful degradation (scan queue full)
- Töökorras kontrollid ja automaatne taaskäivitus

### Kulude optimeerimine
- S3 elutsükli poliitikad (liiguta Glacierisse pärast 90 päeva)
- Aegunud failide automaatne koristamine
- Tõhus tüki suurus (5MB)
- CDN vahemälu staatiliste varade jaoks

## Järgimine ja standardid

### ISO 27001
- Riskihinnang failide käitlemisele
- Turvalisuse poliitikad dokumenteeritud
- Intsidendi reageerimisprotseduurid

### GDPR
- Andmete minimeerimine (ainult vajalikud metaandmed)
- Õigus kustutamisele
- Andmete portatiivsus (eksportimisfunktsioon)
- Nõusoleku jälgimine

### Eesti infosüsteemi turvalisus
- X-Roadi ühilduvus (valikuline)
- Eesti ID-kaardi integratsioon
- Digitaalallkirja tugi

## Testimise strateegia

### Ühiktestid
- MIME tüübi valideerimine
- Faili suuruse kontrollid
- Failinime puhastamine
- Allkirjastatud URLide genereerimine

### Integratsioonitestid
- S3-Ferry integratsioon
- ClamAV skaneerimine
- Ruuteri DSL täitmine
- Andmebaasi operatsioonid

### Läbimõeldud testid
- Täielik üleslaadimise töövoog
- Viiruse tuvastamine ja karantiin
- Allalaadimine allkirjastatud URL-idega
- Koristamine ja aegumine

## Monitooring ja jälgitavus

### Metrikad
- Üleslaadimise edukus
- Viiruse tuvastamise määr
- Salvestusruumi kasutus
- API reaktsiooniahel

### Logimine
- Struktureeritud JSON-logid
- Korrelatsiooni-ID-d (jälgita päringuid)
- Veajälgimine
- Auditiprott

### Häired
- Kõrge viiruse tuvastamise määr
- S3 üleslaadimise ebaõnnestumised
- Vähe kettaruumi
- API vead > 5%
