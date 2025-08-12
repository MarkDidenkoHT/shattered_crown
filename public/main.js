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
        await redirectToGame();
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

  // Handle different parameter patterns
  if (typeof methodOrOptions === 'string') {
    // Case 1: apiCall(url, 'POST', { body })
    options.method = methodOrOptions;
    if (bodyData) {
      options.body = JSON.stringify(bodyData);
    }
  } else if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
    // Case 2: apiCall(url, { options object })
    options = {
      ...options, // Keep default headers
      ...methodOrOptions // Overwrite or add new properties
    };
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
    }
  } else {
    // Case 3: apiCall(url) - default to GET
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
  supabaseConfig: null
};