let supabaseConfig = null;
let currentSession = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
  // Load Supabase configuration
  try {
    const configResponse = await fetch('/api/config');
    supabaseConfig = await configResponse.json();
  } catch (error) {
    console.error('Failed to load configuration:', error);
    alert('Failed to load application configuration');
    return;
  }

  // Check if user is already logged in
  const storedSession = localStorage.getItem('session');
  if (storedSession) {
    try {
      currentSession = JSON.parse(storedSession);
      
      // Verify the session is still valid
      const isValid = await validateSession(currentSession.access_token);
      if (isValid) {
        redirectToGame();
        return;
      } else {
        // Session expired, clear it
        localStorage.removeItem('session');
        localStorage.removeItem('profile');
        currentSession = null;
      }
    } catch (error) {
      console.error('Error checking stored session:', error);
      localStorage.removeItem('session');
      localStorage.removeItem('profile');
    }
  }

  // Set up event listeners
  document.getElementById("loginBtn").addEventListener("click", login);
  document.getElementById("registerBtn").addEventListener("click", register);
  
  // Add password field if not present
  addPasswordField();
});

function addPasswordField() {
  const container = document.querySelector('.form-container');
  const accountNameInput = document.getElementById('accountName');
  
  // Check if password field already exists
  if (!document.getElementById('password')) {
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = 'password';
    passwordInput.placeholder = 'Password';
    passwordInput.style.marginTop = '10px';
    
    // Insert after account name input
    accountNameInput.parentNode.insertBefore(passwordInput, accountNameInput.nextSibling);
  }
}

async function validateSession(token) {
  try {
    const response = await fetch('/api/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.ok;
  } catch (error) {
    console.error('Session validation error:', error);
    return false;
  }
}

async function login() {
  const accountName = document.getElementById("accountName").value.trim();
  const password = document.getElementById("password").value;
  
  if (!accountName) {
    alert("Please enter your account name!");
    return;
  }
  
  if (!password) {
    alert("Please enter your password!");
    return;
  }

  // Disable the login button to prevent double-clicking
  const loginBtn = document.getElementById("loginBtn");
  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountName: accountName,
        password: password
      })
    });

    const data = await response.json();

    if (response.ok) {
      // Store session and profile data
      currentSession = data.session;
      localStorage.setItem('session', JSON.stringify(data.session));
      localStorage.setItem('profile', JSON.stringify(data.profile));
      
      // Check progression: God selection -> Character creation -> Castle
      try {
        // First check if player has selected a god
        if (!data.profile.god) {
          alert("Login successful! Please select your god...");
          loadModule("god_selection");
          return;
        }
        
        // Then check character count
        const characterCount = await getPlayerCharacterCount(data.profile.id);
        
        if (characterCount < 3) {
          alert("Login successful! Redirecting to character creation...");
          loadModule("character_creation");
        } else {
          alert("Login successful! Redirecting to castle...");
          loadModule("castle");
        }
      } catch (error) {
        console.error('Error checking player progression:', error);
        // Default to god selection if there's an error
        alert("Login successful! Redirecting...");
        loadModule("god_selection");
      }
    } else {
      alert(data.error || "Login failed!");
    }
  } catch (error) {
    console.error('Login error:', error);
    alert("Login error! Please try again.");
  } finally {
    // Re-enable the login button
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
}

async function register() {
  const accountName = document.getElementById("accountName").value.trim();
  const password = document.getElementById("password").value;

  if (!accountName) {
    alert("Please enter your account name!");
    return;
  }
  
  if (!password) {
    alert("Please enter your password!");
    return;
  }
  
  if (password.length < 6) {
    alert("Password must be at least 6 characters long!");
    return;
  }

  // Disable the register button to prevent double-clicking
  const registerBtn = document.getElementById("registerBtn");
  registerBtn.disabled = true;
  registerBtn.textContent = "Registering...";

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountName: accountName,
        password: password,
      })
    });

    const data = await response.json();

    if (response.ok) {
      // Store session and profile data
      currentSession = data.session;
      localStorage.setItem('session', JSON.stringify(data.session));
      localStorage.setItem('profile', JSON.stringify(data.profile));
      
      // New users will have no god selected, so go to god selection first
      alert("Registration successful! Please select your god...");
      loadModule("god_selection");
    } else {
      alert(data.error || "Registration failed!");
    }
  } catch (error) {
    console.error('Registration error:', error);
    alert("Registration error! Please try again.");
  } finally {
    // Re-enable the register button
    registerBtn.disabled = false;
    registerBtn.textContent = "Register";
  }
}

async function redirectToGame() {
  // Check player progression: God selection -> Character creation -> Castle
  const profile = getCurrentProfile();
  if (profile) {
    try {
      // First check if player has selected a god
      if (!profile.god) {
        loadModule("god_selection");
        return;
      }
      
      // Then check character count
      const characterCount = await getPlayerCharacterCount(profile.id);
      
      if (characterCount < 3) {
        loadModule("character_creation");
      } else {
        loadModule("castle");
      }
    } catch (error) {
      console.error('Error checking player progression:', error);
      // Default to god selection if there's an error
      loadModule("god_selection");
    }
  } else {
    // No profile found, default to god selection
    loadModule("god_selection");
  }
}

// Helper function to get player character count
async function getPlayerCharacterCount(playerId) {
  try {
    const response = await authenticatedFetch(`/api/supabase/rest/v1/characters?player_id=eq.${playerId}&select=id`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const characters = await response.json();
    return characters.length;
  } catch (error) {
    console.error('Error fetching character count:', error);
    throw error;
  }
}

// Module loading system
async function loadModule(name) {
  const main = document.querySelector(".main-app-container");
  main.innerHTML = "";

  const module = await import(`./${name}.js`);
  await module.loadModule(main, {
    currentSession,
    supabaseConfig,
    getCurrentProfile,
    getCurrentSession,
    authenticatedFetch
  });
}

// Utility function to get current user profile
function getCurrentProfile() {
  const profile = localStorage.getItem('profile');
  return profile ? JSON.parse(profile) : null;
}

// Utility function to get current session
function getCurrentSession() {
  return currentSession;
}

// Utility function to logout
function logout() {
  currentSession = null;
  localStorage.removeItem('session');
  localStorage.removeItem('profile');
  window.location.href = "/";
}

// Utility function to make authenticated API calls
async function authenticatedFetch(url, options = {}) {
  if (!currentSession) {
    throw new Error('No active session');
  }

  const headers = {
    'Authorization': `Bearer ${currentSession.access_token}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // Token expired, logout
    logout();
    throw new Error('Session expired');
  }

  return response;
}

// Export functions for use in other scripts
window.gameAuth = {
  getCurrentProfile,
  getCurrentSession,
  logout,
  authenticatedFetch,
  loadModule
};
