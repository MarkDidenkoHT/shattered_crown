let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _currentView = 'buy'; // 'buy', 'sell', 'return'
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

    // Setup the auction house interface
    _main.innerHTML = `
        <div class="main-app-container auction-container">
            <div class="particles"></div>
            
            <!-- Top Header -->
            <div class="auction-header">
                <div class="top-right-buttons">
                    <button class="fantasy-button back-btn">Return</button>
                </div>
                
                <div class="auction-title">
                    <h1>🏛️ Auction House</h1>
                    <p class="auction-subtitle">Player-driven marketplace</p>
                </div>
            </div>

            <!-- Navigation Tabs -->
            <div class="auction-nav">
                <button class="nav-tab active" data-view="buy">
                    <span class="tab-icon">🛒</span>
                    Buy
                </button>
                <button class="nav-tab" data-view="sell">
                    <span class="tab-icon">💰</span>
                    Sell
                </button>
                <button class="nav-tab" data-view="return">
                    <span class="tab-icon">📋</span>
                    My Listings
                </button>
            </div>

            <!-- Main Content -->
            <div class="auction-content">
                <div id="auction-view-container">
                    <!-- Dynamic content will be loaded here -->
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

        <!-- Purchase Confirmation Modal -->
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
}

async function loadCurrentView() {
    const container = document.getElementById('auction-view-container');
    
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
        const response = await _apiCall('/api/auction/active');
        _activeAuctions = await response.json();
        
        if (_activeAuctions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🏛️</div>
                    <h3>No Active Auctions</h3>
                    <p>Be the first to list something for sale!</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="auctions-grid">
                    ${_activeAuctions.map(auction => `
                        <div class="auction-card" data-auction-id="${auction.id}">
                            <div class="auction-seller">
                                Seller: ${auction.seller?.chat_id || 'Anonymous'}
                            </div>
                            
                            <div class="auction-trade">
                                <div class="trade-offer">
                                    <div class="trade-item-display">
                                        <img src="${getItemIcon(auction.item_selling)}" alt="${auction.item_selling}">
                                        <div class="item-details">
                                            <div class="item-name">${auction.item_selling}</div>
                                            <div class="item-amount">×${auction.amount_selling}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="trade-arrow">⇄</div>
                                
                                <div class="trade-want">
                                    <div class="trade-item-display">
                                        <img src="${getItemIcon(auction.item_wanted)}" alt="${auction.item_wanted}">
                                        <div class="item-details">
                                            <div class="item-name">${auction.item_wanted}</div>
                                            <div class="item-amount">×${auction.amount_wanted}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="auction-actions">
                                <button class="fantasy-button buy-btn" data-auction-id="${auction.id}">
                                    Purchase
                                </button>
                            </div>
                            
                            <div class="auction-time">
                                Listed: ${formatTime(auction.created_at)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        closeMessageBox();
    } catch (error) {
        console.error('Failed to load auctions:', error);
        displayMessage('Failed to load auctions. Please try again.');
    }
}

async function loadSellView(container) {
    displayMessage('Loading your items...');
    
    try {
        const response = await _apiCall(`/api/auction/bank/${_profile.id}`);
        _bankItems = await response.json();
        
        // Get sprite paths for items
        const itemNames = [...new Set(_bankItems.map(item => item.item))];
        const spriteMap = await getItemSprites(itemNames);
        
        _bankItems = _bankItems.map(item => ({
            ...item,
            spritePath: spriteMap[item.item] || 'assets/art/recipes/default_item.png'
        }));
        
        if (_bankItems.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <h3>No Items to Sell</h3>
                    <p>You need items in your bank to create auction listings.</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="bank-items-grid">
                    ${_bankItems.map(item => `
                        <div class="bank-item-card" data-item-id="${item.id}">
                            <div class="item-icon">
                                <img src="${item.spritePath}" alt="${item.item}">
                                <span class="item-quantity">×${item.amount}</span>
                            </div>
                            
                            <div class="item-info">
                                <div class="item-name">${item.item}</div>
                                <div class="item-type">${item.type || 'recipe'}</div>
                            </div>
                            
                            <div class="item-actions">
                                <button class="fantasy-button sell-btn" data-item-id="${item.id}">
                                    Sell
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
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
        const response = await _apiCall(`/api/auction/my-listings/${_profile.id}`);
        _myListings = await response.json();
        
        if (_myListings.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <h3>No Active Listings</h3>
                    <p>You haven't created any auction listings yet.</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="my-listings-grid">
                    ${_myListings.map(listing => `
                        <div class="listing-card ${listing.status ? 'sold' : 'active'}" data-listing-id="${listing.id}">
                            <div class="listing-status">
                                ${listing.status ? '✅ SOLD' : '🕒 ACTIVE'}
                            </div>
                            
                            <div class="listing-trade">
                                <div class="trade-offer">
                                    <div class="trade-item-display">
                                        <img src="${getItemIcon(listing.item_selling)}" alt="${listing.item_selling}">
                                        <div class="item-details">
                                            <div class="item-name">${listing.item_selling}</div>
                                            <div class="item-amount">×${listing.amount_selling}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="trade-arrow">⇄</div>
                                
                                <div class="trade-want">
                                    <div class="trade-item-display">
                                        <img src="${getItemIcon(listing.item_wanted)}" alt="${listing.item_wanted}">
                                        <div class="item-details">
                                            <div class="item-name">${listing.item_wanted}</div>
                                            <div class="item-amount">×${listing.amount_wanted}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="listing-actions">
                                ${!listing.status ? `
                                    <button class="fantasy-button cancel-btn" data-listing-id="${listing.id}">
                                        Cancel
                                    </button>
                                ` : ''}
                            </div>
                            
                            <div class="listing-time">
                                ${listing.status ? `Sold: ${formatTime(listing.modified_at)}` : `Listed: ${formatTime(listing.created_at)}`}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
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

    // Navigation tabs
    _main.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            if (tab.dataset.view === _currentView) return;
            
            // Update active tab
            _main.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Change view
            _currentView = tab.dataset.view;
            await loadCurrentView();
        });
    });

    // Auction actions (using event delegation)
    _main.addEventListener('click', async (e) => {
        if (e.target.classList.contains('buy-btn')) {
            const auctionId = e.target.dataset.auctionId;
            await handleBuyClick(auctionId);
        } else if (e.target.classList.contains('sell-btn')) {
            const itemId = e.target.dataset.itemId;
            await handleSellClick(itemId);
        } else if (e.target.classList.contains('cancel-btn')) {
            const listingId = e.target.dataset.listingId;
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

    // Check if player has the required items
    try {
        const response = await _apiCall(`/api/auction/bank/${_profile.id}`);
        const bankItems = await response.json();
        
        const requiredItem = auction.item_wanted;
        const requiredAmount = auction.amount_wanted;
        const playerAmount = bankItems
            .filter(item => item.item === requiredItem)
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
        // Load available items for trade
        const response = await _apiCall('/api/auction/items');
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
        
        // Store item ID for confirmation
        document.querySelector('.confirm-sell').dataset.itemId = itemId;
        
        // Show modal
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
        
        const response = await _apiCall('/api/auction/create', 'POST', {
            seller_id: _profile.id,
            item_selling: item.item,
            amount_selling: sellAmount,
            item_wanted: wantedItem,
            amount_wanted: wantedAmount
        });

        const result = await response.json();
        
        if (result.success) {
            displayMessage('Auction listing created successfully!');
            document.getElementById('sell-modal').style.display = 'none';
            
            // Refresh current view
            if (_currentView === 'sell') {
                await loadSellView(document.getElementById('auction-view-container'));
            } else if (_currentView === 'return') {
                await loadMyListingsView(document.getElementById('auction-view-container'));
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
            await loadBuyView(document.getElementById('auction-view-container'));
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
            await loadMyListingsView(document.getElementById('auction-view-container'));
        } else {
            displayMessage(result.error || 'Failed to cancel listing.');
        }
    } catch (error) {
        console.error('Failed to cancel listing:', error);
        displayMessage('Failed to cancel listing. Please try again.');
    }
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
    } catch (error) {
        console.error('Failed to get item sprites:', error);
    }
    
    return spriteMap;
}

function getItemIcon(itemName) {
    // Try to find the item in available items first
    const availableItem = _availableItems.find(item => item.name === itemName);
    if (availableItem && availableItem.spritePath) {
        return availableItem.spritePath;
    }
    
    // Fallback to default
    return 'assets/art/recipes/default_item.png';
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
    const particleCount = 20;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 8 + 's';
        particle.style.animationDuration = (Math.random() * 4 + 6) + 's';
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

function addAuctionStyles() {
    const styleId = 'auction-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .auction-container {
            position: relative;
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background-color: #1a150e;
            overflow: hidden;
        }

        .auction-header {
            background-image: url('assets/art/castle/main_auction.png');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            min-height: 25vh;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }

        .auction-title {
            text-align: center;
            color: #c4975a;
            text-shadow: 2px 2px 0px #3d2914;
        }

        .auction-title h1 {
            font-family: 'Cinzel', serif;
            font-size: 2.2rem;
            margin: 0 0 0.5rem 0;
        }

        .auction-subtitle {
            font-family: 'Cinzel', serif;
            font-size: 1rem;
            margin: 0;
            opacity: 0.8;
        }

        /* Navigation Tabs */
        .auction-nav {
            display: flex;
            background: rgba(29,20,12,0.8);
            border-bottom: 2px solid #3d2914;
            padding: 0;
        }

        .nav-tab {
            flex: 1;
            background: transparent;
            border: none;
            border-right: 1px solid #3d2914;
            color: #b8b3a8;
            padding: 1rem;
            cursor: pointer;
            font-family: 'Cinzel', serif;
            font-size: 1rem;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
        }

        .nav-tab:last-child {
            border-right: none;
        }

        .nav-tab:hover {
            background: rgba(196,151,90,0.1);
            color: #c4975a;
        }

        .nav-tab.active {
            background: linear-gradient(145deg, #c4975a, #a25612);
            color: #1d140c;
            font-weight: 600;
        }

        .tab-icon {
            font-size: 1.2rem;
        }

        /* Main Content */
        .auction-content {
            flex: 1;
            padding: 1rem;
            overflow-y: auto;
        }

        /* Buy View - Auctions Grid */
        .auctions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 1rem;
            padding: 0.5rem;
        }

        .auction-card {
            background: linear-gradient(145deg, rgba(29,20,12,0.9), rgba(42,31,22,0.7));
            border: 2px solid #3d2914;
            border-radius: 8px;
            padding: 1rem;
            transition: all 0.3s ease;
        }

        .auction-card:hover {
            border-color: #c4975a;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .auction-seller {
            font-size: 0.9rem;
            color: #8b7355;
            margin-bottom: 0.75rem;
            font-family: 'Cinzel', serif;
        }

        .auction-trade {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
            padding: 0.75rem;
            background: rgba(42,31,22,0.5);
            border-radius: 6px;
            border: 1px solid #3d2914;
        }

        .trade-offer, .trade-want {
            flex: 1;
        }

        .trade-item-display {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .trade-item-display img {
            width: 40px;
            height: 40px;
            border-radius: 4px;
            border: 1px solid #3d2914;
        }

        .item-details {
            flex: 1;
        }

        .item-name {
            font-family: 'Cinzel', serif;
            font-weight: 600;
            color: #c4975a;
            font-size: 0.9rem;
        }

        .item-amount {
            color: #b8b3a8;
            font-size: 0.8rem;
        }

        .trade-arrow {
            font-size: 1.2rem;
            color: #c4975a;
            font-weight: bold;
        }

        .auction-actions {
            display: flex;
            justify-content: center;
            margin-bottom: 0.5rem;
        }

        .buy-btn {
            background: linear-gradient(145deg, #2a5a2a, #1e4a1e);
            border-color: #3a7a3a;
            color: #90c690;
        }

        .buy-btn:hover {
            border-color: #4a9a4a;
            color: #a0d6a0;
        }

        .auction-time {
            text-align: center;
            font-size: 0.8rem;
            color: #8b7355;
            font-style: italic;
        }

        /* Sell View - Bank Items Grid */
        .bank-items-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1rem;
            padding: 0.5rem;
        }

        .bank-item-card {
            background: linear-gradient(145deg, rgba(29,20,12,0.9), rgba(42,31,22,0.7));
            border: 2px solid #3d2914;
            border-radius: 8px;
            padding: 1rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            transition: all 0.3s ease;
        }

        .bank-item-card:hover {
            border-color: #c4975a;
            transform: translateX(2px);
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

        .item-info {
            flex: 1;
        }

        .item-info .item-name {
            font-family: 'Cinzel', serif;
            font-size: 1rem;
            font-weight: 600;
            color: #c4975a;
            margin-bottom: 0.25rem;
        }

        .item-type {
            font-size: 0.8rem;
            color: #8b7355;
        }

        .sell-btn {
            background: linear-gradient(145deg, #5a3a2a, #4a2a1a);
            border-color: #7a5a3a;
            color: #d4a76a;
        }

        .sell-btn:hover {
            border-color: #9a7a5a;
            color: #e4b77a;
        }

        /* My Listings View */
        .my-listings-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 1rem;
            padding: 0.5rem;
        }

        .listing-card {
            background: linear-gradient(145deg, rgba(29,20,12,0.9), rgba(42,31,22,0.7));
            border: 2px solid #3d2914;
            border-radius: 8px;
            padding: 1rem;
            position: relative;
        }

        .listing-card.sold {
            border-color: #4a7a4a;
            background: linear-gradient(145deg, rgba(29,30,20,0.9), rgba(35,42,31,0.7));
        }

        .listing-status {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            font-size: 0.8rem;
            font-weight: bold;
            padding: 0.25rem 0.5rem;
            border-radius: 12px;
            background: rgba(0,0,0,0.7);
        }

        .listing-card.sold .listing-status {
            color: #90c690;
        }

        .listing-card.active .listing-status {
            color: #c4975a;
        }

        .listing-trade {
            margin: 2rem 0 1rem 0;
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.75rem;
            background: rgba(42,31,22,0.5);
            border-radius: 6px;
            border: 1px solid #3d2914;
        }

        .listing-actions {
            display: flex;
            justify-content: center;
            margin-bottom: 0.5rem;
        }

        .cancel-btn {
            background: linear-gradient(145deg, #5a2a2a, #4a1a1a);
            border-color: #7a3a3a;
            color: #d46a6a;
        }

        .cancel-btn:hover {
            border-color: #9a5a5a;
            color: #e47a7a;
        }

        .listing-time {
            text-align: center;
            font-size: 0.8rem;
            color: #8b7355;
            font-style: italic;
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

        /* Empty State */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #8b7355;
            text-align: center;
            padding: 2rem;
        }

        .empty-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            opacity: 0.5;
        }

        .empty-state h3 {
            font-family: 'Cinzel', serif;
            margin-bottom: 0.5rem;
            color: #c4975a;
        }

        .empty-state p {
            opacity: 0.8;
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

        /* Scrollbar */
        .auction-content::-webkit-scrollbar {
            width: 12px;
        }

        .auction-content::-webkit-scrollbar-track {
            background: rgba(29,20,12,0.5);
            border-radius: 6px;
        }

        .auction-content::-webkit-scrollbar-thumb {
            background: linear-gradient(145deg, #c4975a, #a25612);
            border-radius: 6px;
        }

        .auction-content::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(145deg, #d4a76a, #b26622);
        }

        /* Disabled button state */
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        button:disabled:hover {
            background: linear-gradient(145deg, #2a1f16, #1d140c) !important;
            border-color: #3d2914 !important;
            color: #b8b3a8 !important;
        }

        /* Success/Error indicators */
        .success-indicator {
            color: #90c690;
            font-weight: bold;
        }

        .error-indicator {
            color: #d46a6a;
            font-weight: bold;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .auction-title h1 {
                font-size: 1.8rem;
            }

            .auction-subtitle {
                font-size: 0.9rem;
            }

            .nav-tab {
                padding: 0.75rem 0.5rem;
                font-size: 0.9rem;
                flex-direction: column;
                gap: 0.25rem;
            }

            .tab-icon {
                font-size: 1rem;
            }

            .auction-content {
                padding: 0.5rem;
            }

            .auctions-grid, .bank-items-grid, .my-listings-grid {
                grid-template-columns: 1fr;
                gap: 0.75rem;
            }

            .auction-trade, .listing-trade {
                flex-direction: column;
                gap: 0.5rem;
                text-align: center;
            }

            .trade-arrow {
                transform: rotate(90deg);
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

            .bank-item-card {
                flex-direction: column;
                text-align: center;
                gap: 0.75rem;
            }

            .item-actions {
                width: 100%;
                justify-content: center;
            }
        }

        @media (max-width: 480px) {
            .auction-header {
                min-height: 20vh;
            }

            .auction-title h1 {
                font-size: 1.5rem;
            }

            .nav-tab {
                padding: 0.5rem 0.25rem;
                font-size: 0.8rem;
            }

            .auction-card, .bank-item-card, .listing-card {
                padding: 0.75rem;
            }

            .trade-item-display {
                flex-direction: column;
                text-align: center;
                gap: 0.25rem;
            }

            .trade-item-display img {
                width: 32px;
                height: 32px;
            }

            .item-name {
                font-size: 0.8rem !important;
            }

            .item-amount {
                font-size: 0.7rem !important;
            }
        }

        /* Custom Message Box Integration */
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

        .message-ok-btn:hover {
            background: linear-gradient(145deg, #d4a76a, #b26622);
            transform: translateY(-1px);
        }

        /* Loading states */
        .loading {
            opacity: 0.6;
            pointer-events: none;
        }

        .loading::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 20px;
            height: 20px;
            border: 2px solid #c4975a;
            border-top: 2px solid transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            transform: translate(-50%, -50%);
        }

        @keyframes spin {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }

        /* Hover effects for interactive elements */
        .auction-card:hover .buy-btn {
            transform: scale(1.05);
        }

        .bank-item-card:hover .sell-btn {
            transform: scale(1.05);
        }

        .listing-card:hover .cancel-btn {
            transform: scale(1.05);
        }

        /* Animation for new items */
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .auction-card, .bank-item-card, .listing-card {
            animation: slideIn 0.3s ease-out;
        }

        /* Tooltip styles for better UX */
        [data-tooltip] {
            position: relative;
        }

        [data-tooltip]::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.9);
            color: #c4975a;
            padding: 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s;
            z-index: 100;
        }

        [data-tooltip]:hover::after {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);
}
