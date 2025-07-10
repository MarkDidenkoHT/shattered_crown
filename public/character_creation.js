export async function loadModule(main, { currentSession, supabaseConfig, getCurrentProfile, getCurrentSession, authenticatedFetch }) {
  main.innerHTML = `
    <div class="character-creation-container">
      <h2>Character Creation</h2>
      <p>This is a placeholder for the character creation module.</p>
    </div>
  `;
}
