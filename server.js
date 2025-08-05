// Corrected server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORRECTED Security middleware with updated CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://telegram.org", "https://esm.sh"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            // 👇 UPDATED LINE
            connectSrc: ["'self'", "https:", "wss:", "wss://lzdlfcapkfcobutadffa.supabase.co"],
        },
    },
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// Config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    });
});

// ✅ New Telegram-based login
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
        const session = {
            access_token: process.env.SUPABASE_ANON_KEY,
            user: { id: profile.id }
        };

        res.json({ session, profile });
    } catch (err) {
        console.error('[LOGIN]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ New Telegram-based register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

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

        const createResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ chat_id: chatId })
        });

        const created = await createResponse.json();
        if (!createResponse.ok || created.length === 0) {
            return res.status(400).json({ error: 'Failed to create profile' });
        }

        const profile = created[0];
        const session = {
            access_token: process.env.SUPABASE_ANON_KEY,
            user: { id: profile.id }
        };

        res.json({ session, profile });
    } catch (err) {
        console.error('[REGISTER]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify token middleware (optional — still uses anon key for now)
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'No token' });
    }
    req.user = { id: 'anon' }; // dummy user
    next();
};

// Get profile by user id (not chatId)
app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user.id}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const profiles = await response.json();
        if (profiles.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json(profiles[0]);
    } catch (err) {
        console.error('[PROFILE]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Proxies remain unchanged
app.get('/api/supabase/*', verifyToken, async (req, res) => {
    const supabasePath = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url, {
        headers: {
            'apikey': process.env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
    });

    const data = await response.json();
    res.status(response.status).json(data);
});

app.post('/api/supabase/*', verifyToken, async (req, res) => {
    const supabasePath = req.params[0];
    const url = `${process.env.SUPABASE_URL}/${supabasePath}`;

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
});

app.patch('/api/supabase/*', verifyToken, async (req, res) => {
    const supabasePath = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;

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
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ✅ Proxy Supabase edge functions
app.all('/functions/v1/*', async (req, res) => {
    const supabasePath = req.params[0];
    const url = `${process.env.SUPABASE_URL}/functions/v1/${supabasePath}`;

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
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
