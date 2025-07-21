const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://telegram.org"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https:"],
        },
    },
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Configuration endpoint
app.get('/api/config', (req, res) => {
    res.json({
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    });
});

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        console.warn('[VERIFY_TOKEN] No token provided in Authorization header.'); // Added log
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        console.log('[VERIFY_TOKEN] Attempting to verify token with Supabase Auth...'); // Added log
        const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text(); // Get raw error response for more details
            console.error(`[VERIFY_TOKEN] Supabase token verification failed: Status ${response.status}, Response: ${errorText}`); // Added log
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = await response.json();
        console.log('[VERIFY_TOKEN] Token successfully verified. User ID:', req.user.id); // Added log
        next();
    } catch (error) {
        console.error('[VERIFY_TOKEN] Token verification error:', error);
        res.status(401).json({ error: 'Token verification failed' });
    }
};

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
    try {
        const { accountName, password } = req.body;
        console.log(`[AUTH_LOGIN] Login attempt for account: ${accountName}`); // Added log
        
        if (!accountName || !password) {
            console.warn('[AUTH_LOGIN] Missing accountName or password.'); // Added log
            return res.status(400).json({ error: 'Account name and password are required' });
        }

        // Check if profile exists
        console.log(`[AUTH_LOGIN] Checking if profile exists for ${accountName}...`); // Added log
        const profileResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?account_name=eq.${encodeURIComponent(accountName)}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
            }
        });

        const profiles = await profileResponse.json();
        console.log('[AUTH_LOGIN] Profile check response:', profiles); // Added log
        
        if (profiles.length === 0) {
            console.warn('[AUTH_LOGIN] Account not found.'); // Added log
            return res.status(404).json({ error: 'Account not found. Please register first.' });
        }

        // Authenticate with Supabase
        console.log('[AUTH_LOGIN] Authenticating with Supabase Auth...'); // Added log
        const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: accountName,
                password: password
            })
        });

        const authData = await authResponse.json();
        console.log('[AUTH_LOGIN] Supabase Auth response:', authData); // Added log

        if (!authResponse.ok) {
            console.error('[AUTH_LOGIN] Supabase Auth failed:', authData.message || 'Unknown error'); // Added log
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({
            session: authData,
            profile: profiles[0]
        });
        console.log('[AUTH_LOGIN] Login successful, returning session and profile.'); // Added log

    } catch (error) {
        console.error('[AUTH_LOGIN] Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { accountName, password } = req.body;
        console.log(`[AUTH_REGISTER] Registration attempt for account: ${accountName}`); // Added log
        
        if (!accountName || !password) {
            console.warn('[AUTH_REGISTER] Missing accountName or password.'); // Added log
            return res.status(400).json({ error: 'Account name and password are required' });
        }

        // Check if account already exists
        console.log(`[AUTH_REGISTER] Checking if account already exists for ${accountName}...`); // Added log
        const existingResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?account_name=eq.${encodeURIComponent(accountName)}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
            }
        });

        const existing = await existingResponse.json();
        console.log('[AUTH_REGISTER] Existing profile check response:', existing); // Added log
        
        if (existing.length > 0) {
            console.warn('[AUTH_REGISTER] Account name already exists.'); // Added log
            return res.status(409).json({ error: 'Account name already exists' });
        }

        // Create user in Supabase Auth
        console.log('[AUTH_REGISTER] Creating user in Supabase Auth...'); // Added log
        const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: accountName,
                password: password,
                options: {
                    data: { account_name: accountName }
                }
            })
        });

        const authData = await authResponse.json();
        console.log('[AUTH_REGISTER] Supabase Auth signup response:', authData); // Added log

        if (!authResponse.ok) {
            console.error('[AUTH_REGISTER] Supabase Auth signup failed:', authData.message || 'Unknown error'); // Added log
            return res.status(400).json({ error: authData.message || 'Registration failed' });
        }

        // Create profile
        console.log('[AUTH_REGISTER] Creating profile in Supabase database...'); // Added log
        const profileResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${authData.access_token}`, // Use the *newly created user's* token here
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                id: authData.user.id,
                account_name: accountName,
            })
        });

        const profileData = await profileResponse.json();
        console.log('[AUTH_REGISTER] Profile creation response:', profileData); // Added log

        if (!profileResponse.ok) {
            console.error('[AUTH_REGISTER] Profile creation failed:', profileData.message || 'Unknown error'); // Added log
            return res.status(400).json({ error: profileData.message || 'Profile creation failed' });
        }

        res.json({
            session: authData,
            profile: profileData[0]
        });
        console.log('[AUTH_REGISTER] Registration successful, returning session and profile.'); // Added log

    } catch (error) {
        console.error('[AUTH_REGISTER] Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile
app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        console.log('[API_PROFILE] Fetching profile for user ID:', req.user.id); // Added log
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user.id}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
            }
        });

        const profiles = await response.json();
        console.log('[API_PROFILE] Supabase profile fetch response:', profiles); // Added log
        
        if (profiles.length === 0) {
            console.warn('[API_PROFILE] Profile not found for user ID:', req.user.id); // Added log
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json(profiles[0]);
        console.log('[API_PROFILE] Profile successfully returned.'); // Added log
    } catch (error) {
        console.error('[API_PROFILE] Profile fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Supabase proxy for GET requests
app.get('/api/supabase/*', verifyToken, async (req, res) => {
    try {
        const supabasePath = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;
        console.log(`[GET_PROXY] Forwarding GET request to Supabase: ${url}`); // Added log

        const response = await fetch(url, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`, // Keeping consistent with your original code
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[GET_PROXY] Supabase returned error status ${response.status}:`, errorData); // Added log
            return res.status(response.status).json({ error: `Supabase error: ${response.status}` });
        }

        const data = await response.json();
        res.json(data);
        console.log(`[GET_PROXY] Supabase GET response data:`, data); // Added log
    } catch (error) {
        console.error('[GET_PROXY] Supabase proxy error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Supabase proxy for POST requests
app.post('/api/supabase/*', verifyToken, async (req, res) => {
    try {
        const supabasePath = req.params[0];
        const url = `${process.env.SUPABASE_URL}/${supabasePath}`;
        console.log(`[POST_PROXY] Forwarding POST request to Supabase: ${url}`); // Added log
        console.log(`[POST_PROXY] Request body:`, req.body); // Added log

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`, // Keeping consistent with your original code
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[POST_PROXY] Supabase returned error status ${response.status}:`, errorData); // Added log
            return res.status(response.status).json({ 
                error: errorData.message || `HTTP error! status: ${response.status}` 
            });
        }

        const data = await response.json();
        res.json(data);
        console.log(`[POST_PROXY] Supabase POST response data:`, data); // Added log
    } catch (error) {
        console.error('[POST_PROXY] Supabase proxy error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Supabase proxy for PATCH requests
app.patch('/api/supabase/*', verifyToken, async (req, res) => {
    try {
        const supabasePath = req.params[0]; // e.g., 'rest/v1/profiles'
        const queryString = req.url.split('?')[1] || ''; // Extract query string if present
        const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`; // Reconstruct with query string

        console.log(`[PATCH_PROXY] Forwarding PATCH request to Supabase: ${url}`); // Updated log
        console.log(`[PATCH_PROXY] Request body:`, req.body);

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`, // Or your preferred RLS approach
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[PATCH_PROXY] Supabase returned error status ${response.status}:`, errorData);
            return res.status(response.status).json({
                error: errorData.message || `HTTP error! status: ${response.status}`
            });
        }

        const data = await response.json();
        res.json(data);
        console.log(`[PATCH_PROXY] Supabase PATCH response data:`, data);
    } catch (error) {
        console.error('[PATCH_PROXY] Supabase proxy error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    console.log('[HEALTH_CHECK] Health check requested.'); // Added log
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// SPA support - serve index.html for all other routes
app.get('*', (req, res) => {
    console.log(`[SPA_ROUTE] Serving index.html for route: ${req.url}`); // Added log
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('[GLOBAL_ERROR_HANDLER] Uncaught error:', err.stack); // Added log
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
