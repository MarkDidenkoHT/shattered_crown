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
      
      alert("Login successful! Redirecting...");
      redirectToGame();
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
      
      alert("Registration successful! Redirecting...");
      redirectToGame();
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

function redirectToGame() {
  window.location.href = "/character_creation.html"
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
  authenticatedFetch
};