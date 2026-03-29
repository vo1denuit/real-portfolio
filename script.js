import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, orderBy, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDOtDnbLYWV6Mb06PWv6lgA80oiXS_w02k",
  authDomain: "hyeonnnii-fc7f2.firebaseapp.com",
  projectId: "hyeonnnii-fc7f2",
  storageBucket: "hyeonnnii-fc7f2.firebasestorage.app",
  messagingSenderId: "648706418160",
  appId: "1:648706418160:web:780451e978da30929ba935"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── 상태 ────────────────────────────────────────────────
let me = null;
let curBoard = null, curPost = null, editPost = null, detailUid = null;
let boards = []; // [{ id, name, type }]  Firestore에서 로드

// ── 로딩 ────────────────────────────────────────────────
function showLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }

// ── KST 날짜 ────────────────────────────────────────────
function fmt(ts) {
  const d = ts instanceof Timestamp ? ts.toDate() : (ts ? new Date(ts) : new Date());
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const date = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth()+1).padStart(2,'0')}.${String(kst.getUTCDate()).padStart(2,'0')}`;
  const time = `${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}`;
  return `${date} ${time}`;
}
function fmtNow() { return fmt(new Date()); }

// ── 로고 패널 ────────────────────────────────────────────
function toggleLogoPanel() {
  const panel = document.getElementById('logoPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
function closeLogoPanel() {
  document.getElementById('logoPanel').style.display = 'none';
}

async function loadLogoBio() {
  try {
    const snap = await getDoc(doc(db, 'config', 'logoBio'));
    if (!snap.exists()) return;
    const { bio, imgUrl } = snap.data();
    if (bio) document.getElementById('logoPanelBio').textContent = bio;
    if (imgUrl) {
      document.getElementById('logoPanelImg').src = imgUrl;
      document.getElementById('logoPanelImgWrap').style.display = 'block';
    }
  } catch(e) {}
}

function previewBioImg(url) {
  const preview = document.getElementById('bioImgPreview');
  if (url) {
    preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.innerHTML='<span style=\\'font-size:10px;color:#ccc\\'>사진</span>'">`;
  } else {
    preview.innerHTML = `<span style="font-size:10px;color:#ccc">사진</span>`;
  }
}

function uploadBioImg(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('logoBioImgUrl').value = ev.target.result;
    previewBioImg(ev.target.result);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

// ── 게시판 목록 로드 & 네비 렌더 ────────────────────────
async function loadBoards() {
  const snap = await getDoc(doc(db, 'config', 'boards'));
  if (snap.exists() && snap.data().list) {
    boards = snap.data().list;
  } else {
    // 기본 게시판
    boards = [
      { id: 'cv',        name: 'cv',       type: 'single' },
      { id: 'portfolio', name: '포트폴리오', type: 'board'  },
      { id: 'etc',       name: '...',       type: 'board'  },
      { id: 'guest',     name: '게스트',    type: 'guest'  },
    ];
    await setDoc(doc(db, 'config', 'boards'), { list: boards });
  }
  renderNav();
}

function renderNav() {
  const container = document.getElementById('navLinks');
  // 기존 동적 링크 제거 (고정 span들은 유지)
  container.querySelectorAll('.nav-board-link').forEach(el => el.remove());

  // 게시판 링크를 맨 앞에 삽입
  const fixed = container.querySelector('#navAdmin');
  boards.forEach(b => {
    const a = document.createElement('a');
    a.className = 'nav-board-link';
    a.textContent = b.name;
    a.onclick = () => goBoard(b.id);
    container.insertBefore(a, fixed);
  });
}

// ── 홈 템플릿 시스템 ─────────────────────────────────────

// ── 홈 템플릿 + 에디터 ───────────────────────────────────
const HOME_LAYOUTS = [
  {
    id: 'free', name: '전체 자유',
    preview: `<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:3px;padding:8px;justify-content:center">
      <div style="height:3px;background:#ccc;width:55%;border-radius:1px"></div>
      <div style="height:2px;background:#ddd;width:80%;border-radius:1px"></div>
      <div style="height:2px;background:#ddd;width:65%;border-radius:1px"></div>
    </div>`,
    render: (content, lh) =>
      `<div style="width:100%;height:100%;padding:40px 60px;box-sizing:border-box;line-height:${lh}">${content}</div>`
  },
  {
    id: 'split', name: '좌우 분할',
    preview: `<div style="width:100%;height:100%;display:flex">
      <div style="width:42%;background:#e0e0e0;height:100%"></div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:3px;padding:8px">
        <div style="height:3px;background:#ccc;width:70%;border-radius:1px"></div>
        <div style="height:2px;background:#ddd;width:90%;border-radius:1px"></div>
      </div>
    </div>`,
    render: (content, lh, imgUrl) =>
      `<div style="width:100%;height:100%;display:flex">
        <div style="width:42%;flex-shrink:0;overflow:hidden;background:#f0f0f0">
          ${imgUrl ? `<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover">` : ''}
        </div>
        <div style="flex:1;padding:40px 48px;box-sizing:border-box;line-height:${lh};overflow:auto">${content}</div>
      </div>`
  },
  {
    id: 'topimg', name: '상하 분할',
    preview: `<div style="width:100%;height:100%;display:flex;flex-direction:column">
      <div style="height:38%;background:#e0e0e0"></div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:3px;padding:8px">
        <div style="height:3px;background:#ccc;width:60%;border-radius:1px"></div>
        <div style="height:2px;background:#ddd;width:80%;border-radius:1px"></div>
      </div>
    </div>`,
    render: (content, lh, imgUrl) =>
      `<div style="width:100%;height:100%;display:flex;flex-direction:column">
        <div style="height:40%;flex-shrink:0;overflow:hidden;background:#f0f0f0">
          ${imgUrl ? `<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover">` : ''}
        </div>
        <div style="flex:1;padding:32px 60px;box-sizing:border-box;line-height:${lh};overflow:auto">${content}</div>
      </div>`
  },
  {
    id: 'center', name: '가운데 정렬',
    preview: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;padding:8px">
      <div style="height:3px;background:#ccc;width:40%;border-radius:1px"></div>
      <div style="height:2px;background:#ddd;width:60%;border-radius:1px"></div>
      <div style="height:2px;background:#ddd;width:50%;border-radius:1px"></div>
    </div>`,
    render: (content, lh) =>
      `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:40px 60px;box-sizing:border-box">
        <div style="max-width:600px;text-align:center;line-height:${lh}">${content}</div>
      </div>`
  },
];

let curHomeLayout = 'free';

function renderHomeTemplateGrid() {
  document.getElementById('homeTemplateGrid').innerHTML = HOME_LAYOUTS.map(t => `
    <div onclick="selectHomeLayout('${t.id}')" style="border:1px solid ${t.id===curHomeLayout?'#3a3a3a':'#e8e8e8'};cursor:pointer;transition:border 0.15s">
      <div style="height:56px;overflow:hidden">${t.preview}</div>
      <div style="font-size:10px;color:${t.id===curHomeLayout?'#3a3a3a':'#aaa'};text-align:center;padding:5px 0">${t.name}</div>
    </div>`).join('');
}

function selectHomeLayout(id) {
  curHomeLayout = id;
  renderHomeTemplateGrid();
  document.getElementById('homeSplitImgWrap').style.display = id === 'split'  ? 'flex' : 'none';
  document.getElementById('homeTopImgWrap').style.display   = id === 'topimg' ? 'flex' : 'none';
}

function handleHomeSplitImg(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { document.getElementById('homeSplitImg').value = ev.target.result; };
  reader.readAsDataURL(file); e.target.value = '';
}
function handleHomeTopImg(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { document.getElementById('homeTopImg').value = ev.target.result; };
  reader.readAsDataURL(file); e.target.value = '';
}

async function loadHome() {
  const snap = await getDoc(doc(db, 'config', 'home'));
  const el   = document.getElementById('homeContent');
  if (!snap.exists() || !snap.data().content) { el.innerHTML = ''; return; }
  const { content, lineHeight, layout, imgUrl } = snap.data();
  const tmpl = HOME_LAYOUTS.find(t => t.id === (layout||'free')) || HOME_LAYOUTS[0];
  el.innerHTML = tmpl.render(content, lineHeight||'1.6', imgUrl||'');
  el.style.cssText = 'width:100%;height:100%';
}

async function loadHomeEditor() {
  try {
    const snap = await getDoc(doc(db, 'config', 'home'));
    if (snap.exists()) {
      const { content, lineHeight, layout, imgUrl } = snap.data();
      curHomeLayout = layout || 'free';
      const area = document.getElementById('homeEditorArea');
      if (area) {
        area.innerHTML          = content || '';
        area.style.lineHeight   = lineHeight || '1.6';
        area.dataset.lineHeight = lineHeight || '1.6';
        const sel = document.getElementById('homeLineHeight');
        if (sel) sel.value = lineHeight || '1.6';
      }
      if (imgUrl) {
        document.getElementById('homeSplitImg').value = imgUrl;
        document.getElementById('homeTopImg').value   = imgUrl;
      }
    }
  } catch(e) {}

  renderHomeTemplateGrid();
  selectHomeLayout(curHomeLayout);

  try {
    const bioSnap = await getDoc(doc(db, 'config', 'logoBio'));
    if (bioSnap.exists()) {
      document.getElementById('logoBioInput').value = bioSnap.data().bio || '';
      const imgUrl = bioSnap.data().imgUrl || '';
      document.getElementById('logoBioImgUrl').value = imgUrl;
      if (imgUrl) previewBioImg(imgUrl);
    }
  } catch(e) {}
}

function homeEdCmd(cmd, val) {
  const area = document.getElementById('homeEditorArea');
  if (area) area.focus();
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, val||null);
}
function setHomeLineHeight(val) {
  const area = document.getElementById('homeEditorArea');
  if (!area) return;
  area.style.lineHeight    = val;
  area.dataset.lineHeight  = val;
}
function insertHomeImage() { document.getElementById('homeImgInput').click(); }
function handleHomeImgUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const area = document.getElementById('homeEditorArea');
    area.focus();
    document.execCommand('insertHTML', false, `<img src="${ev.target.result}" style="max-width:100%;height:auto;display:block;margin:8px 0">`);
  };
  reader.readAsDataURL(file); e.target.value = '';
}
function insertHomeVideo() {
  const url = prompt('동영상 URL을 입력하세요 (YouTube 등)'); if (!url) return;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  const embed = ytMatch
    ? `<div style="margin:8px 0"><iframe width="560" height="315" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen style="max-width:100%"></iframe></div>`
    : `<div style="margin:8px 0"><video src="${url}" controls style="max-width:100%"></video></div>`;
  const area = document.getElementById('homeEditorArea');
  area.focus(); document.execCommand('insertHTML', false, embed);
}

async function saveHomeContent() {
  const area       = document.getElementById('homeEditorArea');
  const content    = area.innerHTML.trim();
  const lineHeight = area.dataset.lineHeight || '1.6';
  const imgUrl     = curHomeLayout === 'split'  ? document.getElementById('homeSplitImg').value
                   : curHomeLayout === 'topimg' ? document.getElementById('homeTopImg').value : '';
  showLoading();
  try {
    await setDoc(doc(db,'config','home'), { content, lineHeight, layout: curHomeLayout, imgUrl });
    toast('홈 화면이 저장되었습니다.');
    await loadHome();
  } finally { hideLoading(); }
}

async function saveBio() {
  const bio    = document.getElementById('logoBioInput').value;
  const imgUrl = document.getElementById('logoBioImgUrl').value;
  showLoading();
  try {
    await setDoc(doc(db, 'config', 'logoBio'), { bio, imgUrl });
    document.getElementById('logoPanelBio').textContent = bio;
    const wrap = document.getElementById('logoPanelImgWrap');
    const img  = document.getElementById('logoPanelImg');
    if (imgUrl) { img.src = imgUrl; wrap.style.display = 'block'; }
    else wrap.style.display = 'none';
    toast('저장되었습니다.');
  } finally { hideLoading(); }
}

// ── 뷰 전환 ─────────────────────────────────────────────
const ALL_VIEWS = ['homeArea','viewList','viewPost','viewWrite','viewLock','viewSingle','viewAdmin','viewGuest'];

function show(id) {
  ALL_VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('active');
  });
  const t = document.getElementById(id);
  if (!t) return;
  t.style.display = 'flex';
  t.classList.add('active');
}

// ── 해시 네비게이션 ──────────────────────────────────────
function pushHash(hash) {
  if (location.hash !== hash) history.pushState(null, '', hash || '#');
}

function goHome() {
  curBoard = null; curPost = null; show('homeArea');
  pushHash('');
  const btn = document.getElementById('floatHomeBtn');
  if (btn) btn.style.display = 'none';
}

function goBoard(id) {
  const btn = document.getElementById('floatHomeBtn');
  if (btn) btn.style.display = '';
  const b = boards.find(x => x.id === id);
  if (!b) return;
  if (b.type === 'single') { goSingle(b); pushHash('#' + id); return; }
  if (b.type === 'guest')  { goGuest(b);  pushHash('#' + id); return; }
  curBoard = b.id; curPost = null; editPost = null;
  pushHash('#' + id);
  goList(b);
}

// ── 단일 페이지 (CV형) ───────────────────────────────────
let curSingleBoard = null;
async function goSingle(b) {
  curSingleBoard = b;
  show('viewSingle');
  document.getElementById('singleTitle').textContent = b.name;
  document.getElementById('singleEditBtn').style.display = (me && me.admin) ? '' : 'none';
  showLoading();
  try {
    const snap = await getDoc(doc(db, 'config', 'single_' + b.id));
    const content    = snap.exists() ? snap.data().content    : '';
    const lineHeight = snap.exists() ? snap.data().lineHeight : '1.9';
    const body = document.getElementById('singleBody');
    body.innerHTML    = content || '<span style="color:#ccc">아직 작성된 내용이 없습니다.</span>';
    body.style.lineHeight = lineHeight;
  } finally { hideLoading(); }
}

function startSingleEdit() {
  const content    = document.getElementById('singleBody').innerHTML;
  const lineHeight = document.getElementById('singleBody').style.lineHeight || '1.6';
  document.getElementById('singleDisplay').style.display = 'none';
  document.getElementById('singleEditor').style.display  = 'flex';
  const area = document.getElementById('singleEditorArea');
  area.innerHTML = content.includes('아직 작성된 내용이 없습니다') ? '' : content;
  area.style.lineHeight    = lineHeight;
  area.dataset.lineHeight  = lineHeight;
  // 줄간격 select 현재값 반영
  const sel = document.getElementById('singleLineHeight');
  if (sel) sel.value = lineHeight;
  area.focus();
}

async function saveSingleEdit() {
  const area    = document.getElementById('singleEditorArea');
  const content    = area.innerHTML.trim();
  const lineHeight = area.dataset.lineHeight || '1.6';
  showLoading();
  try {
    await setDoc(doc(db, 'config', 'single_' + curSingleBoard.id), { content, lineHeight });
    document.getElementById('singleDisplay').style.display = 'flex';
    document.getElementById('singleEditor').style.display  = 'none';
    document.getElementById('singleBody').innerHTML = content || '<span style="color:#ccc">아직 작성된 내용이 없습니다.</span>';
    document.getElementById('singleBody').style.lineHeight = lineHeight;
    toast('저장되었습니다.');
  } finally { hideLoading(); }
}

function cancelSingleEdit() {
  document.getElementById('singleDisplay').style.display = 'flex';
  document.getElementById('singleEditor').style.display  = 'none';
}

function edCmdSingle(cmd, val) {
  document.getElementById('singleEditorArea').focus();
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, val||null);
}
function insertSingleImage() { document.getElementById('singleImgInput').click(); }
function handleSingleImgUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { document.getElementById('singleEditorArea').focus(); document.execCommand('insertHTML', false, `<img src="${ev.target.result}" style="max-width:100%;height:auto;display:block;margin:8px 0">`); };
  reader.readAsDataURL(file); e.target.value = '';
}
function insertSingleVideo() {
  const url = prompt('동영상 URL을 입력하세요 (YouTube 등)'); if (!url) return;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  const embed = ytMatch
    ? `<div style="margin:8px 0"><iframe width="560" height="315" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen style="max-width:100%"></iframe></div>`
    : `<div style="margin:8px 0"><video src="${esc(url)}" controls style="max-width:100%"></video></div>`;
  document.getElementById('singleEditorArea').focus(); document.execCommand('insertHTML', false, embed);
}

// ── 방명록 ──────────────────────────────────────────────
let curGuestBoard = null;
async function goGuest(b) {
  curGuestBoard = b;
  curBoard = b.id;
  show('viewGuest');
  document.getElementById('guestTitle').textContent = b.name;
  if (me) document.getElementById('gbName').value = me.nick || me.id;
  showLoading();
  try { await renderGuest(); } finally { hideLoading(); }
}

async function renderGuest() {
  const colName = 'guest_' + curBoard;
  const q = query(collection(db, colName), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  document.getElementById('guestCount').textContent = snap.size + '개의 방명록';
  if (snap.empty) {
    document.getElementById('guestList').innerHTML = `<div class="gb-empty">아직 방명록이 없습니다.<br>첫 번째로 남겨보세요 :)</div>`;
    return;
  }
  let h = '';
  snap.forEach(d => {
    const e = { id: d.id, ...d.data() };
    const canSee = !e.secret || (me && me.admin) || (me && me.uid === e.uid) || sessionStorage.getItem('gbulk_'+e.id) === e.pw;
    const text   = canSee ? esc(e.text).replace(/\n/g,'<br>') : '비밀 방명록입니다.';
    const stag   = e.secret ? '<span class="gb-stag">비밀</span>' : '';
    const delBtn = (me && (me.admin || me.uid === e.uid)) ? `<button class="gb-del" onclick="deleteGuest('${e.id}')">삭제</button>` : '';
    const unlockBtn = (e.secret && !canSee) ? `<button class="gb-del" style="color:#aaa" onclick="unlockGuest('${e.id}','${esc(e.pw||'')}')">비밀번호 입력</button>` : '';
    h += `<div class="gb-item${e.secret?' is-secret':''}">
      <div class="gb-meta"><span class="gb-author">${esc(e.author)}</span><span class="gb-date">${fmt(e.createdAt)}</span>${stag}${unlockBtn}${delBtn}</div>
      <div class="gb-text">${text}</div>
    </div>`;
  });
  document.getElementById('guestList').innerHTML = h;
}

function toggleGbPw() {
  document.getElementById('gbSecret').checked
    ? document.getElementById('gbPwWrap').classList.add('on')
    : document.getElementById('gbPwWrap').classList.remove('on');
}

async function submitGuest() {
  const author = me ? (me.nick || me.id) : (document.getElementById('gbName').value.trim() || '익명');
  const text   = document.getElementById('gbText').value.trim();
  const isSec  = document.getElementById('gbSecret').checked;
  const pw     = document.getElementById('gbPw').value || '';
  if (!text) { toast('내용을 입력해주세요.'); return; }
  if (isSec && !pw) { toast('비밀번호를 입력해주세요.'); return; }
  showLoading();
  try {
    await addDoc(collection(db, 'guest_' + curBoard), {
      author, text, secret: isSec, pw: isSec ? pw : '',
      uid: me ? me.uid : null, createdAt: serverTimestamp()
    });
    document.getElementById('gbText').value = '';
    document.getElementById('gbPw').value = '';
    document.getElementById('gbSecret').checked = false;
    document.getElementById('gbPwWrap').classList.remove('on');
    toast('방명록이 등록되었습니다.');
    await renderGuest();
  } finally { hideLoading(); }
}

async function deleteGuest(id) {
  if (!confirm('삭제할까요?')) return;
  showLoading();
  try { await deleteDoc(doc(db, 'guest_' + curBoard, id)); await renderGuest(); }
  finally { hideLoading(); }
}

function unlockGuest(id, pw) {
  const input = prompt('비밀번호를 입력하세요'); if (!input) return;
  if (input === pw) { sessionStorage.setItem('gbulk_'+id, pw); renderGuest(); }
  else toast('비밀번호가 다릅니다.');
}

// ── 게시판 목록 ──────────────────────────────────────────
async function goList(b) {
  show('viewList');
  const board = b || boards.find(x=>x.id===curBoard);
  if (board) pushHash('#' + board.id);
  const bName = board ? board.name : curBoard;
  const viewMode = board?.viewMode || 'list'; // list | gallery | card
  document.getElementById('listName').textContent = bName;

  // 글쓰기 버튼
  const writeBtn = document.querySelector('#viewList .board-top button');
  if (writeBtn) {
    const adminOnly = board?.type === 'single' || board?.adminOnly;
    writeBtn.style.display = (adminOnly && !(me && me.admin)) ? 'none' : '';
  }

  showLoading();
  try {
    const q = query(collection(db, 'boards', curBoard, 'posts'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    let h = '';

    if (snap.empty) {
      h = `<div class="empty">아직 글이 없습니다.</div>`;

    } else if (viewMode === 'gallery') {
      // 전체 글 수집
      const posts = [];
      snap.forEach(d => posts.push({ id: d.id, ...d.data() }));

      // 태그 순서 (board에 저장된 tagOrder 또는 자동 추출)
      const tagOrder = board?.tagOrder || [];
      const allTags  = new Set();
      posts.forEach(p => (p.tags||[]).forEach(t => allTags.add(t)));
      // tagOrder에 없는 태그는 뒤에 추가
      const orderedTags = [
        ...tagOrder.filter(t => allTags.has(t)),
        ...[...allTags].filter(t => !tagOrder.includes(t))
      ];
      // 태그 없는 글도 표시 (기타)
      const noTagPosts = posts.filter(p => !p.tags || p.tags.length === 0);
      if (noTagPosts.length) orderedTags.push('__none__');

      const renderCard = (p) => {
        const canSee = !p.secret || isOwner(p) || sessionStorage.getItem('ulk_'+p.id) === p.secretPw;
        const title  = canSee ? esc(p.title) : '비밀글';
        const imgMatch = p.content ? p.content.match(/<img[^>]+src="([^"]+)"/) : null;
        const thumb = imgMatch ? imgMatch[1] : '';
        const adminOnly = board?.adminOnly || board?.type === 'single';
        return `<div class="gallery-card" onclick="openPost('${p.id}')">
          <div class="gallery-thumb" style="${thumb ? `background-image:url('${thumb}')` : ''}">
            ${!thumb ? `<svg class="gallery-thumb-empty" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>` : ''}
            ${p.secret ? '<span class="gallery-lock">🔒</span>' : ''}
          </div>
          <div class="gallery-info">
            <div class="gallery-title">${title}</div>
            ${adminOnly ? '' : `<div class="gallery-meta">${fmt(p.createdAt)}</div>`}
          </div>
        </div>`;
      };

      h = '';
      orderedTags.forEach(tag => {
        const tagPosts = tag === '__none__'
          ? noTagPosts
          : posts.filter(p => (p.tags||[]).includes(tag));
        if (!tagPosts.length) return;
        const tagLabel = tag === '__none__' ? '기타' : esc(tag);
        h += `<div class="gallery-group">
          <div class="gallery-group-title">${tagLabel}</div>
          <div class="post-gallery">${tagPosts.map(renderCard).join('')}</div>
        </div>`;
      });

    } else if (viewMode === 'card') {
      // ── 카드형 ──
      h = `<div class="post-cards">`;
      snap.forEach(d => {
        const p = { id: d.id, ...d.data() };
        const canSee = !p.secret || isOwner(p) || sessionStorage.getItem('ulk_'+p.id) === p.secretPw;
        const title   = canSee ? esc(p.title) : '비밀글입니다.';
        const preview = canSee && p.content
          ? p.content.replace(/<[^>]+>/g, '').slice(0, 80) + (p.content.length > 80 ? '...' : '')
          : '';
        h += `<div class="post-card" onclick="openPost('${p.id}')">
          <div class="card-title">${p.secret ? '🔒 ' : ''}${title}</div>
          ${preview ? `<div class="card-preview">${esc(preview)}</div>` : ''}
          <div class="card-meta">${esc(p.author)} · ${fmt(p.createdAt)} · 조회 ${p.views||0}</div>
        </div>`;
      });
      h += `</div>`;

    } else {
      // ── 목록형 (기본) ──
      const adminOnly = board?.adminOnly || board?.type === 'single';
      h = `<div class="list-head">
        <span class="col-num">번호</span><span class="col-title">제목</span>
        ${adminOnly ? '' : '<span class="col-author">작성자</span>'}<span class="col-date">날짜</span>
      </div>`;
      let num = snap.size;
      snap.forEach(d => {
        const p = { id: d.id, ...d.data() };
        const canSee = !p.secret || isOwner(p) || sessionStorage.getItem('ulk_'+p.id) === p.secretPw;
        const title  = canSee ? esc(p.title) : '비밀글입니다.';
        const cls    = p.secret ? 'col-title secret' : 'col-title';
        h += `<div class="post-row" onclick="openPost('${p.id}')">
          <span class="col-num">${num--}</span>
          <span class="${cls}">${title}</span>
          ${adminOnly ? '' : `<span class="col-author">${esc(p.author)}</span>`}
          <span class="col-date">${fmt(p.createdAt)}</span>
        </div>`;
      });
    }

    document.getElementById('postList').innerHTML = h;
  } finally { hideLoading(); }
}

// ── 글 보기 ─────────────────────────────────────────────
async function openPost(pid) {
  curPost = pid;
  pushHash('#' + curBoard + '/' + pid);
  showLoading();
  try {
    const snap = await getDoc(doc(db, 'boards', curBoard, 'posts', pid));
    if (!snap.exists()) return;
    const p = { id: snap.id, ...snap.data() };
    if (p.secret && !isOwner(p) && sessionStorage.getItem('ulk_'+pid) !== p.secretPw) {
      show('viewLock'); hideLoading(); return;
    }
    await updateDoc(doc(db, 'boards', curBoard, 'posts', pid), { views: (p.views||0)+1 });
    show('viewPost');
    document.getElementById('pvTitle').textContent = (p.secret?'🔒 ':'')+p.title;
    const board = boards.find(x => x.id === curBoard);
    const adminOnly = board?.adminOnly || board?.type === 'single';
    document.getElementById('pvMeta').innerHTML = `
      ${adminOnly ? '' : `<span>${esc(p.author)}</span>`}
      <span>${fmt(p.createdAt)}</span>
      <span>조회 ${(p.views||0)+1}</span>`;
    document.getElementById('pvBody').innerHTML = p.content || '';
    document.getElementById('pvBody').style.lineHeight = p.lineHeight || '1.6';
    // 태그 표시
    const tagsHtml = (p.tags||[]).length
      ? `<div class="post-tags">${p.tags.map(t=>`<span class="post-tag">${esc(t)}</span>`).join('')}</div>`
      : '';
    document.getElementById('pvBody').insertAdjacentHTML('afterend', tagsHtml);
    let acts = `<button onclick="goList()">목록</button>`;
    if (isOwner(p)) {
      acts += `<button onclick="goEdit('${pid}')">수정</button>`;
      acts += `<button onclick="delPost('${pid}')">삭제</button>`;
    }
    document.getElementById('pvActions').innerHTML = acts;
    await renderCmts(pid);
  } finally { hideLoading(); }
}

async function renderCmts(pid) {
  const q = query(collection(db, 'boards', curBoard, 'posts', pid, 'comments'), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  let h = `<div class="cmt-label">댓글 ${snap.size}</div>`;
  snap.forEach(d => {
    const c = { id: d.id, ...d.data() };
    const canSee = !c.secret || (me && (me.uid===c.uid||me.admin));
    const text   = canSee ? esc(c.text).replace(/\n/g,'<br>') : '비밀댓글입니다.';
    const tag    = c.secret ? '<span class="cmt-stag">비밀</span>' : '';
    const del    = (me && (me.uid===c.uid||me.admin)) ? `<button class="cmt-del" onclick="delCmt('${c.id}')">삭제</button>` : '';
    h += `<div class="cmt-item${c.secret?' is-secret':''}">
      <div class="cmt-meta"><span class="cmt-author">${esc(c.author)}</span><span class="cmt-date">${fmt(c.createdAt)}</span>${tag}${del}</div>
      <div class="cmt-text">${text}</div>
    </div>`;
  });
  const nameF = !me ? `<input type="text" id="cmtName" placeholder="이름">` : '';
  h += `<div class="cmt-form">
    <div class="cmt-inputs">${nameF}<label class="cmt-secret-label"><input type="checkbox" id="cmtSec"> 비밀댓글</label></div>
    <textarea class="cmt-textarea" id="cmtTxt" placeholder="댓글을 남겨주세요" rows="2"></textarea>
    <div class="cmt-submit-row"><button onclick="submitCmt()">등록</button></div>
  </div>`;
  document.getElementById('pvComments').innerHTML = h;
}

async function submitCmt() {
  const text = document.getElementById('cmtTxt').value.trim();
  if (!text) { toast('댓글을 입력해주세요.'); return; }
  const isSec  = document.getElementById('cmtSec').checked;
  const author = me ? (me.nick || me.id) : (document.getElementById('cmtName')?.value.trim()||'익명');
  showLoading();
  try {
    await addDoc(collection(db, 'boards', curBoard, 'posts', curPost, 'comments'), {
      author, text, secret: isSec, uid: me?me.uid:null, createdAt: serverTimestamp()
    });
    toast('등록되었습니다.'); await renderCmts(curPost);
  } finally { hideLoading(); }
}

async function delCmt(cid) {
  if (!confirm('삭제할까요?')) return;
  showLoading();
  try { await deleteDoc(doc(db,'boards',curBoard,'posts',curPost,'comments',cid)); await renderCmts(curPost); }
  finally { hideLoading(); }
}

async function doUnlock() {
  const snap = await getDoc(doc(db, 'boards', curBoard, 'posts', curPost));
  const pw = document.getElementById('lockPw').value;
  if (pw === snap.data().secretPw) { sessionStorage.setItem('ulk_'+curPost, pw); openPost(curPost); }
  else document.getElementById('lockErr').textContent = '비밀번호가 다릅니다.';
}

// ── 에디터 ──────────────────────────────────────────────
function goWrite() {
  editPost = null; show('viewWrite');
  document.getElementById('writeLbl').textContent = '글쓰기';
  renderWF();
}

async function goEdit(pid) {
  showLoading();
  try {
    const snap = await getDoc(doc(db, 'boards', curBoard, 'posts', pid));
    editPost = { id: snap.id, ...snap.data() };
    show('viewWrite');
    document.getElementById('writeLbl').textContent = '수정';
    renderWF(editPost);
  } finally { hideLoading(); }
}

function renderWF(p) {
  const nf = !me ? `<div class="wf-row"><span class="wf-label">이름</span><input class="wf-input" id="wfA" value="${p?esc(p.author):''}"></div>` : '';
  const sc = p && p.secret ? 'checked' : '';
  const pv = p && p.secretPw ? esc(p.secretPw) : '';
  const lh = p && p.lineHeight ? p.lineHeight : '1.6';
  document.getElementById('writeBody').innerHTML = `
    ${nf}
    <div class="wf-row"><span class="wf-label">제목</span><input class="wf-input" id="wfT" value="${p?esc(p.title):''}"></div>
    <div class="editor-toolbar">
      <select id="edFontSize" onchange="edCmd('fontSize',this.value)">
        <option value="1">아주 작게</option><option value="2">작게</option>
        <option value="3" selected>보통</option><option value="4">크게</option>
        <option value="5">아주 크게</option><option value="6">제목</option><option value="7">큰 제목</option>
      </select>
      <div class="tb-divider"></div>
      <select id="edLineHeight" onchange="setLineHeight(this.value)" title="줄간격">
        <option value="1">1배</option>
        <option value="1.4">1.4배</option>
        <option value="1.6">1.6배</option>
        <option value="1.9">1.9배</option>
        <option value="2.2">2.2배</option>
        <option value="2.5">2.5배</option>
        <option value="3">3배</option>
      </select>
      <div class="tb-divider"></div>
      <button class="tb-btn" onclick="edCmd('bold')"><b>B</b></button>
      <button class="tb-btn" onclick="edCmd('italic')"><i>I</i></button>
      <button class="tb-btn" onclick="edCmd('underline')"><u>U</u></button>
      <button class="tb-btn" onclick="edCmd('strikeThrough')"><s>S</s></button>
      <div class="tb-divider"></div>
      <button class="tb-btn" onclick="edCmd('justifyLeft')">≡</button>
      <button class="tb-btn" onclick="edCmd('justifyCenter')">☰</button>
      <button class="tb-btn" onclick="edCmd('justifyRight')">≡</button>
      <div class="tb-divider"></div>
      <button class="tb-btn" onclick="insertImage()">🖼</button>
      <button class="tb-btn" onclick="insertVideo()">▶</button>
      <button class="tb-btn" onclick="insertFile()">📎</button>
      <input type="file" id="edImgInput" accept="image/*" style="display:none" onchange="handleImgUpload(event)">
      <input type="file" id="edFileInput" style="display:none" onchange="handleFileUpload(event)">
    </div>
    <div class="editor-area" id="edArea" contenteditable="true" style="line-height:${lh}" data-line-height="${lh}">${p?p.content:''}</div>
    <div class="wf-options">
      <label class="wf-secret-label"><input type="checkbox" id="wfSec" ${sc} onchange="togglePw()"> 비밀글</label>
      <div class="wf-pw-wrap ${p&&p.secret?'on':''}" id="wfPwW">
        <span>비밀번호</span><input type="password" id="wfPw" value="${pv}">
      </div>
    </div>
    <div class="wf-row" style="margin-top:8px">
      <span class="wf-label" style="color:#bbb;font-size:11px">태그</span>
      <input class="wf-input" id="wfTags" placeholder="디자인, 개발, 일러스트 (쉼표로 구분)" value="${p&&p.tags ? esc(p.tags.join(', ')) : ''}">
    </div>
    <div class="wf-submit-row">
      <button onclick="goList()">취소</button>
      <button class="btn-ok" onclick="submitWF()">${editPost?'수정':'등록'}</button>
    </div>`;

  // 줄간격 select 현재값 반영
  const lhSel = document.getElementById('edLineHeight');
  if (lhSel) lhSel.value = lh;
}

function setLineHeight(val) {
  const area = document.getElementById('edArea');
  if (!area) return;
  area.style.lineHeight = val;
  area.dataset.lineHeight = val;
}

function setSingleLineHeight(val) {
  const area = document.getElementById('singleEditorArea');
  if (!area) return;
  area.style.lineHeight = val;
  area.dataset.lineHeight = val;
}
function edCmd(cmd, val) {
  const area = document.getElementById('edArea');
  if (area) area.focus();
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, val||null);
}
function insertImage() { document.getElementById('edImgInput').click(); }
function handleImgUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { document.getElementById('edArea').focus(); document.execCommand('insertHTML', false, `<img src="${ev.target.result}" style="max-width:100%;height:auto;display:block;margin:8px 0">`); };
  reader.readAsDataURL(file); e.target.value = '';
}
function insertVideo() {
  const url = prompt('동영상 URL을 입력하세요 (YouTube 등)'); if (!url) return;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  const embed = ytMatch
    ? `<div style="margin:8px 0"><iframe width="560" height="315" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen style="max-width:100%"></iframe></div>`
    : `<div style="margin:8px 0"><video src="${esc(url)}" controls style="max-width:100%"></video></div>`;
  document.getElementById('edArea').focus(); document.execCommand('insertHTML', false, embed);
}
function insertFile() { document.getElementById('edFileInput').click(); }
function handleFileUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const link = `<div style="margin:4px 0;padding:8px 12px;background:#f5f5f5;display:inline-block;font-size:12px">📎 <a href="${ev.target.result}" download="${esc(file.name)}">${esc(file.name)}</a> <span style="color:#bbb;font-size:11px">(${(file.size/1024).toFixed(1)}KB)</span></div>`;
    document.getElementById('edArea').focus(); document.execCommand('insertHTML', false, link);
  };
  reader.readAsDataURL(file); e.target.value = '';
}
function togglePw() {
  document.getElementById('wfSec').checked
    ? document.getElementById('wfPwW').classList.add('on')
    : document.getElementById('wfPwW').classList.remove('on');
}

async function submitWF() {
  const board = boards.find(x=>x.id===curBoard);
  if ((board?.adminOnly || board?.type === 'single') && !(me && me.admin)) {
    toast('관리자만 글을 작성할 수 있습니다.'); return;
  }
  const title      = document.getElementById('wfT').value.trim();
  const content    = document.getElementById('edArea').innerHTML.trim();
  const lineHeight = document.getElementById('edArea').dataset.lineHeight || '1.6';
  const isSec      = document.getElementById('wfSec').checked;
  const sPw        = document.getElementById('wfPw')?.value || '';
  const tagsRaw    = document.getElementById('wfTags')?.value || '';
  const tags       = tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);
  if (!title)        { toast('제목을 입력해주세요.'); return; }
  if (!content || content==='<br>') { toast('내용을 입력해주세요.'); return; }
  if (isSec && !sPw) { toast('비밀번호를 입력해주세요.'); return; }
  const author = me ? (me.nick || me.id) : (document.getElementById('wfA')?.value.trim()||'익명');
  showLoading();
  try {
    if (editPost) {
      await updateDoc(doc(db,'boards',curBoard,'posts',editPost.id), { title, content, lineHeight, tags, secret:isSec, secretPw:isSec?sPw:'' });
      toast('수정되었습니다.'); curPost = editPost.id; editPost = null; openPost(curPost);
    } else {
      await addDoc(collection(db,'boards',curBoard,'posts'), {
        title, content, lineHeight, tags, author, secret:isSec, secretPw:isSec?sPw:'',
        uid: me?me.uid:null, views:0, createdAt: serverTimestamp()
      });
      toast('등록되었습니다.'); goList();
    }
  } finally { hideLoading(); }
}

async function delPost(pid) {
  if (!confirm('삭제할까요?')) return;
  showLoading();
  try { await deleteDoc(doc(db,'boards',curBoard,'posts',pid)); toast('삭제되었습니다.'); goList(); }
  finally { hideLoading(); }
}

// ── 관리자 ──────────────────────────────────────────────
async function goAdmin() {
  if (!me?.admin) { toast('관리자만 접근할 수 있습니다.'); return; }
  show('viewAdmin');
  showAdminTab('users');
}

function showAdminTab(tab) {
  ['users','boards','posts','home'].forEach(t => {
    const el = document.getElementById('adminTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById('adminTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (target) { target.style.display = 'flex'; target.style.flexDirection = 'column'; }

  if (tab === 'users')  renderAdmin();
  if (tab === 'boards') renderBoardManage();
  if (tab === 'posts')  initAdminPosts();
  if (tab === 'home')   loadHomeEditor();
}

// ── 관리자 글 관리 ───────────────────────────────────────
async function initAdminPosts() {
  // 게시판 셀렉트 채우기
  const sel = document.getElementById('adminPostBoardSel');
  sel.innerHTML = '<option value="">게시판 선택</option>';
  boards.filter(b => b.type === 'board' || b.type === 'single').forEach(b => {
    sel.innerHTML += `<option value="${esc(b.id)}">${esc(b.name)}</option>`;
  });
  // 방명록도 추가
  boards.filter(b => b.type === 'guest').forEach(b => {
    sel.innerHTML += `<option value="guest_${esc(b.id)}">${esc(b.name)} (방명록)</option>`;
  });
  document.getElementById('adminPostList').innerHTML = '';
  document.getElementById('adminPostCount').textContent = '';
}

async function loadAdminPosts() {
  const sel   = document.getElementById('adminPostBoardSel');
  const val   = sel.value;
  if (!val) return;
  showLoading();
  try {
    const isGuest = val.startsWith('guest_');
    const colPath = isGuest ? val : `boards/${val}/posts`;
    const q = isGuest
      ? query(collection(db, colPath), orderBy('createdAt', 'desc'))
      : query(collection(db, 'boards', val, 'posts'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    document.getElementById('adminPostCount').textContent = `${snap.size}개`;

    if (snap.empty) {
      document.getElementById('adminPostList').innerHTML = `<div class="empty">글이 없습니다.</div>`;
      return;
    }

    let h = `<div class="list-head">
      <span class="col-title">${isGuest ? '내용' : '제목'}</span>
      <span class="col-author">작성자</span>
      <span class="col-date">날짜</span>
      <span style="width:80px;text-align:right;font-size:11px;color:#aaa;flex-shrink:0">관리</span>
    </div>`;

    snap.forEach(d => {
      const p = { id: d.id, ...d.data() };
      const title = isGuest
        ? esc(p.text||'').slice(0,40) + (p.text?.length > 40 ? '...' : '')
        : esc(p.title||'');
      h += `<div class="post-row" style="cursor:default">
        <span class="col-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.secret?'🔒 ':''}${title}</span>
        <span class="col-author">${esc(p.author||'')}</span>
        <span class="col-date">${fmt(p.createdAt)}</span>
        <span style="width:80px;flex-shrink:0;display:flex;justify-content:flex-end;gap:10px">
          ${!isGuest ? `<button onclick="adminEditPost('${val}','${p.id}')" style="font-size:11px;color:#aaa;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:300">수정</button>` : ''}
          <button onclick="adminDelPost('${val}','${p.id}','${isGuest}')" style="font-size:11px;color:#aaa;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:300">삭제</button>
        </span>
      </div>`;
    });
    document.getElementById('adminPostList').innerHTML = h;
  } finally { hideLoading(); }
}

async function adminDelPost(boardId, postId, isGuest) {
  if (!confirm('삭제할까요?')) return;
  showLoading();
  try {
    if (isGuest === 'true') {
      await deleteDoc(doc(db, boardId, postId));
    } else {
      await deleteDoc(doc(db, 'boards', boardId, 'posts', postId));
    }
    toast('삭제되었습니다.');
    await loadAdminPosts();
  } finally { hideLoading(); }
}

async function adminEditPost(boardId, postId) {
  curBoard = boardId;
  await goEdit(postId);
}

async function renderAdmin() {
  const snap = await getDocs(collection(db, 'users'));
  document.getElementById('adminUserCount').textContent = `회원 ${snap.size}명`;
  let h = `<div class="admin-head"><span>아이디</span><span>권한</span><span>가입일</span><span></span></div>`;
  snap.forEach(d => {
    const u = { uid: d.id, ...d.data() };
    const isMe = u.uid === me.uid;
    h += `<div class="admin-row">
      <span class="admin-id">${esc(u.nick||u.id||'')}</span>
      <span class="admin-role">${u.admin?'관리자':'회원'}</span>
      <span class="admin-date">${u.joinDate||'-'}</span>
      <span class="admin-actions">
        <button onclick="openUserDetail('${u.uid}')">상세</button>
        ${!isMe?`<button onclick="toggleAdmin('${u.uid}',${!u.admin})">${u.admin?'권한 해제':'관리자 지정'}</button>`:''}
        ${!isMe?`<button onclick="deleteUser('${u.uid}')">삭제</button>`:''}
      </span>
    </div>`;
  });
  document.getElementById('adminUserList').innerHTML = h;
}

async function toggleAdmin(uid, val) {
  showLoading();
  try { await updateDoc(doc(db,'users',uid), { admin: val }); toast('권한이 변경되었습니다.'); await renderAdmin(); }
  finally { hideLoading(); }
}

async function deleteUser(uid) {
  if (!confirm('계정을 삭제할까요?')) return;
  showLoading();
  try { await deleteDoc(doc(db,'users',uid)); toast('삭제되었습니다.'); await renderAdmin(); }
  finally { hideLoading(); }
}

async function openUserDetail(uid) {
  detailUid = uid;
  const snap = await getDoc(doc(db,'users',uid));
  const u = snap.data();
  showModalPane('pUserDetail');
  document.getElementById('udId').value    = u.id||'';
  document.getElementById('udNick').value  = u.nick||u.id||'';
  document.getElementById('udEmail').value = u.email||'';
  document.getElementById('udDate').value  = u.joinDate||'-';
  document.getElementById('udRole').value  = u.admin?'관리자':'일반 회원';
  document.getElementById('udErr').textContent = '';
  document.getElementById('udToggleAdminBtn').textContent = u.admin?'관리자 권한 해제':'관리자 지정';
  openModalRaw();
}

async function saveUserDetail() {
  const nick = document.getElementById('udNick').value.trim();
  if (!nick) { document.getElementById('udErr').textContent = '이름을 입력해주세요.'; return; }
  showLoading();
  try {
    await updateDoc(doc(db,'users',detailUid), { nick });
    toast('이름이 변경되었습니다.'); closeModal(); await renderAdmin();
  } finally { hideLoading(); }
}

async function toggleAdminFromDetail() {
  const snap = await getDoc(doc(db,'users',detailUid));
  const cur = snap.data()?.admin || false;
  showLoading();
  try { await updateDoc(doc(db,'users',detailUid), { admin: !cur }); toast('권한이 변경되었습니다.'); closeModal(); await renderAdmin(); }
  finally { hideLoading(); }
}

// ── 게시판 관리 ──────────────────────────────────────────
async function renderBoardManage() {
  const typeLabel    = { board: '게시판', guest: '방명록', single: '단일 페이지' };
  const viewModeLabel= { list: '목록형', gallery: '갤러리형', card: '카드형' };
  let h = `<div class="admin-head"><span>ID</span><span>이름</span><span>종류</span><span></span></div>`;
  boards.forEach((b, i) => {
    const adminTag = b.adminOnly ? ' <span style="font-size:10px;color:#aaa">(관리자전용)</span>' : '';
    const modeLabel = viewModeLabel[b.viewMode||'list'];
    h += `<div class="admin-row" id="boardRow_${i}">
      <span class="admin-id" id="boardId_${i}">${esc(b.id)}</span>
      <span class="admin-role" id="boardName_${i}">${esc(b.name)}${adminTag}</span>
      <span class="admin-date">${typeLabel[b.type]||b.type}</span>
      <span class="admin-actions">
        <button onclick="startEditBoard(${i})">수정</button>
        ${b.type !== 'guest' && b.type !== 'single' ? `<button onclick="cycleViewMode(${i})">${modeLabel}</button>` : ''}
        ${b.viewMode === 'gallery' ? `<button onclick="openTagOrder(${i})">태그순서</button>` : ''}
        <button onclick="toggleAdminOnly(${i})">${b.adminOnly ? '전체공개' : '관리자전용'}</button>
        ${i > 0 ? `<button onclick="moveBoardUp(${i})">↑</button>` : ''}
        ${i < boards.length-1 ? `<button onclick="moveBoardDown(${i})">↓</button>` : ''}
        <button onclick="deleteBoard('${b.id}')">삭제</button>
      </span>
    </div>`;
  });
  document.getElementById('boardManageList').innerHTML = h;
}

function startEditBoard(i) {
  const b = boards[i];
  const row = document.getElementById('boardRow_' + i);
  row.innerHTML = `
    <span class="admin-id"><input type="text" id="editBoardId_${i}" value="${esc(b.id)}" style="border:none;border-bottom:1px solid #ccc;font-size:13px;font-family:inherit;font-weight:300;outline:none;width:80px;background:transparent"></span>
    <span class="admin-role"><input type="text" id="editBoardName_${i}" value="${esc(b.name)}" style="border:none;border-bottom:1px solid #ccc;font-size:13px;font-family:inherit;font-weight:300;outline:none;width:80px;background:transparent"></span>
    <span class="admin-date" id="editBoardErr_${i}" style="font-size:11px;color:#c00"></span>
    <span class="admin-actions">
      <button onclick="saveEditBoard(${i})">저장</button>
      <button onclick="renderBoardManage()">취소</button>
    </span>`;
  document.getElementById('editBoardId_' + i).focus();
}

async function saveEditBoard(i) {
  const newId   = document.getElementById('editBoardId_' + i).value.trim();
  const newName = document.getElementById('editBoardName_' + i).value.trim();
  const errEl   = document.getElementById('editBoardErr_' + i);

  if (!newId || !/^[a-zA-Z0-9_]+$/.test(newId)) { errEl.textContent = 'ID는 영문/숫자/밑줄만 가능'; return; }
  if (!newName) { errEl.textContent = '이름을 입력해주세요.'; return; }
  if (newId !== boards[i].id && boards.find((b,idx) => b.id === newId && idx !== i)) {
    errEl.textContent = '이미 존재하는 ID입니다.'; return;
  }

  boards[i].id   = newId;
  boards[i].name = newName;
  await saveBoards();
  renderNav();
  renderBoardManage();
  toast('게시판이 수정되었습니다.');
}

async function moveBoardUp(i) {
  [boards[i-1], boards[i]] = [boards[i], boards[i-1]];
  await saveBoards(); renderBoardManage();
}
async function moveBoardDown(i) {
  [boards[i], boards[i+1]] = [boards[i+1], boards[i]];
  await saveBoards(); renderBoardManage();
}
async function deleteBoard(id) {
  if (!confirm(`"${id}" 게시판을 삭제할까요?\n게시판 설정만 삭제되고 데이터는 Firestore에 남아있어요.`)) return;
  boards = boards.filter(b => b.id !== id);
  await saveBoards(); renderBoardManage(); renderNav();
  toast('게시판이 삭제되었습니다.');
}

function openAddBoard() { showModalPane('pAddBoard'); document.getElementById('addBoardErr').textContent=''; openModalRaw(); }

async function submitAddBoard() {
  const id       = document.getElementById('newBoardId').value.trim();
  const name     = document.getElementById('newBoardName').value.trim();
  const type     = document.getElementById('newBoardType').value;
  const adminOnly= document.getElementById('newBoardAdminOnly').checked;
  if (!id || !/^[a-zA-Z0-9_]+$/.test(id)) { document.getElementById('addBoardErr').textContent = 'ID는 영문/숫자/밑줄만 가능합니다.'; return; }
  if (!name) { document.getElementById('addBoardErr').textContent = '이름을 입력해주세요.'; return; }
  if (boards.find(b => b.id === id)) { document.getElementById('addBoardErr').textContent = '이미 존재하는 ID입니다.'; return; }
  boards.push({ id, name, type, adminOnly });
  await saveBoards();
  renderNav(); renderBoardManage();
  closeModal(); toast(`"${name}" 게시판이 추가되었습니다.`);
}

async function cycleViewMode(i) {
  const modes = ['list', 'gallery', 'card'];
  const cur   = boards[i].viewMode || 'list';
  boards[i].viewMode = modes[(modes.indexOf(cur) + 1) % modes.length];
  await saveBoards();
  renderBoardManage();
  toast(`"${boards[i].name}" 게시판이 ${({list:'목록형',gallery:'갤러리형',card:'카드형'})[boards[i].viewMode]}으로 변경됐어요.`);
}

async function openTagOrder(i) {
  const b = boards[i];
  // 해당 게시판의 모든 태그 수집
  showLoading();
  try {
    const snap = await getDocs(collection(db, 'boards', b.id, 'posts'));
    const allTags = new Set();
    snap.forEach(d => (d.data().tags||[]).forEach(t => allTags.add(t)));
    if (!allTags.size) { toast('아직 태그가 없어요.'); return; }

    const tagOrder = b.tagOrder || [...allTags];
    const ordered  = [...tagOrder.filter(t=>allTags.has(t)), ...[...allTags].filter(t=>!tagOrder.includes(t))];

    // 인라인 편집 UI
    const row = document.getElementById('boardRow_' + i);
    let tagHtml = `<div style="padding:12px 0;display:flex;flex-direction:column;gap:6px" id="tagOrderWrap_${i}">
      <div style="font-size:11px;color:#aaa;margin-bottom:4px">태그 순서 (드래그하여 순서 변경)</div>
      <div id="tagList_${i}" style="display:flex;flex-direction:column;gap:4px">`;
    ordered.forEach((tag, ti) => {
      tagHtml += `<div class="tag-order-item" data-tag="${esc(tag)}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#f9f9f9;cursor:move">
        <span style="font-size:11px;color:#aaa;width:16px">${ti+1}</span>
        <span style="font-size:12px;color:#3a3a3a;flex:1">${esc(tag)}</span>
        ${ti > 0 ? `<button onclick="moveTagUp(${i},${ti})" style="font-size:11px;color:#aaa;background:none;border:none;cursor:pointer">↑</button>` : '<span style="width:20px"></span>'}
        ${ti < ordered.length-1 ? `<button onclick="moveTagDown(${i},${ti})" style="font-size:11px;color:#aaa;background:none;border:none;cursor:pointer">↓</button>` : '<span style="width:20px"></span>'}
      </div>`;
    });
    tagHtml += `</div>
      <div style="display:flex;gap:12px;margin-top:6px">
        <button onclick="saveTagOrder(${i})" style="font-size:11px;color:#3a3a3a;background:none;border:none;cursor:pointer;font-family:inherit">저장</button>
        <button onclick="renderBoardManage()" style="font-size:11px;color:#aaa;background:none;border:none;cursor:pointer;font-family:inherit">취소</button>
      </div>
    </div>`;

    row.insertAdjacentHTML('afterend', tagHtml);
    // 임시 저장용
    row.dataset.tagOrderIdx = i;
  } finally { hideLoading(); }
}

function moveTagUp(boardIdx, tagIdx) {
  const wrap = document.getElementById('tagList_' + boardIdx);
  const items = [...wrap.querySelectorAll('.tag-order-item')];
  if (tagIdx === 0) return;
  wrap.insertBefore(items[tagIdx], items[tagIdx-1]);
  refreshTagNumbers(boardIdx);
}

function moveTagDown(boardIdx, tagIdx) {
  const wrap = document.getElementById('tagList_' + boardIdx);
  const items = [...wrap.querySelectorAll('.tag-order-item')];
  if (tagIdx >= items.length-1) return;
  wrap.insertBefore(items[tagIdx+1], items[tagIdx]);
  refreshTagNumbers(boardIdx);
}

function refreshTagNumbers(boardIdx) {
  const items = document.querySelectorAll(`#tagList_${boardIdx} .tag-order-item`);
  items.forEach((item, i) => {
    item.querySelector('span:first-child').textContent = i+1;
    const btns = item.querySelectorAll('button');
    if (btns[0]) btns[0].setAttribute('onclick', `moveTagUp(${boardIdx},${i})`);
    if (btns[1]) btns[1].setAttribute('onclick', `moveTagDown(${boardIdx},${i})`);
  });
}

async function saveTagOrder(boardIdx) {
  const items = document.querySelectorAll(`#tagList_${boardIdx} .tag-order-item`);
  const tagOrder = [...items].map(el => el.dataset.tag);
  boards[boardIdx].tagOrder = tagOrder;
  await saveBoards();
  toast('태그 순서가 저장됐어요.');
  renderBoardManage();
}

async function toggleAdminOnly(i) {
  boards[i].adminOnly = !boards[i].adminOnly;
  await saveBoards();
  renderBoardManage();
  toast(boards[i].adminOnly ? '관리자 전용으로 변경됐어요.' : '전체 공개로 변경됐어요.');
}

async function saveBoards() {
  await setDoc(doc(db, 'config', 'boards'), { list: boards });
}

// ── 내 정보 ─────────────────────────────────────────────
function openMyInfo() {
  showModalPane('pMyInfo');
  document.getElementById('myId').value   = me.id;
  document.getElementById('myNick').value = me.nick || me.id;
  document.getElementById('myOldPw').value  = '';
  document.getElementById('myNewPw').value  = '';
  document.getElementById('myNewPw2').value = '';
  document.getElementById('myErr').textContent = '';
  openModalRaw();
}

async function saveMyInfo() {
  const nick   = document.getElementById('myNick').value.trim();
  const oldPw  = document.getElementById('myOldPw').value;
  const newPw  = document.getElementById('myNewPw').value;
  const newPw2 = document.getElementById('myNewPw2').value;
  const errEl  = document.getElementById('myErr');
  errEl.textContent = '';

  if (!nick) { errEl.textContent = '이름을 입력해주세요.'; return; }

  // 비밀번호 변경 유효성 검사 (입력한 경우만)
  if (newPw || newPw2 || oldPw) {
    if (!oldPw)           { errEl.textContent = '현재 비밀번호를 입력해주세요.'; return; }
    if (newPw.length < 6) { errEl.textContent = '새 비밀번호는 6자 이상이어야 합니다.'; return; }
    if (newPw !== newPw2) { errEl.textContent = '새 비밀번호가 일치하지 않습니다.'; return; }
  }

  showLoading();
  try {
    // 닉네임 저장
    await updateDoc(doc(db, 'users', me.uid), { nick });
    me.nick = nick;
    updateNav();

    // 비밀번호 변경
    if (newPw) {
      const user = auth.currentUser;
      const cred = EmailAuthProvider.credential(user.email, oldPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
    }

    toast('저장되었습니다.'); closeModal();
  } catch(e) {
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
      errEl.textContent = '현재 비밀번호가 올바르지 않습니다.';
    } else {
      errEl.textContent = '저장 중 오류가 발생했습니다: ' + e.message;
    }
  } finally { hideLoading(); }
}

// ── 인증 ────────────────────────────────────────────────
function showModalPane(id) {
  ['pLogin','pReg','pMyInfo','pUserDetail','pAddBoard'].forEach(p => document.getElementById(p).style.display='none');
  document.getElementById(id).style.display = 'block';
}
function openModal()    { showModalPane('pLogin'); openModalRaw(); setTimeout(()=>document.getElementById('liId').focus(),50); }
function openModalRaw() { document.getElementById('overlay').classList.add('on'); }
function closeModal()   { document.getElementById('overlay').classList.remove('on'); }
function toReg() { showModalPane('pReg'); }
function toLi()  { showModalPane('pLogin'); }

async function doLogin() {
  const id = document.getElementById('liId').value.trim();
  const pw = document.getElementById('liPw').value;
  document.getElementById('liErr').textContent = '';
  showLoading();
  try {
    const snap = await getDocs(collection(db,'users'));
    let email = null;
    snap.forEach(d => { if (d.data().id === id) email = d.data().email; });
    if (!email) { document.getElementById('liErr').textContent = '아이디를 찾을 수 없습니다.'; return; }
    await signInWithEmailAndPassword(auth, email, pw);
    closeModal(); toast(`${id}님 환영합니다.`);
  } catch(e) {
    document.getElementById('liErr').textContent = '아이디 또는 비밀번호를 확인하세요.';
  } finally { hideLoading(); }
}

async function doReg() {
  const id   = document.getElementById('reId').value.trim();
  const nick = document.getElementById('reNick').value.trim();
  const email= document.getElementById('reEmail').value.trim();
  const pw   = document.getElementById('rePw').value;
  const pw2  = document.getElementById('rePw2').value;
  document.getElementById('reErr').textContent = '';
  if (id.length < 4)   { document.getElementById('reErr').textContent = '아이디는 4자 이상이어야 합니다.'; return; }
  if (!/^[a-zA-Z0-9_]+$/.test(id)) { document.getElementById('reErr').textContent = '아이디는 영문/숫자/밑줄만 가능합니다.'; return; }
  if (!nick)           { document.getElementById('reErr').textContent = '이름(닉네임)을 입력해주세요.'; return; }
  if (!email)          { document.getElementById('reErr').textContent = '이메일을 입력해주세요.'; return; }
  if (pw.length < 6)   { document.getElementById('reErr').textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }
  if (pw !== pw2)      { document.getElementById('reErr').textContent = '비밀번호가 일치하지 않습니다.'; return; }
  const existing = await getDocs(collection(db,'users'));
  let dup = false; existing.forEach(d => { if(d.data().id===id) dup=true; });
  if (dup) { document.getElementById('reErr').textContent = '이미 사용 중인 아이디입니다.'; return; }
  showLoading();
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await setDoc(doc(db,'users',cred.user.uid), { id, nick, email, admin: false, joinDate: fmtNow() });
    toast('가입 완료! 로그인해주세요.'); toLi();
  } catch(e) {
    document.getElementById('reErr').textContent = '이미 사용 중인 이메일이거나 오류가 발생했습니다.';
  } finally { hideLoading(); }
}

async function doLogout() { await signOut(auth); toast('로그아웃되었습니다.'); goHome(); }

onAuthStateChanged(auth, async user => {
  if (user) {
    const snap = await getDoc(doc(db,'users',user.uid));
    if (snap.exists()) {
      const data = snap.data();
      me = { uid: user.uid, id: data.id, nick: data.nick || data.id, email: user.email, admin: !!data.admin };
    }
  } else { me = null; }
  updateNav();
});

function updateNav() {
  document.getElementById('navLogin').style.display   = me ? 'none' : '';
  document.getElementById('navUser').style.display    = me ? '' : 'none';
  document.getElementById('navLogout').style.display  = me ? '' : 'none';
  document.getElementById('navAdmin').style.display   = me?.admin ? '' : 'none';
  document.getElementById('navMyInfo').style.display  = me ? '' : 'none';
  if (me) document.getElementById('navUser').textContent = me.nick || me.id;
}

document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) closeModal();
});

// ── 유틸 ────────────────────────────────────────────────
function isOwner(p) { return me && (me.uid === p.uid || me.admin); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let toastTm;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastTm); toastTm = setTimeout(()=>el.classList.remove('on'), 2500);
}

// ── 이벤트 리스너 등록 ───────────────────────────────────
function bindEvents() {
  // 네비 - 로고 클릭 시 패널 토글
  document.getElementById('logoBtn').addEventListener('click', toggleLogoPanel);
  document.getElementById('logoPanelClose').addEventListener('click', closeLogoPanel);
  document.getElementById('logoPanelHome').addEventListener('click', () => { closeLogoPanel(); goHome(); });
  // 패널 바깥 클릭 시 닫기
  document.addEventListener('click', e => {
    const panel = document.getElementById('logoPanel');
    const btn   = document.getElementById('logoBtn');
    if (!panel.contains(e.target) && e.target !== btn) closeLogoPanel();
  });
  document.getElementById('navAdmin').addEventListener('click', goAdmin);
  document.getElementById('navMyInfo').addEventListener('click', openMyInfo);
  document.getElementById('navLogin').addEventListener('click', openModal);
  document.getElementById('navLogout').addEventListener('click', doLogout);

  // 모달 버튼
  document.getElementById('btnDoLogin').addEventListener('click', doLogin);
  document.getElementById('btnDoReg').addEventListener('click', doReg);
  document.getElementById('btnToReg').addEventListener('click', toReg);
  document.getElementById('btnToLi').addEventListener('click', toLi);
  document.getElementById('btnSaveMyInfo').addEventListener('click', saveMyInfo);
  document.getElementById('btnSaveUserDetail').addEventListener('click', saveUserDetail);
  document.getElementById('btnSubmitAddBoard').addEventListener('click', submitAddBoard);
  document.getElementById('udToggleAdminBtn').addEventListener('click', toggleAdminFromDetail);
  ['btnCloseModal1','btnCloseModal2','btnCloseModal3','btnCloseModal4','btnCloseModal5','btnModalClose']
    .forEach(id => document.getElementById(id).addEventListener('click', closeModal));

  // 엔터키
  document.getElementById('liId').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('liPw').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

  // 모달 바깥 클릭
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('overlay')) closeModal();
  });

  // 비밀글 잠금
  document.getElementById('lockPw').addEventListener('keydown', e => { if(e.key==='Enter') doUnlock(); });
  document.getElementById('lockBack')?.addEventListener('click', goList);

  // 단일 페이지
  document.getElementById('singleEditBtn').addEventListener('click', startSingleEdit);
  document.getElementById('btnSaveSingle').addEventListener('click', saveSingleEdit);
  document.getElementById('btnCancelSingle').addEventListener('click', cancelSingleEdit);
}

// 전역 등록 (동적 HTML onclick용)
Object.assign(window, {
  goHome, goBoard, goList, goWrite, goEdit, goAdmin, goSingle, pushHash,
  goGuest, openPost, doUnlock, submitWF, delPost,
  submitCmt, delCmt, submitGuest, deleteGuest, unlockGuest, toggleGbPw,
  startSingleEdit, saveSingleEdit, cancelSingleEdit,
  edCmdSingle, insertSingleImage, insertSingleVideo, handleSingleImgUpload,
  openModal, closeModal, toReg, toLi, doLogin, doReg, doLogout,
  openMyInfo, saveMyInfo, openUserDetail, saveUserDetail, toggleAdminFromDetail, toggleAdmin, deleteUser,
  showAdminTab, renderBoardManage, moveBoardUp, moveBoardDown, deleteBoard, openAddBoard, submitAddBoard, saveHomeContent, saveBio, previewBioImg, uploadBioImg,
  setHomeLineHeight, homeEdCmd, insertHomeImage, insertHomeVideo, handleHomeImgUpload,
  selectHomeLayout, handleHomeSplitImg, handleHomeTopImg,
  startEditBoard, saveEditBoard, toggleAdminOnly, cycleViewMode,
  openTagOrder, moveTagUp, moveTagDown, saveTagOrder,
  loadAdminPosts, adminDelPost, adminEditPost,
  edCmd, setLineHeight, setSingleLineHeight, insertImage, insertVideo, insertFile, handleImgUpload, handleFileUpload, togglePw
});

// ── 해시 라우팅 처리 ────────────────────────────────────
function routeFromHash() {
  const hash = location.hash.replace('#', '');
  if (!hash) { goHome(); return; }
  const [boardId, postId] = hash.split('/');
  const b = boards.find(x => x.id === boardId);
  if (!b) { goHome(); return; }
  if (postId) {
    curBoard = boardId;
    const btn = document.getElementById('floatHomeBtn');
    if (btn) btn.style.display = '';
    openPost(postId);
  } else {
    goBoard(boardId);
  }
}

window.addEventListener('popstate', routeFromHash);

// ── 초기화 ──────────────────────────────────────────────
(async () => {
  bindEvents();
  await loadBoards();
  await loadHome();
  await loadLogoBio();
  document.getElementById('floatHomeBtn').style.display = 'none';
  routeFromHash();
})();
