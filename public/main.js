let supabaseConfig = null;
let currentProfile = null;

// Language management functions
function getCurrentLanguage() {
  if (typeof Weglot !== 'undefined') {
    return Weglot.getCurrentLang();
  }
  return localStorage.getItem('userLanguage') || 'en';
}

function switchLanguage(langCode) {
  console.log('[LANGUAGE] Switching to:', langCode);
  
  if (typeof Weglot !== 'undefined') {
    Weglot.switchTo(langCode);
  }
  
  localStorage.setItem('userLanguage', langCode);
  
  // Update profile settings if user is logged in
  if (currentProfile) {
    updateProfileLanguageSetting(langCode);
  }
}

async function updateProfileLanguageSetting(language) {
  try {
    const response = await fetch(`/api/profile/language/${currentProfile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language })
    });

    if (response.ok) {
      currentProfile.settings = {
        ...(currentProfile.settings || {}),
        language
      };
      localStorage.setItem('profile', JSON.stringify(currentProfile));
      console.log('[LANGUAGE] Profile language setting updated');
    } else {
      const error = await response.json();
      console.error('[LANGUAGE] Server error:', error);
    }
  } catch (error) {
    console.error('[LANGUAGE] Failed to update profile language setting:', error);
  }
}

async function loadUserLanguageFromProfile(profile) {
  try {
    if (profile?.settings?.language) {
      console.log('[LANGUAGE] Loading language from profile:', profile.settings.language);
      switchLanguage(profile.settings.language);
      return profile.settings.language;
    }
    return null;
  } catch (error) {
    console.error('[LANGUAGE] Error loading language from profile:', error);
    return null;
  }
}

// Initialize language detection
function initializeLanguageDetection() {
  try {
    const tgUser = Telegram.WebApp.initDataUnsafe?.user;
    const tgLanguage = tgUser?.language_code;
    
    console.log('[LANGUAGE] Telegram language detected:', tgLanguage);
    
    // Check for saved language preference first
    const savedLanguage = localStorage.getItem('userLanguage');
    
    let targetLanguage = 'en'; // Default fallback
    
    if (savedLanguage) {
      targetLanguage = savedLanguage;
      console.log('[LANGUAGE] Using saved preference:', savedLanguage);
    } else if (tgLanguage && tgLanguage.startsWith('ru')) {
      targetLanguage = 'ru';
      console.log('[LANGUAGE] Auto-detected Russian from Telegram');
    }
    
    // Store the language preference
    localStorage.setItem('userLanguage', targetLanguage);
    
    // Wait for Weglot to be ready, then set language
    if (typeof Weglot !== 'undefined') {
      if (targetLanguage === 'ru' && Weglot.getCurrentLang() !== 'ru') {
        setTimeout(() => {
          Weglot.switchTo('ru');
          console.log('[LANGUAGE] Switched to Russian');
        }, 500);
      }
    }
    
  } catch (error) {
    console.error('[LANGUAGE] Error initializing language detection:', error);
  }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[INIT] DOMContentLoaded triggered');

  const authStatus = document.getElementById('authStatus');

  // Wait a bit for Weglot to load, then initialize language detection
  setTimeout(() => {
    initializeLanguageDetection();
  }, 1000);

  // Load Supabase configuration
  try {
    const response = await fetch('/api/config');
    supabaseConfig = await response.json();
    
    // *** Update the global config after loading ***
    window.gameAuth.supabaseConfig = supabaseConfig;
    
  } catch (error) {
    console.error('[CONFIG] Failed to load configuration:', error);
    authStatus.textContent = 'Failed to load configuration';
    return;
  }

  Telegram.WebApp.ready();
  Telegram.WebApp.expand();

  const tgUser = Telegram.WebApp.initDataUnsafe?.user;
  console.log('[TELEGRAM] initDataUnsafe user:', tgUser);

  if (!tgUser) {
    authStatus.textContent = 'Telegram user not found. Please open via Telegram.';
    return;
  }

  const chatId = String(tgUser.id);
  console.log('[TELEGRAM] chatId:', chatId);

  try {
    // Try to login with chatId
    const loginResponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId })
    });

    let data = await loginResponse.json();
    console.log('[LOGIN] Server response:', data);

    if (loginResponse.ok) {
      currentProfile = data.profile;
      localStorage.setItem('profile', JSON.stringify(currentProfile));
      localStorage.setItem('chatId', chatId);
      
      // Load user's language preference from profile
      await loadUserLanguageFromProfile(currentProfile);
      
      authStatus.textContent = 'Login successful!';
      await redirectToGame();
    } else {
      console.warn('[LOGIN] Login failed, attempting registration');

      // Try to register
      const regResponse = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId })
      });

      data = await regResponse.json();
      console.log('[REGISTER] Server response:', data);

      if (regResponse.ok) {
        currentProfile = data.profile;
        localStorage.setItem('profile', JSON.stringify(currentProfile));
        localStorage.setItem('chatId', chatId);
        
        // For new users, save their detected language to profile
        const currentLang = getCurrentLanguage();
        if (currentLang !== 'en') {
          await updateProfileLanguageSetting(currentLang);
        }
        
        authStatus.textContent = 'Registration successful!';
        
        // Show tutorial for new users
        showTutorial();
      } else {
        console.error('[REGISTER] Registration failed:', data.error);
        authStatus.textContent = data.error || 'Registration failed!';
      }
    }
  } catch (err) {
    console.error('[AUTH] Error:', err);
    authStatus.textContent = 'Authentication error!';
  }
});

// Tutorial system
function showTutorial() {
  console.log('[TUTORIAL] Starting tutorial');
  
  const loginSection = document.querySelector('.login-section');
  loginSection.innerHTML = `
    <div class="tutorial-container">
      <div class="tutorial-slides">
        <!-- Slide 1 -->
        <div class="tutorial-slide active" data-slide="1">
          <h2>Welcome!</h2>
          <p>Shattered Crown is a fantasy turn based rpg with strategy elements.</p>
          <div class="slide-buttons">
            <button class="tutorial-btn next-btn" data-action="next">Next</button>
          </div>
        </div>
        
        <!-- Slide 2 -->
        <div class="tutorial-slide" data-slide="2">
          <h2>Divine Patron</h2>
          <p>In this realm gods fight for an artifact of power. You must choose what deity you will follow. Create three heroes that will recover all parts of the crown for your deity!</p>
          <div class="slide-buttons">
            <button class="tutorial-btn prev-btn" data-action="prev">Previous</button>
            <button class="tutorial-btn next-btn" data-action="next">Next</button>
          </div>
        </div>
        
        <!-- Slide 3 -->
        <div class="tutorial-slide" data-slide="3">
          <h2>Crafting</h2>
          <p>Most gear and equipment comes from crafting, and resources and ingredients come as loot from battles! Each profession has a mini-game.</p>
          <div class="slide-buttons">
            <button class="tutorial-btn prev-btn" data-action="prev">Previous</button>
            <button class="tutorial-btn next-btn" data-action="next">Next</button>
          </div>
        </div>
        
        <!-- Slide 4 -->
        <div class="tutorial-slide" data-slide="4">
          <h2>Ready to Begin</h2>
          <p>Warning! Game is in early development stage and there will be bugs, errors and placeholders! Thank you for testing!</p>
          <div class="slide-buttons">
            <button class="tutorial-btn prev-btn" data-action="prev">Previous</button>
            <button class="fantasy-button" data-action="start-game">Start Your Journey</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add tutorial styles
  addTutorialStyles();
  
  // Initialize tutorial state
  window.currentSlide = 1;
  
  // Add event listeners using event delegation (CSP-compliant)
  addTutorialEventListeners();
  updateTutorialUI();
}

function addTutorialEventListeners() {
  // Use event delegation to handle all tutorial button clicks
  const tutorialContainer = document.querySelector('.tutorial-container');
  
  if (tutorialContainer) {
    tutorialContainer.addEventListener('click', (event) => {
      const action = event.target.dataset.action;
      
      if (!action) return;
      
      switch (action) {
        case 'next':
          nextSlide();
          break;
        case 'prev':
          prevSlide();
          break;
        case 'start-game':
          startGame();
          break;
      }
    });
  }
}

function addTutorialStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .tutorial-container {
      width: 100%;
      max-width: 500px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .tutorial-slides {
      position: relative;
      width: 100%;
      height: 350px;
      overflow: hidden;
      border-radius: 8px;
      background: rgba(29, 20, 12, 0.8);
      backdrop-filter: blur(10px);
      border: 2px solid #3d2914;
    }

    .tutorial-slide {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.5s ease-in-out;
      box-sizing: border-box;
    }

    .tutorial-slide.active {
      opacity: 1;
      transform: translateX(0);
    }

    .tutorial-slide.prev {
      transform: translateX(-100%);
    }

    .tutorial-slide h2 {
      font-family: 'Cinzel', serif;
      font-size: 1.8rem;
      color: #c4975a;
      text-shadow: 2px 2px 0px #3d2914;
      margin-bottom: 1rem;
    }

    .tutorial-slide p {
      font-size: 1.1rem;
      line-height: 1.6;
      color: #b8b3a8;
      max-width: 400px;
      margin-bottom: 2rem;
      flex-grow: 1;
      display: flex;
      align-items: center;
    }

    .slide-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .tutorial-btn {
      padding: 0.75rem 1.5rem;
      font-family: 'Cinzel', serif;
      font-size: 1rem;
      color: #c4975a;
      background: rgba(29, 20, 12, 0.8);
      border: 2px solid #3d2914;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s ease;
      backdrop-filter: blur(5px);
    }

    .tutorial-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .fantasy-button {
      padding: 0.75rem 2rem;
      font-family: 'Cinzel', serif;
      font-size: 1.1rem;
      font-weight: bold;
      color: #ffffff;
      background: linear-gradient(135deg, #c4975a, #8b6914);
      border: 2px solid #c4975a;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s ease;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    }
  `;
  document.head.appendChild(style);
}

function nextSlide() {
  if (window.currentSlide < 4) {
    window.currentSlide++;
    updateTutorialUI();
  }
}

function prevSlide() {
  if (window.currentSlide > 1) {
    window.currentSlide--;
    updateTutorialUI();
  }
}

function updateTutorialUI() {
  const slides = document.querySelectorAll('.tutorial-slide');

  // Update slides
  slides.forEach((slide, index) => {
    const slideNum = index + 1;
    slide.classList.remove('active', 'prev');
    
    if (slideNum === window.currentSlide) {
      slide.classList.add('active');
    } else if (slideNum < window.currentSlide) {
      slide.classList.add('prev');
    }
  });
}

function startGame() {
  console.log('[TUTORIAL] Tutorial completed, starting game');
  redirectToGame();
}

// Redirect logic
async function redirectToGame() {
  const profile = getCurrentProfile();
  console.log('[REDIRECT] Profile loaded:', profile);

  if (!profile) {
    console.warn('[REDIRECT] No profile found, loading god_selection');
    loadModule("god_selection");
    return;
  }

  try {
    if (!profile.god) {
      console.log('[REDIRECT] No god selected, loading god_selection');
      loadModule("god_selection");
      return;
    }

    const characterCount = await getPlayerCharacterCount(profile.id);
    console.log(`[REDIRECT] Character count: ${characterCount}`);

    if (characterCount < 3) {
      console.log('[REDIRECT] Less than 3 characters, loading character_creation');
      loadModule("character_creation");
    } else {
      console.log('[REDIRECT] 3+ characters, loading castle');
      loadModule("castle");
    }
  } catch (error) {
    console.error('[REDIRECT] Error checking progression:', error);
    loadModule("god_selection");
  }
}

async function getPlayerCharacterCount(playerId) {
  console.log(`[CHARACTERS] Fetching character count for playerId: ${playerId}`);
  try {
    const response = await fetch(`/api/characters/count/${playerId}`);
    const data = await response.json();

    if (response.ok) {
      console.log(`[CHARACTERS] Character count:`, data.count);
      return data.count;
    } else {
      console.error('[CHARACTERS] Server error:', data.error);
      return 0;
    }
  } catch (error) {
    console.error('[CHARACTERS] Error fetching character count:', error);
    throw error;
  }
}

function refreshWeglotTranslations() {
  console.log('[TRANSLATION] refreshWeglotTranslations called');
  console.log('[TRANSLATION] Weglot available:', typeof Weglot !== 'undefined');
  
  if (typeof Weglot !== 'undefined') {
    try {
      // Method 1: Try using the refresh method if it exists
      if (typeof Weglot.refresh === 'function') {
        Weglot.refresh();
        console.log('[TRANSLATION] Weglot refresh triggered');
        return;
      }
      
      // Method 2: Try forcing a re-scan by switching language back and forth
      if (typeof Weglot.getCurrentLang === 'function' && typeof Weglot.switchTo === 'function') {
        const currentLang = Weglot.getCurrentLang();
        // Trigger a micro language switch to force re-scan
        setTimeout(() => {
          Weglot.switchTo(currentLang);
          console.log('[TRANSLATION] Weglot re-scan triggered via language switch');
        }, 50);
        return;
      }
      
      // Method 3: Dispatch a custom event to trigger Weglot re-scan
      const event = new CustomEvent('weglot:refresh');
      document.dispatchEvent(event);
      console.log('[TRANSLATION] Weglot refresh event dispatched');
      
    } catch (error) {
      console.error('[TRANSLATION] Weglot refresh error:', error);
    }
  } else {
    console.log('[TRANSLATION] Weglot not available, skipping refresh');
    
    // Try again after a delay if Weglot isn't ready
    setTimeout(() => {
      if (typeof Weglot !== 'undefined') {
        refreshWeglotTranslations();
      }
    }, 500);
  }
}

async function loadModule(name, extraArgs = {}) {
  const main = document.querySelector(".main-app-container");
  main.innerHTML = "";
  console.log(`[MODULE] Loading module: ${name}`);

  try {
    const module = await import(`./${name}.js`);
    await module.loadModule(main, {
      currentProfile,
      supabaseConfig,
      getCurrentProfile,
      apiCall,
      refreshTranslations: refreshWeglotTranslations,
      ...extraArgs
    });
    
    // Refresh translations after module loads
    refreshWeglotTranslations();
    
    console.log(`[MODULE] Loaded module: ${name}`);
  } catch (error) {
    console.error(`[MODULE] Error loading module ${name}:`, error);
    main.innerHTML = `<div>Error loading ${name} module</div>`;
  }
}

function getCurrentProfile() {
  if (currentProfile) return currentProfile;
  
  const profile = localStorage.getItem('profile');
  if (profile) {
    currentProfile = JSON.parse(profile);
    return currentProfile;
  }
  return null;
}

function clearSession() {
  console.log('[SESSION] Clearing session');
  currentProfile = null;
  localStorage.removeItem('profile');
  localStorage.removeItem('chatId');
}

function logout() {
  console.log('[LOGOUT] User logging out');
  clearSession();
  window.location.href = "/";
}

async function apiCall(url, methodOrOptions = 'GET', bodyData = null) {
  if (!supabaseConfig?.SUPABASE_ANON_KEY) {
    throw new Error('No Supabase configuration available');
  }

  const headers = {
    'Authorization': `Bearer ${supabaseConfig.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  let options = { headers };

  // Handle different parameter patterns
  if (typeof methodOrOptions === 'string') {
    options.method = methodOrOptions;
    if (bodyData) {
      options.body = JSON.stringify(bodyData);
    }
  } else if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
    options = {
      ...options, // Keep default headers
      ...methodOrOptions // Overwrite or add new properties
    };
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
    }
  } else {
    options.method = 'GET';
  }

  // Debug logging
  console.log(`[API DEBUG] Making ${options.method} request to: ${url}`);
  console.log(`[API DEBUG] Headers:`, options.headers);
  if (options.body) {
    console.log(`[API DEBUG] Body:`, options.body);
  }

  const response = await fetch(url, options);

  if (response.status === 401) {
    console.error(`[API] 401 Unauthorized for ${url}`);
    const errorText = await response.text();
    console.error(`[API] Response:`, errorText);
    
    // For 401 errors, clear session and redirect to auth
    clearSession();
    window.location.href = "/";
    throw new Error(`Unauthorized access to ${url}`);
  }

  if (!response.ok) {
    console.error(`[API] HTTP error ${response.status} for ${url}`);
    const errorText = await response.text();
    console.error(`[API] Error response:`, errorText);
    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
  }

  return response;
}

// Global API for modules - Initialize with null, will be set after config loads
window.gameAuth = {
  getCurrentProfile,
  logout,
  apiCall,
  loadModule,
  supabaseConfig: null,
  getCurrentLanguage,
  switchLanguage
};
