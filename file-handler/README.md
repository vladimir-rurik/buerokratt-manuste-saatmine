# Failihaldusteenus

Turvaline manuste haldamisteenus Bürokratti jaoks, millel on valideerimine, viiruseotsing ja S3-ühilduv salvestus.

## Funktsioonid

- **Faili valideerimine**: MIME tüübi kontroll, maagiliste numbrite kontroll, suusepiirangud
- **Viiruseotsing**: ClamAVi integratsioon pahavara tuvastamiseks
- **Turvaline salvestus**: S3-ühilduv salvestus S3-Ferry teenuse kaudu
- **Osaline üleslaadimine**: Suurte failide tugi (>100MB)
- **Allkirjastatud URL-id**: Ajapiiranguga turvalised juurdepääsuload
- **Kiiruspiirang**: Kasutajapõhine piiramine (seadistatav)
- **Auditilogimine: Täielik tegevuste jälgimine
- **Kubernetes-valmis**: Kaasatud juurutamismanifestid

## Tehnoloogiad

- **Raamistik**: NestTypeScriptiga
- **Salvestus**: AWS S3 SDK (S3-Ferry kaudu)
- **Viiruseotsing**: ClamAV
- **Andmebaas**: PostgreSQL
- **Dokumentatsioon**: Swagger/OpenAPI

## Eeltingimused

- Node.js 20+
- PostgreSQL 14+
- ClamAV (clamd)
- S3-ühilduv salvestus (MinIO/AWS S3/Azure Blob)
- S3-Ferry teenus

## Arendus

### Paigaldamine

```bash
npm install
```

### Seadistamine

Kopeeri `.env.example` fail `.env` ning seadista:

```bash
cp .env.example .env
```

### Kohalik käivitamine

```bash
# Arendusrežiim koos kuumaloadiga
npm run start:dev

# Tootmisrežiim
npm run build
npm run start:prod
```

### Testide käivitamine

```bash
# Ühiktestid
npm run test

# Läbimõeldud testid
npm run test:e2e

# Kate
npm run test:cov
```

### Koodikontroll

```bash
# Linteri käivitamine
npm run lint

# Automaatne parandus
npm run lint:fix
```

## API dokumentatsioon

Pärast käivitamist on Swaggeri dokumentatsioon kättesaadav:
```
http://localhost:3000/documentation
```

## API otspunktid

### Faili üleslaadimine
```http
POST /v1/files/upload
Content-Type: multipart/form-data

{
  "file": <binaarne>,
  "chatId": "valikuline-vestlus-id"
}
```

### Faili valideerimine (ilma üleslaadimiseta)
```http
POST /v1/files/validate
Content-Type: multipart/form-data

{
  "file": <binaarne>
}
```

### Faili metaandmete hankimine
```http
GET /v1/files/:fileId
Authorization: Bearer <jwt-loot>
```

### Faili kustutamine
```http
DELETE /v1/files/:fileId
Authorization: Bearer <jwt-loot>
```

### Töökorras kontroll
```http
GET /v1/files/health
```

## Turvalisus

### Faili valideerimine
- MIME tüübi lubatud loend
- Maagiliste numbrite kinnitamine
- Faili suuruse piirangud
- Failinime puhastamine
- Rännaku ennetus

### Viiruseotsing
- ClamAVi integratsioon
- Asünkroonne otsingujärjekord
- Nakatunud failide karantiin
- Otsingutulemuste logimine

### Juurdepääsu kontroll
- JWT autentimine nõutav
- Kasutajaõiguste kontroll
- Allkirjastatud URL-id allalaadimiseks
- Auditilogimine kõikidele operatsioonidele

## Docker

### Dockeri pildi ehitamine

```bash
docker build -t file-handler:latest .
```

### Konteineri käivitamine

```bash
docker run -p 3000:3000 \
  -e DB_HOST=postgres \
  -e CLAMAV_HOST=clamav \
  -e S3_FERRY_URL=http://s3-ferry:3000 \
  file-handler:latest
```

## Kubernetesi juurutamine

Juurutamismanifestid on kataloogis `k8s/`:

```bash
kubectl apply -f k8s/
```

## Keskkonnamuutujad

Kõik saadaolevad seadistamisvõimalused on failis `.env.example`.

## Monitooring

### Metrikad
- Üleslaadimise edukus
- Viiruste tuvastamise määr
- Salvestusruumi kasutus
- API reaktsioonid

### Logimine
- Struktureeritud JSON-logid
- Korrelatsiooni-ID-d
- Veajälgimine
- Auditiprott
