let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;

export async function loadModule(main, { apiCall, getCurrentProfile }) {
  console.log('[ALTAR] --- Starting loadModule for Altar ---');
  _main = main;
  _apiCall = apiCall;
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
      <div class="altar-particles"></div>
      <div class="altar-section">
        <div class="altar-header">
          <h1>Sacred Altar</h1>
          <p class="subtitle">Commune with the divine and redeem sacred offerings</p>
        </div>
        
        <div class="altar-content">
          <!-- Central Altar Visual -->
          <div class="altar-visual">
            <div class="altar-flame">🔥</div>
            <div class="altar-glow"></div>
            <div class="runes-circle">
              <div class="rune">⚡</div>
              <div class="rune">❄️</div>
              <div class="rune">🌿</div>
              <div class="rune">🗡️</div>
              <div class="rune">🛡️</div>
              <div class="rune">💎</div>
            </div>
          </div>
          
          <!-- Promo Code Section -->
          <div class="offering-panel">
            <h2>Divine Offerings</h2>
            <p class="offering-desc">Enter sacred codes bestowed by the gods to receive their blessings</p>
            
            <div class="promo-input-section">
              <div class="input-container">
                <input type="text" 
                       id="promoCodeInput" 
                       placeholder="Enter divine code..." 
                       maxlength="50"
                       class="promo-input">
                <div class="input-glow"></div>
              </div>
              <button class="fantasy-button redeem-btn" id="redeemBtn">
                <span class="btn-text">Offer Code</span>
                <span class="btn-icon">⚡</span>
              </button>
            </div>
            
            <div class="blessing-status" id="blessingStatus" style="display: none;">
              <div class="status-content">
                <div class="status-icon">✨</div>
                <div class="status-message"></div>
              </div>
            </div>
            
            <!-- Recent Blessings -->
            <div class="recent-blessings" id="recentBlessings" style="display: none;">
              <h3>Recent Divine Blessings</h3>
              <div class="blessings-list" id="blessingsList"></div>
            </div>
          </div>
        </div>
        
        <div class="altar-actions">
          <button class="fantasy-button return-btn">Return to Castle</button>
        </div>
      </div>
    </div>
  `;

  createAltarParticles();
  setupEventHandlers();
  loadRecentBlessings();
  console.log('[ALTAR] --- loadModule for Altar finished ---');
}

function setupEventHandlers() {
  // Return button
  const returnBtn = _main.querySelector('.return-btn');
  returnBtn.addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });

  // Promo code input
  const promoInput = _main.querySelector('#promoCodeInput');
  const redeemBtn = _main.querySelector('#redeemBtn');
  
  // Enable/disable redeem button based on input
  promoInput.addEventListener('input', () => {
    const code = promoInput.value.trim();
    redeemBtn.disabled = code.length === 0;
    
    if (code.length > 0) {
      redeemBtn.classList.add('active');
    } else {
      redeemBtn.classList.remove('active');
    }
  });

  // Handle Enter key in input
  promoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !redeemBtn.disabled) {
      handlePromoRedeem();
    }
  });

  // Redeem button click
  redeemBtn.addEventListener('click', handlePromoRedeem);
  
  // Initial state
  redeemBtn.disabled = true;
}

async function handlePromoRedeem() {
  const promoInput = _main.querySelector('#promoCodeInput');
  const redeemBtn = _main.querySelector('#redeemBtn');
  const code = promoInput.value.trim().toUpperCase();
  
  if (!code) return;
  
  // Show loading state
  setButtonLoading(redeemBtn, true);
  hideStatus();
  
  try {
    console.log('[ALTAR] Attempting to redeem promo code:', code);
    
    const response = await _apiCall('/api/supabase/functions/v1/redeem_promo', {
      method: 'POST',
      body: {
        code: code,
        player_id: _profile.id
      }
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      // Success
      showStatus('success', result.message, result.rewards);
      promoInput.value = '';
      animateAltarBlessing();
      
      // Refresh recent blessings after a short delay
      setTimeout(() => {
        loadRecentBlessings();
      }, 1000);
      
    } else {
      // Error from server
      const errorMessage = result.error || 'Failed to redeem code';
      showStatus('error', errorMessage);
      shakeInput();
    }
    
  } catch (error) {
    console.error('[ALTAR] Error redeeming promo code:', error);
    showStatus('error', 'Connection failed. Please try again.');
    shakeInput();
  } finally {
    setButtonLoading(redeemBtn, false);
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
    btnIcon.textContent = '⚡';
    
    // Re-check if input has value
    const promoInput = _main.querySelector('#promoCodeInput');
    if (promoInput.value.trim().length === 0) {
      button.disabled = true;
      button.classList.remove('active');
    }
  }
}

function showStatus(type, message, rewards = null) {
  const statusEl = _main.querySelector('#blessingStatus');
  const statusIcon = statusEl.querySelector('.status-icon');
  const statusMessage = statusEl.querySelector('.status-message');
  
  statusEl.className = `blessing-status ${type}`;
  
  if (type === 'success') {
    statusIcon.textContent = '✨';
    let fullMessage = message;
    
    if (rewards && rewards.length > 0) {
      const rewardText = rewards.map(r => `${r.amount}x ${r.item}`).join(', ');
      fullMessage += `\n\nReceived: ${rewardText}`;
    }
    
    statusMessage.textContent = fullMessage;
  } else {
    statusIcon.textContent = '❌';
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

function animateAltarBlessing() {
  const flame = _main.querySelector('.altar-flame');
  const glow = _main.querySelector('.altar-glow');
  const runes = _main.querySelectorAll('.rune');
  
  // Animate flame
  flame.style.transform = 'scale(1.5)';
  flame.style.filter = 'brightness(2)';
  
  // Animate glow
  glow.style.opacity = '0.8';
  glow.style.transform = 'scale(1.2)';
  
  // Animate runes
  runes.forEach((rune, index) => {
    setTimeout(() => {
      rune.style.animation = 'runeGlow 1s ease-out';
    }, index * 100);
  });
  
  // Reset after animation
  setTimeout(() => {
    flame.style.transform = '';
    flame.style.filter = '';
    glow.style.opacity = '';
    glow.style.transform = '';
    
    runes.forEach(rune => {
      rune.style.animation = '';
    });
  }, 2000);
}

async function loadRecentBlessings() {
  try {
    // Get profile to check recent promo usage
    const response = await _apiCall(`/api/supabase/rest/v1/profiles?id=eq.${_profile.id}&select=promos_used`);
    const profiles = await response.json();
    
    if (profiles && profiles.length > 0 && profiles[0].promos_used) {
      const recentPromos = profiles[0].promos_used.slice(-3).reverse(); // Last 3, most recent first
      
      if (recentPromos.length > 0) {
        displayRecentBlessings(recentPromos);
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

function createAltarParticles() {
  console.log('[ALTAR] Creating mystical particles...');
  const particlesContainer = _main.querySelector('.altar-particles');
  if (!particlesContainer) return;

  particlesContainer.innerHTML = '';
  const particleCount = 15;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'altar-particle';
    
    // Random particle type
    const types = ['✨', '⭐', '💫', '🌟'];
    particle.textContent = types[Math.floor(Math.random() * types.length)];
    
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 8 + 's';
    particle.style.animationDuration = (Math.random() * 4 + 6) + 's';
    
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

// Add styles
const styleEl = document.createElement('style');
styleEl.textContent = `
  .altar-section {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 2rem;
    position: relative;
    z-index: 2;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(15px);
  }

  .altar-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .altar-header h1 {
    font-family: 'Cinzel', serif;
    font-size: 2.5rem;
    color: #c4975a;
    margin-bottom: 0.5rem;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    letter-spacing: 2px;
  }

  .altar-header .subtitle {
    font-size: 1rem;
    color: #b8b3a8;
    opacity: 0.9;
    font-style: italic;
  }

  .altar-content {
    display: flex;
    align-items: center;
    gap: 3rem;
    max-width: 900px;
    width: 100%;
  }

  /* Altar Visual */
  .altar-visual {
    position: relative;
    width: 200px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .altar-flame {
    font-size: 3rem;
    z-index: 3;
    position: relative;
    animation: flicker 2s ease-in-out infinite;
    filter: drop-shadow(0 0 10px rgba(255, 165, 0, 0.6));
    transition: all 0.3s ease;
  }

  .altar-glow {
    position: absolute;
    inset: -20px;
    background: radial-gradient(circle, rgba(196, 151, 90, 0.3) 0%, rgba(196, 151, 90, 0.1) 50%, transparent 80%);
    border-radius: 50%;
    opacity: 0.4;
    animation: pulse 3s ease-in-out infinite;
    transition: all 0.3s ease;
  }

  .runes-circle {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    animation: rotate 20s linear infinite;
  }

  .rune {
    position: absolute;
    font-size: 1.2rem;
    color: #c4975a;
    filter: drop-shadow(0 0 5px rgba(196, 151, 90, 0.5));
    transition: all 0.3s ease;
  }

  .rune:nth-child(1) { top: 0; left: 50%; transform: translateX(-50%); }
  .rune:nth-child(2) { top: 25%; right: 0; transform: translateY(-50%); }
  .rune:nth-child(3) { bottom: 25%; right: 0; transform: translateY(50%); }
  .rune:nth-child(4) { bottom: 0; left: 50%; transform: translateX(-50%); }
  .rune:nth-child(5) { bottom: 25%; left: 0; transform: translateY(50%); }
  .rune:nth-child(6) { top: 25%; left: 0; transform: translateY(-50%); }

  /* Offering Panel */
  .offering-panel {
    flex: 1;
    background: linear-gradient(145deg, rgba(29,20,12,0.9), rgba(42,31,22,0.8));
    border: 2px solid #3d2914;
    border-radius: 15px;
    padding: 2rem;
    backdrop-filter: blur(5px);
    box-shadow: 
      inset 0 1px 0 rgba(196, 151, 90, 0.2),
      0 10px 30px rgba(0, 0, 0, 0.4);
  }

  .offering-panel h2 {
    font-family: 'Cinzel', serif;
    color: #c4975a;
    font-size: 1.8rem;
    text-align: center;
    margin-bottom: 0.5rem;
    letter-spacing: 1px;
  }

  .offering-desc {
    color: #b8b3a8;
    text-align: center;
    margin-bottom: 2rem;
    opacity: 0.9;
    line-height: 1.4;
  }

  .promo-input-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .input-container {
    position: relative;
  }

  .promo-input {
    width: 100%;
    padding: 1rem 1.5rem;
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

  /* Blessing Status */
  .blessing-status {
    padding: 1.5rem;
    border-radius: 10px;
    margin-top: 1rem;
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

  .status-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
    margin-top: 0.2rem;
  }

  .status-message {
    color: #b8b3a8;
    line-height: 1.4;
    white-space: pre-line;
    flex: 1;
  }

  /* Recent Blessings */
  .recent-blessings {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(196, 151, 90, 0.2);
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
    padding: 0.8rem 1rem;
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

  /* Particles */
  .altar-particles {
    position: absolute;
    inset: 0;
    overflow: hidden;
    z-index: 1;
    pointer-events: none;
  }

  .altar-particle {
    position: absolute;
    font-size: 1rem;
    animation: floatUp linear infinite;
    opacity: 0.7;
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.5));
  }

  /* Animations */
  @keyframes flicker {
    0%, 100% { transform: scale(1) rotate(0deg); }
    25% { transform: scale(1.05) rotate(-1deg); }
    50% { transform: scale(0.95) rotate(1deg); }
    75% { transform: scale(1.02) rotate(-0.5deg); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.1); }
  }

  @keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes runeGlow {
    0% { filter: drop-shadow(0 0 5px rgba(196, 151, 90, 0.5)); }
    50% { filter: drop-shadow(0 0 15px rgba(196, 151, 90, 1)) brightness(1.5) scale(1.2); }
    100% { filter: drop-shadow(0 0 5px rgba(196, 151, 90, 0.5)); }
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

  /* Responsive */
  @media (max-width: 768px) {
    .altar-content {
      flex-direction: column;
      gap: 2rem;
    }
    
    .altar-visual {
      width: 150px;
      height: 150px;
    }
    
    .altar-flame {
      font-size: 2.5rem;
    }
    
    .offering-panel {
      padding: 1.5rem;
    }
    
    .altar-header h1 {
      font-size: 2rem;
    }
  }

  @media (max-width: 480px) {
    .altar-section {
      padding: 1rem;
    }
    
    .offering-panel {
      padding: 1rem;
    }
  }
`;
document.head.appendChild(styleEl);
