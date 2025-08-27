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
            scriptSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "https://cdn.jsdelivr.net", 
                "https://cdnjs.cloudflare.com", 
                "https://telegram.org", 
                "https://esm.sh",
                "https://cdn.weglot.com",  // Add Weglot CDN
                "https://api.weglot.com"   // Weglot API
            ],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "https://fonts.googleapis.com", 
                "https://cdn.jsdelivr.net",
                "https://cdn.weglot.com"   // Weglot styles
            ],
            fontSrc: [
                "'self'", 
                "https://fonts.gstatic.com",
                "https://cdn.weglot.com"   // Weglot fonts
            ],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: [
                "'self'", 
                "https:", 
                "wss:", 
                "wss://lzdlfcapkfcobutadffa.supabase.co",
                "https://api.weglot.com"   // Weglot API connections
            ],
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

// Add these endpoints to your existing server.js file

// Get all active auctions (status = false)
app.get('/api/auction/active', requireAuth, async (req, res) => {
    try {
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/auction?status=eq.false&select=*,seller:seller_id(chat_id)`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const auctions = await response.json();
        res.json(auctions);
    } catch (error) {
        console.error('[AUCTION ACTIVE]', error);
        res.status(500).json({ error: 'Failed to fetch active auctions' });
    }
});

// Get player's bank items for selling
app.get('/api/auction/bank/:playerId', requireAuth, async (req, res) => {
    try {
        const { playerId } = req.params;
        
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?player_id=eq.${playerId}&select=*,professions(name)`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const bankItems = await response.json();
        res.json(bankItems);
    } catch (error) {
        console.error('[AUCTION BANK]', error);
        res.status(500).json({ error: 'Failed to fetch bank items' });
    }
});

// Get all unique items from recipes and ingredients for trade selection
app.get('/api/auction/items', requireAuth, async (req, res) => {
    try {
        // Get unique items from both tables
        const [recipesResponse, ingredientsResponse] = await Promise.all([
            fetch(`${process.env.SUPABASE_URL}/rest/v1/recipes?select=name,sprite,type`, {
                headers: {
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                }
            }),
            fetch(`${process.env.SUPABASE_URL}/rest/v1/ingridients?select=name,sprite`, {
                headers: {
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                }
            })
        ]);

        const [recipes, ingredients] = await Promise.all([
            recipesResponse.json(),
            ingredientsResponse.json()
        ]);

        // Combine and deduplicate items
        const itemMap = new Map();
        
        // Add ingredients
        ingredients.forEach(item => {
            if (item.name) {
                itemMap.set(item.name, {
                    name: item.name,
                    sprite: item.sprite,
                    spritePath: item.sprite ? `assets/art/ingridients/${item.sprite.endsWith('.png') ? item.sprite : item.sprite + '.png'}` : null,
                    type: 'ingredient'
                });
            }
        });
        
        // Add recipes (may override ingredients if same name)
        recipes.forEach(item => {
            if (item.name) {
                itemMap.set(item.name, {
                    name: item.name,
                    sprite: item.sprite,
                    spritePath: item.sprite ? `assets/art/recipes/${item.sprite.endsWith('.png') ? item.sprite : item.sprite + '.png'}` : null,
                    type: item.type || 'recipe'
                });
            }
        });

        const uniqueItems = Array.from(itemMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        res.json(uniqueItems);
    } catch (error) {
        console.error('[AUCTION ITEMS]', error);
        res.status(500).json({ error: 'Failed to fetch available items' });
    }
});

app.post('/api/auction/create', requireAuth, async (req, res) => {
    try {
        const { seller_id, item_selling, amount_selling, item_wanted, amount_wanted } = req.body;

        if (!seller_id || !item_selling || !amount_selling || !item_wanted || !amount_wanted) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const bankUrl = `${process.env.SUPABASE_URL}/rest/v1/bank?player_id=eq.${seller_id}&item=eq.${item_selling}`;

        const bankResponse = await fetch(bankUrl, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        console.log('Bank response status:', bankResponse.status);
        
        if (!bankResponse.ok) {
            const errorText = await bankResponse.text();
            console.log('❌ Bank query failed:', errorText);
            return res.status(500).json({ error: 'Failed to check bank items' });
        }

        const bankItems = await bankResponse.json();
        const totalAmount = bankItems.reduce((sum, item) => sum + (item.amount || 0), 0);

        if (totalAmount < amount_selling) {
            console.log('❌ Insufficient items in bank');
            return res.status(400).json({ error: 'Insufficient items in bank' });
        }

        let remainingToRemove = amount_selling;
        for (const bankItem of bankItems) {
            if (remainingToRemove <= 0) break;

            const amountToTake = Math.min(remainingToRemove, bankItem.amount);
            remainingToRemove -= amountToTake;

            if (amountToTake === bankItem.amount) {
                // Remove entire entry
                const deleteResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?id=eq.${bankItem.id}`, {
                    method: 'DELETE',
                    headers: {
                        'apikey': process.env.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                    }
                });
                if (!deleteResponse.ok) {
                    const deleteError = await deleteResponse.text();
                }
            } else {
                // Update amount
                const updateResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?id=eq.${bankItem.id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': process.env.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({ amount: bankItem.amount - amountToTake })
                });
                console.log('Update bank entry response status:', updateResponse.status);
                if (!updateResponse.ok) {
                    const updateError = await updateResponse.text();
                    console.log('❌ Update failed:', updateError);
                }
            }
        }


        const auctionData = {
            seller_id,
            item_selling,
            amount_selling,
            item_selling_type: req.body.item_selling_type,   
            item_wanted,
            amount_wanted,
            item_wanted_type: req.body.item_wanted_type,    
            status: false
        };

        
        const auctionUrl = `${process.env.SUPABASE_URL}/rest/v1/auction`;
        console.log('Auction creation URL:', auctionUrl);

        const auctionResponse = await fetch(auctionUrl, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(auctionData)
        });
        
        const responseText = await auctionResponse.text();
        console.log('Auction response body (text):', responseText);

        let newAuction;
        try {
            newAuction = JSON.parse(responseText);
            console.log('Auction response body (parsed):', newAuction);
        } catch (parseError) {
            console.log('❌ Failed to parse auction response as JSON:', parseError);
            return res.status(500).json({ error: 'Invalid response from database' });
        }

        if (!auctionResponse.ok) {
            try {
                await addItemsToBank(seller_id, item_selling, amount_selling);
                console.log('✅ Items restored to bank');
            } catch (restoreError) {
                console.log('❌ Failed to restore items:', restoreError);
            }
            return res.status(auctionResponse.status).json({ error: newAuction.message || 'Failed to create auction' });
        }

        if (!newAuction || newAuction.length === 0) {

            try {
                await addItemsToBank(seller_id, item_selling, amount_selling);
                console.log('✅ Items restored to bank');
            } catch (restoreError) {
                console.log('❌ Failed to restore items:', restoreError);
            }
            return res.status(500).json({ error: 'No auction data returned' });
        }

        res.json({ success: true, auction: newAuction[0] });
    } catch (error) {
        console.error('❌ [AUCTION CREATE ERROR]', error);
        res.status(500).json({ error: 'Failed to create auction', details: error.message });
    }
});

async function sendTelegramNotification(chatId, message) {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.warn('TELEGRAM_BOT_TOKEN not set - skipping notification');
        return;
    }

    if (!chatId) {
        console.warn('No chatId provided - skipping notification');
        return;
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Failed to send Telegram notification:', error);
        }
    } catch (error) {
        console.error('Error sending Telegram notification:', error);
    }
}

app.post('/api/auction/buy', requireAuth, async (req, res) => {
    try {
        const { auction_id, buyer_id } = req.body;

        if (!auction_id || !buyer_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const auctionResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/auction?id=eq.${auction_id}&status=eq.false&select=*,seller:seller_id(chat_id,account_name)`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const auctions = await auctionResponse.json();
        if (auctions.length === 0) {
            return res.status(404).json({ error: 'Auction not found or already sold' });
        }

        const auction = auctions[0];
        const seller = auction.seller; // Contains chat_id and account_name

        // Prevent self-purchase
        if (auction.seller_id === buyer_id) {
            return res.status(400).json({ error: 'Cannot buy your own auction' });
        }

        // Get buyer's profile for notification
        const buyerProfileResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${buyer_id}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });
        const buyerProfiles = await buyerProfileResponse.json();
        const buyerProfile = buyerProfiles.length > 0 ? buyerProfiles[0] : null;

        // Check if buyer has required items
        const buyerBankResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?player_id=eq.${buyer_id}&item=eq.${auction.item_wanted}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const buyerItems = await buyerBankResponse.json();
        const buyerTotal = buyerItems.reduce((sum, item) => sum + (item.amount || 0), 0);

        if (buyerTotal < auction.amount_wanted) {
            return res.status(400).json({ error: 'Insufficient items to complete purchase' });
        }

        // Remove items from buyer's bank
        let remainingToRemove = auction.amount_wanted;
        for (const bankItem of buyerItems) {
            if (remainingToRemove <= 0) break;

            const amountToTake = Math.min(remainingToRemove, bankItem.amount);
            remainingToRemove -= amountToTake;

            if (amountToTake === bankItem.amount) {
                await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?id=eq.${bankItem.id}`, {
                    method: 'DELETE',
                    headers: {
                        'apikey': process.env.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                    }
                });
            } else {
                await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?id=eq.${bankItem.id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': process.env.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ amount: bankItem.amount - amountToTake })
                });
            }
        }

        await addItemsToBank(buyer_id, auction.item_selling, auction.amount_selling, auction.item_selling_type);
        await addItemsToBank(auction.seller_id, auction.item_wanted, auction.amount_wanted, auction.item_wanted_type);

        const updateResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/auction?id=eq.${auction_id}`, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                status: true, 
                buyer_id,
                modified_at: new Date().toISOString()
            })
        });

        if (!updateResponse.ok) {
            throw new Error('Failed to update auction status');
        }

        // Send notification to seller
        if (seller && seller.chat_id) {
            const buyerName = buyerProfile?.account_name || 'Another player';
            const message = `
<b>Your item has been sold!</b>

<b>Item sold:</b> ${auction.amount_selling}x ${auction.item_selling}
<b>Received:</b> ${auction.amount_wanted}x ${auction.item_wanted}
<b>Buyer:</b> ${buyerName}

The items have been added to your bank.
            `;
            
            await sendTelegramNotification(seller.chat_id, message);
        }

        res.json({ success: true, message: 'Purchase completed successfully' });
    } catch (error) {
        console.error('[AUCTION BUY]', error);
        res.status(500).json({ error: 'Failed to complete purchase', details: error.message });
    }
});

// Cancel auction (seller only)
app.delete('/api/auction/cancel/:auctionId', requireAuth, async (req, res) => {
    try {
        const { auctionId } = req.params;
        const { seller_id } = req.body;

        if (!seller_id) {
            return res.status(400).json({ error: 'Seller ID required' });
        }

        // Get auction details
        const auctionResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/auction?id=eq.${auctionId}&seller_id=eq.${seller_id}&status=eq.false`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const auctions = await auctionResponse.json();
        if (auctions.length === 0) {
            return res.status(404).json({ error: 'Auction not found or cannot be cancelled' });
        }

        const auction = auctions[0];

        // Return items to seller's bank
        await addItemsToBank(seller_id, auction.item_selling, auction.amount_selling, auction.item_selling_type);

        // Delete auction
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/auction?id=eq.${auctionId}`, {
            method: 'DELETE',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        res.json({ success: true, message: 'Auction cancelled and items returned' });
    } catch (error) {
        console.error('[AUCTION CANCEL]', error);
        res.status(500).json({ error: 'Failed to cancel auction' });
    }
});

// Get player's auction listings
app.get('/api/auction/my-listings/:playerId', requireAuth, async (req, res) => {
    try {
        const { playerId } = req.params;
        
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/auction?seller_id=eq.${playerId}&order=created_at.desc`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const auctions = await response.json();
        res.json(auctions);
    } catch (error) {
        console.error('[MY LISTINGS]', error);
        res.status(500).json({ error: 'Failed to fetch your listings' });
    }
});

// Helper function to add items to bank
async function addItemsToBank(playerId, itemName, amount, itemType) {
    // Check if player already has this item in bank
    const existingResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?player_id=eq.${playerId}&item=eq.${itemName}`, {
        headers: {
            'apikey': process.env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
    });

    const existingItems = await existingResponse.json();
    
    if (existingItems.length > 0) {
        // Update existing item
        const existingItem = existingItems[0];
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?id=eq.${existingItem.id}`, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount: existingItem.amount + amount })
        });
    } else {
        // Create new bank entry with correct type
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                player_id: playerId,
                item: itemName,
                amount: amount,
                type: itemType   // 👈 use correct type here
            })
        });
    }
}

// Add these endpoints to your existing server.js file

// Get player's bank items (consumables, ingredients, and unequipped gear)
app.get('/api/bank/items/:playerId', async (req, res) => {
    try {
        const { playerId } = req.params;
        
        // Validate playerId format (basic UUID check)
        if (!playerId || !playerId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            return res.status(400).json({ error: 'Invalid player ID format' });
        }

        // Get consumables and ingredients from bank table
        const bankResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?player_id=eq.${playerId}&select=*,professions(name)`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        if (!bankResponse.ok) {
            throw new Error(`Bank query failed: ${bankResponse.status}`);
        }

        const bankItems = await bankResponse.json();

        // Get unequipped gear from craft_sessions table
        const gearResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/craft_sessions?player_id=eq.${playerId}&equipped_by=is.null&result=not.is.null&select=id,result,sprite,type,result_stats`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        if (!gearResponse.ok) {
            throw new Error(`Gear query failed: ${gearResponse.status}`);
        }

        const gearItems = await gearResponse.json();

        // Get all unique item names for sprite lookup
        const allItemNames = [
            ...bankItems.map(item => item.item),
            ...gearItems.map(item => item.result)
        ].filter(name => name);

        const uniqueItemNames = [...new Set(allItemNames)];

        // Build sprite path map
        let spritePathMap = {};

        if (uniqueItemNames.length > 0) {
            const itemNameQuery = uniqueItemNames.map(name => `"${name}"`).join(',');
            
            // Check ingredients table
            try {
                const ingredientsResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ingridients?name=in.(${itemNameQuery})&select=name,sprite`, {
                    headers: {
                        'apikey': process.env.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                    }
                });

                if (ingredientsResponse.ok) {
                    const ingredients = await ingredientsResponse.json();
                    ingredients.forEach(item => {
                        if (item.sprite) {
                            const fileName = item.sprite.endsWith('.png') ? item.sprite : `${item.sprite}.png`;
                            spritePathMap[item.name] = `assets/art/ingridients/${fileName}`;
                        }
                    });
                }
            } catch (error) {
                console.warn('Failed to fetch ingredients sprites:', error);
            }
            
            // Check recipes table
            try {
                const recipesResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/recipes?name=in.(${itemNameQuery})&select=name,sprite`, {
                    headers: {
                        'apikey': process.env.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                    }
                });

                if (recipesResponse.ok) {
                    const recipes = await recipesResponse.json();
                    recipes.forEach(item => {
                        if (item.sprite) {
                            const fileName = item.sprite.endsWith('.png') ? item.sprite : `${item.sprite}.png`;
                            spritePathMap[item.name] = `assets/art/recipes/${fileName}`;
                        }
                    });
                }
            } catch (error) {
                console.warn('Failed to fetch recipes sprites:', error);
            }
        }

        // Format bank items (consumables/ingredients)
        const formattedBankItems = bankItems.map(item => ({
            id: item.id,
            item: item.item,
            amount: item.amount || 1,
            type: item.type || 'consumable',
            profession_name: item.professions?.name || null,
            sprite_path: spritePathMap[item.item] || null,
            source: 'bank'
        }));

        // Format gear items (from craft_sessions)
        const formattedGearItems = gearItems.map(item => ({
            id: item.id,
            item: item.result,
            amount: 1,
            type: item.type || 'equipment',
            profession_name: null,
            sprite_path: item.sprite ? `assets/art/recipes/${item.sprite.endsWith('.png') ? item.sprite : item.sprite + '.png'}` : spritePathMap[item.result] || null,
            source: 'craft_sessions',
            stats: item.result_stats
        }));

        // Combine all items
        const allItems = [...formattedBankItems, ...formattedGearItems];

        res.json(allItems);
    } catch (error) {
        console.error('[BANK ITEMS]', error);
        res.status(500).json({ error: 'Failed to fetch bank items', details: error.message });
    }
});


// Get crafting materials for a specific profession
app.get('/api/crafting/materials/:playerId/:professionId', async (req, res) => {
    try {
        const { playerId, professionId } = req.params;
        
        // Validate input parameters
        if (!playerId || !playerId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            return res.status(400).json({ error: 'Invalid player ID format' });
        }

        if (!professionId || isNaN(parseInt(professionId))) {
            return res.status(400).json({ error: 'Invalid profession ID format' });
        }

        // Get bank items for the specific profession
        const bankResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?player_id=eq.${playerId}&profession_id=eq.${professionId}&select=item,amount`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        if (!bankResponse.ok) {
            throw new Error(`Bank query failed: ${bankResponse.status}`);
        }

        const bankItems = await bankResponse.json();
        
        // Return the raw bank items - let frontend handle enrichment
        res.json(bankItems);
        
    } catch (error) {
        console.error('[CRAFTING MATERIALS]', error);
        res.status(500).json({ error: 'Failed to fetch crafting materials', details: error.message });
    }
});

// Enrich ingredients with properties and sprites
app.post('/api/crafting/enrich-ingredients', async (req, res) => {
    try {
        const { itemNames } = req.body;
        
        // Validate input
        if (!Array.isArray(itemNames) || itemNames.length === 0) {
            return res.status(400).json({ error: 'itemNames array is required' });
        }

        // Sanitize item names
        const sanitizedNames = itemNames
            .filter(name => name && typeof name === 'string')
            .map(name => name.trim())
            .filter(name => name.length > 0);

        if (sanitizedNames.length === 0) {
            return res.status(400).json({ error: 'No valid item names provided' });
        }

        const uniqueNames = [...new Set(sanitizedNames)];
        const namesQuery = uniqueNames.map(name => `"${name}"`).join(',');
        
        // Fetch ingredient data
        const ingredientsResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ingridients?name=in.(${namesQuery})&select=name,properties,sprite`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        if (!ingredientsResponse.ok) {
            throw new Error(`Ingredients query failed: ${ingredientsResponse.status}`);
        }

        const ingredients = await ingredientsResponse.json();
        
        // Create ingredient map for quick lookups
        const ingredientMap = {};
        ingredients.forEach(ingredient => {
            ingredientMap[ingredient.name] = ingredient;
        });
        
        res.json({
            ingredientMap,
            foundCount: ingredients.length,
            requestedCount: uniqueNames.length
        });
        
    } catch (error) {
        console.error('[ENRICH INGREDIENTS]', error);
        res.status(500).json({ error: 'Failed to enrich ingredients', details: error.message });
    }
});

app.post('/api/crafting/reserve-blacksmith-ingredients', async (req, res) => {
    try {
        const { player_id, profession_id, selected_bar, selected_powder, item_name, item_type } = req.body;
        
        // Validate required fields
        if (!player_id || !profession_id || !selected_bar || !selected_powder || !item_name || !item_type) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }

        // Validate player ID format
        if (!player_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid player ID format' 
            });
        }

        // Call the Supabase edge function
        const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/reserve_blacksmith_ingredients`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                player_id,
                profession_id,
                selected_bar,
                selected_powder,
                item_name,
                item_type
            })
        });

        // Handle both JSON and text responses
        const contentType = response.headers.get('content-type');
        let responseData;
        
        if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
        } else {
            const textData = await response.text();
            try {
                responseData = JSON.parse(textData);
            } catch (parseError) {
                return res.status(500).json({
                    success: false,
                    error: 'Invalid response from crafting service'
                });
            }
        }

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: responseData.error || 'Failed to reserve ingredients'
            });
        }

        res.json(responseData);
        
    } catch (error) {
        console.error('[RESERVE BLACKSMITH INGREDIENTS]', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to reserve ingredients', 
            details: error.message 
        });
    }
});


async function finishForging(resultDiv) {
  try {
    const payload = {
      player_id: context.profile.id,
      profession_id: forgingState.professionId,
      session_id: forgingState.sessionId,
      bonus_assignments: forgingState.bonusAssignments
    };
    
    const res = await context.apiCall('/functions/v1/craft_blacksmith', {
      method: 'POST',
      body: payload
    });

    const json = await res.json();
    
    if (!res.ok) {
      resultDiv.innerHTML = `
        <span style="color:red;">🔥 Forging Error (${res.status})</span>
        <br><small style="color:#999;">${json.error || json.message || 'Unknown server error'}</small>
      `;
      
      const finishBtn = document.querySelector('#finish-btn');
      if (finishBtn) finishBtn.disabled = false;
      return; 
    }

    const claimBtn = document.querySelector('#claim-btn');
    const finishBtn = document.querySelector('#finish-btn');
    const craftBtn = document.querySelector('#craft-btn');

    if (json.success) {
      forgingState.result = json.crafted.name;
      resultDiv.innerHTML = `<span style="color:lime;">🔨 Successfully forged: <strong>${json.crafted.name}</strong>!</span>`;

      animateSuccessfulForging();

      if (finishBtn) finishBtn.style.display = 'none';
      if (claimBtn) {
        claimBtn.style.display = 'block';
        claimBtn.disabled = false;
        
        const newClaimBtn = claimBtn.cloneNode(true);
        claimBtn.parentNode.replaceChild(newClaimBtn, claimBtn);
        
        newClaimBtn.addEventListener('click', () => {
          context.displayMessage(`${json.crafted.name} added to your bank!`);
          document.querySelector('.custom-message-box')?.remove();
          forgingState = null;
        });
      }
    } else {
      forgingState.result = 'Failed';
      resultDiv.innerHTML = `
        <span style="color:red;">💥 Forging failed — materials ruined.</span>
        <br><small style="color:#999;">${json.message || 'Something went wrong in the forge'}</small>
      `;

      animateFailedForging();

      if (finishBtn) finishBtn.style.display = 'none';
      if (claimBtn) claimBtn.style.display = 'none';
      
      if (craftBtn) {
        craftBtn.style.display = 'block';
        craftBtn.textContent = 'Forge Again';
        craftBtn.disabled = false;
        
        const newCraftBtn = craftBtn.cloneNode(true);
        craftBtn.parentNode.replaceChild(newCraftBtn, craftBtn);
        
        newCraftBtn.addEventListener('click', () => {
          document.querySelector('.custom-message-box')?.remove();
          startCraftingSession(context);
        });
      }
    }
  } catch (err) {
    resultDiv.innerHTML = '<span style="color:red;">⚠️ Forge malfunction. Try again later.</span>';
    
    const finishBtn = document.querySelector('#finish-btn');
    const claimBtn = document.querySelector('#claim-btn');
    const craftBtn = document.querySelector('#craft-btn');
    
    if (finishBtn) finishBtn.style.display = 'none';
    if (claimBtn) claimBtn.style.display = 'none';
    
    if (craftBtn) {
      craftBtn.style.display = 'block';
      craftBtn.textContent = 'Try Again';
      craftBtn.disabled = false;
      
      const newCraftBtn = craftBtn.cloneNode(true);
      craftBtn.parentNode.replaceChild(newCraftBtn, craftBtn);
      
      newCraftBtn.addEventListener('click', () => {
        document.querySelector('.custom-message-box')?.remove();
        startCraftingSession(context);
      });
    }
  }
}


app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

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

        // Handle both JSON and text responses
        const contentType = response.headers.get('content-type');
        let responseData;
        
        if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
            res.status(response.status).json(responseData);
        } else {
            responseData = await response.text();
            res.status(response.status).send(responseData);
        }
        
        console.log(`[FUNCTIONS PROXY] ${req.method} ${supabasePath} - Status: ${response.status}`);
        
    } catch (error) {
        console.error('[FUNCTIONS PROXY]', error);
        res.status(500).json({ error: 'Proxy error', details: error.message });
    }
});