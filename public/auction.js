let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _currentView = 'buy';
let _activeAuctions = [];
let _bankItems = [];
let _availableItems = [];
let _myListings = [];

export async function loadModule(main, { apiCall, getCurrentProfile }) {
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;

    _profile = _getCurrentProfile();
    if (!_profile) {
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login');
        return;
    }

    _main.innerHTML = `
        <div class="main-app-container bank-container">
            <div class="particles"></div>
            
            <!-- Top Header -->
            <div class="bank-header">
                <div class="top-right-buttons">
                    <button class="fantasy-button back-btn">Return</button>
                </div>
                
                <!-- Filter Tabs -->
                <div class="filter-tabs" id="filterTabs">
                    <button class="filter-tab active" data-view="buy">Buy Items</button>
                    <button class="filter-tab" data-view="sell">Sell Items</button>
                    <button class="filter-tab" data-view="return">My Listings</button>
                </div>
            </div>

            <!-- Main Auction Content -->
            <div class="bank-content">
                <div class="bank-items-container">
                    <div class="bank-items-list" id="auctionItemsList">
                        <!-- Items will be populated here -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Sell Modal -->
        <div id="sell-modal" class="modal" style="display: none;">
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h3>Create Auction Listing</h3>
                <div class="sell-form">
                    <div class="form-group">
                        <label>Selling:</label>
                        <div class="selling-item">
                            <img id="sell-item-icon" src="" alt="">
                            <div>
                                <div id="sell-item-name"></div>
                                <div>Available: <span id="sell-item-available"></span></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="sell-amount">Amount to sell:</label>
                        <input type="number" id="sell-amount" min="1" max="1">
                    </div>
                    
                    <div class="form-group">
                        <label for="wanted-item">Want in return:</label>
                        <select id="wanted-item">
                            <option value="">Select item...</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="wanted-amount">Amount wanted:</label>
                        <input type="number" id="wanted-amount" min="1" value="1">
                    </div>
                    
                    <div class="form-actions">
                        <button class="fantasy-button cancel-sell">Cancel</button>
                        <button class="fantasy-button confirm-sell">List Item</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Buy Modal -->
        <div id="buy-modal" class="modal" style="display: none;">
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h3>Confirm Purchase</h3>
                <div class="trade-preview">
                    <div class="trade-section">
                        <h4>You will receive:</h4>
                        <div class="trade-item">
                            <img id="buy-receive-icon" src="" alt="">
                            <div>
                                <div id="buy-receive-name"></div>
                                <div>Amount: <span id="buy-receive-amount"></span></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="trade-arrow">⇄</div>
                    
                    <div class="trade-section">
                        <h4>You will pay:</h4>
                        <div class="trade-item">
                            <img id="buy-pay-icon" src="" alt="">
                            <div>
                                <div id="buy-pay-name"></div>
                                <div>Amount: <span id="buy-pay-amount"></span></div>
                                <div>You have: <span id="buy-pay-available"></span></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="form-actions">
                    <button class="fantasy-button cancel-buy">Cancel</button>
                    <button class="fantasy-button confirm-buy">Confirm Purchase</button>
                </div>
            </div>
        </div>
    `;

    addAuctionStyles();
    createParticles();
    setupAuctionInteractions();
    await loadCurrentView();
    setBankHeaderBackground();
}

async function loadCurrentView() {
    const container = document.getElementById('auctionItemsList');
    
    try {
        switch (_currentView) {
            case 'buy':
                await loadBuyView(container);
                break;
            case 'sell':
                await loadSellView(container);
                break;
            case 'return':
                await loadMyListingsView(container);
                break;
        }
    } catch (error) {
        console.error('Failed to load view:', error);
        displayMessage('Failed to load auction data. Please try again.');
    }
}

async function loadBuyView(container) {
    displayMessage('Loading active auctions...');
    
    try {
        // Since no JWT, just make a simple authenticated request
        const response = await fetch('/api/auction/active', {
            method: 'GET',
            credentials: 'include', // Include cookies if using session auth
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Please log in to view auctions.');
            }
            throw new Error(`Failed to fetch auctions: ${response.status}`);
        }

        _activeAuctions = await response.json();
        
        if (_activeAuctions.length === 0) {
            container.innerHTML = `
                <div class="empty-bank">
                    <div class="empty-icon">🏛️</div>
                    <h3>No Active Auctions</h3>
                    <p>No items are currently available for purchase</p>
                </div>
            `;
        } else {
            container.innerHTML = _activeAuctions.map(auction => `
                <div class="bank-item auction-item" data-auction-id="${auction.id}">
                    <div class="item-icon">
                        <img src="${getItemIcon(auction.item_selling)}" 
                             alt="${auction.item_selling}" 
                             onerror="this.src='assets/art/recipes/default_item.png'">
                        ${auction.amount_selling > 1 ? `<span class="item-quantity">${auction.amount_selling}</span>` : ''}
                    </div>
                    
                    <div class="item-info">
                        <div class="item-name">${auction.item_selling}</div>
                        <div class="item-details">
                            <span class="item-type">Seller: ${auction.seller?.chat_id || 'Anonymous'}</span>
                            <span class="item-profession">• ${formatTime(auction.created_at)}</span>
                        </div>
                        <div class="auction-trade-info">
                            <span class="trade-want">Wants: ${auction.amount_wanted}× ${auction.item_wanted}</span>
                        </div>
                    </div>
                    
                    <div class="item-actions">
                        <button class="action-btn buy-btn" data-action="buy" data-auction-id="${auction.id}">
                            <span class="btn-icon">💰</span>
                            Buy
                        </button>
                    </div>
                </div>
            `).join('');
        }
        
        closeMessageBox();
    } catch (error) {
        console.error('Failed to load auctions:', error);
        displayMessage(`Failed to load auctions: ${error.message}`);
    }
}

async function loadSellView(container) {
    displayMessage('Loading your items...');
    
    try {
        const response = await fetch(`/api/auction/bank/${_profile.id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch bank items: ${response.status}`);
        }

        _bankItems = await response.json();

        // Build a list of item names for sprite lookup (only non-gear)
        const itemNames = [...new Set(
            _bankItems.filter(item => !item.isGear).map(item => item.item)
        )];

        const spriteMap = await getItemSprites(itemNames);

        // Normalize sprite paths
        _bankItems = _bankItems.map(item => ({
            ...item,
            spritePath: item.spritePath ||
                (item.isGear
                    ? (item.sprite || "assets/art/recipes/default_item.png")
                    : (spriteMap[item.item] ||
                       `assets/art/recipes/${itemNameToSpriteFormat(item.item)}.png`))
        }));

        if (_bankItems.length === 0) {
            container.innerHTML = `
                <div class="empty-bank">
                    <div class="empty-icon">📦</div>
                    <h3>No Items to Sell</h3>
                    <p>You need items in your bank or unequipped crafted gear to create auction listings</p>
                </div>
            `;
        } else {
            container.innerHTML = _bankItems.map(item => `
                <div class="bank-item ${item.isGear ? 'crafted-gear' : ''}" data-item-id="${item.id}">
                    <div class="item-icon">
                        <img src="${item.spritePath}" alt="${item.item}" onerror="this.src='assets/art/recipes/default_item.png'">
                        ${!item.isGear && item.amount > 1 ? `<span class="item-quantity">${item.amount}</span>` : ''}
                    </div>
                    <div class="item-info">
                        <div class="item-name">${item.item}</div>
                        <div class="item-details">
                            ${item.isGear 
                                ? `<span class="item-type">Crafted Gear</span>` 
                                : `<span class="item-type">${item.type || 'recipe'}</span>`}
                            ${item.professions ? `<span class="item-profession">• ${item.professions.name}</span>` : ''}
                        </div>
                        ${item.isGear && item.stats 
                            ? `<pre class="gear-stats">${JSON.stringify(item.stats, null, 2)}</pre>` 
                            : ''}
                    </div>
                    <div class="item-actions">
                        <button class="action-btn sell-btn" 
                                data-action="sell" 
                                data-item-id="${item.id}" 
                                data-is-gear="${item.isGear}">
                            <span class="btn-icon">🏷️</span>
                            Sell
                        </button>
                    </div>
                </div>
            `).join('');
        }

        closeMessageBox();
    } catch (error) {
        console.error('Failed to load bank items:', error);
        displayMessage('Failed to load your items. Please try again.');
    }
}

async function loadMyListingsView(container) {
    displayMessage('Loading your listings...');
    
    try {
        const response = await fetch(`/api/auction/my-listings/${_profile.id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch listings: ${response.status}`);
        }

        _myListings = await response.json();
        
        if (_myListings.length === 0) {
            container.innerHTML = `
                <div class="empty-bank">
                    <div class="empty-icon">📋</div>
                    <h3>No Active Listings</h3>
                    <p>You haven't created any auction listings yet</p>
                </div>
            `;
        } else {
            container.innerHTML = _myListings.map(listing => `
                <div class="bank-item listing-item ${listing.status ? 'sold' : 'active'}" 
                     data-listing-id="${listing.id}">
                     
                    <div class="item-icon">
                        <img src="${getItemIcon(listing.item_selling)}" 
                             alt="${listing.item_selling}" 
                             onerror="this.src='assets/art/recipes/default_item.png'">
                        ${listing.amount_selling > 1 
                            ? `<span class="item-quantity">${listing.amount_selling}</span>` 
                            : ''}
                        <div class="listing-status-badge ${listing.status ? 'sold' : 'active'}">
                            ${listing.status ? 'SOLD' : 'ACTIVE'}
                        </div>
                    </div>
                    
                    <div class="item-info">
                        <div class="item-name">${listing.item_selling}</div>
                        <div class="item-details">
                            <span class="item-type">Status: ${listing.status ? 'Sold' : 'Active'}</span>
                            <span class="item-profession">• ${listing.status 
                                ? formatTime(listing.modified_at) 
                                : formatTime(listing.created_at)}</span>
                        </div>
                        <div class="auction-trade-info">
                            <span class="trade-want">For: ${listing.amount_wanted}× ${listing.item_wanted}</span>
                        </div>
                    </div>
                    
                    <div class="item-actions">
                        ${!listing.status ? `
                            <button class="action-btn cancel-btn" 
                                    data-action="cancel" 
                                    data-listing-id="${listing.id}">
                                <span class="btn-icon">❌</span>
                                Cancel
                            </button>
                        ` : `
                            <span class="sold-indicator">✅ Completed</span>
                        `}
                    </div>
                </div>
            `).join('');
        }
        
        closeMessageBox();
    } catch (error) {
        console.error('Failed to load listings:', error);
        displayMessage('Failed to load your listings. Please try again.');
    }
}

function setupAuctionInteractions() {
    // Back button
    _main.querySelector('.back-btn').addEventListener('click', () => {
        window.gameAuth.loadModule('castle');
    });

    // Navigation tabs (using event delegation)
    _main.querySelector('#filterTabs').addEventListener('click', async (e) => {
        if (e.target.classList.contains('filter-tab')) {
            if (e.target.dataset.view === _currentView) return;
            
            // Update active tab
            _main.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            // Change view
            _currentView = e.target.dataset.view;
            await loadCurrentView();
        }
    });

    // Item action buttons (using event delegation)
    _main.querySelector('#auctionItemsList').addEventListener('click', async (e) => {
        if (e.target.classList.contains('buy-btn') || e.target.closest('.buy-btn')) {
            const btn = e.target.classList.contains('buy-btn') ? e.target : e.target.closest('.buy-btn');
            const auctionId = btn.dataset.auctionId;
            await handleBuyClick(auctionId);
        } else if (e.target.classList.contains('sell-btn') || e.target.closest('.sell-btn')) {
            const btn = e.target.classList.contains('sell-btn') ? e.target : e.target.closest('.sell-btn');
            const itemId = btn.dataset.itemId;
            await handleSellClick(itemId);
        } else if (e.target.classList.contains('cancel-btn') || e.target.closest('.cancel-btn')) {
            const btn = e.target.classList.contains('cancel-btn') ? e.target : e.target.closest('.cancel-btn');
            const listingId = btn.dataset.listingId;
            await handleCancelListing(listingId);
        }
    });

    // Modal interactions
    setupModalInteractions();
}

function setupModalInteractions() {
    // Close modals
    document.querySelectorAll('.close-modal, .cancel-sell, .cancel-buy').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });

    // Sell modal interactions
    document.getElementById('sell-amount').addEventListener('input', (e) => {
        const max = parseInt(e.target.max);
        const value = parseInt(e.target.value);
        if (value > max) e.target.value = max;
        if (value < 1) e.target.value = 1;
    });

    // Confirm sell
    document.querySelector('.confirm-sell').addEventListener('click', async () => {
        await handleConfirmSell();
    });

    // Confirm buy
    document.querySelector('.confirm-buy').addEventListener('click', async () => {
        await handleConfirmBuy();
    });
}

async function handleBuyClick(auctionId) {
    const auction = _activeAuctions.find(a => a.id == auctionId);
    if (!auction) return;

    // Prevent buying own auction
    if (auction.seller_id === _profile.id) {
        displayMessage('You cannot purchase your own auction listing.');
        return;
    }

    try {
        // Fetch player’s available items (bank + unequipped crafted gear)
        const response = await fetch(`/api/auction/bank/${_profile.id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch bank items: ${response.status}`);
        }

        const bankItems = await response.json();

        const requiredItem = auction.item_wanted;
        const requiredAmount = auction.amount_wanted;

        // Sum up player’s amount of the required item (bank only, crafted gear not used as currency)
        const playerAmount = bankItems
            .filter(item => !item.isGear && item.item === requiredItem)
            .reduce((sum, item) => sum + item.amount, 0);

        // Update modal with trade details
        document.getElementById('buy-receive-icon').src = getItemIcon(auction.item_selling);
        document.getElementById('buy-receive-name').textContent = auction.item_selling;
        document.getElementById('buy-receive-amount').textContent = auction.amount_selling;

        document.getElementById('buy-pay-icon').src = getItemIcon(auction.item_wanted);
        document.getElementById('buy-pay-name').textContent = auction.item_wanted;
        document.getElementById('buy-pay-amount').textContent = auction.amount_wanted;
        document.getElementById('buy-pay-available').textContent = playerAmount;

        // Check if player can afford it
        const canAfford = playerAmount >= requiredAmount;
        const confirmBtn = document.querySelector('.confirm-buy');
        confirmBtn.disabled = !canAfford;
        confirmBtn.textContent = canAfford ? 'Confirm Purchase' : 'Insufficient Items';

        // Store auction ID for confirmation
        confirmBtn.dataset.auctionId = auctionId;

        // Show modal
        document.getElementById('buy-modal').style.display = 'block';
    } catch (error) {
        console.error('Failed to check player items:', error);
        displayMessage('Failed to verify your items. Please try again.');
    }
}

async function handleSellClick(itemId) {
    const item = _bankItems.find(i => i.id == itemId);
    if (!item) return;

    try {
        // Call secure backend (no keys exposed)
        const response = await fetch('/api/auction/items', {
            headers: {
                'Authorization': `Bearer ${_anonKey}` // client only sends token
            }
        });

        if (!response.ok) throw new Error('Failed to load items');
        _availableItems = await response.json();

        // Update modal with item details
        document.getElementById('sell-item-icon').src = item.spritePath;
        document.getElementById('sell-item-name').textContent = item.item;
        document.getElementById('sell-item-available').textContent = item.amount;

        const sellAmountInput = document.getElementById('sell-amount');
        sellAmountInput.max = item.amount;
        sellAmountInput.value = Math.min(1, item.amount);

        // Populate wanted items dropdown
        const wantedSelect = document.getElementById('wanted-item');
        wantedSelect.innerHTML = '<option value="">Select item...</option>' +
            _availableItems.map(availableItem =>
                `<option value="${availableItem.name}">${availableItem.name}</option>`
            ).join('');

        document.querySelector('.confirm-sell').dataset.itemId = itemId;

        document.getElementById('sell-modal').style.display = 'block';
    } catch (error) {
        console.error('Failed to load available items:', error);
        displayMessage('Failed to load available items. Please try again.');
    }
}


async function handleConfirmSell() {
    const itemId = document.querySelector('.confirm-sell').dataset.itemId;
    const item = _bankItems.find(i => i.id == itemId);
    if (!item) return;

    const sellAmount = parseInt(document.getElementById('sell-amount').value);
    const wantedItem = document.getElementById('wanted-item').value;
    const wantedAmount = parseInt(document.getElementById('wanted-amount').value);

    if (!wantedItem || !wantedAmount || sellAmount < 1) {
        displayMessage('Please fill in all fields correctly.');
        return;
    }

    try {
        displayMessage('Creating auction listing...');

        const response = await fetch('/api/auction/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${_anonKey}` // send token, not keys
            },
            body: JSON.stringify({
                seller_id: _profile.id,
                item_selling: item.item,
                amount_selling: sellAmount,
                item_wanted: wantedItem,
                amount_wanted: wantedAmount
            })
        });

        const result = await response.json();

        if (result.success) {
            displayMessage('Auction listing created successfully!');
            document.getElementById('sell-modal').style.display = 'none';

            if (_currentView === 'sell') {
                await loadSellView(document.getElementById('auctionItemsList'));
            } else if (_currentView === 'return') {
                await loadMyListingsView(document.getElementById('auctionItemsList'));
            }
        } else {
            displayMessage(result.error || 'Failed to create auction listing.');
        }
    } catch (error) {
        console.error('Failed to create auction:', error);
        displayMessage('Failed to create auction listing. Please try again.');
    }
}


async function handleConfirmBuy() {
    const auctionId = document.querySelector('.confirm-buy').dataset.auctionId;
    
    try {
        displayMessage('Processing purchase...');
        
        const response = await _apiCall('/api/auction/buy', 'POST', {
            auction_id: auctionId,
            buyer_id: _profile.id
        });

        const result = await response.json();
        
        if (result.success) {
            displayMessage('Purchase completed successfully!');
            document.getElementById('buy-modal').style.display = 'none';
            
            // Refresh buy view
            await loadBuyView(document.getElementById('auctionItemsList'));
        } else {
            displayMessage(result.error || 'Failed to complete purchase.');
        }
    } catch (error) {
        console.error('Failed to purchase item:', error);
        displayMessage('Failed to complete purchase. Please try again.');
    }
}

async function handleCancelListing(listingId) {
    if (!confirm('Are you sure you want to cancel this listing? Your items will be returned to your bank.')) {
        return;
    }

    try {
        displayMessage('Cancelling listing...');
        
        const response = await _apiCall(`/api/auction/cancel/${listingId}`, 'DELETE', {
            seller_id: _profile.id
        });

        const result = await response.json();
        
        if (result.success) {
            displayMessage('Listing cancelled and items returned to your bank.');
            await loadMyListingsView(document.getElementById('auctionItemsList'));
        } else {
            displayMessage(result.error || 'Failed to cancel listing.');
        }
    } catch (error) {
        console.error('Failed to cancel listing:', error);
        displayMessage('Failed to cancel listing. Please try again.');
    }
}

function itemNameToSpriteFormat(itemName) {
    return itemName.replace(/\s+/g, '');
}

async function getItemSprites(itemNames) {
    if (itemNames.length === 0) return {};
    
    const spriteMap = {};
    const itemNameQuery = itemNames.map(name => `"${name}"`).join(',');
    
    try {
        // Get sprites from ingredients
        const ingredientsResponse = await _apiCall(`/api/supabase/rest/v1/ingridients?name=in.(${itemNameQuery})&select=name,sprite`);
        const ingredients = await ingredientsResponse.json();
        
        ingredients.forEach(item => {
            if (item.sprite) {
                const fileName = item.sprite.endsWith('.png') ? item.sprite : `${item.sprite}.png`;
                spriteMap[item.name] = `assets/art/ingridients/${fileName}`;
            }
        });
        
        // Get sprites from recipes
        const recipesResponse = await _apiCall(`/api/supabase/rest/v1/recipes?name=in.(${itemNameQuery})&select=name,sprite`);
        const recipes = await recipesResponse.json();
        
        recipes.forEach(item => {
            if (item.sprite) {
                const fileName = item.sprite.endsWith('.png') ? item.sprite : `${item.sprite}.png`;
                spriteMap[item.name] = `assets/art/recipes/${fileName}`;
            }
        });
        
        // For items not found in database, generate sprite paths based on naming convention
        itemNames.forEach(itemName => {
            if (!spriteMap[itemName]) {
                const spriteName = itemNameToSpriteFormat(itemName);
                spriteMap[itemName] = `assets/art/recipes/${spriteName}.png`;
            }
        });
        
    } catch (error) {
        console.error('Failed to get item sprites from database:', error);
        
        // Fallback: generate all sprite paths based on naming convention
        itemNames.forEach(itemName => {
            const spriteName = itemNameToSpriteFormat(itemName);
            spriteMap[itemName] = `assets/art/recipes/${spriteName}.png`;
        });
    }
    
    return spriteMap;
}

function getItemIcon(itemName) {
    // Try to find the item in available items first
    const availableItem = _availableItems.find(item => item.name === itemName);
    if (availableItem && availableItem.spritePath) {
        return availableItem.spritePath;
    }
    
    // Generate sprite path based on naming convention
    const spriteName = itemNameToSpriteFormat(itemName);
    return `assets/art/recipes/${spriteName}.png`;
}

function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 60) {
        return `${diffMins}m ago`;
    } else if (diffHours < 24) {
        return `${diffHours}h ago`;
    } else {
        return `${diffDays}d ago`;
    }
}

function createParticles() {
    const particlesContainer = _main.querySelector('.particles');
    if (!particlesContainer) return;

    particlesContainer.innerHTML = '';
    const particleCount = 15;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 6 + 's';
        particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
        particlesContainer.appendChild(particle);
    }
}

function displayMessage(message) {
    const existing = document.querySelector('.custom-message-box');
    if (existing) existing.remove();

    const messageBox = document.createElement('div');
    messageBox.className = 'custom-message-box';
    messageBox.innerHTML = `
        <div class="message-content">
            <p>${message}</p>
            <button class="fantasy-button message-ok-btn">OK</button>
        </div>
    `;
    document.body.appendChild(messageBox);

    messageBox.querySelector('.message-ok-btn').addEventListener('click', () => {
        messageBox.remove();
    });
}

function closeMessageBox() {
    const existing = document.querySelector('.custom-message-box');
    if (existing) existing.remove();
}

function setBankHeaderBackground() {
  const header = document.querySelector('.bank-header');
  if (header) {
    header.style.backgroundImage = "url('assets/art/castle/main_auction.png')";
  }
}

function addAuctionStyles() {
    const styleId = 'auction-styles-refactored';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        /* Auction-specific item states */
        .auction-item {
            border-left: 4px solid #2a5a2a;
        }

        .listing-item.active {
            border-left: 4px solid #c4975a;
        }

        .listing-item.sold {
            border-left: 4px solid #4a7a4a;
            opacity: 0.85;
        }

        .item-icon {
            position: relative;
            width: 48px;
            height: 48px;
            flex-shrink: 0;
        }

        .item-icon img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 4px;
            border: 1px solid #3d2914;
        }

        .item-quantity {
            position: absolute;
            bottom: -4px;
            right: -4px;
            background: #c4975a;
            color: #1d140c;
            font-size: 0.7rem;
            font-weight: bold;
            padding: 0.1rem 0.3rem;
            border-radius: 8px;
            min-width: 16px;
            text-align: center;
        }

        .listing-status-badge {
            position: absolute;
            top: -8px;
            left: -8px;
            font-size: 0.6rem;
            font-weight: bold;
            padding: 0.2rem 0.4rem;
            border-radius: 10px;
            text-transform: uppercase;
        }

        .listing-status-badge.active {
            background: #c4975a;
            color: #1d140c;
        }

        .listing-status-badge.sold {
            background: #4a7a4a;
            color: #fff;
        }

        .item-info {
            flex: 1;
            min-width: 0;
        }

        .item-name {
            font-family: 'Cinzel', serif;
            font-size: 1rem;
            font-weight: 600;
            color: #c4975a;
            margin-bottom: 0.25rem;
        }

        .item-details {
            font-size: 0.8rem;
            color: #b8b3a8;
            display: flex;
            gap: 0.5rem;
            margin-bottom: 0.25rem;
        }

        .item-type {
            color: #8b7355;
        }

        .item-profession {
            color: #9a8566;
        }

        .auction-trade-info {
            font-size: 0.8rem;
            color: #9a8566;
            font-style: italic;
        }

        .trade-want {
            color: #b8b3a8;
        }

        .item-actions {
            display: flex;
            align-items: center;
        }

        .action-btn {
            background: linear-gradient(145deg, #2a1f16, #1d140c);
            border: 2px solid #3d2914;
            color: #b8b3a8;
            padding: 0.4rem 0.8rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.8rem;
            font-family: 'Cinzel', serif;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.3rem;
        }

        .btn-icon {
            font-size: 0.9rem;
        }

        .sold-indicator {
            color: #90c690;
            font-size: 0.8rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 0.3rem;
        }

        /* Empty State */
        .empty-bank {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #8b7355;
            text-align: center;
        }

        .empty-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            opacity: 0.5;
        }

        .empty-bank h3 {
            font-family: 'Cinzel', serif;
            margin-bottom: 0.5rem;
            color: #c4975a;
        }

        .filter-tab {
            background: linear-gradient(145deg, #2a1f16, #1d140c);
            border: 2px solid #3d2914;
            color: #8b7355;
            padding: 0.6rem 1.2rem;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Cinzel', serif;
            font-weight: 600;
            transition: all 0.3s ease;
            flex: 1;
            text-align: center;
        }

        .filter-tab.active {
            background: linear-gradient(145deg, #c4975a, #a25612);
            border-color: #c4975a;
            color: #1d140c;
        }

        /* Modals */
        .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-content {
            background: linear-gradient(145deg, #2a1f16, #1d140c);
            border: 2px solid #c4975a;
            border-radius: 8px;
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
        }

        .close-modal {
            position: absolute;
            top: 0.5rem;
            right: 1rem;
            background: none;
            border: none;
            font-size: 2rem;
            color: #c4975a;
            cursor: pointer;
            padding: 0;
            line-height: 1;
        }

        .modal-content h3 {
            font-family: 'Cinzel', serif;
            color: #c4975a;
            text-align: center;
            margin-bottom: 1.5rem;
        }

        .form-group {
            margin-bottom: 1rem;
        }

        .form-group label {
            display: block;
            color: #b8b3a8;
            font-family: 'Cinzel', serif;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }

        .selling-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.75rem;
            background: rgba(42,31,22,0.5);
            border-radius: 6px;
            border: 1px solid #3d2914;
        }

        .selling-item img {
            width: 40px;
            height: 40px;
            border-radius: 4px;
            border: 1px solid #3d2914;
        }

        .selling-item > div > div:first-child {
            font-family: 'Cinzel', serif;
            font-weight: 600;
            color: #c4975a;
        }

        .selling-item > div > div:last-child {
            color: #b8b3a8;
            font-size: 0.9rem;
        }

        input[type="number"], select {
            width: 100%;
            padding: 0.75rem;
            background: rgba(42,31,22,0.8);
            border: 2px solid #3d2914;
            border-radius: 4px;
            color: #b8b3a8;
            font-family: 'Cinzel', serif;
        }

        input[type="number"]:focus, select:focus {
            outline: none;
            border-color: #c4975a;
        }

        .form-actions {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 2rem;
        }

        /* Trade Preview */
        .trade-preview {
            display: flex;
            align-items: center;
            gap: 2rem;
            margin: 1.5rem 0;
            padding: 1rem;
            background: rgba(42,31,22,0.3);
            border-radius: 6px;
            border: 1px solid #3d2914;
        }

        .trade-section {
            flex: 1;
        }

        .trade-section h4 {
            font-family: 'Cinzel', serif;
            color: #c4975a;
            margin-bottom: 0.5rem;
            text-align: center;
        }

        .trade-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem;
            background: rgba(29,20,12,0.8);
            border-radius: 4px;
        }

        .trade-item img {
            width: 32px;
            height: 32px;
            border-radius: 3px;
            border: 1px solid #3d2914;
        }

        .trade-item > div > div:first-child {
            font-family: 'Cinzel', serif;
            color: #c4975a;
            font-size: 0.9rem;
        }

        .trade-item > div > div:not(:first-child) {
            color: #b8b3a8;
            font-size: 0.8rem;
        }

        .trade-arrow {
            font-size: 2rem;
            color: #c4975a;
            font-weight: bold;
        }

        /* Particles */
        .particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            overflow: hidden;
        }

        .particle {
            position: absolute;
            width: 4px;
            height: 4px;
            background: radial-gradient(circle, #c4975a, transparent);
            border-radius: 50%;
            animation: float 8s infinite linear;
        }

        @keyframes float {
            0% {
                transform: translateY(100vh) rotate(0deg);
                opacity: 0;
            }
            10% {
                opacity: 1;
            }
            90% {
                opacity: 1;
            }
            100% {
                transform: translateY(-10vh) rotate(360deg);
                opacity: 0;
            }
        }

        /* Message Box */
        .custom-message-box {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        }

        .message-content {
            background: linear-gradient(145deg, #2a1f16, #1d140c);
            border: 2px solid #c4975a;
            border-radius: 8px;
            padding: 2rem;
            text-align: center;
            max-width: 400px;
            width: 90%;
        }

        .message-content p {
            color: #b8b3a8;
            font-family: 'Cinzel', serif;
            margin-bottom: 1.5rem;
            font-size: 1rem;
        }

        .message-ok-btn {
            background: linear-gradient(145deg, #c4975a, #a25612);
            border: 2px solid #c4975a;
            color: #1d140c;
            padding: 0.75rem 1.5rem;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Cinzel', serif;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        @media (max-width: 768px) {
            .filter-tab {
                font-size: 0.8rem;
                padding: 0.4rem 0.8rem;
            }

            .bank-item {
                gap: 0.5rem;
                padding: 0.5rem;
            }

            .item-icon {
                width: 40px;
                height: 40px;
            }

            .action-btn {
                padding: 0.3rem 0.6rem;
                font-size: 0.7rem;
            }

            .auction-trade-info {
                font-size: 0.7rem;
            }

            .trade-preview {
                flex-direction: column;
                gap: 1rem;
            }

            .trade-preview .trade-arrow {
                transform: rotate(90deg);
                font-size: 1.5rem;
            }

            .modal-content {
                width: 95%;
                padding: 1.5rem;
                margin: 1rem;
            }

            .form-actions {
                flex-direction: column;
                gap: 0.75rem;
            }

            .filter-tab {
                flex: none;
            }
        }
    `;
    document.head.appendChild(style);
}
