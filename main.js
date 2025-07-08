document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("registerBtn").addEventListener("click", register);

async function login() {
  const accountName = document.getElementById("accountName").value.trim();
  if (!accountName) return alert("Please enter your account name!");

  try {
    const res = await fetch(`/api/supabase/rest/v1/users?account_name=eq.${encodeURIComponent(accountName)}`, {
      method: "GET",
      headers: {
        "apikey": "public",
        "Authorization": "Bearer public"
      }
    });
    const data = await res.json();

    if (data.length > 0) {
      localStorage.setItem("user", JSON.stringify(data[0]));
      alert("Login successful! Redirecting...");
      // Redirect to game screen
      window.location.href = "/game";
    } else {
      alert("Account not found. Please register first.");
    }
  } catch (err) {
    console.error(err);
    alert("Login error!");
  }
}

async function register() {
  const accountName = document.getElementById("accountName").value.trim();
  const faction = document.getElementById("factionSelect").value;

  if (!accountName) return alert("Please enter your account name!");
  if (!faction) return alert("Please choose a faction!");

  try {
    const res = await fetch(`/api/supabase/rest/v1/users`, {
      method: "POST",
      headers: {
        "apikey": "public",
        "Authorization": "Bearer public",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({ account_name: accountName, faction: parseInt(faction, 10) })
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem("user", JSON.stringify(data[0]));
      alert("Registration successful! Redirecting...");
      window.location.href = "/game";
    } else {
      alert("Registration failed: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error(err);
    alert("Registration error!");
  }
}
