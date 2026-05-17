let currentUser = null;
let currentProfile = null;
let activeTab = "dms";
let activeChat = null;
let unsubscribeChat = null;
let allConvos = [];
let selectedMembers = [];
let selectiveMode = false;
let selectedDMUser = null;
let selectedGroupUsers = [];
let selectedAddMember = null;
let authResolved = false;
const _cache = {};

const convList = document.getElementById("convList");
const convSearch = document.getElementById("convSearch");
const messagesEl = document.getElementById("messagesArea");
const messageInput = document.getElementById("messageInput");
const cipherSelect = document.getElementById("cipherSelect");
const cipherKeyInput = document.getElementById("cipherKeyInput");
const btnSelective = document.getElementById("btnSelective");
const memberPicker = document.getElementById("memberPicker");
const btnGroupInfo = document.getElementById("btnGroupInfo");
const noChatEl = document.getElementById("noChatState");
const activeChatEl = document.getElementById("activeChatState");

function uid() {
  return currentUser?.id || currentUser?.uid;
}

function showChat() {
  activeChatEl.style.display = "flex";
  noChatEl.style.display = "none";
  document.body.classList.add("chatOpen");
}

function hideChat() {
  activeChatEl.style.display = "none";
  noChatEl.style.display = "grid";
  document.body.classList.remove("chatOpen");
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function getProfile(u) {
  if (_cache[u]) return _cache[u];
  const p = await CC.getUserProfile(u);
  if (p) _cache[u] = p;
  return p;
}

function populateCipherSelect() {
  cipherSelect.innerHTML = "";
  CipherEngine.getCipherList().forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    cipherSelect.appendChild(opt);
  });
  cipherSelect.addEventListener("change", () => {
    const id = cipherSelect.value;
    if (id && id !== "none") {
      cipherKeyInput.style.display = "block";
      const c = CipherEngine.getCipherList().find(x => x.id === id);
      cipherKeyInput.placeholder = c ? c.keyPlaceholder : "Key";
    } else {
      cipherKeyInput.style.display = "none";
      cipherKeyInput.value = "";
    }
  });
}

function initUI() {
  populateCipherSelect();
  const av = currentProfile.avatar;
  document.getElementById("userBarAvatar").textContent = av.initials;
  document.getElementById("userBarAvatar").style.background = av.color;
  document.getElementById("userBarName").textContent = currentProfile.username;

  document.querySelectorAll(".convTab").forEach(tab => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll(".convTab").forEach(t => t.classList.toggle("active", t === tab));
      renderConvList();
    });
  });

  convSearch.addEventListener("input", () => renderConvList());

  CC.listenConversations(uid(), async convos => {
    const enriched = [];
    for (const c of convos) {
      const p = await getProfile(c.otherUid);
      enriched.push({ type: "dm", id: c.id, otherUid: c.otherUid, name: p?.username || "Unknown", lastMessage: c.lastMessage, lastTimestamp: c.lastTimestamp, avatar: p?.avatar });
    }
    const dmPart = enriched;
    const groups = await CC.getGroupsForUser(uid());
    const groupPart = groups.map(g => ({
      type: "group", id: g.groupId, name: g.name, lastMessage: "", lastTimestamp: 0, avatar: g.avatar, members: g.members
    }));
    allConvos = [...dmPart, ...groupPart];
    renderConvList();
  });

  loadGroups();
}

async function loadGroups() {
  const groups = await CC.getGroupsForUser(uid());
  const existingIds = new Set(allConvos.filter(c => c.type === "group").map(c => c.id));
  groups.forEach(g => {
    if (!existingIds.has(g.groupId)) {
      allConvos.push({ type: "group", id: g.groupId, name: g.name, lastMessage: "", lastTimestamp: 0, avatar: g.avatar, members: g.members });
    }
  });
  renderConvList();
}

function renderConvList() {
  const q = convSearch.value.trim().toLowerCase();
  const list = allConvos.filter(c => c.type === (activeTab === "dms" ? "dm" : "group"));
  const filtered = q ? list.filter(c => c.name.toLowerCase().includes(q)) : list;
  filtered.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));

  convList.innerHTML = "";
  if (!filtered.length) {
    convList.innerHTML = '<p style="padding:16px;color:var(--text2);font-size:13px;text-align:center">No conversations yet</p>';
    return;
  }

  filtered.forEach(c => {
    const el = document.createElement("div");
    el.className = "convItem" + (activeChat && activeChat.id === c.id ? " active" : "");
    const av = c.avatar || { initials: "?", color: "#333" };
    el.innerHTML = `
      <div class="avatar" style="background:${av.color}">${av.initials}</div>
      <div class="convMeta">
        <div class="convName">${escapeHtml(c.name)}</div>
        <div class="convPreview">${escapeHtml((c.lastMessage || "").slice(0, 40))}</div>
      </div>`;
    el.addEventListener("click", () => {
      if (c.type === "dm") openDM(c.otherUid, c.name);
      else openGroup(c.id, c.name);
    });
    convList.appendChild(el);
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function openDM(otherUid, otherUsername) {
  if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
  activeChat = { type: "dm", id: CC.getDMId(uid(), otherUid), otherUid, name: otherUsername };
  selectedMembers = [];
  selectiveMode = false;
  btnSelective.classList.add("hidden");
  btnGroupInfo.classList.add("hidden");
  memberPicker.classList.add("hidden");
  btnSelective.classList.remove("active");

  const p = await getProfile(otherUid);
  const av = p?.avatar || { initials: "?", color: "#333" };
  document.getElementById("chatHeaderAvatar").textContent = av.initials;
  document.getElementById("chatHeaderAvatar").style.background = av.color;
  document.getElementById("chatHeaderName").textContent = otherUsername;
  document.getElementById("chatHeaderSub").textContent = "Direct message";

  showChat();
  unsubscribeChat = CC.listenDM(uid(), otherUid, msgs => renderMessages(msgs, "dm"));
  renderConvList();
}

async function openGroup(groupId, groupName) {
  if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
  const info = await CC.getGroupInfo(groupId);
  if (!info) return;

  const memberProfiles = {};
  for (const m of info.members) {
    if (m !== uid()) memberProfiles[m] = await getProfile(m);
  }

  activeChat = {
    type: "group", id: groupId, name: groupName || info.name,
    members: info.members, memberProfiles, avatar: info.avatar
  };
  selectedMembers = [];
  selectiveMode = false;

  btnSelective.classList.remove("hidden");
  btnGroupInfo.classList.remove("hidden");
  memberPicker.classList.add("hidden");
  btnSelective.classList.remove("active");

  const av = info.avatar;
  document.getElementById("chatHeaderAvatar").textContent = av.initials;
  document.getElementById("chatHeaderAvatar").style.background = av.color;
  document.getElementById("chatHeaderName").textContent = info.name;
  document.getElementById("chatHeaderSub").textContent = `${info.members.length} members`;

  buildMemberPicker();
  showChat();
  unsubscribeChat = CC.listenGroupMessages(groupId, msgs => renderMessages(msgs, "group"));
  renderConvList();
}

function buildMemberPicker() {
  memberPicker.innerHTML = "";
  if (!activeChat || activeChat.type !== "group") return;
  Object.entries(activeChat.memberProfiles || {}).forEach(([muid, prof]) => {
    if (!prof) return;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "memberChip" + (selectedMembers.includes(muid) ? " selected" : "");
    chip.textContent = prof.username;
    chip.addEventListener("click", () => {
      const i = selectedMembers.indexOf(muid);
      if (i >= 0) selectedMembers.splice(i, 1);
      else selectedMembers.push(muid);
      chip.classList.toggle("selected", selectedMembers.includes(muid));
    });
    memberPicker.appendChild(chip);
  });
}

function renderMessages(msgs, type) {
  messagesEl.innerHTML = "";
  const myUid = uid();

  msgs.forEach(msg => {
    const isSent = msg.fromUid === myUid;
    let key = null;
    if (type === "dm") key = msg.key;
    else key = (msg.keyEnvelopes || {})[myUid];

    const isAuthorized = isSent || key != null;
    let body = msg.ciphertext;
    let locked = false;
    let showBadge = false;

    if (msg.cipherType && isAuthorized) {
      try {
        body = CipherEngine.decrypt(msg.cipherType, msg.ciphertext, key);
        showBadge = true;
      } catch {
        body = msg.ciphertext;
        locked = true;
      }
    } else if (msg.cipherType && !isAuthorized) {
      locked = true;
    }

    const row = document.createElement("div");
    row.className = "msgRow " + (isSent ? "sent" : "recv");

    if (type === "group" && !isSent) {
      getProfile(msg.fromUid).then(p => {
        const sender = document.createElement("div");
        sender.className = "msgSender";
        sender.textContent = p?.username || "Unknown";
        row.insertBefore(sender, row.firstChild);
      });
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble" + (isSent ? " sent" : "") + (locked ? " locked" : "");
    bubble.textContent = body;

    const meta = document.createElement("div");
    meta.className = "msgMeta";
    if (msg.cipherType && isAuthorized) {
      meta.innerHTML = `<span class="cipherBadge">${escapeHtml(msg.cipherType)}</span> 🔓 <span>${formatTime(msg.timestamp)}</span>`;
    } else if (msg.cipherType && !isAuthorized) {
      meta.innerHTML = `🔒 <span>${formatTime(msg.timestamp)}</span>`;
    } else {
      meta.textContent = formatTime(msg.timestamp);
    }

    row.appendChild(bubble);
    row.appendChild(meta);
    messagesEl.appendChild(row);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendMessage() {
  if (!activeChat) return;
  const text = messageInput.value.trim();
  if (!text) return;

  const cipherType = cipherSelect.value;
  const key = cipherKeyInput.value.trim();

  if (cipherType && cipherType !== "none" && !key) {
    alert("Please enter a key for the " + cipherType + " cipher.");
    return;
  }

  let ciphertext = text;
  let usedKey = null;
  if (cipherType && cipherType !== "none" && key) {
    try {
      ciphertext = CipherEngine.encrypt(cipherType, text, key);
      usedKey = key;
    } catch (e) {
      alert("Cipher error: " + e.message);
      return;
    }
  }

  messageInput.value = "";
  messageInput.style.height = "auto";

  try {
    if (activeChat.type === "dm") {
      await CC.sendDM({
        fromUid: uid(), toUid: activeChat.otherUid,
        ciphertext, cipherType: cipherType !== "none" ? cipherType : null, key: usedKey
      });
    } else {
      const envelopes = {};
      if (usedKey) {
        const targets = selectiveMode && selectedMembers.length
          ? selectedMembers
          : activeChat.members;
        targets.forEach(u => { envelopes[u] = usedKey; });
        envelopes[uid()] = usedKey;
      }
      await CC.sendGroupMessage({
        groupId: activeChat.id, fromUid: uid(),
        ciphertext, cipherType: cipherType !== "none" ? cipherType : null,
        keyEnvelopes: envelopes
      });
    }
  } catch (e) {
    alert("Failed to send: " + (e.message || String(e)));
  }
}

/* Modals */
const dmModal = document.getElementById("dmModal");
const groupModal = document.getElementById("groupModal");
const groupInfoModal = document.getElementById("groupInfoModal");
const addMemberModal = document.getElementById("addMemberModal");

function openModal(el) { el.classList.remove("hidden"); }
function closeModal(el) { el.classList.add("hidden"); }

document.getElementById("btnNewDM").addEventListener("click", () => {
  selectedDMUser = null;
  document.getElementById("dmSearch").value = "";
  document.getElementById("dmResults").innerHTML = "";
  document.getElementById("dmOpen").disabled = true;
  openModal(dmModal);
});

document.getElementById("dmCancel").addEventListener("click", () => closeModal(dmModal));

let dmSearchTimer;
document.getElementById("dmSearch").addEventListener("input", e => {
  clearTimeout(dmSearchTimer);
  dmSearchTimer = setTimeout(async () => {
    const q = e.target.value.trim();
    const results = await CC.searchUsers(q);
    const box = document.getElementById("dmResults");
    box.innerHTML = "";
    results.filter(u => u.uid !== uid()).forEach(u => {
      const row = document.createElement("div");
      row.className = "userResult" + (selectedDMUser?.uid === u.uid ? " selected" : "");
      row.innerHTML = `<div class="avatar" style="background:${u.avatar.color}">${u.avatar.initials}</div>
        <div><strong>${escapeHtml(u.username)}</strong></div>`;
      row.addEventListener("click", () => {
        selectedDMUser = u;
        box.querySelectorAll(".userResult").forEach(r => r.classList.remove("selected"));
        row.classList.add("selected");
        document.getElementById("dmOpen").disabled = false;
      });
      box.appendChild(row);
    });
  }, 300);
});

document.getElementById("dmOpen").addEventListener("click", () => {
  if (!selectedDMUser) return;
  closeModal(dmModal);
  openDM(selectedDMUser.uid, selectedDMUser.username);
});

document.getElementById("btnNewGroup").addEventListener("click", () => {
  selectedGroupUsers = [];
  document.getElementById("groupName").value = "";
  document.getElementById("groupUserSearch").value = "";
  document.getElementById("groupResults").innerHTML = "";
  document.getElementById("groupSelected").innerHTML = "";
  openModal(groupModal);
});

document.getElementById("groupCancel").addEventListener("click", () => closeModal(groupModal));

function renderGroupSelected() {
  const box = document.getElementById("groupSelected");
  box.innerHTML = selectedGroupUsers.map(u =>
    `<span class="memberChip selected">${escapeHtml(u.username)}</span>`
  ).join(" ");
}

let groupSearchTimer;
document.getElementById("groupUserSearch").addEventListener("input", e => {
  clearTimeout(groupSearchTimer);
  groupSearchTimer = setTimeout(async () => {
    const q = e.target.value.trim();
    const results = await CC.searchUsers(q);
    const box = document.getElementById("groupResults");
    box.innerHTML = "";
    const selectedIds = new Set(selectedGroupUsers.map(u => u.uid));
    results.filter(u => u.uid !== uid() && !selectedIds.has(u.uid)).forEach(u => {
      const row = document.createElement("div");
      row.className = "userResult";
      row.innerHTML = `<div class="avatar" style="background:${u.avatar.color}">${u.avatar.initials}</div>
        <div><strong>${escapeHtml(u.username)}</strong></div>`;
      row.addEventListener("click", () => {
        selectedGroupUsers.push(u);
        renderGroupSelected();
        row.remove();
      });
      box.appendChild(row);
    });
  }, 300);
});

document.getElementById("groupCreate").addEventListener("click", async () => {
  const name = document.getElementById("groupName").value.trim();
  if (!name) { alert("Enter a group name."); return; }
  try {
    const groupId = await CC.createGroup({
      name, creatorUid: uid(),
      memberUids: selectedGroupUsers.map(u => u.uid)
    });
    closeModal(groupModal);
    await loadGroups();
    openGroup(groupId, name);
  } catch (e) {
    alert(e.message || String(e));
  }
});

btnSelective.addEventListener("click", () => {
  selectiveMode = !selectiveMode;
  btnSelective.classList.toggle("active", selectiveMode);
  memberPicker.classList.toggle("hidden", !selectiveMode);
  if (selectiveMode) buildMemberPicker();
});

btnGroupInfo.addEventListener("click", async () => {
  if (!activeChat || activeChat.type !== "group") return;
  document.getElementById("groupInfoTitle").textContent = activeChat.name;
  const list = document.getElementById("groupInfoMembers");
  list.innerHTML = "";
  for (const m of activeChat.members) {
    const p = m === uid() ? currentProfile : await getProfile(m);
    const item = document.createElement("div");
    item.className = "memberListItem";
    const av = p?.avatar || { initials: "?", color: "#333" };
    const you = m === uid() ? '<span class="youBadge">you</span>' : "";
    const contact = p?.email || p?.phone || "";
    item.innerHTML = `
      <div class="avatar" style="background:${av.color}">${av.initials}</div>
      <div>
        <strong>${escapeHtml(p?.username || "Unknown")}</strong>${you}
        <div style="font-size:12px;color:var(--text2)">${escapeHtml(contact)}</div>
      </div>`;
    list.appendChild(item);
  }
  openModal(groupInfoModal);
});

document.getElementById("groupInfoClose").addEventListener("click", () => closeModal(groupInfoModal));

document.getElementById("btnAddMember").addEventListener("click", () => {
  closeModal(groupInfoModal);
  selectedAddMember = null;
  document.getElementById("addMemberSearch").value = "";
  document.getElementById("addMemberResults").innerHTML = "";
  document.getElementById("addMemberConfirm").disabled = true;
  openModal(addMemberModal);
});

document.getElementById("addMemberCancel").addEventListener("click", () => closeModal(addMemberModal));

let addMemberTimer;
document.getElementById("addMemberSearch").addEventListener("input", e => {
  clearTimeout(addMemberTimer);
  addMemberTimer = setTimeout(async () => {
    const q = e.target.value.trim();
    const results = await CC.searchUsers(q);
    const box = document.getElementById("addMemberResults");
    box.innerHTML = "";
    const inGroup = new Set(activeChat?.members || []);
    results.filter(u => !inGroup.has(u.uid)).forEach(u => {
      const row = document.createElement("div");
      row.className = "userResult" + (selectedAddMember?.uid === u.uid ? " selected" : "");
      row.innerHTML = `<div class="avatar" style="background:${u.avatar.color}">${u.avatar.initials}</div>
        <div><strong>${escapeHtml(u.username)}</strong></div>`;
      row.addEventListener("click", () => {
        selectedAddMember = u;
        box.querySelectorAll(".userResult").forEach(r => r.classList.remove("selected"));
        row.classList.add("selected");
        document.getElementById("addMemberConfirm").disabled = false;
      });
      box.appendChild(row);
    });
  }, 300);
});

document.getElementById("addMemberConfirm").addEventListener("click", async () => {
  if (!selectedAddMember || !activeChat) return;
  try {
    await CC.addMemberToGroup(activeChat.id, selectedAddMember.uid);
    closeModal(addMemberModal);
    const info = await CC.getGroupInfo(activeChat.id);
    activeChat.members = info.members;
    const memberProfiles = {};
    for (const m of info.members) {
      if (m !== uid()) memberProfiles[m] = await getProfile(m);
    }
    activeChat.memberProfiles = memberProfiles;
    document.getElementById("chatHeaderSub").textContent = `${info.members.length} members`;
    buildMemberPicker();
    await loadGroups();
  } catch (e) {
    alert(e.message || String(e));
  }
});

document.getElementById("btnBack").addEventListener("click", () => {
  if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
  activeChat = null;
  hideChat();
});

document.getElementById("btnLogout").addEventListener("click", async () => {
  await CC.logoutUser();
  window.location.replace("login.html");
});

document.getElementById("btnSend").addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
});

CC.onAuthChange(async user => {
  if (authResolved) return;
  authResolved = true;

  if (!user) {
    window.location.replace("login.html");
    return;
  }

  currentUser = user;
  currentUser.uid = user.id;

  let profile = null;
  for (let i = 0; i < 5; i++) {
    profile = await CC.getUserProfile(user.id);
    if (profile) break;
    await new Promise(r => setTimeout(r, 800));
  }

  if (!profile) {
    const email = user.email || null;
    const fallback = email ? email.split("@")[0] : "user";
    const username = String(fallback).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || "user";
    await CC.createUserProfile(user.id, { username, email, phone: null });
    await new Promise(r => setTimeout(r, 500));
    profile = await CC.getUserProfile(user.id);
  }

  if (!profile) {
    await CC.logoutUser();
    window.location.replace("login.html");
    return;
  }

  currentProfile = profile;
  _cache[profile.uid] = profile;
  initUI();
});
