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

// Helper function to get user profile from session
async function getUserFromSession(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    throw new Error('No authorization token provided');
  }
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new Error('Invalid or expired token');
  }
  
  return user;
}

// Get bank items for the authenticated user
app.get('/api/bank/items', async (req, res) => {
  try {
    const user = await getUserFromSession(req);
    
    // Get bank items (ingredients, consumables, etc.)
    const { data: bankItems, error: bankError } = await supabase
      .from('bank')
      .select(`
        id,
        item,
        amount,
        type,
        profession_id,
        professions:profession_id (name)
      `)
      .eq('player_id', user.id);
    
    if (bankError) {
      console.error('Bank query error:', bankError);
      return res.status(500).json({ error: 'Failed to fetch bank items' });
    }
    
    // Get unequipped gear from craft_sessions
    const { data: unequippedGear, error: gearError } = await supabase
      .from('craft_sessions')
      .select(`
        id,
        result as item,
        result_stats,
        sprite,
        type,
        profession_id,
        professions:profession_id (name)
      `)
      .eq('player_id', user.id)
      .is('equipped_by', null)
      .not('result', 'is', null);
    
    if (gearError) {
      console.error('Gear query error:', gearError);
      return res.status(500).json({ error: 'Failed to fetch gear items' });
    }
    
    // Get all unique item names for sprite lookup
    const allBankItemNames = bankItems.map(item => item.item);
    const allGearItemNames = unequippedGear.map(item => item.item);
    const allItemNames = [...new Set([...allBankItemNames, ...allGearItemNames])];
    
    let spritePathMap = {};
    
    if (allItemNames.length > 0) {
      // Fetch from ingredients table
      const { data: ingredients, error: ingredientsError } = await supabase
        .from('ingridients')
        .select('name, sprite')
        .in('name', allItemNames);
      
      if (!ingredientsError && ingredients) {
        ingredients.forEach(item => {
          if (item.sprite) {
            const fileName = item.sprite.endsWith('.png') ? item.sprite : `${item.sprite}.png`;
            spritePathMap[item.name] = `assets/art/ingridients/${fileName}`;
          }
        });
      }
      
      // Fetch from recipes table
      const { data: recipes, error: recipesError } = await supabase
        .from('recipes')
        .select('name, sprite')
        .in('name', allItemNames);
      
      if (!recipesError && recipes) {
        recipes.forEach(item => {
          if (item.sprite) {
            const fileName = item.sprite.endsWith('.png') ? item.sprite : `${item.sprite}.png`;
            spritePathMap[item.name] = `assets/art/recipes/${fileName}`;
          }
        });
      }
    }
    
    // Process bank items
    const processedBankItems = bankItems.map(item => ({
      ...item,
      source: 'bank',
      spritePath: spritePathMap[item.item] || null,
      amount: item.amount || 1
    }));
    
    // Process gear items (use sprite from craft_sessions if available)
    const processedGearItems = unequippedGear.map(item => ({
      ...item,
      source: 'gear',
      spritePath: item.sprite || spritePathMap[item.item] || null,
      amount: 1 // Gear items are always quantity 1
    }));
    
    // Combine and return all items
    const allItems = [...processedBankItems, ...processedGearItems];
    
    res.json({
      success: true,
      data: allItems,
      meta: {
        bankItemsCount: processedBankItems.length,
        gearItemsCount: processedGearItems.length,
        totalItems: allItems.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching bank items:', error);
    res.status(500).json({ 
      error: 'Failed to fetch bank items',
      message: error.message 
    });
  }
});

// Get available filter types for the user's bank
app.get('/api/bank/filters', async (req, res) => {
  try {
    const user = await getUserFromSession(req);
    
    // Get unique types from bank
    const { data: bankTypes, error: bankError } = await supabase
      .from('bank')
      .select('type')
      .eq('player_id', user.id)
      .not('type', 'is', null);
    
    // Get unique types from unequipped gear
    const { data: gearTypes, error: gearError } = await supabase
      .from('craft_sessions')
      .select('type')
      .eq('player_id', user.id)
      .is('equipped_by', null)
      .not('result', 'is', null)
      .not('type', 'is', null);
    
    if (bankError || gearError) {
      return res.status(500).json({ error: 'Failed to fetch filter types' });
    }
    
    const allTypes = [
      ...(bankTypes || []).map(item => item.type),
      ...(gearTypes || []).map(item => item.type)
    ];
    
    const uniqueTypes = [...new Set(allTypes)].filter(type => type).sort();
    
    res.json({
      success: true,
      data: ['all', ...uniqueTypes]
    });
    
  } catch (error) {
    console.error('Error fetching filter types:', error);
    res.status(500).json({ 
      error: 'Failed to fetch filter types',
      message: error.message 
    });
  }
});

// Get specific item details (for modals, tooltips, etc.)
app.get('/api/bank/item/:source/:id', async (req, res) => {
  try {
    const user = await getUserFromSession(req);
    const { source, id } = req.params;
    
    let item = null;
    
    if (source === 'bank') {
      const { data, error } = await supabase
        .from('bank')
        .select(`
          id,
          item,
          amount,
          type,
          profession_id,
          professions:profession_id (name)
        `)
        .eq('id', id)
        .eq('player_id', user.id)
        .single();
      
      if (error) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      item = data;
    } else if (source === 'gear') {
      const { data, error } = await supabase
        .from('craft_sessions')
        .select(`
          id,
          result as item,
          result_stats,
          sprite,
          type,
          profession_id,
          professions:profession_id (name),
          ingredients,
          start_properties,
          end_properties
        `)
        .eq('id', id)
        .eq('player_id', user.id)
        .is('equipped_by', null)
        .single();
      
      if (error) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      item = data;
    } else {
      return res.status(400).json({ error: 'Invalid source' });
    }
    
    res.json({
      success: true,
      data: {
        ...item,
        source
      }
    });
    
  } catch (error) {
    console.error('Error fetching item details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch item details',
      message: error.message 
    });
  }
});

// Remove/delete item from bank
app.delete('/api/bank/item/:source/:id', async (req, res) => {
  try {
    const user = await getUserFromSession(req);
    const { source, id } = req.params;
    const { amount } = req.body; // Optional: for partial removal
    
    if (source === 'bank') {
      if (amount && amount > 0) {
        // Partial removal - decrease amount
        const { data: currentItem, error: fetchError } = await supabase
          .from('bank')
          .select('amount')
          .eq('id', id)
          .eq('player_id', user.id)
          .single();
        
        if (fetchError || !currentItem) {
          return res.status(404).json({ error: 'Item not found' });
        }
        
        const newAmount = currentItem.amount - amount;
        
        if (newAmount <= 0) {
          // Remove completely if amount reaches 0 or below
          const { error } = await supabase
            .from('bank')
            .delete()
            .eq('id', id)
            .eq('player_id', user.id);
          
          if (error) {
            return res.status(500).json({ error: 'Failed to remove item' });
          }
        } else {
          // Update with new amount
          const { error } = await supabase
            .from('bank')
            .update({ amount: newAmount })
            .eq('id', id)
            .eq('player_id', user.id);
          
          if (error) {
            return res.status(500).json({ error: 'Failed to update item amount' });
          }
        }
      } else {
        // Complete removal
        const { error } = await supabase
          .from('bank')
          .delete()
          .eq('id', id)
          .eq('player_id', user.id);
        
        if (error) {
          return res.status(500).json({ error: 'Failed to remove item' });
        }
      }
    } else if (source === 'gear') {
      // For gear, we don't delete from craft_sessions, we might mark it as deleted
      // or move it to a different table, depending on your game logic
      // For now, let's just return an error as gear deletion needs special handling
      return res.status(400).json({ 
        error: 'Gear deletion requires special handling',
        message: 'Contact support to delete crafted gear items'
      });
    } else {
      return res.status(400).json({ error: 'Invalid source' });
    }
    
    res.json({
      success: true,
      message: 'Item processed successfully'
    });
    
  } catch (error) {
    console.error('Error removing item:', error);
    res.status(500).json({ 
      error: 'Failed to remove item',
      message: error.message 
    });
  }
});




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
