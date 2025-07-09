// supabase_data.js

async function getProfile() {
    try {
        const response = await window.gameAuth.authenticatedFetch('/api/profile');
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.error('Error fetching profile:', error);
        return null;
    }
}

async function updateProfile(userId, updates) {
    try {
        const response = await window.gameAuth.authenticatedFetch(`/api/supabase/rest/v1/profiles?id=eq.${userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
                'X-HTTP-Method-Override': 'PATCH'
            },
            body: JSON.stringify(updates)
        });

        if (response.ok) {
            const data = await response.json();
            return data[0];
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error updating profile:', errorData);
            return null;
        }
    } catch (error) {
        console.error('Network error updating profile:', error);
        return null;
    }
}

async function getGods() {
    try {
        const response = await window.gameAuth.authenticatedFetch('/api/supabase/rest/v1/gods?select=*');
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('Error fetching gods:', error);
        return [];
    }
}

async function getCharactersForPlayer(playerId) {
    try {
        const response = await window.gameAuth.authenticatedFetch(`/api/supabase/rest/v1/characters?player_id=eq.${playerId}&select=*`);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('Error fetching characters:', error);
        return [];
    }
}

async function createCharacter(characterData) {
    try {
        const response = await window.gameAuth.authenticatedFetch('/api/supabase/rest/v1/characters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(characterData)
        });

        if (response.ok) {
            const data = await response.json();
            return data[0];
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error creating character:', errorData);
            return null;
        }
    } catch (error) {
        console.error('Network error creating character:', error);
        return null;
    }
}

async function getRacesByFaction(factionId) {
    try {
        const response = await window.gameAuth.authenticatedFetch(`/api/supabase/rest/v1/races?faction_id=eq.${factionId}&select=*`);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('Error fetching races:', error);
        return [];
    }
}

async function getClassesByRace(raceId) {
    try {
        const response = await window.gameAuth.authenticatedFetch(`/api/supabase/rest/v1/classes?faction_id=eq.${raceId}&select=*`);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('Error fetching classes:', error);
        return [];
    }
}

window.supabaseData = {
    getProfile,
    updateProfile,
    getGods,
    getCharactersForPlayer,
    createCharacter,
    getRacesByFaction,
    getClassesByRace
};