// character_data.js

let _apiCall = null;
let _profile = null;

export function initCharacterData(apiCall, profile) {
  _apiCall = apiCall;
  _profile = profile;
}

export async function loadPlayerCharacters(playerId, spawnPositions = []) {
  const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${playerId}&select=*`);
  const rows = await response.json();

  const formatted = rows.map((raw, index) => {
    const char = formatCharacter(raw);
    char.position = spawnPositions[index] || null;
    return char;
  });

  return formatted;
}

export async function loadEnemiesByNames(names = [], spawnPositions = []) {
  if (names.length === 0) return [];

  // Get unique names for the API call
  const uniqueNames = [...new Set(names)];
  const filter = uniqueNames.map(n => `name.eq.${n}`).join(',');
  const response = await _apiCall(`/api/supabase/rest/v1/enemies?select=*&or=(${filter})`);
  
  if (!response.ok) throw new Error(`Failed to fetch enemies. Status: ${response.status}`);
  const rows = await response.json();

  // Create a lookup map for faster enemy data retrieval
  const enemyLookup = {};
  rows.forEach(enemy => {
    enemyLookup[enemy.name] = enemy;
  });

  // Process enemies in the original order from the names array
  const result = [];
  names.forEach((name, index) => {
    const enemyData = enemyLookup[name];
    if (!enemyData) {
      console.warn(`Enemy '${name}' not found in database`);
      return;
    }

    const instance = formatCharacter(enemyData);
    // Assign position based on the original index, not result.length
    instance.position = spawnPositions[index] || null;
    result.push(instance);
  });

  return result;
}

export function formatCharacter(raw) {
  const rawStats = typeof raw.stats === 'string' ? JSON.parse(raw.stats) : raw.stats;
  const stats = {};
  for (const [key, value] of Object.entries(rawStats)) {
    stats[key.toLowerCase()] = value;
  }

  const maxHp = stats.vitality * 10;

  return {
    id: raw.id,
    name: raw.name,
    type: raw.player_id ? 'player' : 'enemy',
    spriteName: raw.sprite_name,
    position: null,
    stats: {
      ...stats,
      hp: maxHp,
      maxHp: maxHp
    },
    abilities: typeof raw.learned_abilities === 'string'
  ? JSON.parse(raw.learned_abilities)
  : raw.learned_abilities || []
  };
}
