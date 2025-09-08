let _main;
let _getCurrentProfile;
let _profile;
let _currentView = 'buy';
let _activeAuctions = [];
let _bankItems = [];
let _availableItems = [];
let _myListings = [];

export async function loadModule(main, { getCurrentProfile }) {
    _main = main;
    _getCurrentProfile = getCurrentProfile;
    _profile = await _getCurrentProfile();

    _main.innerHTML = `
        <div class="main-app-container bank-container">
            <div class="particles"></div>
            
            <div class="bank-header">
                <div class="top-right-buttons">
                    <button class="fantasy-button back-btn">Return</button>
                </div>
                
                <div class="filter-tabs" id="filterTabs">
                    <button class="filter-tab active" data-view="buy">Buy Items</button>
                    <button class="filter-tab" data-view="sell">Sell Items</button>
                    <button class="filter-tab" data-view="return">My Listings</button>
                </div>
            </div>

            <div class="bank-content">
                <!-- Buy View Filters -->
                <div class="buy-filters" id="buyFilters" style="display: none;">
                    <div class="filter-controls">
                        <input type="text" id="buy-search" placeholder="Search items..." class="search-input">
                        <select id="buy-filter" class="filter-select">
                            <option value="all">All Items</option>
                            <option value="ingredient">Ingredients</option>
                            <option value="consumable">Consumables</option>
                            <option value="gear">Crafted Gear</option>
                        </select>
                        <select id="buy-sort" class="filter-select">
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                            <option value="name">By Name</option>
                        </select>
                    </div>
                </div>

                <div class="bank-items-container">
                    <div class="bank-items-list" id="auctionItemsList">
                    </div>
                </div>
            </div>
        </div>

        <div id="sell-modal" class="modal" style="display: none;">
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h3>Create Auction Listing</h3>
                <div class="sell-form">
                  <div style="display: flex;">
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
                    
                      <div>
                        <div class="form-group">
                            <label for="sell-amount">Amount to sell:</label>
                            <input type="number" id="sell-amount" min="1" max="1">
                        </div>
                        <div class="form-group">
                            <label for="wanted-amount">Amount wanted:</label>
                            <input type="number" id="wanted-amount" min="1" value="1">
                        </div>
                      </div>
                  </div>  
                    
                    <div class="form-group">
                        <label for="wanted-item">Want in return:</label>
                        <div class="wanted-controls">
                        <input id="wanted-search" type="text" placeholder="Search item..." style="border-radius: 4px; background: rgba(42, 31, 22, 0.8)">
                        <select id="wanted-filter">
                            <option value="all">All</option>
                            <option value="ingredient">Ingredients</option>
                            <option value="consumable">Consumables</option>
                        </select>
                        </div>

                    <div id="wanted-item-picker" class="wanted-grid"></div>
                    </div>
                    
                    <div class="form-actions">
                        <button class="fantasy-button cancel-sell">Cancel</button>
                        <button class="fantasy-button confirm-sell">List Item</button>
                    </div>
                </div>
            </div>
        </div>

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
    const buyFilters = document.getElementById('buyFilters');
    
    // Show/hide filters based on current view
    buyFilters.style.display = _currentView === 'buy' ? 'block' : 'none';
    
    try {
        switch (_currentView) {
            case 'buy': await loadBuyView(container); break;
            case 'sell': await loadSellView(container); break;
            case 'return': await loadMyListingsView(container); break;
        }
    } catch (error) {
        console.error('Failed to load view:', error);
        displayMessage('Failed to load auction data. Please try again.');
    }
}

async function loadBuyView(container) {
    displayMessage('Loading active auctions...');
    
    try {
        const response = await fetch('/api/auction/active', {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch auctions: ${response.status}`);
        }

        _activeAuctions = await response.json();
        renderFilteredAuctions(_activeAuctions);
        closeMessageBox();
    } catch (error) {
        console.error('Failed to load auctions:', error);
        displayMessage('Failed to load auctions. Please try again.');
    }
}

function renderFilteredAuctions(auctions) {
    const container = document.getElementById('auctionItemsList');
    const searchQuery = document.getElementById('buy-search')?.value.toLowerCase() || '';
    const filterType = document.getElementById('buy-filter')?.value || 'all';
    const sortBy = document.getElementById('buy-sort')?.value || 'newest';

    let filteredAuctions = auctions.filter(auction => {
        const matchesSearch = !searchQuery || 
            auction.item_selling.toLowerCase().includes(searchQuery) ||
            auction.item_wanted.toLowerCase().includes(searchQuery);
        
        // Use the type from auction table instead of calculating it
        const matchesFilter = filterType === 'all' || auction.type === filterType;
        
        return matchesSearch && matchesFilter;
    });

    // Sort auctions
    filteredAuctions.sort((a, b) => {
        switch (sortBy) {
            case 'oldest':
                return new Date(a.created_at) - new Date(b.created_at);
            case 'name':
                return a.item_selling.localeCompare(b.item_selling);
            case 'newest':
            default:
                return new Date(b.created_at) - new Date(a.created_at);
        }
    });
    
    if (filteredAuctions.length === 0) {
        const hasFilters = searchQuery || filterType !== 'all';
        container.innerHTML = `
            <div class="empty-bank">
                <div class="empty-icon">🏛️</div>
                <h3>${hasFilters ? 'No Matching Auctions' : 'No Active Auctions'}</h3>
                <p>${hasFilters ? 'Try adjusting your search or filters' : 'No items are currently available for purchase'}</p>
            </div>
        `;
    } else {
        container.innerHTML = filteredAuctions.map(auction => `
            <div class="bank-item auction-item" data-auction-id="${auction.id}">
                <div class="item-icon">
                    <img src="${getItemIcon(auction.item_selling)}" 
                         alt="${auction.item_selling}">
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
}

async function loadSellView(container) {
    displayMessage('Loading your items...');
    
    try {
        console.log('[Auction] Fetching available items for wanted picker...');
        const itemsResponse = await fetch('/api/auction/items');
        if (itemsResponse.ok) {
            const allItems = await itemsResponse.json();
            console.log('[Auction] /api/auction/items response:', allItems);
            _availableItems = allItems.filter(i => i.type === 'Ingredient' || i.type === 'Consumable');
            console.log('[Auction] Filtered available items:', _availableItems);
        }

        console.log('[Auction] Fetching bank items and gear for profile:', _profile.id);
        const response = await fetch(`/api/auction/bank/${_profile.id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('supabase_token')}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch bank items: ${response.status}`);
        }

        _bankItems = await response.json();
        console.log('[Auction] Raw bank items + gear:', _bankItems);

        const itemNames = [...new Set(_bankItems.filter(item => !item.isGear).map(item => item.item))];
        console.log('[Auction] Item names for sprite lookup:', itemNames);

        const spriteMap = await getItemSprites(itemNames);
        console.log('[Auction] Sprite map:', spriteMap);

        _bankItems = _bankItems.map(item => {
            const spritePath = item.isGear ? getItemIcon(item.item, true) : (item.spritePath || getItemIcon(item.item));
            const rarityClass = item.isGear ? getGearRarity(item.item) : '';
            console.log(`[Auction] Item "${item.item}" (isGear: ${item.isGear}) assigned spritePath:`, spritePath, 'type:', item.type, 'rarityClass:', rarityClass);
            return {
                ...item,
                spritePath,
                rarityClass
            };
        });

        if (_bankItems.length === 0) {
            container.innerHTML = `
                <div class="empty-bank">
                    <div class="empty-icon">📦</div>
                    <h3>No Items to Sell</h3>
                    <p>You need items in your bank or unequipped crafted gear to create auction listings</p>
                </div>
            `;
        } else {
            container.innerHTML = _bankItems.map(item => {
                return `
                <div class="bank-item ${item.isGear ? 'crafted-gear' : ''}" data-item-id="${item.id}">
                    <div class="item-icon ${item.rarityClass}">
                        <img src="${item.spritePath}" alt="${item.item}">
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
                            ? `<div class="gear-stats">${formatGearStats(item.stats)}</div>` 
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
            `;
            }).join('');
        }

        closeMessageBox();
    } catch (error) {
        console.error('Failed to load bank items:', error);
        displayMessage('Failed to load your items. Please try again.');
    }
}

function formatGearStats(stats) {
    if (!stats || !Array.isArray(stats)) return '';
    
    return stats.map(stat => 
        `<span class="stat-item">${stat.name}: ${stat.value}</span>`
    ).join(' • ');
}

async function loadMyListingsView(container) {
    displayMessage('Loading your listings...');
    
    try {
        const response = await fetch(`/api/auction/my-listings/${_profile.id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('supabase_token')}` }
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
                        <img src="${getItemIcon(listing.item_selling)}">
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
    _main.querySelector('.back-btn').addEventListener('click', () => {
        window.gameAuth.loadModule('castle');
    });

    _main.querySelector('#filterTabs').addEventListener('click', async (e) => {
        if (e.target.classList.contains('filter-tab')) {
            if (e.target.dataset.view === _currentView) return;
            
            _main.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            _currentView = e.target.dataset.view;
            await loadCurrentView();
        }
    });

    // Setup buy view filters
    setupBuyFilters();

    _main.querySelector('#auctionItemsList').addEventListener('click', async (e) => {
        const btn = e.target.closest('.buy-btn, .sell-btn, .cancel-btn');
        if (!btn) return;

        if (btn.classList.contains('buy-btn')) {
            await handleBuyClick(btn.dataset.auctionId);
        } else if (btn.classList.contains('sell-btn')) {
            await handleSellClick(btn.dataset.itemId);
        } else if (btn.classList.contains('cancel-btn')) {
            await handleCancelListing(btn.dataset.listingId);
        }
    });

    setupModalInteractions();
}

function setupBuyFilters() {
    const searchInput = document.getElementById('buy-search');
    const filterSelect = document.getElementById('buy-filter');
    const sortSelect = document.getElementById('buy-sort');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (_currentView === 'buy') {
                renderFilteredAuctions(_activeAuctions);
            }
        });
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            if (_currentView === 'buy') {
                renderFilteredAuctions(_activeAuctions);
            }
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            if (_currentView === 'buy') {
                renderFilteredAuctions(_activeAuctions);
            }
        });
    }
}

function setupModalInteractions() {
    document.querySelectorAll('.close-modal, .cancel-sell, .cancel-buy').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });

    document.getElementById('sell-amount').addEventListener('input', (e) => {
        const max = parseInt(e.target.max);
        const value = parseInt(e.target.value);
        if (value > max) e.target.value = max;
        if (value < 1) e.target.value = 1;
    });

    document.querySelector('.confirm-sell').addEventListener('click', handleConfirmSell);
    document.querySelector('.confirm-buy').addEventListener('click', handleConfirmBuy);
}

async function handleBuyClick(auctionId) {
    const auction = _activeAuctions.find(a => a.id == auctionId);
    if (!auction) return;

    if (auction.seller_id === _profile.id) {
        displayMessage('You cannot purchase your own auction listing.');
        return;
    }

    try {
        const response = await fetch(`/api/auction/bank/${_profile.id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('supabase_token')}` }
        });

        if (!response.ok) throw new Error(`Failed to fetch bank items: ${response.status}`);

        const bankItems = await response.json();
        const playerAmount = bankItems
            .filter(item => !item.isGear && item.item === auction.item_wanted)
            .reduce((sum, item) => sum + item.amount, 0);

        document.getElementById('buy-receive-icon').src = getItemIcon(auction.item_selling);
        document.getElementById('buy-receive-name').textContent = auction.item_selling;
        document.getElementById('buy-receive-amount').textContent = auction.amount_selling;

        document.getElementById('buy-pay-icon').src = getItemIcon(auction.item_wanted);
        document.getElementById('buy-pay-name').textContent = auction.item_wanted;
        document.getElementById('buy-pay-amount').textContent = auction.amount_wanted;
        document.getElementById('buy-pay-available').textContent = playerAmount;

        const canAfford = playerAmount >= auction.amount_wanted;
        const confirmBtn = document.querySelector('.confirm-buy');
        confirmBtn.disabled = !canAfford;
        confirmBtn.textContent = canAfford ? 'Confirm Purchase' : 'Insufficient Items';
        confirmBtn.dataset.auctionId = auctionId;

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
        const response = await fetch('/api/auction/items');
        if (!response.ok) throw new Error('Failed to load items');
        
        const allItems = await response.json();
        _availableItems = allItems.filter(i => i.type === 'Ingredient' || i.type === 'Consumable');

        document.getElementById('sell-item-icon').src = item.spritePath;
        document.getElementById('sell-item-name').textContent = item.item;
        document.getElementById('sell-item-available').textContent = item.amount;

        const sellAmountInput = document.getElementById('sell-amount');
        sellAmountInput.max = item.amount;
        sellAmountInput.value = Math.min(1, item.amount);

        renderWantedItemPicker(_availableItems);

        document.querySelector('.confirm-sell').dataset.itemId = itemId;
        document.getElementById('sell-modal').style.display = 'block';
        
        const filterEl = document.getElementById('wanted-filter');
        const searchEl = document.getElementById('wanted-search');
        
        filterEl.addEventListener('change', () => renderWantedItemPicker(_availableItems));
        searchEl.addEventListener('input', () => renderWantedItemPicker(_availableItems));
    } catch (error) {
        console.error('Failed to load available items:', error);
        displayMessage('Failed to load available items. Please try again.');
    }
}

function renderWantedItemPicker(items) {
    const container = document.getElementById('wanted-item-picker');
    const filterValue = document.getElementById('wanted-filter').value;
    const searchQuery = document.getElementById('wanted-search').value.toLowerCase();

    const filtered = items.filter(item =>
        (filterValue === 'all' || item.type === filterValue) &&
        (!searchQuery || item.name.toLowerCase().includes(searchQuery))
    );

    container.innerHTML = filtered.map(item => `
        <div class="wanted-card" data-name="${item.name}">
            <img src="${item.spritePath || 'assets/art/recipes/default_item.png'}" 
                 alt="${item.name}" class="wanted-icon">
            <div class="wanted-name">${item.name}</div>
            <div class="wanted-type">${item.type}</div>
        </div>
    `).join('');

    container.querySelectorAll('.wanted-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.wanted-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            container.dataset.selectedItem = card.dataset.name;
        });
    });
}

function getSelectedWantedItem() {
    return document.getElementById('wanted-item-picker').dataset.selectedItem || null;
}

async function handleConfirmSell() {
    const itemId = document.querySelector('.confirm-sell').dataset.itemId;
    const item = _bankItems.find(i => i.id == itemId);
    if (!item) return;

    const sellAmount = parseInt(document.getElementById('sell-amount').value);
    const wantedItem = getSelectedWantedItem();
    const wantedAmount = parseInt(document.getElementById('wanted-amount').value);

    if (!wantedItem || !wantedAmount || sellAmount < 1) {
        displayMessage('Please fill in all fields correctly.');
        return;
    }

    try {
        displayMessage('Creating auction listing...');

        const response = await fetch('/api/auction/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        const response = await fetch('/api/auction/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auction_id: auctionId,
                buyer_id: _profile.id
            })
        });

        const result = await response.json();

        if (result.success) {
            displayMessage('Purchase completed successfully!');
            document.getElementById('buy-modal').style.display = 'none';
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

        const response = await fetch(`/api/auction/cancel/${listingId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seller_id: _profile.id })
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

    try {
        console.log('[Auction] getItemSprites - fetching /api/auction/items for sprite lookup');
        const response = await fetch('/api/auction/items');
        const items = await response.json();
        console.log('[Auction] getItemSprites - items:', items);

        const itemIndex = {};
        items.forEach(item => {
            if (item.name) itemIndex[item.name] = item;
        });

        itemNames.forEach(itemName => {
            const dbItem = itemIndex[itemName];
            if (dbItem && dbItem.spritePath) {
                spriteMap[itemName] = dbItem.spritePath;
                console.log(`[Auction] getItemSprites - Found spritePath for "${itemName}":`, dbItem.spritePath);
            } else {
                const spriteName = itemNameToSpriteFormat(itemName);
                spriteMap[itemName] = `assets/art/recipes/${spriteName}.png`;
                console.log(`[Auction] getItemSprites - Default spritePath for "${itemName}":`, spriteMap[itemName]);
            }
        });

    } catch (error) {
        console.error('Failed to get item sprites:', error);
        itemNames.forEach(itemName => {
            const spriteName = itemNameToSpriteFormat(itemName);
            spriteMap[itemName] = `assets/art/recipes/${spriteName}.png`;
            console.log(`[Auction] getItemSprites - Error fallback spritePath for "${itemName}":`, spriteMap[itemName]);
        });
    }

    return spriteMap;
}

function getGearIconPath(itemName) {
    console.log('getGearIconPath called with:', itemName);
    
    let baseName = itemName;
    
    baseName = baseName.replace(/^(Basic|Uncommon|Rare|Epic|Legendary)\s+/i, '');
    console.log('After removing rarity prefix:', baseName);
    
    baseName = baseName.replace(/\s+of\s+(the\s+)?.*$/i, '');
    console.log('After removing suffix:', baseName);
    
    const spriteName = baseName.replace(/\s+/g, '');
    console.log('Final sprite name:', spriteName);
    
    const finalPath = `assets/art/items/${spriteName}.png`;
    console.log('Final path:', finalPath);
    
    return finalPath;
}

function getItemIcon(itemName, isGear = false) {
    console.log(`[Auction] getItemIcon called for "${itemName}" (isGear: ${isGear})`);
    const availableItem = _availableItems.find(item => item.name === itemName);
    if (availableItem && availableItem.spritePath) {
        console.log(`[Auction] getItemIcon - Found spritePath in _availableItems for "${itemName}":`, availableItem.spritePath);
        return availableItem.spritePath;
    }
    
    if (isGear) {
        const gearPath = getGearIconPath(itemName);
        console.log(`[Auction] getItemIcon - Gear path for "${itemName}":`, gearPath);
        return gearPath;
    }
    
    const spriteName = itemNameToSpriteFormat(itemName);
    const recipePath = `assets/art/recipes/${spriteName}.png`;
    console.log(`[Auction] getItemIcon - Default recipe path for "${itemName}":`, recipePath);
    return recipePath;
}

function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
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
        .buy-filters {
            padding: 1rem;
            background: rgba(42, 31, 22, 0.3);
            border-bottom: 1px solid #3d2914;
            margin-bottom: 1rem;
        }

        .filter-controls {
            display: flex;
            gap: 1rem;
            align-items: center;
            flex-wrap: wrap;
        }

        .search-input {
            flex: 1;
            min-width: 200px;
            padding: 0.5rem;
            background: rgba(42, 31, 22, 0.8);
            border: 2px solid #3d2914;
            border-radius: 4px;
            color: #b8b3a8;
            font-family: 'Cinzel', serif;
        }

        .search-input:focus {
            outline: none;
            border-color: #c4975a;
        }

        .filter-select {
            padding: 0.5rem;
            background: rgba(42, 31, 22, 0.8);
            border: 2px solid #3d2914;
            border-radius: 4px;
            color: #b8b3a8;
            font-family: 'Cinzel', serif;
            cursor: pointer;
        }

        .filter-select:focus {
            outline: none;
            border-color: #c4975a;
        }

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

        .auction-trade-info {
            font-size: 0.8rem;
            color: #9a8566;
            font-style: italic;
        }

        .trade-want {
            color: #b8b3a8;
        }

        .gear-stats {
            font-size: 0.75rem;
            color: #9a8566;
            margin-top: 0.25rem;
        }

        .stat-item {
            color: #c4975a;
            font-weight: 600;
        }

        .item-actions {
            display: flex;
            align-items: center;
        }

        .action-btn {
            background: linear-gradient(145deg, #2a1f16, #63360f);
            border: 2px solid #996228;
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
            background: linear-gradient(145deg, #2a1f16, #ab5509);
            border: 2px solid #c4975a;
            border-radius: 8px;
            padding: 5px;
            max-width: 500px;
            width: 92%;
            max-height: 98vh;
            overflow-y: auto;
            position: relative;
            margin: auto;
            margin-top: 5px;
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
        }

        .form-group label {
            display: block;
            color: #b8b3a8;
            font-family: 'Cinzel', serif;
            font-weight: 600;
            text-align: center;
        }

        .selling-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 5px;
            background: rgba(42,31,22,0.5);
            border-radius: 6px;
            border: 1px solid #3d2914;
            flex-direction: column;
            width: 96%;
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
        }

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
            cursor: not-allowed;
        }

        .wanted-controls {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        }

        .wanted-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, 97px);
            gap: 8px;
            max-height: 250px;
            overflow-y: auto;
            padding: 5px;
        }

        .wanted-card {
            border: 1px solid #ff9817;
            border-radius: 6px;
            padding: 5px;
            text-align: center;
            cursor: pointer;
            background: linear-gradient(145deg, #2a1f16, #63360f);
            transition: all 0.2s;
        }

        .wanted-card.selected {
            border-color: #3216cd;
            background: #225921;
        }

        .wanted-icon {
            width: 48px;
            height: 48px;
        }

        .wanted-name {
            font-size: 12px;
            margin-top: 5px;
        }

        .wanted-type {
            font-size: 10px;
            color: #666;
        }
    `;
    document.head.appendChild(style);
}

function getGearRarity(itemName) {
    // Extracts rarity from item name prefix (e.g. "Epic Sword of Doom")
    const match = itemName.match(/^(Basic|Uncommon|Rare|Epic|Legendary)\s+/i);
    if (!match) return '';
    return `rarity-${match[1].toLowerCase()}`;
}