export async function loadModule(main, { currentSession, supabaseConfig, getCurrentProfile, getCurrentSession, authenticatedFetch }) {
  main.innerHTML = `
    <div class="castle-container">
      <h2>Castle</h2>
      <p>This is a placeholder for the castle.</p>
    </div>
  `;
}
