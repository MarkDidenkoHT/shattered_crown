let supabaseConfig = null;
let currentProfile = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[INIT] DOMContentLoaded triggered');

  const authStatus = document.getElementById('authStatus');

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
          <h2>Welcome to Shattered Crown</h2>
          <p>Add your tutorial text for slide 1 here...</p>
        </div>
        
        <!-- Slide 2 -->
        <div class="tutorial-slide" data-slide="2">
          <h2>Choose Your Divine Patron</h2>
          <p>Add your tutorial text for slide 2 here...</p>
        </div>
        
        <!-- Slide 3 -->
        <div class="tutorial-slide" data-slide="3">
          <h2>Build Your Heroes</h2>
          <p>Add your tutorial text for slide 3 here...</p>
        </div>
        
        <!-- Slide 4 -->
        <div class="tutorial-slide" data-slide="4">
          <h2>Ready to Begin</h2>
          <p>Warning! Game is in early development stage and there will be bugs, errors and placeholders! Thank you for testing!</p>
          <div class="tutorial-final-buttons">
            <button class="fantasy-button start-game-btn">Start Your Journey</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add tutorial styles
  addTutorialStyles();
  
  // Initialize tutorial state
  window.currentSlide = 1;
  
  // Add event listeners after DOM is created
  setupTutorialEventListeners();
  updateTutorialUI();
}

function setupTutorialEventListeners() {
  // Add event listeners for navigation buttons
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('tutorial-next-btn')) {
      nextSlide();
    } else if (e.target.classList.contains('tutorial-prev-btn')) {
      prevSlide();
    } else if (e.target.classList.contains('start-game-btn')) {
      startGame();
    }
  });
}

function addTutorialStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .tutorial-container {
      width: 100%;
      max-width: 500px;
      display: flex;
      flex-direction: column;
      gap: 2rem;
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
      padding: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.5s ease-in-out;
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
    }

    .tutorial-slide p {
      font-size: 1.1rem;
      line-height: 1.6;
      color: #b8b3a8;
      max-width: 400px;
      margin-bottom: 2rem;
    }

    .tutorial-slide-nav {
      display: flex;
      gap: 1rem;
      margin-top: auto;
    }

    .tutorial-final-buttons {
      margin-top: 2rem;
    }

    .tutorial-prev-btn,
    .tutorial-next-btn {
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

    .tutorial-prev-btn:hover,
    .tutorial-next-btn:hover {
      background: #3d2914;
      border-color: #c4975a;
    }

    .tutorial-prev-btn:disabled,
    .tutorial-next-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .fantasy-button {
      padding: 1rem 2rem;
      font-family: 'Cinzel', serif;
      font-size: 1.2rem;
      font-weight: 600;
      color: #1d140c;
      background: linear-gradient(145deg, #c4975a, #a67c3a);
      border: 2px solid #3d2914;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    }

    .fantasy-button:hover {
      background: linear-gradient(145deg, #a67c3a, #c4975a);
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.4);
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
    const response = await apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${playerId}&select=id`);
    const characters = await response.json();
    console.log(`[CHARACTERS] Characters fetched:`, characters);
    return characters.length;
  } catch (error) {
    console.error('[CHARACTERS] Error fetching character count:', error);
    throw error;
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
      ...extraArgs
    });
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

  if (typeof methodOrOptions === 'string') {
    options.method = methodOrOptions;
    if (bodyData) {
      options.body = JSON.stringify(bodyData);
    }
  } else if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
    options = {
      ...options,
      ...methodOrOptions
    };
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
    }
  } else {
    options.method = 'GET';
  }

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

window.gameAuth = {
  getCurrentProfile,
  logout,
  apiCall,
  loadModule,
  supabaseConfig: null
};
