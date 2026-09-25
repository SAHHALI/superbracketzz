// ========================================================
// Konfigurasi Supabase Client
// Ganti URL dan ANON_KEY di bawah ini dengan kredensial dari project Supabase Anda:
// Dashboard Supabase -> Project Settings -> API
// ========================================================

const SUPABASE_CONFIG = {
    url: 'https://dxqupvdmrtrolgkendmg.supabase.co',
    anonKey: 'sb_publishable_qrI_L8CK8uTPHcUOK6U-Gg_nqwHrnxp'
};

let dbClient = null;

// Cek apakah konfigurasi sudah diisi oleh pengguna
function isSupabaseConfigured() {
    return SUPABASE_CONFIG.url && 
           !SUPABASE_CONFIG.url.includes('YOUR_SUPABASE_URL') &&
           SUPABASE_CONFIG.anonKey && 
           !SUPABASE_CONFIG.anonKey.includes('YOUR_SUPABASE_ANON_KEY');
}

// Inisialisasi client
function initSupabase() {
    if (dbClient) return true;
    if (window.supabase && isSupabaseConfigured()) {
        try {
            dbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
            console.log('✅ Supabase Client berhasil terhubung!');
            return true;
        } catch (e) {
            console.error('❌ Gagal menginisialisasi Supabase:', e);
            return false;
        }
    }
    return false;
}

// Coba inisialisasi langsung
initSupabase();

// Helper Service untuk Komunikasi dengan Database
const SupabaseService = {
    isReady() {
        if (!dbClient) {
            initSupabase();
        }
        return dbClient !== null;
    },

    // --- Pemain (Players) ---
    async getPlayers() {
        if (!this.isReady()) return null;
        const { data, error } = await dbClient.from('players').select('*').order('id', { ascending: true });
        if (error) { console.error('Error getPlayers:', error); return null; }
        return data;
    },

    async addPlayer(player) {
        if (!this.isReady()) return null;
        const { data, error } = await dbClient.from('players').insert([{
            name: player.name,
            photo: player.photo
        }]).select();
        if (error) { console.error('Error addPlayer:', error); return null; }
        return data ? data[0] : null;
    },

    async updatePlayer(player) {
        if (!this.isReady()) return null;
        const { data, error } = await dbClient.from('players').update({
            name: player.name,
            photo: player.photo
        }).eq('id', player.id).select();
        if (error) { console.error('Error updatePlayer:', error); return null; }
        return data ? data[0] : null;
    },

    // --- Turnamen (Tournaments) ---
    async getTournaments() {
        if (!this.isReady()) return null;
        const { data, error } = await dbClient.from('tournaments').select('*').order('id', { ascending: true });
        if (error) { console.error('Error getTournaments:', error); return null; }
        return data;
    },

    async createTournament(tournament, participants, matches) {
        if (!this.isReady()) return null;
        
        // 1. Simpan tournament
        const { data: tData, error: tErr } = await dbClient.from('tournaments').insert([{
            name: tournament.name,
            sport: tournament.sport,
            format: tournament.format,
            status: tournament.status || 'active',
            created_at: tournament.createdAt || new Date().toLocaleDateString('id-ID')
        }]).select();

        if (tErr || !tData || tData.length === 0) {
            console.error('Error createTournament:', tErr);
            return null;
        }

        const newTournament = tData[0];
        const newTournamentId = newTournament.id;

        // 2. Simpan peserta
        const participantsToInsert = participants.map(p => ({
            tournament_id: newTournamentId,
            name: p.name,
            photo: p.photo
        }));

        const { data: pData, error: pErr } = await dbClient.from('participants').insert(participantsToInsert).select();
        if (pErr) {
            console.error('Error inserting participants:', pErr);
            return null;
        }

        // Mapping ID lokal ke ID supabase
        const participantIdMap = {};
        participants.forEach((localP, idx) => {
            if (pData[idx]) {
                participantIdMap[localP.id] = pData[idx].id;
            }
        });

        // 3. Simpan matches
        const matchesToInsert = matches.map(m => ({
            tournament_id: newTournamentId,
            round: m.round,
            participant1_id: m.participant1_id ? participantIdMap[m.participant1_id] || null : null,
            participant2_id: m.participant2_id ? participantIdMap[m.participant2_id] || null : null,
            score1: m.score1 || 0,
            score2: m.score2 || 0,
            status: m.status || 'pending',
            next_match_id: null
        }));

        const { data: mData, error: mErr } = await dbClient.from('matches').insert(matchesToInsert).select();
        if (mErr) {
            console.error('Error inserting matches:', mErr);
            return null;
        }

        return {
            tournament: newTournament,
            participants: pData,
            matches: mData
        };
    },

    async getParticipants(tournamentId) {
        if (!this.isReady()) return null;
        const { data, error } = await dbClient.from('participants').select('*').eq('tournament_id', tournamentId);
        if (error) { console.error('Error getParticipants:', error); return null; }
        return data;
    },

    async getMatches(tournamentId) {
        if (!this.isReady()) return null;
        const { data, error } = await dbClient.from('matches').select('*').eq('tournament_id', tournamentId);
        if (error) { console.error('Error getMatches:', error); return null; }
        return data;
    },

    async updateMatch(matchId, score1, score2, status, nextMatchId, nextSlot, nextParticipantId) {
        if (!this.isReady()) return null;

        const updateData = {
            score1: score1,
            score2: score2,
            status: status
        };

        const { data, error } = await dbClient.from('matches').update(updateData).eq('id', matchId).select();
        if (error) {
            console.error('Error updateMatch:', error);
            return null;
        }

        // Jika ada match lanjutan di knockout
        if (nextMatchId && nextSlot && nextParticipantId) {
            const nextUpdate = {};
            if (nextSlot === 1) nextUpdate.participant1_id = nextParticipantId;
            else if (nextSlot === 2) nextUpdate.participant2_id = nextParticipantId;

            await dbClient.from('matches').update(nextUpdate).eq('id', nextMatchId);
        }

        return data;
    }
};

// Pastikan SupabaseService tersedia secara global di window
window.SupabaseService = SupabaseService;
window.isSupabaseConfigured = isSupabaseConfigured;
