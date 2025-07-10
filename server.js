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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
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
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = await response.json();
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Token verification failed' });
  }
};

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { accountName, password } = req.body;
    
    if (!accountName || !password) {
      return res.status(400).json({ error: 'Account name and password are required' });
    }

    // Check if profile exists
    const profileResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?account_name=eq.${encodeURIComponent(accountName)}`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      }
    });

    const profiles = await profileResponse.json();
    
    if (profiles.length === 0) {
      return res.status(404).json({ error: 'Account not found. Please register first.' });
    }

    // Authenticate with Supabase
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

    if (!authResponse.ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      session: authData,
      profile: profiles[0]
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { accountName, password } = req.body;
    
    if (!accountName || !password) {
      return res.status(400).json({ error: 'Account name and password are required' });
    }

    // Check if account already exists
    const existingResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?account_name=eq.${encodeURIComponent(accountName)}`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      }
    });

    const existing = await existingResponse.json();
    
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Account name already exists' });
    }

    // Create user in Supabase Auth
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

    if (!authResponse.ok) {
      return res.status(400).json({ error: authData.message || 'Registration failed' });
    }

    // Create profile
    const profileResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        id: authData.user.id,
        account_name: accountName,
      })
    });

    const profileData = await profileResponse.json();

    if (!profileResponse.ok) {
      return res.status(400).json({ error: profileData.message || 'Profile creation failed' });
    }

    res.json({
      session: authData,
      profile: profileData[0]
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
app.get('/api/profile', verifyToken, async (req, res) => {
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user.id}`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      }
    });

    const profiles = await response.json();
    
    if (profiles.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(profiles[0]);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Supabase proxy for GET requests
app.get('/api/supabase/*', verifyToken, async (req, res) => {
  try {
    const supabasePath = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Supabase error: ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Supabase proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Supabase proxy for POST requests
app.post('/api/supabase/*', verifyToken, async (req, res) => {
  try {
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: errorData.message || `HTTP error! status: ${response.status}` 
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Supabase proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// SPA support - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
