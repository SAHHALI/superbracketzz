// Local State Management
let appState = {
    isLoggedIn: false,
    tournaments: [],
    participants: [],
    matches: [],
    players: [],
    currentIdCounter: {
        tournaments: 1,
        participants: 1,
        matches: 1,
        players: 1
    }
};

// Load state from sessionStorage & sync with Supabase
async function loadState() {
    const saved = sessionStorage.getItem('bracketAppState');
    if (saved) {
        appState = JSON.parse(saved);
        if (!appState.players) appState.players = [];
        if (!appState.currentIdCounter.players) appState.currentIdCounter.players = 1;
    }

    updateDbStatusBadge();

    // Jika Supabase aktif, muat data terbaru dari Cloud
    if (window.SupabaseService && window.SupabaseService.isReady()) {
        try {
            const remotePlayers = await window.SupabaseService.getPlayers();
            if (remotePlayers && remotePlayers.length > 0) {
                appState.players = remotePlayers;
                renderPlayers();
            }

            const remoteTournaments = await window.SupabaseService.getTournaments();
            if (remoteTournaments && remoteTournaments.length > 0) {
                appState.tournaments = remoteTournaments;
                loadTournaments();
            }
            saveState();
        } catch (err) {
            console.warn('Gagal sinkronisasi data dari Supabase:', err);
        }
    }
    updateDbStatusBadge();
}

// Update tampilan badge status database di header
function updateDbStatusBadge() {
    const badge = document.getElementById('db-status-badge');
    if (!badge) return;
    if (window.SupabaseService && window.SupabaseService.isReady()) {
        badge.innerHTML = '<span class="status-pulse-dot online"></span> Supabase Cloud Terhubung';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        badge.style.color = '#34d399';
        badge.style.background = 'rgba(16, 185, 129, 0.15)';
        badge.title = 'Terhubung ke database Supabase Cloud (Live Sync Aktif)';
    } else {
        badge.innerHTML = '<span class="status-pulse-dot local"></span> Mode Penyimpanan Lokal';
        badge.style.borderColor = 'rgba(255,255,255,0.2)';
        badge.style.color = '#94a3b8';
        badge.style.background = 'rgba(255,255,255,0.08)';
        badge.title = 'Data disimpan di browser (sessionStorage). Masukkan kunci Supabase di assets/js/supabaseClient.js untuk sinkronisasi.';
    }
}

// Save state to sessionStorage
function saveState() {
    sessionStorage.setItem('bracketAppState', JSON.stringify(appState));
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    checkAuth();

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const u = document.getElementById('username').value;
        const p = document.getElementById('password').value;

        if (u === 'sahhalipz' && p === 'kompebetgila') {
            appState.isLoggedIn = true;
            saveState();
            checkAuth();
            document.getElementById('login-error').style.display = 'none';
            document.getElementById('login-form').reset();
        } else {
            const err = document.getElementById('login-error');
            err.textContent = 'Nama pengguna atau kata sandi salah.';
            err.style.display = 'block';
        }
    });

    document.getElementById('create-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('t-name').value;
        const sport = document.getElementById('t-sport').value;
        const format = document.getElementById('t-format').value;
        const checkboxes = document.querySelectorAll('.player-checkbox:checked');
        const manualInput = document.getElementById('t-manual-players').value;
        
        let parts = Array.from(checkboxes).map(cb => {
            return appState.players.find(p => p.id == cb.value);
        }).filter(p => p !== undefined);

        if (manualInput.trim()) {
            const manualNames = manualInput.split(',').map(n => n.trim()).filter(n => n.length > 0);
            manualNames.forEach(nName => {
                const newPlayer = {
                    id: appState.currentIdCounter.players++,
                    name: nName,
                    photo: null
                };
                appState.players.push(newPlayer);
                parts.push(newPlayer);
            });

            // Membatasi jumlah pemain maksimal 20
            const MAX_PLAYERS = 20;
            if (appState.players.length > MAX_PLAYERS) {
                appState.players.splice(0, appState.players.length - MAX_PLAYERS);
            }

            // Update the global player list immediately
            renderPlayers();
            saveState();
        }

        if (parts.length < 2) {
            alert('Dibutuhkan minimal 2 peserta. Silakan pilih pemain dari daftar atau ketikkan nama manual.');
            return;
        }

        createTournament(name, sport, format, parts);
        document.getElementById('t-manual-players').value = '';
    });
});

// --- Auth ---
function checkAuth() {
    updateDbStatusBadge();
    if (appState.isLoggedIn) {
        showSection('dashboard-section');
        document.getElementById('nav-buttons').style.display = 'flex';
        loadTournaments();
        renderPlayers();
    } else {
        showSection('login-section');
        document.getElementById('nav-buttons').style.display = 'none';
    }
}

function logout() {
    appState.isLoggedIn = false;
    saveState();
    checkAuth();
}

// --- UI Helpers ---
function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    if (id === 'leaderboard-section') {
        renderLeaderboard();
    }
}

function getSportWithIcon(sport) {
    if (!sport) return '';
    if (sport.includes('Badminton') || sport.includes('🏸')) return '🏸 Badminton';
    if (sport.includes('Chess') || sport.includes('♟️')) return '♟️ Chess';
    if (sport.includes('Billiard') || sport.includes('🎱')) return '🎱 Billiard';
    return `🎮 ${sport.replace('🎮 ', '')}`;
}

// --- Tournament Logic ---
function createTournament(name, sport, format, selectedPlayers) {
    const tId = appState.currentIdCounter.tournaments++;

    appState.tournaments.push({
        id: tId,
        name: name,
        sport: sport,
        format: format,
        status: 'active',
        createdAt: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    });

    const partIds = [];
    selectedPlayers.forEach(player => {
        const pId = appState.currentIdCounter.participants++;
        appState.participants.push({
            id: pId,
            tournament_id: tId,
            name: player.name,
            photo: player.photo
        });
        partIds.push(pId);
    });

    // Generate Matches
    if (format === 'Knockout') {
        const rounds = Math.ceil(Math.log2(partIds.length));
        // Shuffle participants
        for (let i = partIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [partIds[i], partIds[j]] = [partIds[j], partIds[i]];
        }

        let matches = [];
        // Round 1
        for (let i = 0; i < partIds.length; i += 2) {
            const mId = appState.currentIdCounter.matches++;
            appState.matches.push({
                id: mId,
                tournament_id: tId,
                round: 1,
                participant1_id: partIds[i],
                participant2_id: partIds[i + 1] || null,
                score1: 0,
                score2: 0,
                status: 'pending',
                next_match_id: null
            });
            matches.push(mId);
        }

        let prev_round_matches = matches;
        for (let r = 2; r <= rounds; r++) {
            let current_round_matches = [];
            for (let i = 0; i < prev_round_matches.length; i += 2) {
                const mId = appState.currentIdCounter.matches++;
                appState.matches.push({
                    id: mId,
                    tournament_id: tId,
                    round: r,
                    participant1_id: null,
                    participant2_id: null,
                    score1: 0,
                    score2: 0,
                    status: 'pending',
                    next_match_id: null
                });
                current_round_matches.push(mId);

                // Update previous matches
                let m1 = appState.matches.find(m => m.id === prev_round_matches[i]);
                if (m1) m1.next_match_id = mId;

                if (i + 1 < prev_round_matches.length) {
                    let m2 = appState.matches.find(m => m.id === prev_round_matches[i + 1]);
                    if (m2) m2.next_match_id = mId;
                }
            }
            prev_round_matches = current_round_matches;
        }

    } else if (format === 'League' || format === 'League2') {
        let list = [...partIds];
        if (list.length % 2 !== 0) {
            list.push(null); // Add a dummy player for odd number of players
        }
        const numPlayers = list.length;
        const numRounds = numPlayers - 1;
        const half = numPlayers / 2;

        let leg1 = [];
        let leg2 = [];
        let leg3 = [];

        for (let r = 0; r < numRounds; r++) {
            for (let i = 0; i < half; i++) {
                const home = list[i];
                const away = list[numPlayers - 1 - i];
                if (home !== null && away !== null) {
                    // Balance home/away: bergantian home/away per putaran
                    if (r % 2 === 0) {
                        leg1.push({ home: home, away: away, round: r + 1 });
                        leg2.push({ home: away, away: home, round: r + 1 + numRounds });
                        leg3.push({ home: home, away: away, round: r + 1 + (numRounds * 2) });
                    } else {
                        leg1.push({ home: away, away: home, round: r + 1 });
                        leg2.push({ home: home, away: away, round: r + 1 + numRounds });
                        leg3.push({ home: away, away: home, round: r + 1 + (numRounds * 2) });
                    }
                }
            }
            // Rotate list: keep index 0 fixed, rotate others
            list.splice(1, 0, list.pop());
        }

        // Format Liga: Default 3 Putaran (bertemu 3 kali)
        const allScheduledMatches = (format === 'League2') ? [...leg1, ...leg2] : [...leg1, ...leg2, ...leg3];

        // Create matches in appState
        allScheduledMatches.forEach(sm => {
            const mId = appState.currentIdCounter.matches++;
            appState.matches.push({
                id: mId,
                tournament_id: tId,
                round: sm.round,
                participant1_id: sm.home,
                participant2_id: sm.away,
                score1: 0,
                score2: 0,
                status: 'pending',
                next_match_id: null
            });
        });
    }

    // Membatasi jumlah turnamen maksimal 10
    const MAX_TOURNAMENTS = 10;
    if (appState.tournaments.length > MAX_TOURNAMENTS) {
        const numToRemove = appState.tournaments.length - MAX_TOURNAMENTS;
        const removedTournaments = appState.tournaments.splice(0, numToRemove);
        const removedIds = removedTournaments.map(t => t.id);
        
        // Hapus peserta dan pertandingan yang terkait dengan turnamen yang dihapus
        appState.participants = appState.participants.filter(p => !removedIds.includes(p.tournament_id));
        appState.matches = appState.matches.filter(m => !removedIds.includes(m.tournament_id));
    }

    saveState();

    // Sinkronisasi dengan Supabase jika aktif
    if (window.SupabaseService && window.SupabaseService.isReady()) {
        const currentTournament = appState.tournaments.find(t => t.id === tId);
        const currentParts = appState.participants.filter(p => p.tournament_id === tId);
        const currentMatches = appState.matches.filter(m => m.tournament_id === tId);
        window.SupabaseService.createTournament(currentTournament, currentParts, currentMatches);
    }

    document.getElementById('create-form').reset();
    loadTournaments();
}

function loadTournaments() {
    const list = document.getElementById('tournaments-list');
    list.innerHTML = '';

    // Reverse for descending order
    [...appState.tournaments].reverse().forEach(t => {
        const matches = appState.matches.filter(m => m.tournament_id === t.id);
        const parts = appState.participants.filter(p => p.tournament_id === t.id);
        let winnerHTML = '';

        if (matches.length > 0) {
            if (t.format === 'Knockout') {
                const finalMatch = matches.reduce((prev, current) => (prev.round > current.round) ? prev : current, matches[0]);
                if (finalMatch && finalMatch.status === 'completed') {
                    const winnerId = finalMatch.score1 > finalMatch.score2 ? finalMatch.participant1_id : finalMatch.participant2_id;
                    const winnerName = getParticipantName(winnerId, parts);
                    winnerHTML = `<div style="color: #fbbf24; font-weight: 700; margin-top: 0.8rem; font-size: 1rem; text-shadow: 0 0 10px rgba(251, 191, 36, 0.4);">🏆 ${winnerName}</div>`;
                }
            } else if (t.format === 'League') {
                const allCompleted = matches.every(m => m.status === 'completed');
                if (allCompleted) {
                    const standings = {};
                    parts.forEach(p => {
                        standings[p.id] = { name: p.name, pts: 0, gf: 0, ga: 0 };
                    });
                    matches.forEach(m => {
                        if (standings[m.participant1_id] && standings[m.participant2_id]) {
                            const p1 = standings[m.participant1_id];
                            const p2 = standings[m.participant2_id];
                            p1.gf += m.score1; p1.ga += m.score2;
                            p2.gf += m.score2; p2.ga += m.score1;
                            if (m.score1 > m.score2) p1.pts += 3;
                            else if (m.score1 < m.score2) p2.pts += 3;
                            else { p1.pts += 1; p2.pts += 1; }
                        }
                    });
                    const sorted = Object.values(standings).sort((a, b) => {
                        if (b.pts !== a.pts) return b.pts - a.pts;
                        return (b.gf - b.ga) - (a.gf - a.ga);
                    });
                    if (sorted.length > 0) {
                        winnerHTML = `<div style="color: #fbbf24; font-weight: 700; margin-top: 0.8rem; font-size: 1rem; text-shadow: 0 0 10px rgba(251, 191, 36, 0.4);">🏆 ${sorted[0].name}</div>`;
                    }
                }
            }
        }

        const div = document.createElement('div');
        div.className = 'tournament-card';
        div.innerHTML = `
            <div style="font-size: 0.8rem; color: var(--accent); margin-bottom: 0.4rem; font-weight: 600;">${t.createdAt || ''}</div>
            <strong style="font-size: 1.1rem;">${t.name}</strong> - ${getSportWithIcon(t.sport)} (${t.format})
            ${winnerHTML}
        `;
        div.onclick = () => viewTournament(t.id);
        list.appendChild(div);
    });
}

let currentTournamentId = null;

async function viewTournament(id) {
    currentTournamentId = id;
    let tournament = appState.tournaments.find(t => t.id === id);
    let participants = appState.participants.filter(p => p.tournament_id === id);
    let matches = appState.matches.filter(m => m.tournament_id === id).sort((a, b) => a.round - b.round || a.id - b.id);

    // Ambil data jika belum ada di lokal (misal saat dibuka dari device lain via Supabase)
    if ((participants.length === 0 || matches.length === 0) && window.SupabaseService && window.SupabaseService.isReady()) {
        const [cloudParts, cloudMatches] = await Promise.all([
            window.SupabaseService.getParticipants(id),
            window.SupabaseService.getMatches(id)
        ]);
        if (cloudParts && cloudParts.length > 0) {
            appState.participants = appState.participants.filter(p => p.tournament_id !== id).concat(cloudParts);
            participants = cloudParts;
        }
        if (cloudMatches && cloudMatches.length > 0) {
            appState.matches = appState.matches.filter(m => m.tournament_id !== id).concat(cloudMatches);
            matches = cloudMatches.sort((a, b) => a.round - b.round || a.id - b.id);
        }
        saveState();
    }

    if (tournament) {
        document.getElementById('view-title').innerHTML = `${tournament.name} <div style="font-size: 0.9rem; color: var(--accent); font-weight: 600; margin-top: 0.3rem;">${getSportWithIcon(tournament.sport)} • Dibuat pada: ${tournament.createdAt || 'Tidak diketahui'}</div>`;
        const area = document.getElementById('printable-area');
        area.innerHTML = '';

        if (tournament.format === 'Knockout') {
            renderKnockout(area, matches, participants);
        } else {
            renderLeague(area, matches, participants);
        }

        showSection('view-section');
    }
}

// --- Render Logic ---
function getParticipantName(id, participants) {
    if (!id) return 'TBD';
    const p = participants.find(x => x.id === id);
    return p ? p.name : 'Unknown';
}

function renderKnockout(container, matches, participants) {
    const roundsMap = {};
    matches.forEach(m => {
        if (!roundsMap[m.round]) roundsMap[m.round] = [];
        roundsMap[m.round].push(m);
    });

    const bracketDiv = document.createElement('div');
    bracketDiv.className = 'bracket';

    Object.keys(roundsMap).forEach(r => {
        const roundDiv = document.createElement('div');
        roundDiv.className = 'round';

        roundsMap[r].forEach(m => {
            const matchDiv = document.createElement('div');
            matchDiv.className = 'match';

            const p1 = getParticipantName(m.participant1_id, participants);
            const p2 = getParticipantName(m.participant2_id, participants);

            const isCompleted = m.status === 'completed';
            
            const maxRound = Math.max(...Object.keys(roundsMap).map(Number));
            const isFinal = parseInt(r) === maxRound;
            let p1Trophy = '';
            let p2Trophy = '';
            if (isFinal && isCompleted) {
                if (m.score1 > m.score2) p1Trophy = ' 🏆';
                if (m.score2 > m.score1) p2Trophy = ' 🏆';
            }

            matchDiv.innerHTML = `
                <div class="participant">
                    <span>${p1}${p1Trophy}</span>
                    <input type="number" class="score-input" value="${m.score1}" data-id="${m.id}" data-p="1">
                </div>
                <div class="participant">
                    <span>${p2}${p2Trophy}</span>
                    <input type="number" class="score-input" value="${m.score2}" data-id="${m.id}" data-p="2">
                </div>
                ${m.participant1_id && m.participant2_id ? `
                    <div style="display: flex; gap: 0.25rem; margin-top: 0.5rem;">
                        <button style="flex: 1; padding: 0.3rem 0.2rem; font-size: 0.75rem;" onclick="updateMatch(${m.id})">💾 Simpan</button>
                        <button style="flex: 1; padding: 0.3rem 0.2rem; font-size: 0.75rem; background: linear-gradient(135deg, #f59e0b, #d97706);" onclick="openLiveScoreModal(${m.id})">⚡ Live</button>
                    </div>
                ` : ''}
            `;
            roundDiv.appendChild(matchDiv);
        });
        bracketDiv.appendChild(roundDiv);
    });

    container.appendChild(bracketDiv);
}

function renderLeague(container, matches, participants) {
    const standings = {};
    participants.forEach(p => {
        standings[p.id] = { name: p.name, photo: p.photo, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    });

    matches.forEach(m => {
        if (m.status === 'completed') {
            const p1 = standings[m.participant1_id];
            const p2 = standings[m.participant2_id];

            if (p1 && p2) {
                p1.pld++; p2.pld++;
                p1.gf += m.score1; p1.ga += m.score2;
                p2.gf += m.score2; p2.ga += m.score1;

                if (m.score1 > m.score2) {
                    p1.w++; p2.l++; p1.pts += 3;
                } else if (m.score1 < m.score2) {
                    p2.w++; p1.l++; p2.pts += 3;
                } else {
                    p1.d++; p2.d++; p1.pts += 1; p2.pts += 1;
                }
            }
        }
    });

    const tableArr = Object.values(standings).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        return (b.gf - b.ga) - (a.gf - a.ga);
    });

    const allCompleted = matches.length > 0 && matches.every(m => m.status === 'completed');

    const tableDiv = document.createElement('div');
    tableDiv.innerHTML = `
        <h3 class="mb-1">Klasemen</h3>
        <div class="table-responsive">
            <table class="league-table mb-2">
                <tr><th>Tim</th><th>Main</th><th>M</th><th>S</th><th>K</th><th>Poin</th></tr>
                ${tableArr.map((row, index) => `
                    <tr>
                        <td style="display: flex; align-items: center; gap: 0.5rem;">
                            <img src="${row.photo ? row.photo : `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name)}&background=random`}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
                            ${row.name}${allCompleted && index === 0 ? ' 🏆' : ''}
                        </td>
                        <td>${row.pld}</td>
                        <td>${row.w}</td>
                        <td>${row.d}</td>
                        <td>${row.l}</td>
                        <td><strong>${row.pts}</strong></td>
                    </tr>
                `).join('')}
            </table>
        </div>
        <div class="html2pdf__page-break"></div>
        <h3 class="mb-1" style="margin-top: 1.5rem;">Pertandingan</h3>
    `;

    container.appendChild(tableDiv);

    // Group matches by round
    const roundsMap = {};
    matches.forEach(m => {
        if (!roundsMap[m.round]) roundsMap[m.round] = [];
        roundsMap[m.round].push(m);
    });

    Object.keys(roundsMap).forEach(rNum => {
        const roundHeader = document.createElement('h4');
        roundHeader.className = 'mb-1';
        roundHeader.style.marginTop = '1.5rem';
        roundHeader.style.color = 'var(--accent)';
        roundHeader.textContent = `Babak ${rNum}`;
        container.appendChild(roundHeader);

        const matchesDiv = document.createElement('div');
        matchesDiv.className = 'matches-grid';

        roundsMap[rNum].forEach(m => {
            const div = document.createElement('div');
            div.className = 'league-match-card';
            
            const part1 = participants.find(p => p.id === m.participant1_id);
            const part2 = participants.find(p => p.id === m.participant2_id);
            
            const img1 = part1 && part1.photo ? part1.photo : `https://ui-avatars.com/api/?name=${encodeURIComponent(part1 ? part1.name : 'P1')}&background=random`;
            const img2 = part2 && part2.photo ? part2.photo : `https://ui-avatars.com/api/?name=${encodeURIComponent(part2 ? part2.name : 'P2')}&background=random`;

            div.innerHTML = `
                <div class="league-match-row">
                    <div class="league-match-team">
                        <img src="${img1}" alt="${part1 ? part1.name : 'P1'}">
                        <span>${part1 ? part1.name : 'Unknown'}</span>
                    </div>
                    <input type="number" class="score-input" value="${m.score1}" id="s1-${m.id}">
                </div>
                
                <div class="league-match-vs-divider">VS</div>
                
                <div class="league-match-row">
                    <div class="league-match-team">
                        <img src="${img2}" alt="${part2 ? part2.name : 'P2'}">
                        <span>${part2 ? part2.name : 'Unknown'}</span>
                    </div>
                    <input type="number" class="score-input" value="${m.score2}" id="s2-${m.id}">
                </div>
                
                <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
                    <button style="flex: 1;" onclick="updateLeagueMatch(${m.id})">💾 Simpan Skor</button>
                    <button style="flex: 1; background: linear-gradient(135deg, #f59e0b, #d97706);" onclick="openLiveScoreModal(${m.id})">⚡ Live Score</button>
                </div>
            `;
            matchesDiv.appendChild(div);
        });
        container.appendChild(matchesDiv);
    });
}

// --- Match Update Logic ---
function processMatchUpdate(id, s1, s2) {
    const match = appState.matches.find(m => m.id === id);
    if (!match) return;

    match.score1 = s1;
    match.score2 = s2;
    match.status = 'completed';

    if (match.next_match_id) {
        if (s1 === s2) {
            alert("Pertandingan sistem gugur tidak boleh berakhir seri.");
            match.status = 'pending';
            return;
        }

        const winnerId = (s1 > s2) ? match.participant1_id : match.participant2_id;
        const nextMatch = appState.matches.find(m => m.id === match.next_match_id);

        if (nextMatch) {
            if (nextMatch.participant1_id === match.participant1_id || nextMatch.participant1_id === match.participant2_id) {
                nextMatch.participant1_id = winnerId;
            } else if (nextMatch.participant2_id === match.participant1_id || nextMatch.participant2_id === match.participant2_id) {
                nextMatch.participant2_id = winnerId;
            } else if (!nextMatch.participant1_id) {
                nextMatch.participant1_id = winnerId;
            } else {
                nextMatch.participant2_id = winnerId;
            }
        }
    }

    saveState();

    if (window.SupabaseService && window.SupabaseService.isReady()) {
        window.SupabaseService.updateMatch(id, s1, s2, match.status, match.next_match_id);
    }

    renderPlayers();
    renderLeaderboard();
    viewTournament(currentTournamentId);
}

function updateMatch(id) {
    const inputs = document.querySelectorAll(`input[data-id="${id}"]`);
    let s1 = 0, s2 = 0;
    inputs.forEach(i => {
        if (i.dataset.p == "1") s1 = parseInt(i.value) || 0;
        if (i.dataset.p == "2") s2 = parseInt(i.value) || 0;
    });

    processMatchUpdate(id, s1, s2);
}

function updateLeagueMatch(id) {
    const s1 = parseInt(document.getElementById(`s1-${id}`).value) || 0;
    const s2 = parseInt(document.getElementById(`s2-${id}`).value) || 0;

    processMatchUpdate(id, s1, s2);
}

function downloadPDF() {
    const element = document.getElementById('printable-area');
    
    // Sembunyikan tombol "Simpan Skor" sebelum dicetak
    const buttons = element.querySelectorAll('button');
    buttons.forEach(b => b.style.display = 'none');

    const opt = {
        margin: 0.5,
        filename: 'tournament.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
    };
    
    html2pdf().set(opt).from(element).save().then(() => {
        // Tampilkan kembali tombol setelah PDF selesai dibuat
        buttons.forEach(b => b.style.display = '');
    });
}

// --- Player Management Logic ---

document.getElementById('player-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('p-id').value;
    const name = document.getElementById('p-name').value;
    const photoInput = document.getElementById('p-photo');
    
    let photoBase64 = null;
    
    // If we're editing and no new photo was provided, keep the old one
    if (id && (!photoInput.files || !photoInput.files[0])) {
        const existing = appState.players.find(p => p.id == id);
        if (existing) photoBase64 = existing.photo;
    }

    if (photoInput.files && photoInput.files[0]) {
        try {
            photoBase64 = await resizeImage(photoInput.files[0]);
        } catch (err) {
            alert('Gagal memproses gambar.');
            console.error(err);
            return;
        }
    }

    if (id) {
        // Edit
        const player = appState.players.find(p => p.id == id);
        if (player) {
            player.name = name;
            player.photo = photoBase64;
            if (window.SupabaseService && window.SupabaseService.isReady()) {
                window.SupabaseService.updatePlayer(player);
            }
        }
    } else {
        // Add
        const newPlayer = {
            id: appState.currentIdCounter.players++,
            name: name,
            photo: photoBase64
        };
        appState.players.push(newPlayer);
        if (window.SupabaseService && window.SupabaseService.isReady()) {
            window.SupabaseService.addPlayer(newPlayer).then(created => {
                if (created && created.id) {
                    newPlayer.id = created.id;
                    saveState();
                }
            });
        }
    }

    // Membatasi jumlah pemain maksimal 20
    const MAX_PLAYERS = 20;
    if (appState.players.length > MAX_PLAYERS) {
        appState.players.splice(0, appState.players.length - MAX_PLAYERS);
    }

    saveState();
    resetPlayerForm();
    renderPlayers();
});

function resizeImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 150;
                const MAX_HEIGHT = 150;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

function renderPlayers() {
    // Render in players section
    const list = document.getElementById('players-list');
    if (list) list.innerHTML = '';
    
    // Render in tournament creation section
    const tList = document.getElementById('t-participants-list');
    if (tList) tList.innerHTML = '';

    appState.players.forEach(p => {
        // 1. Players Section Card
        if (list) {
            const stats = getPlayerStats(p.id);
            const card = document.createElement('div');
            card.className = 'player-card';
            const img = p.photo ? `<img src="${p.photo}" alt="${p.name}">` : `<img src="https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random" alt="${p.name}">`;
            const trophyBadge = stats.trophies > 0 ? `<div class="player-card-trophy-badge">🏆 ${stats.trophies}</div>` : '';
            
            card.innerHTML = `
                <div class="player-card-avatar-wrap">
                    ${img}
                    ${trophyBadge}
                </div>
                <div class="player-card-name" title="${p.name}">${p.name}</div>
                <div class="player-mini-stats">
                    ${stats.totalMatches > 0 ? `WR: <strong style="color:#34d399">${stats.winRate}%</strong> (${stats.wins}M-${stats.losses}K)` : `<span style="color:var(--text-muted)">Belum bertanding</span>`}
                </div>
                <div class="player-card-actions">
                    <button class="btn-stats-view" onclick="openPlayerStatsModal(${p.id})">📊 Profil</button>
                    <button class="btn-player-edit" onclick="editPlayer(${p.id})">✏️</button>
                </div>
            `;
            list.appendChild(card);
        }

        // 2. Tournament Creation Checkbox
        if (tList) {
            const cbDiv = document.createElement('div');
            cbDiv.className = 'player-checkbox-item';
            const img = p.photo ? `<img src="${p.photo}" alt="${p.name}">` : `<img src="https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random" alt="${p.name}">`;
            
            cbDiv.innerHTML = `
                <input type="checkbox" class="player-checkbox" value="${p.id}" id="cb-${p.id}" style="display:none;">
                <label for="cb-${p.id}" class="player-select-card">
                    ${img} 
                    <span style="font-size:0.9rem; font-weight:600;">${p.name}</span>
                    <div class="check-icon">✓</div>
                </label>
            `;
            tList.appendChild(cbDiv);
        }
    });
}

function editPlayer(id) {
    const p = appState.players.find(x => x.id == id);
    if (!p) return;
    
    document.getElementById('player-form-title').textContent = 'Edit Pemain';
    document.getElementById('p-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-submit-btn').innerHTML = '✏️ Perbarui Pemain';
    document.getElementById('p-cancel-btn').style.display = 'block';
    
    const preview = document.getElementById('p-photo-preview');
    if (p.photo) {
        preview.innerHTML = `<img src="${p.photo}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">`;
    } else {
        preview.innerHTML = '';
    }
}

function resetPlayerForm() {
    document.getElementById('player-form').reset();
    document.getElementById('p-id').value = '';
    document.getElementById('player-form-title').textContent = 'Tambah Pemain';
    document.getElementById('p-submit-btn').innerHTML = '💾 Simpan Pemain';
    document.getElementById('p-cancel-btn').style.display = 'none';
    document.getElementById('p-photo-preview').innerHTML = '';
}

function filterPlayers() {
    const term = document.getElementById('t-search-player').value.toLowerCase();
    const items = document.querySelectorAll('.player-checkbox-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(term)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// --- Audio Logic ---
function toggleMusic() {
    const audio = document.getElementById('bg-music');
    const btn = document.getElementById('music-toggle');
    if (audio.paused) {
        audio.play().catch(err => alert("Gagal memutar lagu: " + err));
        btn.innerHTML = '⏸'; // Pause symbol
    } else {
        audio.pause();
        btn.innerHTML = '♫'; // Music symbol
    }
}

// --- Live Score Logic ---
let liveScoreMatchId = null;
let liveScoreVal1 = 0;
let liveScoreVal2 = 0;

function openLiveScoreModal(matchId) {
    const match = appState.matches.find(m => m.id === matchId);
    if (!match) return;

    liveScoreMatchId = matchId;
    
    const tournamentId = match.tournament_id;
    const participants = appState.participants.filter(p => p.tournament_id === tournamentId);
    const part1 = participants.find(p => p.id === match.participant1_id);
    const part2 = participants.find(p => p.id === match.participant2_id);

    document.getElementById('live-name-1').textContent = part1 ? part1.name : 'TBD';
    document.getElementById('live-name-2').textContent = part2 ? part2.name : 'TBD';

    const img1 = part1 && part1.photo ? part1.photo : `https://ui-avatars.com/api/?name=${encodeURIComponent(part1 ? part1.name : 'P1')}&background=random`;
    const img2 = part2 && part2.photo ? part2.photo : `https://ui-avatars.com/api/?name=${encodeURIComponent(part2 ? part2.name : 'P2')}&background=random`;
    
    document.getElementById('live-photo-1').src = img1;
    document.getElementById('live-photo-2').src = img2;

    liveScoreVal1 = match.score1 || 0;
    liveScoreVal2 = match.score2 || 0;

    document.getElementById('live-score-val-1').textContent = liveScoreVal1;
    document.getElementById('live-score-val-2').textContent = liveScoreVal2;

    document.getElementById('live-score-modal').style.display = 'flex';
}

function adjustLiveScore(teamNum, amount) {
    if (teamNum === 1) {
        liveScoreVal1 = Math.max(0, liveScoreVal1 + amount);
        document.getElementById('live-score-val-1').textContent = liveScoreVal1;
    } else {
        liveScoreVal2 = Math.max(0, liveScoreVal2 + amount);
        document.getElementById('live-score-val-2').textContent = liveScoreVal2;
    }
}

function saveLiveScore() {
    if (liveScoreMatchId !== null) {
        processMatchUpdate(liveScoreMatchId, liveScoreVal1, liveScoreVal2);
        closeLiveScoreModal();
    }
}

function closeLiveScoreModal() {
    document.getElementById('live-score-modal').style.display = 'none';
    liveScoreMatchId = null;
}

// ========================================================
// STATISTIK PEMAIN, RIWAYAT KEMENANGAN, & LEADERBOARD
// ========================================================

function getPlayerStats(playerId) {
    const player = appState.players.find(p => p.id == playerId);
    if (!player) return {
        player: { id: playerId, name: 'Unknown', photo: null },
        totalMatches: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0,
        winRate: 0, trophies: 0, tournamentWins: [], recentForm: [], history: []
    };

    let totalMatches = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let gf = 0;
    let ga = 0;
    let trophies = 0;
    let tournamentWins = [];
    let history = [];

    const normPlayerName = player.name.trim().toLowerCase();

    // Loop through all tournaments in appState
    appState.tournaments.forEach(t => {
        const parts = appState.participants.filter(p => p.tournament_id === t.id);
        const myPart = parts.find(p => p.name.trim().toLowerCase() === normPlayerName);
        const tMatches = appState.matches.filter(m => m.tournament_id === t.id);

        if (!myPart) return;

        // 1. Cek Gelar Juara (Trophy)
        if (t.format === 'Knockout') {
            const finalMatch = tMatches.reduce((prev, cur) => (cur && (!prev || cur.round > prev.round)) ? cur : prev, null);
            if (finalMatch && finalMatch.status === 'completed') {
                const winnerPartId = (finalMatch.score1 > finalMatch.score2) ? finalMatch.participant1_id : finalMatch.participant2_id;
                if (winnerPartId === myPart.id) {
                    trophies++;
                    tournamentWins.push({ name: t.name, sport: t.sport, date: t.createdAt, format: 'Gugur' });
                }
            }
        } else if (t.format && t.format.includes('League')) {
            const allCompleted = tMatches.length > 0 && tMatches.every(m => m.status === 'completed');
            if (allCompleted) {
                const standings = {};
                parts.forEach(p => { standings[p.id] = { id: p.id, name: p.name, pts: 0, gf: 0, ga: 0 }; });
                tMatches.forEach(m => {
                    if (standings[m.participant1_id] && standings[m.participant2_id]) {
                        const p1 = standings[m.participant1_id];
                        const p2 = standings[m.participant2_id];
                        p1.gf += m.score1; p1.ga += m.score2;
                        p2.gf += m.score2; p2.ga += m.score1;
                        if (m.score1 > m.score2) p1.pts += 3;
                        else if (m.score1 < m.score2) p2.pts += 3;
                        else { p1.pts += 1; p2.pts += 1; }
                    }
                });
                const sorted = Object.values(standings).sort((a, b) => {
                    if (b.pts !== a.pts) return b.pts - a.pts;
                    return (b.gf - b.ga) - (a.gf - a.ga);
                });
                if (sorted.length > 0 && sorted[0].id === myPart.id) {
                    trophies++;
                    tournamentWins.push({ name: t.name, sport: t.sport, date: t.createdAt, format: 'Liga' });
                }
            }
        }

        // 2. Kumpulkan Pertandingan
        tMatches.forEach(m => {
            if (m.status !== 'completed') return;
            const isP1 = m.participant1_id === myPart.id;
            const isP2 = m.participant2_id === myPart.id;

            if (isP1 || isP2) {
                totalMatches++;
                const myScore = isP1 ? m.score1 : m.score2;
                const oppScore = isP1 ? m.score2 : m.score1;
                const oppPartId = isP1 ? m.participant2_id : m.participant1_id;
                const oppPart = parts.find(p => p.id === oppPartId);
                const opponentName = oppPart ? oppPart.name : 'Unknown';
                const opponentPhoto = oppPart ? oppPart.photo : null;

                gf += myScore;
                ga += oppScore;

                let result = 'D';
                if (myScore > oppScore) {
                    wins++;
                    result = 'W';
                } else if (myScore < oppScore) {
                    losses++;
                    result = 'L';
                } else {
                    draws++;
                    result = 'D';
                }

                history.push({
                    matchId: m.id,
                    tournamentName: t.name,
                    sport: t.sport,
                    date: t.createdAt || 'Baru saja',
                    opponentName,
                    opponentPhoto,
                    myScore,
                    oppScore,
                    result
                });
            }
        });
    });

    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
    const recentForm = history.slice(-5).map(h => h.result);

    return {
        player,
        totalMatches,
        wins,
        draws,
        losses,
        gf,
        ga,
        gd: gf - ga,
        winRate,
        trophies,
        tournamentWins,
        recentForm,
        history: history.reverse() // Pertandingan terbaru di atas
    };
}

function getPlayerTitle(stats) {
    if (stats.trophies >= 3 || (stats.winRate >= 80 && stats.totalMatches >= 5)) {
        return { title: '👑 GOAT / Legenda Arena', color: '#fbbf24' };
    }
    if (stats.trophies >= 1 || (stats.winRate >= 65 && stats.totalMatches >= 3)) {
        return { title: '🔥 Juara & Predator Arena', color: '#f59e0b' };
    }
    if (stats.winRate >= 50 && stats.totalMatches >= 2) {
        return { title: '⚔️ Petarung Tangguh', color: '#3b82f6' };
    }
    if (stats.totalMatches > 0) {
        return { title: '⚡ Penantang Berani', color: '#10b981' };
    }
    return { title: '🌱 Pendatang Baru', color: '#94a3b8' };
}

function getAllPlayersStats() {
    return appState.players.map(p => getPlayerStats(p.id)).sort((a, b) => {
        if (b.trophies !== a.trophies) return b.trophies - a.trophies;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.gd - a.gd;
    });
}

function showLeaderboardSection() {
    showSection('leaderboard-section');
    renderLeaderboard();
}

function renderLeaderboard() {
    const podiumContainer = document.getElementById('podium-container');
    const tbody = document.getElementById('leaderboard-tbody');
    if (!tbody) return;

    const allStats = getAllPlayersStats();

    // Render Podium Top 3
    if (podiumContainer) {
        podiumContainer.innerHTML = '';
        if (allStats.length >= 1) {
            const top1 = allStats[0];
            const top2 = allStats.length >= 2 ? allStats[1] : null;
            const top3 = allStats.length >= 3 ? allStats[2] : null;

            let html = '';

            // Juara 2 (Kiri)
            if (top2) {
                const img2 = top2.player.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(top2.player.name)}&background=random`;
                html += `
                    <div class="podium-card podium-rank-2" onclick="openPlayerStatsModal(${top2.player.id})">
                        <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">🥈</div>
                        <img src="${img2}" class="podium-avatar" alt="${top2.player.name}">
                        <div class="podium-name">${top2.player.name}</div>
                        <div style="font-size: 0.8rem; color: #94a3b8; font-weight: 700;">🏆 ${top2.trophies} Trofi • ${top2.winRate}% WR</div>
                        <span class="podium-badge" style="background: rgba(148, 163, 184, 0.2); color: #cbd5e1; border: 1px solid #94a3b8;">Rank #2</span>
                    </div>
                `;
            }

            // Juara 1 (Tengah)
            if (top1) {
                const img1 = top1.player.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(top1.player.name)}&background=random`;
                html += `
                    <div class="podium-card podium-rank-1" onclick="openPlayerStatsModal(${top1.player.id})">
                        <div class="podium-crown">👑</div>
                        <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">🥇</div>
                        <img src="${img1}" class="podium-avatar" alt="${top1.player.name}">
                        <div class="podium-name" style="color: #fbbf24;">${top1.player.name}</div>
                        <div style="font-size: 0.85rem; color: #fef08a; font-weight: 800;">🏆 ${top1.trophies} Trofi • ${top1.winRate}% WR</div>
                        <span class="podium-badge" style="background: rgba(251, 191, 36, 0.25); color: #fbbf24; border: 1px solid #fbbf24;">👑 Champion #1</span>
                    </div>
                `;
            }

            // Juara 3 (Kanan)
            if (top3) {
                const img3 = top3.player.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(top3.player.name)}&background=random`;
                html += `
                    <div class="podium-card podium-rank-3" onclick="openPlayerStatsModal(${top3.player.id})">
                        <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">🥉</div>
                        <img src="${img3}" class="podium-avatar" alt="${top3.player.name}">
                        <div class="podium-name">${top3.player.name}</div>
                        <div style="font-size: 0.8rem; color: #d97706; font-weight: 700;">🏆 ${top3.trophies} Trofi • ${top3.winRate}% WR</div>
                        <span class="podium-badge" style="background: rgba(217, 119, 6, 0.2); color: #fbbf24; border: 1px solid #d97706;">Rank #3</span>
                    </div>
                `;
            }

            podiumContainer.innerHTML = html;
        } else {
            podiumContainer.innerHTML = `<div style="color: var(--text-muted); font-style: italic; padding: 1.5rem;">Belum ada pemain di arena. Tambahkan pemain dan mainkan pertandingan!</div>`;
        }
    }

    // Render Table Rows
    tbody.innerHTML = '';
    if (allStats.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 2rem;">Belum ada data pemain.</td></tr>`;
        return;
    }

    allStats.forEach((s, idx) => {
        const rank = idx + 1;
        let rankBadge = `<span class="lb-rank-num">#${rank}</span>`;
        if (rank === 1) rankBadge = `<span class="lb-rank-num" style="color: #fbbf24; font-size: 1.25rem;">🥇 1</span>`;
        else if (rank === 2) rankBadge = `<span class="lb-rank-num" style="color: #94a3b8; font-size: 1.2rem;">🥈 2</span>`;
        else if (rank === 3) rankBadge = `<span class="lb-rank-num" style="color: #d97706; font-size: 1.2rem;">🥉 3</span>`;

        const img = s.player.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.player.name)}&background=random`;

        const formPills = s.recentForm.length > 0
            ? s.recentForm.map(f => `<span class="form-pill ${f.toLowerCase()}">${f}</span>`).join('')
            : '<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>';

        const tr = document.createElement('tr');
        tr.onclick = () => openPlayerStatsModal(s.player.id);
        tr.innerHTML = `
            <td>${rankBadge}</td>
            <td>
                <div class="lb-player-col">
                    <img src="${img}" class="lb-player-avatar" alt="${s.player.name}">
                    <div>
                        <strong style="color: var(--text-main); font-size: 0.95rem;">${s.player.name}</strong>
                    </div>
                </div>
            </td>
            <td style="text-align: center;"><strong style="color: #fbbf24;">${s.trophies > 0 ? `🏆 ${s.trophies}` : '-'}</strong></td>
            <td style="text-align: center;">${s.totalMatches}</td>
            <td style="text-align: center;"><span style="color: #10b981;">${s.wins}</span> - <span style="color: #f59e0b;">${s.draws}</span> - <span style="color: #ef4444;">${s.losses}</span></td>
            <td style="text-align: center;">
                <div style="font-weight: 700; color: ${s.winRate >= 50 ? '#34d399' : '#94a3b8'}">${s.winRate}%</div>
            </td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 0.25rem; justify-content: center;">${formPills}</div>
            </td>
            <td style="text-align: right;">
                <button class="btn-stats-view" onclick="event.stopPropagation(); openPlayerStatsModal(${s.player.id})" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">📊 Profil</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openPlayerStatsModal(playerId) {
    const stats = getPlayerStats(playerId);
    if (!stats || !stats.player) return;

    const modal = document.getElementById('player-stats-modal');
    if (!modal) return;

    const p = stats.player;
    const titleInfo = getPlayerTitle(stats);

    // Hero Avatar & Name
    const heroAvatar = document.getElementById('ps-hero-avatar');
    heroAvatar.src = p.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random`;
    heroAvatar.style.borderColor = titleInfo.color;

    document.getElementById('ps-hero-name').textContent = p.name;
    const titleBadge = document.getElementById('ps-hero-title');
    titleBadge.textContent = titleInfo.title;
    titleBadge.style.color = titleInfo.color;
    titleBadge.style.borderColor = titleInfo.color;

    // Form Pills
    const formContainer = document.getElementById('ps-hero-form');
    if (stats.recentForm.length > 0) {
        formContainer.innerHTML = stats.recentForm.map(f => `<span class="form-pill ${f.toLowerCase()}">${f}</span>`).join('');
    } else {
        formContainer.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted);">Belum ada laga</span>';
    }

    // 4 Highlight Stats
    document.getElementById('ps-stat-trophies').textContent = `${stats.trophies} 🏆`;
    document.getElementById('ps-stat-matches').textContent = stats.totalMatches;
    document.getElementById('ps-stat-winrate').textContent = `${stats.winRate}%`;
    document.getElementById('ps-winrate-bar').style.width = `${stats.winRate}%`;
    document.getElementById('ps-stat-record').innerHTML = `<span style="color:#10b981">${stats.wins}M</span> - <span style="color:#f59e0b">${stats.draws}S</span> - <span style="color:#ef4444">${stats.losses}K</span>`;

    // Trophy Showcase
    const trophyShowcase = document.getElementById('ps-trophy-showcase');
    const trophyList = document.getElementById('ps-trophy-list');
    if (stats.trophies > 0 && stats.tournamentWins.length > 0) {
        trophyShowcase.style.display = 'block';
        trophyList.innerHTML = stats.tournamentWins.map(tw => `
            <div class="trophy-item-tag">
                <span>🏆</span>
                <span>${tw.name} (${getSportWithIcon(tw.sport)})</span>
            </div>
        `).join('');
    } else {
        trophyShowcase.style.display = 'none';
        trophyList.innerHTML = '';
    }

    // Match History List
    const historyList = document.getElementById('ps-match-history-list');
    document.getElementById('ps-history-count').textContent = `${stats.history.length} Pertandingan`;

    if (stats.history.length > 0) {
        historyList.innerHTML = stats.history.map(h => {
            const oppImg = h.opponentPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(h.opponentName)}&background=random`;
            const resultClass = h.result.toLowerCase();
            const resultLabel = h.result === 'W' ? 'MENANG' : (h.result === 'D' ? 'SERI' : 'KALAH');

            return `
                <div class="history-item-row">
                    <div style="flex: 1;">
                        <div class="history-tournament-info">${getSportWithIcon(h.sport)} • ${h.tournamentName}</div>
                        <div class="history-matchup">
                            <span style="color: #38bdf8;">Anda</span>
                            <span class="history-score-badge">${h.myScore} - ${h.oppScore}</span>
                            <div style="display: flex; align-items: center; gap: 0.35rem; color: var(--text-muted); font-size: 0.85rem;">
                                <img src="${oppImg}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                                <span>${h.opponentName}</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <span class="history-result-badge ${resultClass}">${resultLabel}</span>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        historyList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.9rem; font-style: italic;">
                Belum ada riwayat pertandingan untuk pemain ini.<br>Pertandingan turnamen yang selesai akan otomatis tercatat di sini!
            </div>
        `;
    }

    modal.style.display = 'flex';
}

function closePlayerStatsModal() {
    const modal = document.getElementById('player-stats-modal');
    if (modal) modal.style.display = 'none';
}
