const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://cdn.sheetjs.com" ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:","https:"],
      connectSrc: ["'self'", "https:"],
    },
  },
}));


app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Only expose public/anon keys!
const PUBLIC_CONFIG = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY, // Anon key for client-side auth
};

// Configuration endpoint
app.get('/api/config', (req, res) => {
  res.json(PUBLIC_CONFIG);
});

// Custom auth endpoints for your game logic
app.post('/api/auth/login', async (req, res) => {
  try {
    const { accountName, password } = req.body;
    
    if (!accountName || !password) {
      return res.status(400).json({ error: 'Account name and password are required' });
    }

    // First check if profile exists
    const profileResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?account_name=eq.${encodeURIComponent(accountName)}`, {
      method: 'GET',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const profiles = await profileResponse.json();
    
    if (profiles.length === 0) {
      return res.status(404).json({ error: 'Account not found. Please register first.' });
    }

    // Authenticate with Supabase Auth
    const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: `${accountName}`, // Use consistent email format
        password: password
      })
    });

    const authData = await authResponse.json();

    if (!authResponse.ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Return the session and profile data
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
    
    if (!accountName || !password ) {
      return res.status(400).json({ error: 'Account name and password are required' });
    }

    // Check if account name already exists
    const existingProfileResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?account_name=eq.${encodeURIComponent(accountName)}`, {
      method: 'GET',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const existingProfiles = await existingProfileResponse.json();
    
    if (existingProfiles.length > 0) {
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
        email: `${accountName}`, // Use consistent email format
        password: password,
        options: {
          data: {
            account_name: accountName
          }
        }
      })
    });

    const authData = await authResponse.json();

    if (!authResponse.ok) {
      return res.status(400).json({ error: authData.message || 'Registration failed' });
    }

    // Create profile in database
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

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await response.json();
    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Token verification failed' });
  }
};

// Protected route to get user profile
app.get('/api/profile', verifyToken, async (req, res) => {
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user.id}`, {
      method: 'GET',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
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

// Supabase proxy endpoints (for other database operations)
app.get('/api/supabase/*', verifyToken, async (req, res) => {
    try {
        const supabasePath = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
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

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Send relocation mail endpoint
app.post('/api/send-relocation-mail', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT, 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        const mailOptions = {
            from: process.env.SMTP_USER,
            to: ['markdidenkowork@gmail.com', 'markdidenkowork@yandex.com'],
            subject: 'Результаты перемещений',
            text: 'Во вложении файл с результатами перемещений.',
            attachments: [
                {
                    filename: 'relocation.xlsx',
                    content: req.file.buffer
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (err) {
        console.error('Mail send error:', err);
        res.status(500).json({ error: 'Ошибка отправки письма' });
    }
});

// Serve your main HTML file for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
