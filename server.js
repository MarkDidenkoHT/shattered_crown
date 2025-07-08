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
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://cdn.sheetjs.com"
      ],
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

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Only expose public/anon keys!
const PUBLIC_CONFIG = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY, // Only anon/public key!
};

// Configuration endpoint
app.get('/api/config', (req, res) => {
  res.json(PUBLIC_CONFIG);
});

// Supabase proxy endpoints
app.get('/api/supabase/*', async (req, res) => {
    try {
        const supabasePath = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': process.env.SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
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

app.post('/api/supabase/*', async (req, res) => {
    try {
        const supabasePath = req.params[0];
        const url = `${process.env.SUPABASE_URL}/${supabasePath}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
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

app.patch('/api/supabase/*', async (req, res) => {
    try {
        const supabasePath = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
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

app.delete('/api/supabase/*', async (req, res) => {
    try {
        const supabasePath = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const url = `${process.env.SUPABASE_URL}/${supabasePath}${queryString ? '?' + queryString : ''}`;

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'apikey': process.env.SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Supabase error: ${response.status}` });
        }

        // DELETE might return empty response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            res.status(204).send();
        }
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
        // SMTP config from env
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