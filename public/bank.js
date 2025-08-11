let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _bankItems = [];
let _filteredItems = [];
let _currentFilter = 'all';

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

    // Setup the bank interface
    _main.innerHTML = `
        <div class="main-app-container bank-container">
            <div class="particles"></div>
            
            <!-- Top Header -->
            <div class="bank-header">
                <div class="top-right-buttons">
                    <button class="fantasy-button back-btn">Return</button>
                </div>
                
                <!-- Filter Tabs - will be populated dynamically -->
                <div class="filter-tabs" id="filterTabs">
                    <!-- Dynamic filter tabs will be inserted here -->
                </div>
            </div>

            <!-- Main Bank Content -->
            <div class="bank-content">
                <div class="bank-items-container">
                    <div class="bank-items-list" id="bankItemsList">
                        <!-- Items will be populated here -->
                    </div>
                </div>
            </div>
        </div>
    `;

    addBankStyles();
    createParticles();
    await fetchBankItems();
    setupBankInteractions();
}

async function fetchBankItems() {
    try {
        displayMessage('Loading bank items...');
        
        // First get the bank items
        const bankResponse = await _apiCall(`/api/supabase/rest/v1/bank?player_id=eq.${_profile.id}&select=*,professions(name)`);
        const bankItems = await bankResponse.json();
        
        // Get all unique ingredient and recipe names to fetch sprites
        const ingredientNames = bankItems.filter(item => item.type === 'ingredient').map(item => item.item);
        const recipeNames = bankItems.filter(item => item.type !== 'ingredient').map(item => item.item);
        
        // Fetch sprite data for ingredients and recipes
        let ingredientSprites = {};
        let recipeSprites = {};
        
        if (ingredientNames.length > 0) {
            const ingredientsResponse = await _apiCall(`/api/supabase/rest/v1/ingridients?name=in.(${ingredientNames.map(name => `"${name}"`).join(',')})&select=name,sprite`);
            const ingredients = await ingredientsResponse.json();
            ingredientSprites = ingredients.reduce((acc, ing) => {
                acc[ing.name] = ing.sprite;
                return acc;
            }, {});
        }
        
        if (recipeNames.length > 0) {
            const recipesResponse = await _apiCall(`/api/supabase/rest/v1/recipes?name=in.(${recipeNames.map(name => `"${name}"`).join(',')})&select=name,sprite`);
            const recipes = await recipesResponse.json();
            recipeSprites = recipes.reduce((acc, rec) => {
                acc[rec.name] = rec.sprite;
                return acc;
            }, {});
        }
        
        // Merge sprite data into bank items
        _bankItems = bankItems.map(item => ({
            ...item,
            sprite: item.type === 'ingredient' ? ingredientSprites[item.item] : recipeSprites[item.item]
        }));
        
        _filteredItems = [..._bankItems];
        createDynamicFilters();
        renderBankItems();
        closeMessageBox();
    } catch (error) {
        console.error('Failed to fetch bank items:', error);
        displayMessage('Failed to load bank items. Please try again.');
        _bankItems = [];
        _filteredItems = [];
        createDynamicFilters();
        renderBankItems();
    }
}

function createDynamicFilters() {
    const filterTabs = document.getElementById('filterTabs');
    
    // Get unique types from player's items
    const uniqueTypes = [...new Set(_bankItems.map(item => item.type).filter(type => type))];
    
    // Always include "All Items" first
    const filters = ['all', ...uniqueTypes.sort()];
    
    filterTabs.innerHTML = filters.map(filter => `
        <button class="filter-tab ${filter === 'all' ? 'active' : ''}" data-filter="${filter}">
            ${filter === 'all' ? 'All Items' : formatItemType(filter)}
        </button>
    `).join('');
}

function renderBankItems() {
    const itemsList = document.getElementById('bankItemsList');
    
    if (_filteredItems.length === 0) {
        itemsList.innerHTML = `
            <div class="empty-bank">
                <div class="empty-icon">🏦</div>
                <h3>Your bank is empty</h3>
                <p>Items you store will appear here</p>
            </div>
        `;
        return;
    }

    itemsList.innerHTML = _filteredItems.map(item => `
        <div class="bank-item" data-item-id="${item.id}" data-type="${item.type || 'recipe'}">
            <div class="item-icon">
                <img src="${getItemIcon(item)}" alt="${item.item}" onerror="this.src='assets/art/recipes/default_item.png'">
                ${item.amount > 1 ? `<span class="item-quantity">${item.amount}</span>` : ''}
            </div>
            
            <div class="item-info">
                <div class="item-name">${item.item}</div>
                <div class="item-details">
                    <span class="item-type">${formatItemType(item.type)}</span>
                    ${item.professions ? `<span class="item-profession">• ${item.professions.name}</span>` : ''}
                </div>
            </div>
            
            <div class="item-actions">
                <button class="action-btn auction-btn" data-action="auction" data-item-id="${item.id}">
                    <span class="btn-icon">🏛️</span>
                    Auction
                </button>
                <button class="action-btn discard-btn" data-action="discard" data-item-id="${item.id}">
                    <span class="btn-icon">🗑️</span>
                    Discard
                </button>
            </div>
        </div>
    `).join('');
}

function getItemIcon(item) {
    // Use the sprite name directly from database without modifications
    const spriteName = item.sprite;
    
    // Determine folder based on type
    const isIngredient = item.type === 'Ingredient';
    const basePath = isIngredient ? 'assets/art/ingridients/' : 'assets/art/recipes/';
    
    // Add .png extension if not already present
    const fileName = spriteName.endsWith('.png') ? spriteName : `${spriteName}.png`;
    
    return `${basePath}${fileName}`;
}

function formatItemType(type) {
    if (!type) return 'Recipe';
    
    // Handle specific type formatting
    const typeMap = {
        'ingredient': 'Ingredient',
        'consumable': 'Consumable',
        'weapon': 'Weapon',
        'armor': 'Armor',
        'tool': 'Tool'
    };
    
    return typeMap[type.toLowerCase()] || type.charAt(0).toUpperCase() + type.slice(1);
}

function setupBankInteractions() {
    // Back button
    _main.querySelector('.back-btn').addEventListener('click', () => {
        window.gameAuth.loadModule('castle');
    });

    // Filter tabs (using event delegation)
    _main.querySelector('#filterTabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-tab')) {
            // Update active tab
            _main.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            // Filter items
            _currentFilter = e.target.dataset.filter;
            if (_currentFilter === 'all') {
                _filteredItems = [..._bankItems];
            } else {
                _filteredItems = _bankItems.filter(item => item.type === _currentFilter);
            }
            
            renderBankItems();
        }
    });

    // Item action buttons (using event delegation)
    _main.querySelector('#bankItemsList').addEventListener('click', async (e) => {
        if (e.target.classList.contains('auction-btn') || e.target.closest('.auction-btn')) {
            const btn = e.target.classList.contains('auction-btn') ? e.target : e.target.closest('.auction-btn');
            const itemId = btn.dataset.itemId;
            await handleAuctionItem(itemId);
        } else if (e.target.classList.contains('discard-btn') || e.target.closest('.discard-btn')) {
            const btn = e.target.classList.contains('discard-btn') ? e.target : e.target.closest('.discard-btn');
            const itemId = btn.dataset.itemId;
            await handleDiscardItem(itemId);
        }
    });
}

async function handleAuctionItem(itemId) {
    const item = _bankItems.find(i => i.id == itemId);
    if (!item) return;

    // Placeholder for auction functionality
    displayMessage(`Auction system coming soon! ${item.item} will be available for player trading.`);
}

async function handleDiscardItem(itemId) {
    const item = _bankItems.find(i => i.id == itemId);
    if (!item) return;

    const confirmed = await showConfirmDialog(
        `Discard ${item.item}?`,
        `This item will be permanently destroyed and cannot be recovered.`
    );

    if (confirmed) {
        try {
            await _apiCall(`/api/supabase/rest/v1/bank?id=eq.${itemId}`, {
                method: 'DELETE'
            });

            displayMessage(`Discarded ${item.item}!`);
            await fetchBankItems();
        } catch (error) {
            console.error('Failed to discard item:', error);
            displayMessage('Failed to discard item. Please try again.');
        }
    }
}

function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'custom-message-box';
        dialog.innerHTML = `
            <div class="message-content confirm-dialog">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-buttons">
                    <button class="fantasy-button confirm-yes">Yes</button>
                    <button class="fantasy-button confirm-no">No</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        dialog.querySelector('.confirm-yes').addEventListener('click', () => {
            dialog.remove();
            resolve(true);
        });

        dialog.querySelector('.confirm-no').addEventListener('click', () => {
            dialog.remove();
            resolve(false);
        });
    });
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

function addBankStyles() {
    const styleId = 'bank-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .bank-container {
            position: relative;
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background-color: #1a150e;
            overflow: hidden;
        }

        .bank-header {
            background-image: url('assets/art/castle/main_bank.png');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            min-height: 20vh;
            position: relative;
            display: flex;
            align-items: flex-end;
        }

        .bank-title {
            font-family: 'Cinzel', serif;
            font-size: 1.8rem;
            color: #c4975a;
            text-shadow: 2px 2px 0px #3d2914;
            margin: 0;
            text-align: center;
            flex: 1;
        }

        /* Filter Tabs - Horizontal Scrollable */
        .filter-tabs {
            display: flex;
            gap: 0.5rem;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 0.25rem 0;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
        }

        .filter-tabs::-webkit-scrollbar {
            display: none;
        }

        .filter-tab {
            background: linear-gradient(145deg, #2a1f16, #1d140c);
            border: 2px solid #3d2914;
            color: #b8b3a8;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Cinzel', serif;
            font-size: 0.9rem;
            transition: all 0.3s ease;
            white-space: nowrap;
            flex-shrink: 0;
            min-width: fit-content;
        }

        .filter-tab:hover {
            border-color: #c4975a;
            color: #c4975a;
        }

        .filter-tab.active {
            background: linear-gradient(145deg, #c4975a, #a25612);
            border-color: #c4975a;
            color: #1d140c;
            font-weight: 600;
        }

        .bank-content {
            flex: 1;
            overflow: hidden;
        }

        .bank-items-container {
            height: 100%;
            background: rgba(29,20,12,0.3);
            border: 2px solid #3d2914;
            border-radius: 8px;
            overflow: hidden;
        }

        .bank-items-list {
            height: 100%;
            overflow-y: auto;
            padding: 0.5rem;
        }

        /* Custom Scrollbar */
        .bank-items-list::-webkit-scrollbar {
            width: 12px;
        }

        .bank-items-list::-webkit-scrollbar-track {
            background: rgba(29,20,12,0.5);
            border-radius: 6px;
        }

        .bank-items-list::-webkit-scrollbar-thumb {
            background: linear-gradient(145deg, #c4975a, #a25612);
            border-radius: 6px;
        }

        .bank-items-list::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(145deg, #d4a76a, #b26622);
        }

        /* Bank Items */
        .bank-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(145deg, rgba(29,20,12,0.8), rgba(42,31,22,0.6));
            border: 2px solid #3d2914;
            border-radius: 6px;
            transition: all 0.3s ease;
        }

        .bank-item:hover {
            border-color: #c4975a;
            transform: translateX(2px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
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
        }

        .item-type {
            color: #8b7355;
        }

        .item-profession {
            color: #9a8566;
        }

        .item-actions {
            display: flex;
            gap: 0.5rem;
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

        .auction-btn:hover {
            border-color: #6f42c1;
            color: #6f42c1;
            background: linear-gradient(145deg, #3a2a4a, #2a1e3a);
        }

        .discard-btn:hover {
            border-color: #dc3545;
            color: #dc3545;
            background: linear-gradient(145deg, #5b1e1e, #4a1d1d);
        }

        .btn-icon {
            font-size: 0.9rem;
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

        .bank-stats {
            display: flex;
            gap: 2rem;
            font-family: 'Cinzel', serif;
            color: #c4975a;
            align-items: center;
        }

        .auction-note {
            color: #8b7355;
            font-style: italic;
            font-size: 0.9rem;
        }

        /* Confirm Dialog */
        .confirm-dialog {
            max-width: 400px;
        }

        .confirm-dialog h3 {
            font-family: 'Cinzel', serif;
            color: #c4975a;
            margin-bottom: 1rem;
            text-align: center;
        }

        .confirm-buttons {
            display: flex;
            gap: 0.5rem;
            margin-top: 1.5rem;
        }

        .confirm-buttons .fantasy-button {
            flex: 1;
            padding: 0.75rem;
        }

        /* Mobile Responsiveness */
        @media (max-width: 768px) {
            .bank-title {
                font-size: 1.4rem;
            }

            .filter-tab {
                font-size: 0.8rem;
                padding: 0.4rem 0.8rem;
            }

            .bank-item {
                gap: 0.5rem;
                padding: 0.5rem;
            }

            .item-actions {
                flex-direction: column;
                gap: 0.3rem;
            }

            .action-btn {
                padding: 0.3rem 0.6rem;
                font-size: 0.7rem;
            }

            .bank-stats {
                gap: 1rem;
                font-size: 0.9rem;
                flex-direction: column;
                text-align: center;
            }
        }
    `;
    document.head.appendChild(style);
}
