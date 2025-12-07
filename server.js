/**
 * PROSPECTOR Backend Server
 * Handles all API calls securely on the server-side
 */

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5500'],
    credentials: true
}));
app.use(express.json());

// Initialize Firebase Admin SDK
let firebaseInitialized = false;
try {
    let serviceAccount = null;
    
    // Try loading from file first (GOOGLE_APPLICATION_CREDENTIALS)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const fs = require('fs');
        const path = require('path');
        const credPath = path.resolve(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS);
        if (fs.existsSync(credPath)) {
            serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
            console.log('Loaded Firebase credentials from file');
        }
    }
    
    // Fallback to JSON string in environment variable
    if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('Loaded Firebase credentials from environment variable');
    }
    
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        firebaseInitialized = true;
        console.log('Firebase Admin initialized successfully');
    } else {
        console.log('Firebase Admin not configured - API endpoints will work without server-side auth verification');
        console.log('(Add serviceAccountKey.json to backend folder and set GOOGLE_APPLICATION_CREDENTIALS in .env)');
    }
} catch (error) {
    console.error('Firebase initialization error:', error.message);
}

// API Keys from environment variables
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || GOOGLE_PLACES_API_KEY;

// Verify Firebase token middleware
async function verifyToken(req, res, next) {
    if (!firebaseInitialized) {
        // Skip auth if Firebase not configured (development mode)
        req.userId = 'dev-user';
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.userId = decodedToken.uid;
        req.userEmail = decodedToken.email;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        firebase: firebaseInitialized,
        googlePlaces: !!GOOGLE_PLACES_API_KEY
    });
});

// Get Maps API key for client-side autocomplete
app.get('/api/maps-config', (req, res) => {
    if (!GOOGLE_MAPS_API_KEY) {
        return res.json({ apiKey: null });
    }
    // Return the API key - it will be restricted by HTTP referrer in Google Cloud Console
    res.json({ apiKey: GOOGLE_MAPS_API_KEY });
});

// ============================================
// GOOGLE PLACES API ENDPOINTS
// ============================================

// Optional auth middleware - logs user if authenticated but doesn't require it
async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ') && firebaseInitialized) {
        try {
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.userId = decodedToken.uid;
            req.userEmail = decodedToken.email;
        } catch (error) {
            // Token invalid but we don't require auth, so continue
            req.userId = 'anonymous';
        }
    } else {
        req.userId = 'anonymous';
    }
    next();
}

// Nearby Search (doesn't require auth - API key protection is on server)
app.post('/api/places/nearby', optionalAuth, async (req, res) => {
    if (!GOOGLE_PLACES_API_KEY) {
        return res.status(500).json({ error: 'Google Places API not configured' });
    }

    const { lat, lng, radius, type, keyword } = req.body;

    if (!lat || !lng) {
        return res.status(400).json({ error: 'lat and lng are required' });
    }

    try {
        const params = new URLSearchParams({
            location: `${lat},${lng}`,
            radius: radius || 8047, // Default 5 miles in meters
            key: GOOGLE_PLACES_API_KEY
        });

        if (type) params.append('type', type);
        if (keyword) params.append('keyword', keyword);

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`
        );
        const data = await response.json();

        // Remove sensitive info before sending to client
        if (data.results) {
            data.results = data.results.map(place => ({
                place_id: place.place_id,
                name: place.name,
                vicinity: place.vicinity,
                geometry: place.geometry,
                types: place.types,
                rating: place.rating,
                user_ratings_total: place.user_ratings_total,
                business_status: place.business_status,
                opening_hours: place.opening_hours
            }));
        }

        res.json(data);
    } catch (error) {
        console.error('Places Nearby Search error:', error);
        res.status(500).json({ error: 'Failed to fetch nearby places' });
    }
});

// Text Search (doesn't require auth - API key protection is on server)
app.post('/api/places/text-search', optionalAuth, async (req, res) => {
    if (!GOOGLE_PLACES_API_KEY) {
        return res.status(500).json({ error: 'Google Places API not configured' });
    }

    const { query, lat, lng, radius } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'query is required' });
    }

    try {
        const params = new URLSearchParams({
            query: query,
            key: GOOGLE_PLACES_API_KEY
        });

        if (lat && lng) {
            params.append('location', `${lat},${lng}`);
            params.append('radius', radius || 8047);
        }

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
        );
        const data = await response.json();

        res.json(data);
    } catch (error) {
        console.error('Places Text Search error:', error);
        res.status(500).json({ error: 'Failed to search places' });
    }
});

// Place Details (doesn't require auth)
app.get('/api/places/details/:placeId', optionalAuth, async (req, res) => {
    if (!GOOGLE_PLACES_API_KEY) {
        return res.status(500).json({ error: 'Google Places API not configured' });
    }

    const { placeId } = req.params;
    const fields = req.query.fields || 'name,formatted_address,formatted_phone_number,opening_hours,geometry,website,rating';

    try {
        const params = new URLSearchParams({
            place_id: placeId,
            fields: fields,
            key: GOOGLE_PLACES_API_KEY
        });

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?${params}`
        );
        const data = await response.json();

        res.json(data);
    } catch (error) {
        console.error('Place Details error:', error);
        res.status(500).json({ error: 'Failed to fetch place details' });
    }
});

// Place Autocomplete (doesn't require auth)
app.get('/api/places/autocomplete', optionalAuth, async (req, res) => {
    if (!GOOGLE_PLACES_API_KEY) {
        return res.status(500).json({ error: 'Google Places API not configured' });
    }

    const { input, lat, lng, radius, types } = req.query;

    if (!input) {
        return res.status(400).json({ error: 'input is required' });
    }

    try {
        const params = new URLSearchParams({
            input: input,
            key: GOOGLE_PLACES_API_KEY
        });

        if (lat && lng) {
            params.append('location', `${lat},${lng}`);
            params.append('radius', radius || 50000);
        }
        if (types) params.append('types', types);

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
        );
        const data = await response.json();

        res.json(data);
    } catch (error) {
        console.error('Place Autocomplete error:', error);
        res.status(500).json({ error: 'Failed to get autocomplete suggestions' });
    }
});

// ============================================
// GOOGLE MAPS / DIRECTIONS API ENDPOINTS
// ============================================

// Geocoding (doesn't require auth)
app.get('/api/geocode', optionalAuth, async (req, res) => {
    if (!GOOGLE_MAPS_API_KEY) {
        return res.status(500).json({ error: 'Google Maps API not configured' });
    }

    const { address, latlng } = req.query;

    if (!address && !latlng) {
        return res.status(400).json({ error: 'address or latlng is required' });
    }

    try {
        const params = new URLSearchParams({
            key: GOOGLE_MAPS_API_KEY
        });

        if (address) params.append('address', address);
        if (latlng) params.append('latlng', latlng);

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?${params}`
        );
        const data = await response.json();

        res.json(data);
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: 'Failed to geocode' });
    }
});

// Directions (doesn't require auth)
app.post('/api/directions', optionalAuth, async (req, res) => {
    if (!GOOGLE_MAPS_API_KEY) {
        return res.status(500).json({ error: 'Google Maps API not configured' });
    }

    const { origin, destination, waypoints, mode, optimize } = req.body;

    if (!origin || !destination) {
        return res.status(400).json({ error: 'origin and destination are required' });
    }

    try {
        const params = new URLSearchParams({
            origin: typeof origin === 'object' ? `${origin.lat},${origin.lng}` : origin,
            destination: typeof destination === 'object' ? `${destination.lat},${destination.lng}` : destination,
            mode: mode || 'driving',
            key: GOOGLE_MAPS_API_KEY
        });

        if (waypoints && waypoints.length > 0) {
            const waypointStr = waypoints.map(wp => 
                typeof wp === 'object' ? `${wp.lat},${wp.lng}` : wp
            ).join('|');
            params.append('waypoints', optimize ? `optimize:true|${waypointStr}` : waypointStr);
        }

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/directions/json?${params}`
        );
        const data = await response.json();

        res.json(data);
    } catch (error) {
        console.error('Directions error:', error);
        res.status(500).json({ error: 'Failed to get directions' });
    }
});

// Distance Matrix (doesn't require auth)
app.post('/api/distance-matrix', optionalAuth, async (req, res) => {
    if (!GOOGLE_MAPS_API_KEY) {
        return res.status(500).json({ error: 'Google Maps API not configured' });
    }

    const { origins, destinations, mode } = req.body;

    if (!origins || !destinations) {
        return res.status(400).json({ error: 'origins and destinations are required' });
    }

    try {
        const formatPoints = (points) => points.map(p => 
            typeof p === 'object' ? `${p.lat},${p.lng}` : p
        ).join('|');

        const params = new URLSearchParams({
            origins: formatPoints(origins),
            destinations: formatPoints(destinations),
            mode: mode || 'driving',
            key: GOOGLE_MAPS_API_KEY
        });

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`
        );
        const data = await response.json();

        res.json(data);
    } catch (error) {
        console.error('Distance Matrix error:', error);
        res.status(500).json({ error: 'Failed to get distance matrix' });
    }
});

// ============================================
// FRONTEND CONFIG ENDPOINT (Safe to expose)
// ============================================

// Return non-sensitive config for frontend
app.get('/api/config', (req, res) => {
    res.json({
        // Firebase config is safe - it's meant to be public
        firebase: {
            apiKey: process.env.FIREBASE_WEB_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID
        },
        // Only send a flag, not the actual key
        features: {
            googlePlaces: !!GOOGLE_PLACES_API_KEY,
            directions: !!GOOGLE_MAPS_API_KEY
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 PROSPECTOR Backend Server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
    console.log(`\n📋 Configuration:`);
    console.log(`   - Firebase: ${firebaseInitialized ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   - Google Places API: ${GOOGLE_PLACES_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   - Google Maps API: ${GOOGLE_MAPS_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log('\n');
});
