export async function loadCharacters() {
    console.log('[CHAR_DATA] Loading player characters (placeholder)');
    // Future: Fetch character stats, abilities, items
}

export async function loadEnemies() {
    console.log('[CHAR_DATA] Loading enemies (placeholder)');
    // Future: Fetch enemies from "enemies" table using enemyNamesToSpawn
}

window.characterData = {
    loadCharacters,
    loadEnemies
};
