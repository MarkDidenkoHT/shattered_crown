let supabaseConfig = null;
let currentProfile = null;
let mainThemeAudio = null;
let audioInitialized = false;
let audioContext = null;
let audioUnlocked = false;

function initializeAudio() {
  if (audioInitialized) return;
  
  try {
    mainThemeAudio = document.getElementById('mainTheme');
    if (!mainThemeAudio) return;
    
    mainThemeAudio.volume = 0.3;
    mainThemeAudio.preload = 'auto';
    mainThemeAudio.load();
    
    mainThemeAudio.addEventListener('canplaythrough', () => {});
    mainThemeAudio.addEventListener('loadeddata', () => {});
    mainThemeAudio.addEventListener('loadstart', () => {});
    mainThemeAudio.addEventListener('error', (e) => {});
    mainThemeAudio.addEventListener('stalled', () => {});
    mainThemeAudio.addEventListener('waiting', () => {});
    
    audioInitialized = true;
    setupUserInteractionListeners();
    
  } catch (error) {}
}

function setupUserInteractionListeners() {
  const events = ['touchstart', 'touchend', 'click', 'keydown'];
  
  const unlockAudio = async (e) => {
    if (audioUnlocked) return;
    
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      if (mainThemeAudio && mainThemeAudio.readyState >= 2) {
        const playPromise = mainThemeAudio.play();
        
        if (playPromise !== undefined) {
          try {
            await playPromise;
            audioUnlocked = true;
            
            events.forEach(event => {
              document.removeEventListener(event, unlockAudio, { passive: false });
              document.body.removeEventListener(event, unlockAudio, { passive: false });
            });
            
          } catch (playError) {}
        }
      }
      
    } catch (error) {}
  };
  
  events.forEach(event => {
    document.addEventListener(event, unlockAudio, { passive: false });
    document.body.addEventListener(event, unlockAudio, { passive: false });
  });
  
  if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
    Telegram.WebApp.onEvent('mainButtonClicked', unlockAudio);
    Telegram.WebApp.onEvent('backButtonClicked', unlockAudio);
  }
}

async function playMainTheme() {
  if (!mainThemeAudio || audioInitialized === false) {
    return;
  }
  
  try {
    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    if (mainThemeAudio.readyState >= 2) {
      const playPromise = mainThemeAudio.play();
      
      if (playPromise !== undefined) {
        await playPromise;
        audioUnlocked = true;
      }
    }
  } catch (error) {}
}

function handleFirstUserInteraction() {
  playMainTheme();
}

function pauseMainTheme() {
  if (mainThemeAudio && !mainThemeAudio.paused) {
    mainThemeAudio.pause();
  }
}

function setMainThemeVolume(volume) {
  if (mainThemeAudio) {
    mainThemeAudio.volume = Math.max(0, Math.min(1, volume));
  }
}

function debugAudioState() {
  console.log({
    audioInitialized,
    audioUnlocked,
    readyState: mainThemeAudio?.readyState,
    paused: mainThemeAudio?.paused,
    currentTime: mainThemeAudio?.currentTime,
    duration: mainThemeAudio?.duration,
    volume: mainThemeAudio?.volume,
    audioContextState: audioContext?.state,
    userAgent: navigator.userAgent
  });
}

function getCurrentLanguage() {
  if (typeof Weglot !== 'undefined') {
    return Weglot.getCurrentLang();
  }
  return localStorage.getItem('userLanguage') || 'en';
}

function switchLanguage(langCode) {
  if (typeof Weglot !== 'undefined') {
    Weglot.switchTo(langCode);
  }
  
  localStorage.setItem('userLanguage', langCode);
  
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
    }
  } catch (error) {}
}

async function loadUserLanguageFromProfile(profile) {
  try {
    if (profile?.settings?.language) {
      switchLanguage(profile.settings.language);
      return profile.settings.language;
    }
    return null;
  } catch (error) {
    return null;
  }
}

function initializeLanguageDetection() {
  try {
    const tgUser = Telegram.WebApp.initDataUnsafe?.user;
    const tgLanguage = tgUser?.language_code;
    
    const savedLanguage = localStorage.getItem('userLanguage');
    let targetLanguage = 'en';
    
    if (savedLanguage) {
      targetLanguage = savedLanguage;
    } else if (tgLanguage && tgLanguage.startsWith('ru')) {
      targetLanguage = 'ru';
    }
    
    localStorage.setItem('userLanguage', targetLanguage);
    
    if (typeof Weglot !== 'undefined') {
      if (targetLanguage === 'ru' && Weglot.getCurrentLang() !== 'ru') {
        setTimeout(() => {
          Weglot.switchTo('ru');
        }, 500);
      }
    }
    
  } catch (error) {}
}

document.addEventListener('DOMContentLoaded', async () => {
  const authStatus = document.getElementById('authStatus');

  setTimeout(() => {
    initializeLanguageDetection();
  }, 1000);

  setTimeout(() => {
    initializeAudio();
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('test')) {
      const debugBtn = document.createElement('button');
      debugBtn.textContent = 'Debug Audio';
      debugBtn.style.position = 'fixed';
      debugBtn.style.top = '10px';
      debugBtn.style.right = '10px';
      debugBtn.style.zIndex = '9999';
      debugBtn.onclick = debugAudioState;
      document.body.appendChild(debugBtn);
    }
  }, 500);

  try {
    const response = await fetch('/api/config');
    supabaseConfig = await response.json();
    window.gameAuth.supabaseConfig = supabaseConfig;
  } catch (error) {
    authStatus.textContent = 'Failed to load configuration';
    return;
  }

  Telegram.WebApp.ready();
  Telegram.WebApp.expand();

  const tgUser = Telegram.WebApp.initDataUnsafe?.user;

  if (!tgUser) {
    authStatus.textContent = 'Telegram user not found. Please open via Telegram.';
    return;
  }

  const chatId = String(tgUser.id);

  try {
    const loginResponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId })
    });

    let data = await loginResponse.json();

    if (loginResponse.ok) {
      currentProfile = data.profile;
      localStorage.setItem('profile', JSON.stringify(currentProfile));
      localStorage.setItem('chatId', chatId);
      
      await loadUserLanguageFromProfile(currentProfile);
      
      if (!currentProfile.tutorial) {
        showTutorial();
      } else {
        authStatus.textContent = 'Login successful!';
        await redirectToGame();
      }
    } else {
      const regResponse = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId })
      });

      data = await regResponse.json();

      if (regResponse.ok) {
        currentProfile = data.profile;
        localStorage.setItem('profile', JSON.stringify(currentProfile));
        localStorage.setItem('chatId', chatId);
        
        const currentLang = getCurrentLanguage();
        if (currentLang !== 'en') {
          await updateProfileLanguageSetting(currentLang);
        }
        
        authStatus.textContent = 'Registration successful!';
        showTutorial();
      } else {
        authStatus.textContent = data.error || 'Registration failed!';
      }
    }
  } catch (err) {
    authStatus.textContent = 'Authentication error!';
  }
});

function showTutorial() {
  const loginSection = document.querySelector('.login-section');
  loginSection.innerHTML = `
    <div class="tutorial-container">
      <div class="tutorial-slides">
        <div class="tutorial-slide active" data-slide="1">
          <h2>Welcome!</h2>
          <p>Shattered Crown is a fantasy turn based rpg with strategy elements.</p>
          <div class="slide-buttons">
            <button class="tutorial-btn next-btn" data-action="next">Next</button>
          </div>
        </div>
        
        <div class="tutorial-slide" data-slide="2">
          <h2>Divine Patron</h2>
          <p>In this realm gods fight for an artifact of power. You must choose what deity you will follow. Create three heroes that will recover all parts of the crown for your deity!</p>
          <div class="slide-buttons">
            <button class="tutorial-btn prev-btn" data-action="prev">Previous</button>
            <button class="tutorial-btn next-btn" data-action="next">Next</button>
          </div>
        </div>
        
        <div class="tutorial-slide" data-slide="3">
          <h2>Crafting</h2>
          <p>All gear and equipment come from crafting, resources and ingredients come as loot from battles and can be traded for with other players! Each profession has a mini-game.</p>
          <div class="slide-buttons">
            <button class="tutorial-btn prev-btn" data-action="prev">Previous</button>
            <button class="tutorial-btn next-btn" data-action="next">Next</button>
          </div>
        </div>
        
        <div class="tutorial-slide" data-slide="4">
          <h2>Ready to Begin</h2>
          <p>Warning! Game is in early development stage and there will be bugs, errors and placeholders! Thank you for testing!</p>
          <div class="slide-buttons">
            <button class="tutorial-btn prev-btn" data-action="prev">Previous</button>
            <button class="fantasy-button" data-action="start-game">Play</button>
          </div>
        </div>
      </div>
    </div>
  `;

  addTutorialStyles();
  window.currentSlide = 1;
  addTutorialEventListeners();
  updateTutorialUI();
}

function addTutorialEventListeners() {
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
          completeTutorial();
          break;
      }
    });
  }
}

async function completeTutorial() {
  try {
    const chatId = localStorage.getItem('chatId');
    
    if (!chatId) {
      console.error('No chatId found');
      return;
    }

    const response = await fetch('/api/player/complete-tutorial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId })
    });

    if (response.ok) {
      const data = await response.json();
      currentProfile = data.profile;
      localStorage.setItem('profile', JSON.stringify(currentProfile));
      redirectToGame();
    } else {
      console.error('Failed to complete tutorial');
    }
  } catch (error) {
    console.error('Error completing tutorial:', error);
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
      height: 450px;
      overflow: hidden;
      border-radius: 8px;
      background: rgba(99, 54, 14, 0.8);
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
      touch-action: manipulation;
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
      touch-action: manipulation;
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

async function redirectToGame() {
  const profile = getCurrentProfile();

  if (!profile) {
    loadModule("god_selection");
    return;
  }

  try {
    if (!profile.god) {
      loadModule("god_selection");
      return;
    }

    const characterCount = await getPlayerCharacterCount(profile.id);

    if (characterCount < 3) {
      loadModule("character_creation");
    } else {
      loadModule("castle");
    }
  } catch (error) {
    loadModule("god_selection");
  }
}

async function getPlayerCharacterCount(playerId) {
  try {
    const response = await fetch(`/api/characters/count/${playerId}`);
    const data = await response.json();

    if (response.ok) {
      return data.count;
    } else {
      return 0;
    }
  } catch (error) {
    throw error;
  }
}

function refreshWeglotTranslations() {
  if (typeof Weglot !== 'undefined') {
    try {
      if (typeof Weglot.refresh === 'function') {
        Weglot.refresh();
        return;
      }
      
      if (typeof Weglot.getCurrentLang === 'function' && typeof Weglot.switchTo === 'function') {
        const currentLang = Weglot.getCurrentLang();
        setTimeout(() => {
          Weglot.switchTo(currentLang);
        }, 50);
        return;
      }
      
      const event = new CustomEvent('weglot:refresh');
      document.dispatchEvent(event);
      
    } catch (error) {}
  } else {
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
    
    refreshWeglotTranslations();
  } catch (error) {
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
  currentProfile = null;
  localStorage.removeItem('profile');
  localStorage.removeItem('chatId');
}

function logout() {
  clearSession();
  window.location.href = "/";
}

async function apiCall(url, methodOrOptions = 'GET', bodyData = null) {
  console.group(`🚀 API CALL: ${methodOrOptions?.method || methodOrOptions} ${url}`);
  
  if (!supabaseConfig?.SUPABASE_ANON_KEY) {
    console.error('❌ No Supabase configuration available');
    console.groupEnd();
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
      console.log('📦 Request Body:', bodyData);
    }
  } else if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
    options = {
      ...options,
      ...methodOrOptions
    };
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
      console.log('📦 Request Body:', options.body);
    }
  } else {
    options.method = 'GET';
  }

  console.log('⚙️ Request Options:', {
    method: options.method,
    headers: { ...headers, Authorization: 'Bearer ***' },
    hasBody: !!options.body
  });

  try {
    const startTime = Date.now();
    const response = await fetch(url, options);
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`📥 Response: ${response.status} ${response.statusText} (${duration}ms)`);

    if (response.status === 401) {
      console.error('🔐 Unauthorized - clearing session');
      clearSession();
      window.location.href = "/";
      console.groupEnd();
      throw new Error(`Unauthorized access to ${url}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HTTP Error ${response.status}:`, errorText);
      console.groupEnd();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const responseClone = response.clone();
    try {
      const responseData = await responseClone.json();
      console.log('✅ Response Data:', responseData);
    } catch (jsonError) {
      const textData = await response.text();
      console.log('📄 Response Text:', textData);
    }

    console.groupEnd();
    return response;

  } catch (error) {
    console.error('💥 Fetch Error:', error);
    console.groupEnd();
    throw error;
  }
}

function updateCurrentProfile(newProfile) {
  currentProfile = newProfile;
  localStorage.setItem('profile', JSON.stringify(newProfile));
}

window.gameAuth = {
  getCurrentProfile,
  updateCurrentProfile,
  logout,
  apiCall,
  loadModule,
  supabaseConfig: null,
  getCurrentLanguage,
  switchLanguage,
  playMainTheme,
  pauseMainTheme,
  setMainThemeVolume,
  debugAudioState
};