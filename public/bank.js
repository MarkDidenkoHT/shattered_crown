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

// Inject loading modal styles if not present (reuse from battle/altar)
function injectBankLoadingStyles() {
    if (document.getElementById('bank-loading-styles')) return;
    const style = document.createElement('style');
    style.id = 'bank-loading-styles';
    style.textContent = `
    .loading-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(5px);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease;
    }
    .loading-content {
      background: linear-gradient(145deg, rgba(29, 20, 12, 0.95), rgba(42, 31, 22, 0.9));
      border: 2px solid #c4975a;
      border-radius: 12px;
      padding: 2.5rem;
      text-align: center;
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.2),
        0 8px 32px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(10px);
      min-width: 320px;
      max-width: 90vw;
    }
    .loading-header h2 {
      font-family: 'Cinzel', serif;
      color: #c4975a;
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      text-shadow: 1px 1px 0 #3d2914;
      letter-spacing: 1px;
    }
    .loading-message {
      color: #b8b3a8;
      font-size: 1rem;
      margin-bottom: 2rem;
      font-style: italic;
      opacity: 0.9;
    }
    .loading-animation {
      position: relative;
      width: 120px;
      height: 120px;
      margin: 0 auto 2rem;
    }
    .crafting-wheel {
      width: 100%;
      height: 100%;
      border: 3px solid #3d2914;
      border-radius: 50%;
      position: relative;
      background: radial-gradient(circle, rgba(196, 151, 90, 0.1), transparent);
      animation: rotateWheel 3s linear infinite;
      box-shadow: 
        inset 0 0 10px rgba(196, 151, 90, 0.3),
        0 0 20px rgba(196, 151, 90, 0.2);
    }
    .wheel-spoke {
      position: absolute;
      width: 2px;
      height: 50px;
      background: linear-gradient(to bottom, #c4975a, transparent);
      left: 50%;
      top: 50%;
      transform-origin: 0 0;
      border-radius: 1px;
    }
    .wheel-spoke:nth-child(1) { transform: translate(-50%, -100%) rotate(0deg); }
    .wheel-spoke:nth-child(2) { transform: translate(-50%, -100%) rotate(60deg); }
    .wheel-spoke:nth-child(3) { transform: translate(-50%, -100%) rotate(120deg); }
    .wheel-spoke:nth-child(4) { transform: translate(-50%, -100%) rotate(180deg); }
    .wheel-spoke:nth-child(5) { transform: translate(-50%, -100%) rotate(240deg); }
    .wheel-spoke:nth-child(6) { transform: translate(-50%, -100%) rotate(300deg); }
    .loading-particles {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .loading-particles .particle {
      position: absolute;
      width: 4px;
      height: 4px;
      background: #c4975a;
      border-radius: 50%;
      opacity: 0;
      animation: floatParticle 2s ease-in-out infinite;
      box-shadow: 0 0 6px rgba(196, 151, 90, 0.5);
    }
    .loading-particles .particle:nth-child(1) { top: 20%; left: 30%; animation-delay: 0s; }
    .loading-particles .particle:nth-child(2) { top: 60%; right: 25%; animation-delay: 0.4s; }
    .loading-particles .particle:nth-child(3) { bottom: 30%; left: 20%; animation-delay: 0.8s; }
    .loading-particles .particle:nth-child(4) { top: 40%; right: 40%; animation-delay: 1.2s; }
    .loading-particles .particle:nth-child(5) { bottom: 20%; right: 30%; animation-delay: 1.6s; }
    .loading-progress {
      width: 100%;
      margin-bottom: 1.5rem;
    }
    .progress-bar {
      width: 100%;
      height: 8px;
      background: rgba(61, 41, 20, 0.8);
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #3d2914;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #c4975a, #e6b573, #c4975a);
      background-size: 200% 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
      animation: progressShimmer 2s ease-in-out infinite;
      box-shadow: 0 0 10px rgba(196, 151, 90, 0.4);
    }
    .progress-text {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 0.5rem;
      font-size: 0.9rem;
    }
    .progress-step {
      color: #b8b3a8;
      font-style: italic;
    }
    .progress-percent {
      color: #c4975a;
      font-weight: bold;
      font-family: 'Cinzel', serif;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes rotateWheel {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes floatParticle {
      0%, 100% { 
        opacity: 0; 
        transform: translateY(0px) scale(1); 
      }
      50% { 
        opacity: 1; 
        transform: translateY(-20px) scale(1.2); 
      }
    }
    @keyframes progressShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    `;
    document.head.appendChild(style);
}

function createBankLoadingModal(title = "Loading Bank", message = "Fetching your items...") {
    injectBankLoadingStyles();
    const modal = document.createElement('div');
    modal.className = 'loading-modal';
    modal.innerHTML = `
      <div class="loading-content">
        <div class="loading-header">
          <h2>${title}</h2>
          <p class="loading-message">${message}</p>
        </div>
        <div class="loading-animation">
          <div class="crafting-wheel">
            ${Array(6).fill().map(() => '<div class="wheel-spoke"></div>').join('')}
          </div>
          <div class="loading-particles">
            ${Array(5).fill().map(() => '<div class="particle"></div>').join('')}
          </div>
        </div>
        <div class="loading-progress">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <div class="progress-text">
            <span class="progress-step">Connecting to bank...</span>
            <span class="progress-percent">0%</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function updateBankLoadingProgress(modal, step, message, percent) {
    if (!modal?.parentNode) return;
    const progressStep = modal.querySelector('.progress-step');
    const loadingMessage = modal.querySelector('.loading-message');
    const progressFill = modal.querySelector('.progress-fill');
    const progressPercent = modal.querySelector('.progress-percent');
    if (progressStep) progressStep.textContent = step;
    if (loadingMessage) loadingMessage.textContent = message;
    if (progressFill && typeof percent === 'number') progressFill.style.width = `${percent}%`;
    if (progressPercent && typeof percent === 'number') progressPercent.textContent = `${Math.round(percent)}%`;
}

function removeBankLoadingModal(modal) {
    if (modal?.parentNode) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.parentNode && modal.remove(), 300);
    }
}

async function fetchBankItems() {
    try {
        // Show loading modal instead of displayMessage
        const loadingModal = createBankLoadingModal("Loading Bank", "Fetching your items...");
        const loadingStartTime = Date.now();
        updateBankLoadingProgress(loadingModal, "Connecting to bank...", "Authenticating...", 10);

        // Use secure backend endpoint without exposing API keys
        updateBankLoadingProgress(loadingModal, "Loading items...", "Retrieving bank items...", 40);
        const response = await fetch(`/api/bank/items/${_profile.id}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        updateBankLoadingProgress(loadingModal, "Processing...", "Preparing item list...", 80);

        if (!response.ok) {
            removeBankLoadingModal(loadingModal);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        _bankItems = await response.json();

        _filteredItems = [..._bankItems];
        createDynamicFilters();
        renderBankItems();

        // Ensure minimum loading time for smooth animation
        const minTime = 1200;
        const elapsed = Date.now() - loadingStartTime;
        await new Promise(resolve => setTimeout(resolve, Math.max(0, minTime - elapsed)));

        removeBankLoadingModal(loadingModal);
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
                <img src="${getItemIcon(item)}" alt="${item.item}">
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