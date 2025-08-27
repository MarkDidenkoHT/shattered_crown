let _main;
let _getCurrentProfile;
let _profile;
let _bankItems = [];
let _filteredItems = [];
let _currentFilter = 'all';

export async function loadModule(main, { getCurrentProfile }) {
    _main = main;
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
    setBankHeaderBackground();
}

async function fetchBankItems() {
    try {
        displayMessage('Loading bank items...');
        
        // Use secure backend endpoint without exposing API keys
        const response = await fetch(`/api/bank/items/${_profile.id}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        _bankItems = await response.json();
        
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
            ${filter === 'all' ? 'All Items' : filter}
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
        <div class="bank-item" data-item-id="${item.id}" data-type="${item.type || 'consumable'}">
            <div class="item-icon">
                <img src="${getItemIcon(item)}" alt="${item.item}" onerror="this.src='assets/art/recipes/default_item.png'">
                ${item.amount > 1 ? `<span class="item-quantity">${item.amount}</span>` : ''}
            </div>
            
            <div class="item-info">
                <div class="item-name">${item.item}</div>
                <div class="item-details">
                    <span class="item-type">${item.type || 'consumable'}</span>
                    ${item.profession_name ? `<span class="item-profession">• ${item.profession_name}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function getItemIcon(item) {
    // Use the sprite path from backend response, or fallback to default
    return item.sprite_path || 'assets/art/recipes/default_item.png';
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

function setBankHeaderBackground() {
  const header = document.querySelector('.bank-header');
  if (header) {
    header.style.backgroundImage = "url('assets/art/castle/main_bank.png')";
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

        /* Mobile Responsiveness */
        @media (max-width: 768px) {
            .filter-tab {
                font-size: 0.8rem;
                padding: 0.4rem 0.8rem;
            }

            .bank-item {
                gap: 0.5rem;
                padding: 0.5rem;
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