const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware with updated CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://telegram.org", "https://esm.sh"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https:", "wss:", "wss://lzdlfcapkfcobutadffa.supabase.co"],
        },
    },
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// Config endpoint - only return what's needed
app.get('/api/config', (req, res) => {
    res.json({
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    });
});

// Telegram-based login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?chat_id=eq.${chatId}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const profiles = await response.json();
        if (profiles.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const profile = profiles[0];
        
        // Simplified response - just return profile, client will handle auth
        res.json({ profile });
    } catch (err) {
        console.error('[LOGIN]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Telegram-based register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        // Check if profile already exists
        const checkResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?chat_id=eq.${chatId}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const existing = await checkResponse.json();
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Profile already exists' });
        }

        // Create profile with starter_items set to false initially
        const createResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ 
                chat_id: chatId,
                starter_items: false 
            })
        });

        const created = await createResponse.json();
        if (!createResponse.ok || created.length === 0) {
            return res.status(400).json({ error: 'Failed to create profile' });
        }

        const profile = created[0];

        // Call edge function to add starter items
        try {
            const starterItemsResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/add-starter-items`, {
                method: 'POST',
                headers: {
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    player_id: profile.id 
                })
            });

            if (!starterItemsResponse.ok) {
                const starterResult = await starterItemsResponse.json();
                console.error('[REGISTER] Failed to add starter items:', starterResult);
            }
        } catch (starterError) {
            console.error('[REGISTER] Error adding starter items:', starterError);
        }

        // Simplified response - just return profile
        res.json({ profile });
    } catch (err) {
        console.error('[REGISTER]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Simplified middleware - just check if anon key is provided
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header required' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (token !== process.env.SUPABASE_ANON_KEY) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    next();
};

// Supabase proxy endpoints
app.get('/api/supabase/*', requireAuth, async (req, res) => {
    const supabasePath = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;

    try {
        const response = await fetch(url, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('[PROXY GET]', error);
        res.status(500).json({ error: 'Proxy error' });
    }
});

app.post('/api/supabase/*', requireAuth, async (req, res) => {
    const supabasePath = req.params[0];
    const url = `${process.env.SUPABASE_URL}/${supabasePath}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('[PROXY POST]', error);
        res.status(500).json({ error: 'Proxy error' });
    }
});

app.patch('/api/supabase/*', requireAuth, async (req, res) => {
    const supabasePath = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;

    try {
        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('[PROXY PATCH]', error);
        res.status(500).json({ error: 'Proxy error' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Proxy Supabase edge functions
app.all('/functions/v1/*', requireAuth, async (req, res) => {
    const supabasePath = req.params[0];
    const url = `${process.env.SUPABASE_URL}/functions/v1/${supabasePath}`;

    try {
        const response = await fetch(url, {
            method: req.method,
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: ['POST', 'PATCH', 'PUT'].includes(req.method) ? JSON.stringify(req.body) : undefined
        });

        const text = await response.text();
        res.status(response.status).send(text);
    } catch (error) {
        console.error('[FUNCTIONS PROXY]', error);
        res.status(500).json({ error: 'Proxy error' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
