const fs = require('fs');
let h = fs.readFileSync('edulink-portail.html', 'utf8');

// ── 1. Ajouter <div class="page" id="page-profil"> après la dernière page ──
const oldLastPage = '  <div class="page" id="page-enseignants"></div>';
// Il y a un doublon d'enseignants — on cible la dernière occurrence
const lastIdx = h.lastIndexOf(oldLastPage);
if (lastIdx === -1) { console.log('ECHEC: dernière page non trouvée'); process.exit(1); }
h = h.slice(0, lastIdx + oldLastPage.length) +
    '\n  <div class="page" id="page-profil"></div>' +
    h.slice(lastIdx + oldLastPage.length);
console.log('1. div page-profil ajouté: OK');

// ── 2. Ajouter entrée dans showPage renderers ──
const oldRenderers = "    'certificats-portail': afficherCertificatsPortail,\n  };";
const newRenderers = "    'certificats-portail': afficherCertificatsPortail,\n    profil: afficherProfil,\n  };";
if (!h.includes(oldRenderers)) { console.log('ECHEC: renderers non trouvés'); process.exit(1); }
h = h.replace(oldRenderers, newRenderers);
console.log('2. renderer profil ajouté: OK');

// ── 3. Ajouter bouton Profil dans l'accueil header (après student-pill) ──
// On cherche la div du pill étudiant pour ajouter un lien profil dans le header accueil
// On l'injecte plutôt dans le drawer Plus comme item supplémentaire
const oldPlusGrid = '      <button class="nav-plus-item" onclick="showPageFromPlus(\'certificats-portail\')">'+
'\n        <span class="pi-ico">📜</span><span class="pi-lbl">Docs</span>'+
'\n      </button>'+
'\n    </div>'+
'\n  </div>';
const newPlusGrid = '      <button class="nav-plus-item" onclick="showPageFromPlus(\'certificats-portail\')">'+
'\n        <span class="pi-ico">📜</span><span class="pi-lbl">Docs</span>'+
'\n      </button>'+
'\n      <button class="nav-plus-item" onclick="showPageFromPlus(\'profil\')">'+
'\n        <span class="pi-ico">👤</span><span class="pi-lbl">Profil</span>'+
'\n      </button>'+
'\n    </div>'+
'\n  </div>';
if (!h.includes(oldPlusGrid)) { console.log('AVERTISSEMENT: bouton profil dans drawer non injecté (drawer modifié)'); }
else { h = h.replace(oldPlusGrid, newPlusGrid); console.log('3. bouton Profil dans drawer: OK'); }

// ── 4. Ajouter la fonction afficherProfil avant la fermeture du script ──
const anchorJS = 'function afficherCertificatsPortail() {';
const profilFn = `// ══ B2.5 PROFIL FAMILLE ══
function afficherProfil() {
  const page = document.getElementById('page-profil');
  if (!page) return;
  const e = currentEtudiant;
  const fam = currentFamille || {};

  // Historique connexions (5 dernières depuis localStorage)
  const CONN_KEY = 'edulink_conn_history';
  const connHistory = JSON.parse(localStorage.getItem(CONN_KEY) || '[]');
  const now = new Date().toISOString();
  connHistory.unshift(now);
  const last5 = connHistory.slice(0, 5);
  localStorage.setItem(CONN_KEY, JSON.stringify(last5));

  const initials = e ? (e.nom||'?')[0].toUpperCase() : '?';
  const nomComplet = e ? (e.nom + ' ' + (e.prenom||'')).trim() : 'Étudiant inconnu';
  const niveau = e ? (e.niveau || '—') : '—';
  const filiere = e ? (e.filiere || '—') : '—';
  const matricule = e ? (e.matricule || '—') : '—';
  const emailFam = fam.email || fam.telephone || '—';

  const connRows = last5.map((iso, i) => {
    const d = new Date(iso);
    const label = i === 0 ? ' <span style="background:#d1fae5;color:#065f46;font-size:10px;padding:1px 6px;border-radius:99px;font-weight:700">Actuelle</span>' : '';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px">' +
      '<span style="color:#374151">📱 Connexion OTP' + label + '</span>' +
      '<span style="color:#9ca3af;font-size:11px">' + d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) + '</span>' +
      '</div>';
  }).join('');

  page.innerHTML =
    '<div class="page-pad">' +

    // Carte étudiant
    '<div style="background:#fff;border-radius:16px;border:1px solid #f1f5f9;padding:1.25rem;margin-bottom:1rem;box-shadow:0 1px 4px rgba(0,0,0,.06)">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:1rem">' +
        '<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#0f6e56,#1e3a5f);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;flex-shrink:0">' + initials + '</div>' +
        '<div>' +
          '<div style="font-size:16px;font-weight:700;color:#1e293b">' + nomComplet + '</div>' +
          '<div style="font-size:12px;color:#64748b;margin-top:2px">Matricule : ' + matricule + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div style="background:#f8fafc;border-radius:10px;padding:10px">' +
          '<div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Niveau</div>' +
          '<div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-top:2px">' + niveau + '</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border-radius:10px;padding:10px">' +
          '<div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Filière</div>' +
          '<div style="font-size:13px;font-weight:600;color:#374151;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + filiere + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // Préférences notifications
    '<div style="background:#fff;border-radius:16px;border:1px solid #f1f5f9;padding:1.25rem;margin-bottom:1rem;box-shadow:0 1px 4px rgba(0,0,0,.06)">' +
      '<div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:.75rem">🔔 Notifications</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f9fafb">' +
        '<div><div style="font-size:13px;font-weight:500;color:#374151">Nouvelles notes</div><div style="font-size:11px;color:#9ca3af">Alerté quand une note est publiée</div></div>' +
        '<label style="position:relative;display:inline-block;width:42px;height:24px"><input type="checkbox" id="pref-notes" ' + (localStorage.getItem('pref_notes') !== 'false' ? 'checked' : '') + ' onchange="savePref(\'pref_notes\',this.checked)" style="opacity:0;width:0;height:0"><span style="position:absolute;inset:0;background:' + (localStorage.getItem('pref_notes') !== 'false' ? '#0f6e56' : '#e2e8f0') + ';border-radius:24px;cursor:pointer;transition:.2s" id="tog-notes"></span></label>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f9fafb">' +
        '<div><div style="font-size:13px;font-weight:500;color:#374151">Paiements en attente</div><div style="font-size:11px;color:#9ca3af">Rappels de scolarité</div></div>' +
        '<label style="position:relative;display:inline-block;width:42px;height:24px"><input type="checkbox" id="pref-paie" ' + (localStorage.getItem('pref_paie') !== 'false' ? 'checked' : '') + ' onchange="savePref(\'pref_paie\',this.checked)" style="opacity:0;width:0;height:0"><span style="position:absolute;inset:0;background:' + (localStorage.getItem('pref_paie') !== 'false' ? '#0f6e56' : '#e2e8f0') + ';border-radius:24px;cursor:pointer;transition:.2s" id="tog-paie"></span></label>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">' +
        '<div><div style="font-size:13px;font-weight:500;color:#374151">Messages école</div><div style="font-size:11px;color:#9ca3af">Nouveaux messages reçus</div></div>' +
        '<label style="position:relative;display:inline-block;width:42px;height:24px"><input type="checkbox" id="pref-msg" ' + (localStorage.getItem('pref_msg') !== 'false' ? 'checked' : '') + ' onchange="savePref(\'pref_msg\',this.checked)" style="opacity:0;width:0;height:0"><span style="position:absolute;inset:0;background:' + (localStorage.getItem('pref_msg') !== 'false' ? '#0f6e56' : '#e2e8f0') + ';border-radius:24px;cursor:pointer;transition:.2s" id="tog-msg"></span></label>' +
      '</div>' +
    '</div>' +

    // Historique connexions
    '<div style="background:#fff;border-radius:16px;border:1px solid #f1f5f9;padding:1.25rem;margin-bottom:1rem;box-shadow:0 1px 4px rgba(0,0,0,.06)">' +
      '<div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:.75rem">🕐 Historique de connexions</div>' +
      (connRows || '<div style="font-size:13px;color:#9ca3af;padding:8px 0">Aucune connexion enregistrée.</div>') +
    '</div>' +

    // Compte famille
    '<div style="background:#fff;border-radius:16px;border:1px solid #f1f5f9;padding:1.25rem;margin-bottom:5rem;box-shadow:0 1px 4px rgba(0,0,0,.06)">' +
      '<div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:.75rem">👨‍👩‍👧 Compte famille</div>' +
      '<div style="font-size:13px;color:#374151;padding:8px 0;border-bottom:1px solid #f9fafb;display:flex;justify-content:space-between">' +
        '<span style="color:#9ca3af">Contact</span><span style="font-weight:500">' + emailFam + '</span>' +
      '</div>' +
      '<button onclick="deconnexion()" style="margin-top:14px;width:100%;padding:11px;background:#fff;border:1.5px solid #fee2e2;border-radius:10px;color:#dc2626;font-size:13px;font-weight:600;cursor:pointer;font-family:Poppins,sans-serif">🚪 Se déconnecter</button>' +
    '</div>' +

    '</div>';
}

function savePref(key, val) {
  localStorage.setItem(key, val ? 'true' : 'false');
  // Mettre à jour couleur toggle visuellement
  const map = {'pref_notes':'tog-notes','pref_paie':'tog-paie','pref_msg':'tog-msg'};
  const togId = map[key];
  if (togId) {
    const tog = document.getElementById(togId);
    if (tog) tog.style.background = val ? '#0f6e56' : '#e2e8f0';
  }
}

`;

if (!h.includes(anchorJS)) { console.log('ECHEC: ancre JS B2.4 non trouvée'); process.exit(1); }
h = h.replace(anchorJS, profilFn + anchorJS);
// anchorJS est 'function afficherCertificatsPortail() {' — elle est conservée dans newJS
console.log('4. fonction afficherProfil injectée: OK');

fs.writeFileSync('edulink-portail.html', h, 'utf8');
console.log('Fichier ecrit. Patch B2.5 termine.');
