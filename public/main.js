let supabaseConfig = null;
let currentSession = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[INIT] DOMContentLoaded triggered'); // LOG

  // Load Supabase configuration
  try {
    const response = await fetch('/api/config');
    supabaseConfig = await response.json();
    console.log('[CONFIG] Loaded supabaseConfig:', supabaseConfig); // LOG
  } catch (error) {
    console.error('[CONFIG] Failed to load configuration:', error);
    alert('Failed to load application configuration');
    return;
  }

  // Check if user is already logged in
  const storedSession = localStorage.getItem('session');
  if (storedSession) {
    console.log('[SESSION] Found stored session in localStorage'); // LOG
    try {
      currentSession = JSON.parse(storedSession);
      console.log('[SESSION] Parsed currentSession:', currentSession); // LOG
      
      const isValid = await validateSession();
      console.log(`[SESSION] Session validity: ${isValid}`); // LOG
      if (isValid) {
        console.log('[SESSION] Valid session, redirecting to game...'); // LOG
        redirectToGame();
        return;
      } else {
        console.warn('[SESSION] Session invalid, clearing'); // LOG
        clearSession();
      }
    } catch (error) {
      console.error('[SESSION] Error checking stored session:', error);
      clearSession();
    }
  }

  document.getElementById("loginBtn").addEventListener("click", login);
  document.getElementById("registerBtn").addEventListener("click", register);

  addPasswordField();
  console.log('[UI] Event listeners attached, password field ensured'); // LOG
});

function addPasswordField() {
  const accountNameInput = document.getElementById('accountName');

  if (!document.getElementById('password')) {
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = 'password';
    passwordInput.placeholder = 'Password';
    passwordInput.style.marginTop = '10px';

    accountNameInput.parentNode.insertBefore(passwordInput, accountNameInput.nextSibling);
    console.log('[UI] Password field added'); // LOG
  }
}

async function validateSession() {
  try {
    const response = await fetch('/api/profile', {
      headers: {
        'Authorization': `Bearer ${currentSession.access_token}`
      }
    });
    return response.ok;
  } catch (error) {
    console.error('[SESSION] Validation error:', error);
    return false;
  }
}

async function login() {
  const accountName = document.getElementById("accountName").value.trim();
  const password = document.getElementById("password").value;

  if (!accountName || !password) {
    alert("Please enter your account name and password!");
    return;
  }

  console.log(`[LOGIN] Attempting login for account: ${accountName}`); // LOG

  const loginBtn = document.getElementById("loginBtn");
  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountName, password })
    });

    const data = await response.json();
    console.log('[LOGIN] Server response:', data); // LOG

    if (response.ok) {
      currentSession = data.session;
      localStorage.setItem('session', JSON.stringify(data.session));
      localStorage.setItem('profile', JSON.stringify(data.profile));

      console.log('[LOGIN] Login successful. Session and profile stored'); // LOG
      alert("Login successful!");
      await redirectToGame();
    } else {
      console.warn('[LOGIN] Login failed:', data.error); // LOG
      alert(data.error || "Login failed!");
    }
  } catch (error) {
    console.error('[LOGIN] Login error:', error);
    alert("Login error! Please try again.");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
}

async function register() {
  const accountName = document.getElementById("accountName").value.trim();
  const password = document.getElementById("password").value;

  if (!accountName || !password || password.length < 6) {
    alert("Invalid input for registration.");
    return;
  }

  console.log(`[REGISTER] Attempting registration for account: ${accountName}`); // LOG

  const registerBtn = document.getElementById("registerBtn");
  registerBtn.disabled = true;
  registerBtn.textContent = "Registering...";

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountName, password })
    });

    const data = await response.json();
    console.log('[REGISTER] Server response:', data); // LOG

    if (response.ok) {
      currentSession = data.session;
      localStorage.setItem('session', JSON.stringify(data.session));
      localStorage.setItem('profile', JSON.stringify(data.profile));

      console.log('[REGISTER] Registration successful. Session and profile stored'); // LOG
      alert("Registration successful!");
      await redirectToGame();
    } else {
      console.warn('[REGISTER] Registration failed:', data.error); // LOG
      alert(data.error || "Registration failed!");
    }
  } catch (error) {
    console.error('[REGISTER] Registration error:', error);
    alert("Registration error! Please try again.");
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = "Register";
  }
}

async function redirectToGame() {
  const profile = getCurrentProfile();
  console.log('[REDIRECT] Profile loaded:', profile); // LOG

  if (!profile) {
    console.warn('[REDIRECT] No profile found, loading god_selection'); // LOG
    loadModule("god_selection");
    return;
  }

  try {
    if (!profile.god) {
      console.log('[REDIRECT] No god selected, loading god_selection'); // LOG
      loadModule("god_selection");
      return;
    }

    const characterCount = await getPlayerCharacterCount(profile.id);
    console.log(`[REDIRECT] Character count: ${characterCount}`); // LOG

    if (characterCount < 3) {
      console.log('[REDIRECT] Less than 3 characters, loading character_creation'); // LOG
      loadModule("character_creation");
    } else {
      console.log('[REDIRECT] 3+ characters, loading castle'); // LOG
      loadModule("castle");
    }
  } catch (error) {
    console.error('[REDIRECT] Error checking progression:', error);
    loadModule("god_selection");
  }
}

async function getPlayerCharacterCount(playerId) {
  console.log(`[CHARACTERS] Fetching character count for playerId: ${playerId}`); // LOG
  try {
    const response = await apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${playerId}&select=id`);
    const characters = await response.json();
    console.log(`[CHARACTERS] Characters fetched:`, characters); // LOG
    return characters.length;
  } catch (error) {
    console.error('[CHARACTERS] Error fetching character count:', error);
    throw error;
  }
}

async function loadModule(name) {
  const main = document.querySelector(".main-app-container");
  main.innerHTML = "";
  console.log(`[MODULE] Loading module: ${name}`); // LOG

  try {
    const module = await import(`./${name}.js`);
    await module.loadModule(main, {
      currentSession,
      supabaseConfig,
      getCurrentProfile,
      getCurrentSession,
      apiCall
    });
    console.log(`[MODULE] Loaded module: ${name}`); // LOG
  } catch (error) {
    console.error(`[MODULE] Error loading module ${name}:`, error);
    main.innerHTML = `<div>Error loading ${name} module</div>`;
  }
}

function getCurrentProfile() {
  const profile = localStorage.getItem('profile');
  return profile ? JSON.parse(profile) : null;
}

function getCurrentSession() {
  return currentSession;
}

function clearSession() {
  console.log('[SESSION] Clearing session'); // LOG
  currentSession = null;
  localStorage.removeItem('session');
  localStorage.removeItem('profile');
}

function logout() {
  console.log('[LOGOUT] User logging out'); // LOG
  clearSession();
  window.location.href = "/";
}

async function apiCall(url, options = {}) {
  if (!currentSession) throw new Error('No active session');

  const headers = {
    'Authorization': `Bearer ${currentSession.access_token}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    console.warn('[API] Session expired, logging out'); // LOG
    logout();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    console.error(`[API] HTTP error ${response.status} for ${url}`); // LOG
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
}

window.gameAuth = {
  getCurrentProfile,
  getCurrentSession,
  logout,
  apiCall,
  loadModule
};
