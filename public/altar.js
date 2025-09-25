let _main;
let _getCurrentProfile;
let _profile;

export async function loadModule(main, { getCurrentProfile }) {
  console.log('[ALTAR] --- Starting loadModule for Altar ---');
  _main = main;
  _getCurrentProfile = getCurrentProfile;

  _profile = _getCurrentProfile();
  if (!_profile) {
    console.error('[ALTAR] No profile found. Redirecting to god selection.');
    displayMessage('User profile not found. Please log in again.');
    window.gameAuth.loadModule('god_selection');
    return;
  }

  _main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      <div class="altar-section">
      
      <div class="bank-header">
        <div class="top-right-buttons">
          <button class="fantasy-button return-btn">Return</button>
        </div>
      </div>
        
        <div class="altar-content">
          <div class="offering-panel">
            <h2>Divine Offerings</h2>
            
            <div class="promo-input-section">
              <div class="input-container">
                <input type="text" 
                       id="promoCodeInput" 
                       placeholder="Enter promo code" 
                       maxlength="50"
                       class="promo-input">
                <div class="input-glow"></div>
              </div>
              <button class="fantasy-button redeem-btn" id="redeemBtn">
                <span class="btn-text">Offer Code</span>
                <span class="btn-icon"></span>
              </button>
            </div>
            
            <div class="blessing-status" id="blessingStatus" style="display: none;">
              <div class="status-content">
                <div class="status-icon"></div>
                <div class="status-message"></div>
              </div>
              <h3>Recent Divine Blessings</h3>
            </div>
            
            <div class="recent-blessings" id="recentBlessings" style="display: none;">
              <div class="blessings-list" id="blessingsList"></div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  `;

  createParticles();
  setupEventHandlers();
  loadRecentBlessings();
  setBankHeaderBackground();
}

function setupEventHandlers() {
  const returnBtn = _main.querySelector('.return-btn');
  returnBtn.addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });

  const promoInput = _main.querySelector('#promoCodeInput');
  const redeemBtn = _main.querySelector('#redeemBtn');
  
  promoInput.addEventListener('input', () => {
    const code = promoInput.value.trim();
    redeemBtn.disabled = code.length === 0;
    
    if (code.length > 0) {
      redeemBtn.classList.add('active');
    } else {
      redeemBtn.classList.remove('active');
    }
  });

  promoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !redeemBtn.disabled) {
      handlePromoRedeem();
    }
  });

  redeemBtn.addEventListener('click', handlePromoRedeem);
  redeemBtn.disabled = true;
}

// Inject loading modal styles if not present (reuse from crafting/battle)
function injectAltarLoadingStyles() {
  if (document.getElementById('altar-loading-styles')) return;
  const style = document.createElement('style');
  style.id = 'altar-loading-styles';
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

function createAltarLoadingModal(title = "Submitting Offer", message = "Invoking divine powers...") {
  injectAltarLoadingStyles();
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
          <span class="progress-step">Connecting...</span>
          <span class="progress-percent">0%</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function updateAltarLoadingProgress(modal, step, message, percent) {
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

function removeAltarLoadingModal(modal) {
  if (modal?.parentNode) {
    modal.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => modal.parentNode && modal.remove(), 300);
  }
}

async function handlePromoRedeem() {
  const promoInput = _main.querySelector('#promoCodeInput');
  const redeemBtn = _main.querySelector('#redeemBtn');
  const code = promoInput.value.trim().toUpperCase();
  
  if (!code) return;

  // Show loading modal
  const loadingModal = createAltarLoadingModal("Submitting Offer", "Invoking divine powers...");
  const loadingStartTime = Date.now();
  updateAltarLoadingProgress(loadingModal, "Connecting to altar...", "Sending your offering...", 10);

  setButtonLoading(redeemBtn, true);
  hideStatus();

  try {
    // Simulate progress
    updateAltarLoadingProgress(loadingModal, "Validating code...", "Checking code validity...", 40);

    const response = await fetch('/api/promo/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        player_id: _profile.id
      })
    });

    updateAltarLoadingProgress(loadingModal, "Receiving blessings...", "Processing rewards...", 80);

    const result = await response.json();

    // Ensure minimum loading time for smooth animation
    const minTime = 1200;
    const elapsed = Date.now() - loadingStartTime;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, minTime - elapsed)));

    removeAltarLoadingModal(loadingModal);

    if (response.ok && result.success) {
      showStatus('success', result.message, result.rewards);
      promoInput.value = '';

      setTimeout(() => loadRecentBlessings(), 1000);
    } else {
      const errorMessage = result.error || 'Failed to redeem code';
      showStatus('error', errorMessage);
      shakeInput();
    }

  } catch (error) {
    removeAltarLoadingModal(loadingModal);
    console.error('[ALTAR] Error redeeming promo code:', error);
    showStatus('error', 'Connection failed. Please try again.');
    shakeInput();
  } finally {
    setButtonLoading(redeemBtn, false);
  }
}

function setBankHeaderBackground() {
  const header = document.querySelector('.bank-header');
  if (header) {
    header.style.backgroundImage = "url('assets/art/castle/main_altar.png')";
  }
}

function setButtonLoading(button, loading) {
  const btnText = button.querySelector('.btn-text');
  const btnIcon = button.querySelector('.btn-icon');
  
  if (loading) {
    button.disabled = true;
    button.classList.add('loading');
    btnText.textContent = 'Invoking...';
    btnIcon.textContent = '⏳';
  } else {
    button.disabled = false;
    button.classList.remove('loading');
    btnText.textContent = 'Offer Code';
    btnIcon.textContent = '';
    
    const promoInput = _main.querySelector('#promoCodeInput');
    if (promoInput.value.trim().length === 0) {
      button.disabled = true;
      button.classList.remove('active');
    }
  }
}

function showStatus(type, message, rewards = null) {
  const statusEl = _main.querySelector('#blessingStatus');
  const statusMessage = statusEl.querySelector('.status-message');
  
  statusEl.className = `blessing-status ${type}`;
  
  if (type === 'success') {
    let fullMessage = message;
    
    if (rewards && rewards.length > 0) {
      const rewardText = rewards.map(r => `${r.amount}x ${r.item}`).join(', ');
      fullMessage += `\n\nReceived: ${rewardText}`;
    }
    
    statusMessage.textContent = fullMessage;
  } else {
    statusMessage.textContent = message;
  }
  
  statusEl.style.display = 'flex';
  statusEl.style.animation = 'fadeInScale 0.5s ease-out';
}

function hideStatus() {
  const statusEl = _main.querySelector('#blessingStatus');
  statusEl.style.display = 'none';
}

function shakeInput() {
  const inputContainer = _main.querySelector('.input-container');
  inputContainer.style.animation = 'shake 0.5s ease-in-out';
  setTimeout(() => {
    inputContainer.style.animation = '';
  }, 500);
}

async function loadRecentBlessings() {
  try {
    const response = await fetch(`/api/promo/recent/${_profile.id}`);
    const profiles = await response.json();

    if (profiles && profiles.length > 0 && profiles[0].promos_used) {
      // Show all promos, not just last 3
      const allPromos = profiles[0].promos_used.slice().reverse();
      if (allPromos.length > 0) {
        displayRecentBlessings(allPromos);
      }
    }
  } catch (error) {
    console.error('[ALTAR] Error loading recent blessings:', error);
  }
}

function displayRecentBlessings(promos) {
  const container = _main.querySelector('#recentBlessings');
  const list = _main.querySelector('#blessingsList');
  
  list.innerHTML = promos.map(promo => `
    <div class="blessing-item">
      <div class="blessing-code">${promo}</div>
      <div class="blessing-checkmark">✓</div>
    </div>
  `).join('');
  
  container.style.display = 'block';
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
    particle.style.animationDelay = Math.random() * 6 + 's';
    particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
    particlesContainer.appendChild(particle);
  }
}

function displayMessage(message) {
  console.log(`[ALTAR] Displaying message: ${message}`);
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

const styleEl = document.createElement('style');
styleEl.textContent = `
  .altar-section {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    z-index: 2;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(15px);
  }

  .altar-content {
    display: flex;
    align-items: center;
    max-width: 600px;
    width: 100%;
  }

  .offering-panel {
    max-height: 75vh;
    flex: 1;
    padding: 8px;
    backdrop-filter: blur(5px);
    box-shadow: 
      inset 0 1px 0 rgba(196, 151, 90, 0.2),
      0 10px 30px rgba(0, 0, 0, 0.4);
  }

  .offering-panel h2 {
    font-family: 'Cinzel', serif;
    color: #c4975a;
    font-size: 1.2rem;
    text-align: center;
    letter-spacing: 1px;
  }

  .promo-input-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
  }

  .input-container {
    position: relative;
  }

  .promo-input {
    width: 100%;
    padding: 8px;
    background: rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(196, 151, 90, 0.3);
    border-radius: 10px;
    color: #b8b3a8;
    font-size: 1rem;
    font-family: 'Cinzel', serif;
    letter-spacing: 1px;
    text-align: center;
    text-transform: uppercase;
    transition: all 0.3s ease;
  }

  .promo-input:focus {
    outline: none;
    border-color: #c4975a;
    color: #c4975a;
    box-shadow: 
      0 0 0 3px rgba(196, 151, 90, 0.1),
      inset 0 0 10px rgba(196, 151, 90, 0.1);
  }

  .promo-input::placeholder {
    color: rgba(184, 179, 168, 0.6);
    font-style: italic;
  }

  .input-glow {
    position: absolute;
    inset: -2px;
    border-radius: 10px;
    background: linear-gradient(45deg, transparent, rgba(196, 151, 90, 0.2), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: -1;
  }

  .promo-input:focus + .input-glow {
    opacity: 1;
  }

  .redeem-btn {
    align-self: center;
    padding: 1rem 2rem;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.3s ease;
    min-width: 180px;
    justify-content: center;
  }

  .redeem-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .redeem-btn.active {
    background: linear-gradient(145deg, #c4975a, #a67c3a);
    box-shadow: 
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 5px 15px rgba(196, 151, 90, 0.3);
  }

  .redeem-btn.loading {
    animation: buttonPulse 1.5s ease-in-out infinite;
  }

  .blessing-status {
    padding: 6px;
    border-radius: 10px;
    margin-top: 6px;
    animation: fadeInScale 0.5s ease-out;
  }

  .blessing-status.success {
    background: linear-gradient(145deg, rgba(76, 175, 80, 0.2), rgba(56, 142, 60, 0.15));
    border: 2px solid rgba(76, 175, 80, 0.4);
  }

  .blessing-status.error {
    background: linear-gradient(145deg, rgba(244, 67, 54, 0.2), rgba(198, 40, 40, 0.15));
    border: 2px solid rgba(244, 67, 54, 0.4);
  }

  .status-content {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .status-message {
    color: #b8b3a8;
    line-height: 1.4;
    white-space: pre-line;
    flex: 1;
  }

  .recent-blessings {
    padding-top: 0.5rem;
    border-top: 1px solid rgba(196, 151, 90, 0.2);
    overflow: auto;
    max-height: 35vh;
  }

  .recent-blessings h3 {
    font-family: 'Cinzel', serif;
    color: #c4975a;
    font-size: 1.2rem;
    text-align: center;
    margin-bottom: 1rem;
  }

  .blessings-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .blessing-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    border-left: 3px solid #c4975a;
  }

  .blessing-code {
    font-family: 'Cinzel', serif;
    color: #b8b3a8;
    letter-spacing: 1px;
  }

  .blessing-checkmark {
    color: #4CAF50;
    font-weight: bold;
  }

  .altar-actions {
    margin-top: 2rem;
  }

  .altar-particles {
    position: absolute;
    inset: 0;
    overflow: hidden;
    z-index: 10;
    pointer-events: none;
  }

  .altar-particle {
    position: absolute;
    font-size: 1rem;
    animation: floatUp linear infinite;
    opacity: 0.7;
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.5));
  }

  @keyframes fadeInScale {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }

  @keyframes buttonPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.8; }
  }

  @keyframes floatUp {
    from {
      transform: translateY(100vh) scale(1);
      opacity: 0.7;
    }
    to {
      transform: translateY(-20px) scale(0.5);
      opacity: 0;
    }
  }
`;
document.head.appendChild(styleEl);
