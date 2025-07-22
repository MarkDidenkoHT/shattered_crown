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
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length === 0) return [];

  const filter = uniqueNames.map(n => `name.eq.${n}`).join(',');
  const response = await _apiCall(`/api/supabase/rest/v1/enemies?select=*&or=(${filter})`);
  if (!response.ok) throw new Error(`Failed to fetch enemies. Status: ${response.status}`);

  const rows = await response.json();

  const enemyCount = {};
  names.forEach(n => { enemyCount[n] = (enemyCount[n] || 0) + 1; });

  const result = [];

  uniqueNames.forEach(name => {
    const enemyData = rows.find(e => e.name === name);
    if (!enemyData) return;

    for (let i = 0; i < enemyCount[name]; i++) {
      const instance = formatCharacter(enemyData);
      const spawnIndex = result.length;
      instance.position = spawnPositions[spawnIndex] || null;
      result.push(instance);
    }
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
