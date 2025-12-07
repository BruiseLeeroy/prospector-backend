# PROSPECTOR Backend Server

A secure Node.js/Express backend that handles all API calls for the PROSPECTOR CRM application. This keeps your Google API keys secure on the server side.

## Why Use a Backend?

- **Security**: API keys are never exposed to the browser
- **Rate Limiting**: Control API usage from a central point
- **Monitoring**: Track API usage and errors
- **Cost Control**: Prevent API abuse

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
# Server
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5500

# Google APIs (REQUIRED)
GOOGLE_PLACES_API_KEY=your_actual_google_api_key
GOOGLE_MAPS_API_KEY=your_actual_google_api_key

# Firebase
FIREBASE_PROJECT_ID=promap-ed8fa
FIREBASE_WEB_API_KEY=your_firebase_web_api_key
FIREBASE_AUTH_DOMAIN=promap-ed8fa.firebaseapp.com
FIREBASE_STORAGE_BUCKET=promap-ed8fa.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Firebase Admin (for authentication verification)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

### 3. Get Your API Keys

#### Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable these APIs:
   - Places API
   - Maps JavaScript API
   - Geocoding API
   - Directions API
   - Distance Matrix API
4. Go to Credentials → Create Credentials → API Key
5. **Important**: Restrict the key:
   - For backend: Restrict by IP address (your server IP)
   - For frontend (Maps JS): Restrict by HTTP referrer

#### Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Project Settings → General → Your apps → Web app config
4. Project Settings → Service Accounts → Generate new private key

### 4. Start the Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

### 5. Test the API

```bash
curl http://localhost:3001/api/health
```

Should return:
```json
{
  "status": "ok",
  "firebase": true,
  "googlePlaces": true
}
```

## API Endpoints

### Health Check
```
GET /api/health
```

### Places API

**Nearby Search**
```
POST /api/places/nearby
Body: { lat, lng, radius, type, keyword }
```

**Text Search**
```
POST /api/places/text-search
Body: { query, lat, lng, radius }
```

**Place Details**
```
GET /api/places/details/:placeId
Query: ?fields=name,formatted_address,...
```

**Autocomplete**
```
GET /api/places/autocomplete
Query: ?input=...&lat=...&lng=...
```

### Geocoding

```
GET /api/geocode
Query: ?address=... or ?latlng=lat,lng
```

### Directions

```
POST /api/directions
Body: { origin, destination, waypoints, optimize, mode }
```

### Distance Matrix

```
POST /api/distance-matrix
Body: { origins, destinations, mode }
```

## Deployment Options

### Option 1: Heroku

```bash
# Install Heroku CLI
heroku login
heroku create prospector-api
heroku config:set GOOGLE_PLACES_API_KEY=your_key
heroku config:set FIREBASE_PROJECT_ID=your_project
# ... set other env vars
git push heroku main
```

### Option 2: Railway

1. Connect your GitHub repo
2. Add environment variables in Railway dashboard
3. Deploy

### Option 3: Google Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/PROJECT_ID/prospector-api

# Deploy
gcloud run deploy prospector-api \
  --image gcr.io/PROJECT_ID/prospector-api \
  --platform managed \
  --set-env-vars "GOOGLE_PLACES_API_KEY=..." 
```

### Option 4: DigitalOcean App Platform

1. Create new app from GitHub
2. Set environment variables
3. Deploy

## Frontend Configuration

Update your frontend to point to the backend:

```javascript
// In your frontend config.js or index.html
window.PROSPECTOR_API_URL = 'https://your-backend-url.com';
```

For the Google Maps JavaScript API (needed for autocomplete widget), you'll still need a key in index.html, but:
1. Create a separate, restricted API key
2. Restrict it to your domain (HTTP referrers)
3. Only enable Maps JavaScript API for this key

## Security Best Practices

1. **Never commit `.env` to git** - It's in `.gitignore`
2. **Use IP restrictions** on your backend API key
3. **Use HTTP referrer restrictions** on your frontend API key
4. **Enable CORS** only for your domains
5. **Use Firebase Auth** to verify users
6. **Monitor API usage** in Google Cloud Console

## Troubleshooting

### "Google Places API not configured"
- Check that GOOGLE_PLACES_API_KEY is set in .env
- Make sure the API is enabled in Google Cloud Console

### CORS errors
- Add your frontend URL to ALLOWED_ORIGINS in .env
- Make sure the URL includes the protocol (http:// or https://)

### Firebase auth errors
- Verify FIREBASE_SERVICE_ACCOUNT JSON is valid
- Check that the service account has proper permissions

### 401 Unauthorized
- Make sure the frontend is sending the Firebase auth token
- Check that the token hasn't expired
