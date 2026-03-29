import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, orderBy, serverTimestamp, Timestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

function fmtChat(ts) {
  const d = ts instanceof Timestamp ? ts.toDate() : (ts ? new Date(ts) : new Date());
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const date = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth()+1).padStart(2,'0')}.${String(kst.getUTCDate()).padStart(2,'0')}`;
  const time = `${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}:${String(kst.getUTCSeconds()).padStart(2,'0')}`;
  return `${date} ${time}`;
}
function fmtNow() { return fmt(new Date()); }

// ── 메모 카드 시스템 ─────────────────────────────────────
let popups = [];
let curPopupIdx = null;

function makeDraggable(card) {
  let startX, startY, startLeft, startTop, dragging = false;
  const header = card.querySelector('.memo-card-header');
  const handle = header || card;

  handle.addEventListener('mousedown', e => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;
    e.preventDefault();
    dragging = false;
    startX = e.clientX; startY = e.clientY;
    startLeft = parseInt(card.style.left) || 0;
    startTop  = parseInt(card.style.top)  || 0;
    const onMove = e => {
      dragging = true;
      card.style.left = (startLeft + e.clientX - startX) + 'px';
      card.style.top  = (startTop  + e.clientY - startY) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  handle.addEventListener('touchstart', e => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    startLeft = parseInt(card.style.left) || 0;
    startTop  = parseInt(card.style.top)  || 0;
    const onMove = e => {
      const t = e.touches[0];
      card.style.left = (startLeft + t.clientX - startX) + 'px';
      card.style.top  = (startTop  + t.clientY - startY) + 'px';
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
  }, { passive: true });
}

function closePopup(id) {
  const card = document.getElementById('memo_' + id);
  // 채팅 메모는 숨기기만 (새로고침하면 다시 뜸)
  if (id === 'chatMemo') {
    if (card) card.style.display = 'none';
    if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    return;
  }
  if (card) card.remove();
  sessionStorage.setItem('popup_closed_' + id, '1');
}

async function loadPopup() {
  try {
    const snap = await getDoc(doc(db, 'config', 'popups'));
    if (!snap.exists()) return;
    const list = snap.data().list || [];
    const container = document.getElementById('memoContainer');
    if (!container) return;
    const W = container.offsetWidth  || 800;
    const H = container.offsetHeight || 520;

    list.filter(p => p.enabled).forEach((p, i) => {
      if (sessionStorage.getItem('popup_closed_' + p.id)) return;

      // 방문자 채팅 메모 타입
      if (p.type === 'chat') {
        renderChatMemo(p, container, W, H, i);
        return;
      }

      if (!p.content) return;
      const card = document.createElement('div');
      card.className = 'memo-card';
      card.id = 'memo_' + p.id;

      // 랜덤 위치 (가장자리 여백 40px)
      const left = Math.floor(Math.random() * Math.max(W - 280, 40));
      const top  = Math.floor(Math.random() * Math.max(H - 160, 40));
      card.style.left = left + 'px';
      card.style.top  = top  + 'px';

      card.innerHTML = `
        <div class="memo-card-header">
          <button class="memo-card-close" onclick="closePopup('${p.id}')">✕</button>
        </div>
        <div class="memo-card-body">${p.content}</div>`;
      makeDraggable(card);
      container.appendChild(card);
    });

    // 방문자 채팅 메모 (별도 저장소)
    await loadChatMemo(container, W, H);
  } catch(e) { console.error('메모 로드 오류:', e); }
}

// ── 방문자 채팅 메모 ─────────────────────────────────────
let chatUnsubscribe = null;

async function loadChatMemo(container, W, H) {
  try {
    const snap = await getDoc(doc(db, 'config', 'chatMemo'));
    if (!snap.exists() || !snap.data().enabled) return;
    if (sessionStorage.getItem('popup_closed_chatMemo')) return;

    const old = document.getElementById('memo_chatMemo');
    if (old) old.remove();

    const card = document.createElement('div');
    card.className = 'memo-card chat-memo';
    card.id = 'memo_chatMemo';

    const left = Math.floor(Math.random() * Math.max(W - 280, 40));
    const top  = Math.floor(Math.random() * Math.max(H - 240, 40));
    card.style.left = left + 'px';
    card.style.top  = top + 'px';
    card.style.width = '260px';

    card.innerHTML = `
      <div class="memo-card-header" style="cursor:move">
        <span style="font-size:11px;color:#aaa;flex:1">채팅</span>
        <button class="memo-card-close" onclick="closePopup('chatMemo')" style="pointer-events:all">✕</button>
      </div>

      <div class="chat-messages" id="chatMsgs" style="pointer-events:all"></div>

      <div class="chat-input-wrap" style="pointer-events:all">
        <input
          type="text"
          id="chatTextInput"
          placeholder="메시지를 입력하세요"
          style="flex:1;border:none;border-top:1px solid #f0f0f0;font-size:11px;font-family:inherit;font-weight:300;outline:none;padding:6px 4px;background:transparent;color:#3a3a3a;pointer-events:all;cursor:text"
          onkeydown="if(event.key==='Enter')submitChatMsg()"
        >
        <button
          onclick="submitChatMsg()"
          style="font-size:11px;color:#aaa;background:none;border:none;cursor:pointer;font-family:inherit;flex-shrink:0;padding:0 4px;pointer-events:all"
        >전송</button>
      </div>
    `;

    makeDraggable(card);
    container.appendChild(card);

    const chatCol = collection(db, 'chatMessages');
    const chatQ = query(chatCol, orderBy('createdAt', 'asc'));

    if (chatUnsubscribe) chatUnsubscribe();

    chatUnsubscribe = onSnapshot(chatQ, (snap) => {
      const el = document.getElementById('chatMsgs');
      if (!el) return;

      el.innerHTML = snap.docs.map(d => {
        const m = d.data();
        const canDelete = !!(me && me.admin);

        return `
          <div class="chat-line">
            <div class="chat-line-top">
              <span class="chat-author">${esc(m.author || '익명')}</span>
              <span class="chat-time">${fmtChat(m.createdAt)}</span>
              ${canDelete ? `<button class="chat-del-btn" onclick="deleteChatMsg('${d.id}')">삭제</button>` : ''}
            </div>
            <div class="chat-text">${esc(m.text).replace(/\n/g, '<br>')}</div>
          </div>
        `;
      }).join('');

      el.scrollTop = el.scrollHeight;
    });
  } catch (e) {
    console.error('채팅 메모 오류:', e);
  }
}

async function submitChatMsg() {
  const txtEl = document.getElementById('chatTextInput');
  const text  = txtEl?.value.trim();
  if (!text) return;

  const author = me ? (me.nick || me.id) : '익명';

  try {
    await addDoc(collection(db, 'chatMessages'), {
      author,
      text,
      uid: me?.uid || null,
      createdAt: serverTimestamp()
    });
    if (txtEl) txtEl.value = '';
  } catch (e) {
    console.error('채팅 전송 오류:', e);
    toast('전송 실패');
  }
}

async function deleteChatMsg(id) {
  if (!(me && me.admin)) {
    toast('관리자만 삭제할 수 있어요.');
    return;
  }

  if (!confirm('이 메시지를 삭제할까요?')) return;

  try {
    await deleteDoc(doc(db, 'chatMessages', id));
    toast('삭제되었습니다.');
  } catch (e) {
    console.error('채팅 삭제 오류:', e);
    toast('삭제 실패');
  }
}

function insertPopupLink() {
  const url = prompt('링크 URL을 입력하세요 (https://...)');
  if (!url) return;
  const text = prompt('링크 텍스트를 입력하세요') || url;
  document.getElementById('popupEditorArea')?.focus();
  document.execCommand('insertHTML', false, `<a href="${esc(url)}" target="_blank" style="color:#3a3a3a;text-decoration:underline">${esc(text)}</a>`);
}

async function loadPopupEditor() {
  try {
    const snap = await getDoc(doc(db, 'config', 'popups'));
    popups = snap.exists() ? (snap.data().list || []) : [];
  } catch(e) { popups = []; }
  renderPopupList();
}

function renderPopupList() {
  const el = document.getElementById('popupManageList');
  if (!el) return;
  let h = `<div style="padding:10px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;gap:8px">
    <span style="font-size:12px;color:#3a3a3a;flex:1">방문자 채팅 메모</span>
    <button onclick="toggleChatMemo()" id="chatMemoToggleBtn" style="font-size:11px;color:#aaa;background:none;border:none;cursor:pointer;font-family:inherit">로딩중...</button>
  </div>`;
  if (!popups.length) {
    h += `<div style="font-size:12px;color:#ccc;padding:8px 0">메모가 없습니다.</div>`;
  } else {
    h += popups.map((p, i) => `
      <div style="padding:10px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span style="font-size:12px;color:#3a3a3a;flex:1">${esc(p.title||'제목 없음')}</span>
        <span style="font-size:11px;color:${p.enabled?'#5a9a5a':'#ccc'}">${p.enabled?'활성':'비활성'}</span>
        <button onclick="editPopup(${i})" style="font-size:11px;color:#aaa;background:none;border:none;cursor:pointer;font-family:inherit">수정</button>
        <button onclick="deletePopup(${i})" style="font-size:11px;color:#aaa;background:none;border:none;cursor:pointer;font-family:inherit">삭제</button>
      </div>`).join('');
  }
  el.innerHTML = h;
  getDoc(doc(db, 'config', 'chatMemo')).then(snap => {
    const btn = document.getElementById('chatMemoToggleBtn');
    if (btn) btn.textContent = (snap.exists() && snap.data().enabled) ? '활성 (끄기)' : '비활성 (켜기)';
  }).catch(() => {});
}

async function toggleChatMemo() {
  const snap = await getDoc(doc(db, 'config', 'chatMemo'));
  const cur = snap.exists() ? !!snap.data().enabled : false;
  await setDoc(doc(db, 'config', 'chatMemo'), { enabled: !cur, messages: snap.exists() ? (snap.data().messages||[]) : [] });
  toast(!cur ? '채팅 메모가 활성화됐어요.' : '채팅 메모가 비활성화됐어요.');
  renderPopupList();
  const container = document.getElementById('memoContainer');
  if (container) { container.innerHTML = ''; sessionStorage.clear(); await loadPopup(); }
}

function openAddPopup() {
  curPopupIdx = null;
  showPopupEditForm({ title: '', content: '', enabled: true });
}

function editPopup(i) {
  curPopupIdx = i;
  showPopupEditForm(popups[i]);
}

function showPopupEditForm(p) {
  const el = document.getElementById('popupManageList');
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
      <input type="text" id="popupTitleInput" placeholder="메모 제목 (관리용)" value="${esc(p.title||'')}"
        style="border:none;border-bottom:1px solid #ccc;font-size:13px;font-family:inherit;font-weight:300;color:#3a3a3a;outline:none;padding:5px 0;background:transparent">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#888;cursor:pointer">
        <input type="checkbox" id="popupEnabledInput" ${p.enabled?'checked':''} accent-color="#3a3a3a"> 홈에 표시
      </label>
      <div class="editor-toolbar">
        <button class="tb-btn" onclick="popupEdCmd('bold')"><b>B</b></button>
        <button class="tb-btn" onclick="popupEdCmd('italic')"><i>I</i></button>
        <button class="tb-btn" onclick="popupEdCmd('underline')"><u>U</u></button>
        <div class="tb-divider"></div>
        <button class="tb-btn" onclick="popupEdCmd('justifyLeft')">≡</button>
        <button class="tb-btn" onclick="popupEdCmd('justifyCenter')">☰</button>
        <button class="tb-btn" onclick="popupEdCmd('justifyRight')">≡</button>
        <div class="tb-divider"></div>
        <button class="tb-btn" onclick="insertPopupImage()">🖼</button>
        <button class="tb-btn" onclick="insertPopupLink()" style="font-size:11px">URL</button>
        <input type="file" id="popupImgInput" accept="image/*" style="display:none" onchange="handlePopupImgUpload(event)">
      </div>
      <div class="editor-area" id="popupEditorArea" contenteditable="true" style="min-height:120px">${p.content||''}</div>
      <div style="display:flex;justify-content:flex-end;gap:12px">
        <button onclick="loadPopupEditor()" style="font-size:12px;color:#aaa;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:300">취소</button>
        <button onclick="savePopup()" style="font-size:12px;color:#3a3a3a;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:300">저장</button>
      </div>
    </div>`;
}

async function savePopup() {
  const title   = document.getElementById('popupTitleInput')?.value.trim() || '';
  const content = document.getElementById('popupEditorArea')?.innerHTML.trim() || '';
  const enabled = document.getElementById('popupEnabledInput')?.checked ?? true;
  const id = curPopupIdx !== null ? popups[curPopupIdx].id : Date.now().toString();
  if (curPopupIdx !== null) {
    popups[curPopupIdx] = { ...popups[curPopupIdx], id, title, content, enabled };
  } else {
    popups.push({ id, title, content, enabled });
  }
  showLoading();
  try {
    await setDoc(doc(db, 'config', 'popups'), { list: popups });
    toast('저장되었습니다.');
    curPopupIdx = null;
    renderPopupList();
    // 홈 메모 카드 새로고침
    const container = document.getElementById('memoContainer');
    if (container) { container.innerHTML = ''; sessionStorage.clear(); await loadPopup(); }
  } finally { hideLoading(); }
}

async function deletePopup(i) {
  if (!confirm('메모를 삭제할까요?')) return;
  popups.splice(i, 1);
  showLoading();
  try {
    await setDoc(doc(db, 'config', 'popups'), { list: popups });
    toast('삭제되었습니다.');
    renderPopupList();
    const container = document.getElementById('memoContainer');
    if (container) { container.innerHTML = ''; await loadPopup(); }
  } finally { hideLoading(); }
}

function popupEdCmd(cmd) {
  document.getElementById('popupEditorArea')?.focus();
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, null);
}
function insertPopupImage() { document.getElementById('popupImgInput')?.click(); }
function handlePopupImgUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('popupEditorArea')?.focus();
    document.execCommand('insertHTML', false, `<img src="${ev.target.result}" style="max-width:100%;height:auto;display:block;margin:8px 0">`);
  };
  reader.readAsDataURL(file); e.target.value = '';
}

// [truncated in canvas preview for brevity here, but full file is available via sandbox link]
