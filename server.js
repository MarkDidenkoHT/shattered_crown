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

// Get all active auctions (status = false)
app.get('/api/auction/active', async (req, res) => {
    try {
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/auction?status=eq.false&select=*,seller:seller_id(chat_id)`, {
            headers: {
                'apikey': process.env.SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Supabase response: ${response.status} ${response.statusText}`, errorText);
            return res.status(response.status).json({ 
                error: `Failed to fetch auctions: ${response.status}` 
            });
        }

        const auctions = await response.json();
        res.json(auctions);
    } catch (error) {
        console.error('[AUCTION ACTIVE]', error);
        res.status(500).json({ error: 'Failed to fetch active auctions' });
    }
});

app.get('/api/auction/bank/:playerId', async (req, res) => {
  const { playerId } = req.params;

  try {
    // Fetch bank items
    const bankResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/bank?player_id=eq.${playerId}&amount=gt.0&select=*,professions(name)`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );
    const bankItems = await bankResponse.json();

    // Fetch unequipped crafted gear (exclude fail/success results)
    const gearResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/craft_sessions?player_id=eq.${playerId}&equipped_by=is.null&result=not.in.(fail,success)`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );
    const craftedGear = await gearResponse.json();

    // Normalize crafted gear format
    const gearItems = craftedGear.map(g => ({
      id: g.id,
      item: g.result || 'Crafted Item',
      type: g.type || 'gear',
      professions: { name: 'Crafting' },
      amount: 1,
      spritePath: g.sprite || 'assets/art/recipes/default_item.png',
      stats: g.result_stats,
      isGear: true
    }));

    res.json([...bankItems, ...gearItems]);
  } catch (error) {
    console.error('[BANK ITEMS + CRAFTED GEAR]', error);
    res.status(500).json({ error: 'Failed to fetch items available for auction' });
  }
});

// Get all unique items from recipes and ingredients for trade selection
app.get('/api/auction/items', async (req, res) => {  // Added 'req' parameter
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
          spritePath: item.sprite
            ? `assets/art/ingridients/${item.sprite.endsWith('.png') ? item.sprite : item.sprite + '.png'}`
            : null,
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
          spritePath: item.sprite
            ? `assets/art/recipes/${item.sprite.endsWith('.png') ? item.sprite : item.sprite + '.png'}`
            : null,
          type: item.type || 'recipe'
        });
      }
    });

    const uniqueItems = Array.from(itemMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    res.json(uniqueItems);
  } catch (error) {
    console.error('[AUCTION ITEMS]', error);
    res.status(500).json({ error: 'Failed to fetch available items' });
  }
});

app.post('/api/auction/create', async (req, res) => {
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
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?id=eq.${bankItem.id}`, {
          method: 'DELETE',
          headers: {
            'apikey': process.env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
          }
        });
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

// Helper: transfer crafted gear from seller → buyer
async function transferGearItem(gearId, buyerId) {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/craft_sessions?id=eq.${gearId}`, {
        method: 'PATCH',
        headers: {
            'apikey': process.env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ player_id: buyerId, equipped_by: null })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to transfer gear: ${text}`);
    }
}

app.post('/api/auction/buy', async (req, res) => {
  try {
    const { auction_id, buyer_id } = req.body;
    if (!auction_id || !buyer_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get auction with seller details
    const auctionResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/auction?id=eq.${auction_id}&status=eq.false&select=*,seller:seller_id(chat_id,account_name)`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );

    const auctions = await auctionResponse.json();
    if (auctions.length === 0) {
      return res.status(404).json({ error: 'Auction not found or already sold' });
    }

    const auction = auctions[0];
    const seller = auction.seller;

    // Prevent self-buy
    if (auction.seller_id === buyer_id) {
      return res.status(400).json({ error: 'Cannot buy your own auction' });
    }

    // Fetch buyer profile (for notification)
    const buyerProfileResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${buyer_id}`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );
    const buyerProfiles = await buyerProfileResponse.json();
    const buyerProfile = buyerProfiles.length > 0 ? buyerProfiles[0] : null;

    // 1️⃣ Deduct wanted items from buyer
    if (auction.item_wanted_type === 'gear') {
      return res.status(400).json({ error: 'Trading gear for gear not supported yet' });
    } else {
      const buyerBankResponse = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/bank?player_id=eq.${buyer_id}&item=eq.${auction.item_wanted}`,
        {
          headers: {
            'apikey': process.env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
          }
        }
      );

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

      // Seller receives wanted bank items
      await addItemsToBank(auction.seller_id, auction.item_wanted, auction.amount_wanted, auction.item_wanted_type);
    }

    // 2️⃣ Transfer selling item → buyer
    if (auction.item_selling_type === 'gear') {
      await transferGearItem(auction.item_selling_id, buyer_id);
    } else {
      await addItemsToBank(buyer_id, auction.item_selling, auction.amount_selling, auction.item_selling_type);
    }

    // 3️⃣ Update auction status
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

    // 4️⃣ Notify seller via Telegram
    if (seller && seller.chat_id) {
      const buyerName = buyerProfile?.account_name || 'Another player';
      const message = `
<b>Your item has been sold!</b>

<b>Item sold:</b> ${auction.amount_selling}x ${auction.item_selling}
<b>Received:</b> ${auction.amount_wanted}x ${auction.item_wanted}
<b>Buyer:</b> ${buyerName}

The items have been added to your bank.`;
      await sendTelegramNotification(seller.chat_id, message);
    }

    res.json({ success: true, message: 'Purchase completed successfully' });
  } catch (error) {
    console.error('[AUCTION BUY]', error);
    res.status(500).json({ error: 'Failed to complete purchase', details: error.message });
  }
});

// Cancel auction (seller only)
app.delete('/api/auction/cancel/:auctionId', async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { seller_id } = req.body;

    if (!seller_id) {
      return res.status(400).json({ error: 'Seller ID required' });
    }

    // Get auction details
    const auctionResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/auction?id=eq.${auctionId}&seller_id=eq.${seller_id}&status=eq.false`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );

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
app.get('/api/auction/my-listings/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/auction?seller_id=eq.${playerId}&order=created_at.desc`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );

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
        const gearResponse = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/craft_sessions
            ?player_id=eq.${playerId}
            &equipped_by=is.null
            &result=not.is.null
            &result=not.eq.success
            &result=not.eq.fail
            &sprite=not.is.null
            &select=id,result,sprite,type,result_stats`
            .replace(/\s+/g, ''), // clean up spaces/newlines
            {
                headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                }
            }
            );


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
        
        // Get bank items for the specific profession, excluding consumables
        const bankResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bank?player_id=eq.${playerId}&profession_id=eq.${professionId}&type=neq.Consumable&select=item,amount`, {
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
        
        console.log('Edge function responseData:', responseData);
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

app.post('/api/crafting/blacksmith', async (req, res) => {
    try {
        const { player_id, profession_id, session_id, bonus_assignments } = req.body;
        
        // Validate required fields
        if (!player_id || !profession_id || !session_id) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields' 
            });
        }

        // Verify player exists by checking profiles table
        const playerResponse = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${player_id}`,
            {
                headers: {
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                }
            }
        );

        const players = await playerResponse.json();
        if (players.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Player not found' 
            });
        }

        // Call the edge function with session_id + array bonus_assignments
        const craftResponse = await fetch(
            `${process.env.SUPABASE_URL}/functions/v1/craft_blacksmith`,
            {
                method: 'POST',
                headers: {
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    player_id,
                    profession_id,
                    session_id,
                    bonus_assignments: Array.isArray(bonus_assignments) 
                        ? bonus_assignments 
                        : []
                })
            }
        );

        const contentType = craftResponse.headers.get('content-type');
        let responseData;

        if (contentType && contentType.includes('application/json')) {
            responseData = await craftResponse.json();
        } else {
            const textData = await craftResponse.text();
            try {
                responseData = JSON.parse(textData);
            } catch (parseError) {
                return res.status(500).json({
                    success: false,
                    error: 'Invalid response from crafting service'
                });
            }
        }

        res.status(craftResponse.status).json(responseData);

    } catch (error) {
        console.error('[BLACKSMITH CRAFT]', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// Herbalism crafting
app.post('/api/crafting/herbalism', async (req, res) => {
    try {
        const { player_id, profession_id, seed_name, environment, fertilizer_name } = req.body;

        if (!player_id || !profession_id || !seed_name || !environment) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Verify player exists
        const playerResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${player_id}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });
        const players = await playerResponse.json();
        if (!Array.isArray(players) || players.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Player not found'
            });
        }

        // Forward to herbalism edge function
        const craftResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/craft_herbalism`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                player_id,
                profession_id,
                seed_name,
                environment,
                fertilizer_name
            })
        });

        const contentType = craftResponse.headers.get('content-type');
        let responseData;

        if (contentType && contentType.includes('application/json')) {
            responseData = await craftResponse.json();
        } else {
            const textData = await craftResponse.text();
            try {
                responseData = JSON.parse(textData);
            } catch {
                return res.status(500).json({
                    success: false,
                    error: 'Invalid response from herbalism service'
                });
            }
        }

        res.status(craftResponse.status).json(responseData);

    } catch (err) {
        console.error('[HERBALISM CRAFT]', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: err.message
        });
    }
});

// Mining / Alchemy crafting
app.post('/api/crafting/alchemy', async (req, res) => {
    try {
        const { player_id, profession_id, session_id, adjustments } = req.body;

        if (!player_id || !profession_id || !session_id || !Array.isArray(adjustments)) {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid required fields'
            });
        }

        // Verify player exists
        const playerResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${player_id}`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const players = await playerResponse.json();
        if (!Array.isArray(players) || players.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Player not found'
            });
        }

        // Forward to Supabase Edge Function
        const craftResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/craft_alchemy`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                player_id,
                profession_id,
                session_id,
                adjustments
            })
        });

        const contentType = craftResponse.headers.get('content-type');
        let responseData;

        if (contentType && contentType.includes('application/json')) {
            responseData = await craftResponse.json();
        } else {
            const textData = await craftResponse.text();
            try {
                responseData = JSON.parse(textData);
            } catch {
                return res.status(500).json({
                    success: false,
                    error: 'Invalid response from alchemy service'
                });
            }
        }

        res.status(craftResponse.status).json(responseData);

    } catch (err) {
        console.error('[ALCHEMY CRAFT]', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: err.message
        });
    }
});

// Reserve ores/ingredients for mining (alchemy start)
app.post('/api/crafting/reserve-alchemy-ingredients', async (req, res) => {
  try {
    const { player_id, profession_id, selected_ingredients } = req.body;

    if (!player_id || !profession_id || !Array.isArray(selected_ingredients) || selected_ingredients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Verify player exists
    const playerResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${player_id}`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });

    const players = await playerResponse.json();
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Forward to Supabase Edge function
    const reserveResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/reserve_ingredients`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ player_id, profession_id, selected_ingredients })
    });

    const contentType = reserveResponse.headers.get('content-type');
    let responseData;

    if (contentType && contentType.includes('application/json')) {
      responseData = await reserveResponse.json();
    } else {
      const textData = await reserveResponse.text();
      try {
        responseData = JSON.parse(textData);
      } catch {
        return res.status(500).json({
          success: false,
          error: 'Invalid response from reserve service'
        });
      }
    }

    res.status(reserveResponse.status).json(responseData);

  } catch (err) {
    console.error('[RESERVE ALCHEMY INGREDIENTS]', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

app.post('/api/promo/redeem', async (req, res) => {
    try {
        const { code, player_id } = req.body;

        if (!code || !player_id) {
            return res.status(400).json({ success: false, error: 'Missing code or player_id' });
        }

        // Call Supabase securely (keys only exist on server)
        const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/redeem_promo`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code, player_id })
        });

        const data = await response.json();
        return res.status(response.status).json(data);

    } catch (error) {
        console.error('[PROMO REDEEM]', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get recent blessings for a player
app.get('/api/promo/recent/:playerId', async (req, res) => {
    try {
        const { playerId } = req.params;

        if (!playerId) {
            return res.status(400).json({ error: 'Missing playerId' });
        }

        const response = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${playerId}&select=promos_used`,
            {
                headers: {
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                }
            }
        );

        if (!response.ok) {
            const text = await response.text();
            console.error('[PROMO RECENT] Supabase error:', text);
            return res.status(response.status).json({ error: 'Failed to fetch recent blessings' });
        }

        const profiles = await response.json();
        res.json(profiles);

    } catch (error) {
        console.error('[PROMO RECENT]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update profile language setting
app.patch('/api/profile/language/:playerId', async (req, res) => {
    try {
        const { playerId } = req.params;
        const { language } = req.body;

        if (!playerId || !language) {
            return res.status(400).json({ error: 'Missing playerId or language' });
        }

        // Fetch current profile to preserve existing settings
        const fetchResponse = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${playerId}&select=settings`,
            {
                headers: {
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                }
            }
        );

        if (!fetchResponse.ok) {
            return res.status(fetchResponse.status).json({ error: 'Failed to load current settings' });
        }

        const profiles = await fetchResponse.json();
        const currentSettings = (profiles[0] && profiles[0].settings) || {};

        const updatedSettings = {
            ...currentSettings,
            language
        };

        // Update settings in Supabase
        const updateResponse = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${playerId}`,
            {
                method: 'PATCH',
                headers: {
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ settings: updatedSettings })
            }
        );

        const result = await updateResponse.json();
        res.status(updateResponse.status).json(result);

    } catch (error) {
        console.error('[PROFILE LANGUAGE UPDATE]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get character count for a player
app.get('/api/characters/count/:playerId', async (req, res) => {
    try {
        const { playerId } = req.params;

        if (!playerId) {
            return res.status(400).json({ error: 'Missing playerId' });
        }

        const response = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/characters?player_id=eq.${playerId}&select=id`,
            {
                headers: {
                    'apikey': process.env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                }
            }
        );

        if (!response.ok) {
            const text = await response.text();
            console.error('[CHARACTERS COUNT] Supabase error:', text);
            return res.status(response.status).json({ error: 'Failed to fetch character count' });
        }

        const characters = await response.json();
        res.json({ count: characters.length });

    } catch (error) {
        console.error('[CHARACTERS COUNT]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update profile with selected god
app.patch('/api/profile/select-god', async (req, res) => {
  try {
    const { profileId, godId } = req.body;

    if (!profileId || !godId) {
      return res.status(400).json({ error: 'Missing profileId or godId' });
    }

    const url = `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ god: godId })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to update profile', details: data });
    }

    res.json(data);
  } catch (error) {
    console.error('[SELECT GOD]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get list of gods (with id, name, description, image)
app.get('/api/gods', async (req, res) => {
  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/gods?select=id,name,description,image`;
    const response = await fetch(url, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });

    const gods = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to load gods', details: gods });
    }

    res.json(gods);
  } catch (error) {
    console.error('[GET GODS]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get races for a specific god
app.get('/api/races/:godId', async (req, res) => {
  try {
    const { godId } = req.params;

    if (!godId || godId === 'null') {
      return res.status(400).json({ error: 'Invalid or missing godId' });
    }

    const url = `${process.env.SUPABASE_URL}/rest/v1/races?god_id=eq.${godId}&select=id,name,description,base_stats`;
    const response = await fetch(url, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });

    const races = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to load races', details: races });
    }

    res.json(races);
  } catch (error) {
    console.error('[GET RACES]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all characters for a player
app.get('/api/characters/:playerId', async (req, res) => {
  const { playerId } = req.params;

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/characters?player_id=eq.${playerId}&select=id,race_id,class_id,portrait,profession_id,professions(name)`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      console.error("Supabase error:", await response.text());
      return res.status(502).json({ error: "Failed to fetch characters" });
    }

    const characters = await response.json();
    res.json(characters);
  } catch (error) {
    console.error("[CHARACTERS]", error);
    res.status(500).json({ error: "Server error fetching characters" });
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
