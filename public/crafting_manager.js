let _main;
let _apiCall;
let _getCurrentProfile;
let _getCurrentSession;
let _profile;
let _session;

let craftingState = null;

export async function loadModule(main, { apiCall, getCurrentProfile, getCurrentSession }) {
  console.log('[CRAFTING] --- Starting loadModule for Crafting Manager ---');
  _main = main;
  _apiCall = apiCall;
  _getCurrentProfile = getCurrentProfile;
  _getCurrentSession = getCurrentSession;

   _profile = _getCurrentProfile();
   _session = _getCurrentSession();
  console.log('[DEBUG] Profile:', _profile);
  console.log('[DEBUG] Session:', _session);

  if (!_profile || !_session) {
    console.error('[CRAFTING] No profile or session found. Redirecting to login.');
    displayMessage('User session not found. Please log in again.');
    window.gameAuth.loadModule('login');
    return;
  }

  _main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      <div class="character-creation-section"></div>
    </div>
  `;

  createParticles();
  await fetchAndRenderProfessions();
  console.log('[CRAFTING] --- loadModule for Crafting Manager finished ---');
}

// Loading animation utilities
function createLoadingModal(title = "Loading Profession Data", message = "Gathering recipes and materials...") {
  const modal = document.createElement('div');
  modal.className = 'loading-modal';
  modal.innerHTML = `
    <div class="loading-content">
      <div class="loading-header">
        <h2>${title}</h2>
        <p class="loading-message">${message}</p>
      </div>
      
      <!-- Animated crafting icon -->
      <div class="loading-animation">
        <div class="crafting-wheel">
          <div class="wheel-spoke"></div>
          <div class="wheel-spoke"></div>
          <div class="wheel-spoke"></div>
          <div class="wheel-spoke"></div>
          <div class="wheel-spoke"></div>
          <div class="wheel-spoke"></div>
        </div>
        <div class="loading-particles">
          <div class="particle"></div>
          <div class="particle"></div>
          <div class="particle"></div>
          <div class="particle"></div>
          <div class="particle"></div>
        </div>
      </div>
      
      <!-- Progress bar -->
      <div class="loading-progress">
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
        <div class="progress-text">
          <span class="progress-step">Fetching recipes...</span>
          <span class="progress-percent">0%</span>
        </div>
      </div>
      
      <!-- Loading dots -->
      <div class="loading-dots">
        <span>.</span><span>.</span><span>.</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  return modal;
}

// Enhanced loading with progress steps
function createAdvancedLoadingModal(professionName = "Profession") {
  const modal = createLoadingModal(`Loading ${professionName}`, `Preparing your ${professionName.toLowerCase()} workspace...`);
  
  const progressSteps = [
    { text: "Connecting to workshop...", duration: 500 },
    { text: `Loading ${professionName.toLowerCase()} data...`, duration: 1000 },
    { text: "Fetching available recipes...", duration: 800 },
    { text: "Checking material inventory...", duration: 500 },
    { text: "Finalizing workspace...", duration: 200 }
  ];
  
  let currentStep = 0;
  let progress = 0;
  
  const progressFill = modal.querySelector('.progress-fill');
  const progressStep = modal.querySelector('.progress-step');
  const progressPercent = modal.querySelector('.progress-percent');
  
  function updateProgress() {
    if (currentStep < progressSteps.length) {
      const step = progressSteps[currentStep];
      progressStep.textContent = step.text;
      
      const targetProgress = ((currentStep + 1) / progressSteps.length) * 100;
      
      // Animate progress bar
      const startProgress = progress;
      const progressDiff = targetProgress - startProgress;
      const startTime = Date.now();
      
      function animateProgress() {
        const elapsed = Date.now() - startTime;
        const progressRatio = Math.min(elapsed / step.duration, 1);
        
        progress = startProgress + (progressDiff * progressRatio);
        progressFill.style.width = `${progress}%`;
        progressPercent.textContent = `${Math.round(progress)}%`;
        
        if (progressRatio < 1) {
          requestAnimationFrame(animateProgress);
        } else {
          currentStep++;
          if (currentStep < progressSteps.length) {
            setTimeout(updateProgress, 100);
          }
        }
      }
      
      animateProgress();
    }
  }
  
  // Start progress animation
  setTimeout(updateProgress, 300);
  
  return modal;
}

// Simple spinner loading for quick operations
function createSpinnerModal(message = "Loading...") {
  const modal = document.createElement('div');
  modal.className = 'loading-modal simple-loading';
  modal.innerHTML = `
    <div class="loading-content simple">
      <div class="spinner"></div>
      <p class="loading-message">${message}</p>
    </div>
  `;
  
  document.body.appendChild(modal);
  return modal;
}

// Utility to remove loading modals with fade out
function removeLoadingModal(modal) {
  if (modal && modal.parentNode) {
    modal.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.remove();
      }
    }, 300);
  }
}

async function fetchAndRenderProfessions() {
  console.log('[CRAFTING] Fetching player characters with professions...');
  try {
    const response = await _apiCall(
      `/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=*,races(name),classes(name),professions(id,name)`
    );
    const characters = await response.json();
    console.log('[CRAFTING] Characters fetched:', characters);

    renderProfessions(characters);
  } catch (error) {
    console.error('[CRAFTING] Error fetching professions:', error);
    displayMessage('Failed to load professions. Please try again.');
  }
}

function renderProfessions(characters) {
  const section = _main.querySelector('.character-creation-section');

  section.innerHTML = `
    <div class="art-header">
      <h1>Your Crafting Professions</h1>
      <p class="subtitle">Select a profession to view recipes or start crafting.</p>
    </div>
    <div class="selection-section">
      <div class="profession-selection-grid">
        ${characters
          .filter(c => c.professions?.name)
          .map(professionCardHTML)
          .join('')}
      </div>
    </div>
    <div class="confirm-return-buttons">
      <button class="fantasy-button return-btn">Return</button>
    </div>
  `;

  section.querySelector('.return-btn').addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });

  // Enhanced recipes button with loading
  section.querySelectorAll('.recipes-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const profName = btn.dataset.profession;
      const profId = btn.dataset.professionId;

      // Show loading immediately
      const loadingModal = createSpinnerModal(`Loading ${profName} recipes...`);
      
      // Disable button and show loading state
      const originalContent = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `
        <div class="button-loading">
          <div class="mini-spinner"></div>
          <span>Loading...</span>
        </div>
      `;

      try {
        const recipes = await fetchRecipes(profId);
        removeLoadingModal(loadingModal);
        showRecipesModal(recipes, profName);
      } catch (err) {
        console.error('[CRAFTING] Failed to load recipes:', err);
        removeLoadingModal(loadingModal);
        displayMessage(`Failed to load recipes for ${profName}`);
      } finally {
        // Restore button state
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
    });
  });

  // Enhanced craft button with advanced loading
  section.querySelectorAll('.craft-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const profName = btn.dataset.profession;
      const profId = btn.dataset.professionId;

      // Disable button and show loading state
      const originalContent = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `
        <div class="button-loading">
          <div class="mini-spinner"></div>
          <span>Loading...</span>
        </div>
      `;

      try {
        await loadProfessionModuleWithLoading(profName, profId);
      } catch (err) {
        console.error('[CRAFTING] Failed to start crafting session:', err);
        displayMessage(`Failed to start crafting for ${profName}`);
      } finally {
        // Restore button state
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
    });
  });
}

function professionCardHTML(character) {
  const profName = character.professions?.name || 'Unknown';
  const profId = character.professions?.id || 0;
  return `
    <div class="selection-card">
      <div class="card-info-block">
        <img src="assets/art/professions/${profName.toLowerCase().replace(/\s+/g, '_')}.png" 
             alt="${profName}" 
             style="width:64px;height:64px;"
             onerror="this.src='assets/art/placeholder.png';">
        <h3 class="card-name">${profName}</h3>
        <p class="card-description">Character: ${character.name || `Lvl ${character.level || 1} ${character.races?.name || 'Unknown'}`}</p>
        <div class="confirm-return-buttons">
          <button class="fantasy-button recipes-btn" data-profession="${profName}" data-profession-id="${profId}">
            Recipes
          </button>
          <button class="fantasy-button craft-btn" data-profession="${profName}" data-profession-id="${profId}">
            Craft
          </button>
        </div>
      </div>
    </div>
  `;
}

async function fetchRecipes(professionId) {
  const response = await _apiCall(
    `/api/supabase/rest/v1/recipes?profession_id=eq.${professionId}&select=name,ingridients,sprite`
  );
  return await response.json();
}

function showRecipesModal(recipes, professionName) {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content scrollable-modal">
      <h2>${professionName} Recipes</h2>
      ${recipes.length === 0
        ? '<p>No recipes found.</p>'
        : recipes.map(recipeHTML).join('')}
      <button class="fantasy-button message-ok-btn">Close</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
  });

  // Add fade in animation
  modal.style.animation = 'fadeIn 0.3s ease';
}

function recipeHTML(recipe) {
  const ingridients = Array.isArray(recipe.ingridients)
    ? recipe.ingridients.join(', ')
    : JSON.stringify(recipe.ingridients);
  return `
    <div style="margin-bottom: 1.5rem; text-align: left;">
      <strong>${recipe.name}</strong><br/>
      <img src="assets/art/recipes/${recipe.sprite}.png" 
           alt="${recipe.name}" 
           style="width: 64px; height: 64px;"
           onerror="this.src='assets/art/placeholder.png';"><br/>
      <span><strong>Ingredients:</strong> ${ingridients}</span>
    </div>
  `;
}

// Helper function for profession modules to control loading
function updateLoadingProgress(loadingModal, step, message) {
  if (!loadingModal || !loadingModal.parentNode) return;
  
  const progressStep = loadingModal.querySelector('.progress-step');
  const loadingMessage = loadingModal.querySelector('.loading-message');
  
  if (progressStep) progressStep.textContent = step;
  if (loadingMessage) loadingMessage.textContent = message;
}

// Helper function for profession modules to finish loading
function finishLoading(loadingModal, loadingStartTime, minimumTime = 3000) {
  if (!loadingModal || !loadingModal.parentNode) return Promise.resolve();
  
  return new Promise(resolve => {
    const elapsedTime = Date.now() - loadingStartTime;
    const remainingTime = Math.max(0, minimumTime - elapsedTime);
    
    // Update to final step
    updateLoadingProgress(loadingModal, "Crafting interface ready!", "Welcome to your workshop!");
    
    setTimeout(() => {
      removeLoadingModal(loadingModal);
      resolve();
    }, Math.max(remainingTime, 500)); // At least 500ms to show final message
  });
}

// Enhanced profession module loading with advanced loading animation
async function loadProfessionModuleWithLoading(professionName, professionId) {
  console.log(`[CRAFTING] Loading ${professionName} module with loading animation...`);
  
  // Create advanced loading modal immediately
  const loadingModal = createAdvancedLoadingModal(professionName);
  const loadingStartTime = Date.now();
  
  try {
    // Convert profession name to filename format (e.g., "Alchemy" -> "alchemy")
    const moduleFileName = professionName.toLowerCase().replace(/\s+/g, '_');
    
    // Update loading message to be more specific
    const loadingMessage = loadingModal.querySelector('.loading-message');
    loadingMessage.textContent = `Initializing ${professionName} crafting interface...`;
    
    // Simulate some loading steps while actually loading the module
    await new Promise(resolve => setTimeout(resolve, 800)); // Let progress animation start
    
    // Dynamically import the profession module
    const professionModule = await import(`./professions/${moduleFileName}.js`);
    
    // Update loading message for the next phase
    loadingMessage.textContent = `Starting ${professionName} crafting session...`;
    
    // Pass the necessary context to the profession module INCLUDING the loading modal
    const context = {
      main: _main,
      apiCall: _apiCall,
      profile: _profile,
      session: _session,
      professionId,
      professionName,
      craftingState: craftingState,
      // Pass the loading modal so the profession module can control it
      loadingModal: loadingModal,
      loadingStartTime: loadingStartTime,
      // Utility functions that profession modules might need
      displayMessage,
      fetchRecipes,
      createParticles,
      createSpinnerModal,
      removeLoadingModal,
      updateLoadingProgress,
      finishLoading
    };
    
    // DON'T remove loading modal here - let the profession module handle it
    // Start the profession-specific crafting session
    await professionModule.startCraftingSession(context);
    
    // Fallback: if profession module doesn't handle loading modal removal
    setTimeout(() => {
      if (loadingModal.parentNode) {
        console.log('[CRAFTING] Fallback: removing loading modal after timeout');
        removeLoadingModal(loadingModal);
      }
    }, 8000); // 8 second fallback timeout
    
  } catch (error) {
    console.error(`[CRAFTING] Failed to load ${professionName} module:`, error);
    removeLoadingModal(loadingModal);
    
    // Show more helpful error message
    if (error.message && error.message.includes('Failed to resolve module')) {
      displayMessage(`${professionName} crafting interface is not available yet. Please check back later.`);
    } else {
      displayMessage(`Failed to load ${professionName} crafting interface. Please try again.`);
    }
  }
}

// Original function kept for backward compatibility
async function loadProfessionModule(professionName, professionId) {
  return await loadProfessionModuleWithLoading(professionName, professionId);
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

  // Add fade in animation
  messageBox.style.animation = 'fadeIn 0.3s ease';
}

// Add loading animation styles to the page
function injectLoadingStyles() {
  if (document.getElementById('crafting-loading-styles')) return; // Already injected
  
  const style = document.createElement('style');
  style.id = 'crafting-loading-styles';
  style.textContent = `
    /* Loading Modal Styles */
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

    .loading-content.simple {
      padding: 2rem;
      min-width: 200px;
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

    /* Crafting Wheel Animation */
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

    /* Loading Particles */
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

    .loading-particles .particle:nth-child(1) {
      top: 20%;
      left: 30%;
      animation-delay: 0s;
    }
    .loading-particles .particle:nth-child(2) {
      top: 60%;
      right: 25%;
      animation-delay: 0.4s;
    }
    .loading-particles .particle:nth-child(3) {
      bottom: 30%;
      left: 20%;
      animation-delay: 0.8s;
    }
    .loading-particles .particle:nth-child(4) {
      top: 40%;
      right: 40%;
      animation-delay: 1.2s;
    }
    .loading-particles .particle:nth-child(5) {
      bottom: 20%;
      right: 30%;
      animation-delay: 1.6s;
    }

    /* Progress Bar */
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

    /* Loading Dots */
    .loading-dots {
      color: #c4975a;
      font-size: 2rem;
      font-weight: bold;
      letter-spacing: 0.2rem;
    }

    .loading-dots span {
      animation: dotBounce 1.5s ease-in-out infinite;
    }

    .loading-dots span:nth-child(1) { animation-delay: 0s; }
    .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
    .loading-dots span:nth-child(3) { animation-delay: 0.4s; }

    /* Simple Spinner */
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #3d2914;
      border-top: 4px solid #c4975a;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
      box-shadow: 0 0 10px rgba(196, 151, 90, 0.3);
    }

    /* Button Loading States */
    .button-loading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      justify-content: center;
    }

    .mini-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #3d2914;
      border-top: 2px solid #c4975a;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes fadeOut {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.9); }
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

    @keyframes dotBounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-10px); }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Mobile Responsiveness */
    @media (max-width: 480px) {
      .loading-content {
        padding: 1.5rem;
        margin: 1rem;
      }
      
      .loading-header h2 {
        font-size: 1.2rem;
      }
      
      .loading-animation {
        width: 80px;
        height: 80px;
      }
      
      .loading-message {
        font-size: 0.9rem;
      }
      
      .progress-text {
        font-size: 0.8rem;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// Initialize loading styles when module loads
injectLoadingStyles();