// CipherChat — Main application logic (chat.html)

(function () {
  const $ = (id) => document.getElementById(id);

  // State
  let currentUser = null;
  let currentProfile = null;
  let activeTab = "dms";
  let activeChat = null; // { type, id, otherUid?, name, members?, memberProfiles? }
  let unsubscribeChat = null;
  let allConvos = [];
  let selectedMembers = [];
  let selectiveMode = false;
  let selectedDMUser = null;
  let selectedGroupUsers = [];
  let selectedAddMemberUser = null;
  const _profileCache = {}; // uid -> profile
  let authResolved = false;

  // Elements
  const convoListEl = $("convoList");
  const searchConvosEl = $("searchConvos");
  const tabDmsEl = $("tabDms");
  const tabGroupsEl = $("tabGroups");
  const meAvatarEl = $("meAvatar");
  const meUsernameEl = $("meUsername");
  const btnLogoutEl = $("btnLogout");

  const noChatStateEl = $("noChatState");
  const activeChatStateEl = $("activeChatState");
  const messagesEl = $("messages");

  const btnBackEl = $("btnBack");
  const chatAvatarEl = $("chatAvatar");
  const chatTitleEl = $("chatTitle");
  const chatSubEl = $("chatSub");
  const btnGroupInfoEl = $("btnGroupInfo");

  const cipherSelectEl = $("cipherSelect");
  const cipherKeyLabelEl = $("cipherKeyLabel");
  const cipherKeyInputEl = $("cipherKeyInput");
  const btnSelectiveEl = $("btnSelective");
  const memberPickerEl = $("memberPicker");
  const memberListEl = $("memberList");
  const messageInputEl = $("messageInput");
  const btnSendEl = $("btnSend");

  // Modals
  const newDmModalEl = $("newDmModal");
  const dmSearchInputEl = $("dmSearchInput");
  const dmResultsEl = $("dmResults");
  const dmErrorEl = $("dmError");
  const btnNewDMEl = $("btnNewDM");
  const btnOpenDmEl = $("btnOpenDm");

  const newGroupModalEl = $("newGroupModal");
  const btnNewGroupEl = $("btnNewGroup");
  const groupNameInputEl = $("groupNameInput");
  const groupUserSearchEl = $("groupUserSearch");
  const groupSelectedChipsEl = $("groupSelectedChips");
  const groupResultsEl = $("groupResults");
  const groupErrorEl = $("groupError");
  const btnCreateGroupEl = $("btnCreateGroup");

  const groupInfoModalEl = $("groupInfoModal");
  const groupInfoTitleEl = $("groupInfoTitle");
  const groupMembersListEl = $("groupMembersList");
  const groupInfoErrorEl = $("groupInfoError");
  const btnOpenAddMemberEl = $("btnOpenAddMember");

  const addMemberModalEl = $("addMemberModal");
  const addMemberTitleEl = $("addMemberTitle");
  const addMemberSearchEl = $("addMemberSearch");
  const addMemberResultsEl = $("addMemberResults");
  const addMemberErrorEl = $("addMemberError");
  const btnConfirmAddMemberEl = $("btnConfirmAddMember");

  function openModal(el) {
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
  }
  function closeModal(el) {
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-close]");
    if (!btn) return;
    const id = btn.getAttribute("data-close");
    const el = $(id);
    if (el) closeModal(el);
  });

  // Cipher select init
  function initCipherSelect() {
    const list = CipherEngine.getCipherList();
    cipherSelectEl.innerHTML = "";
    list.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.label;
      cipherSelectEl.appendChild(o);
    });
    updateCipherKeyUI();
  }

  function getCipherMeta(cipherId) {
    return CipherEngine.getCipherList().find((c) => c.id === cipherId) || null;
  }

  function updateCipherKeyUI() {
    const id = cipherSelectEl.value;
    const meta = getCipherMeta(id);
    if (!id) {
      cipherKeyInputEl.style.display = "none";
      cipherKeyLabelEl.textContent = "Key";
      cipherKeyInputEl.value = "";
      cipherKeyInputEl.placeholder = "Key";
      return;
    }
    cipherKeyInputEl.style.display = "block";
    cipherKeyLabelEl.textContent = meta?.keyLabel || "Key";
    cipherKeyInputEl.placeholder = meta?.keyPlaceholder || "Key";
  }

  cipherSelectEl.addEventListener("change", updateCipherKeyUI);

  // Textarea behavior
  function autoResizeTextarea() {
    messageInputEl.style.height = "auto";
    const next = Math.min(messageInputEl.scrollHeight, 120);
    messageInputEl.style.height = `${next}px`;
  }
  messageInputEl.addEventListener("input", autoResizeTextarea);
  messageInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Tabs
  function setActiveTab(tab) {
    activeTab = tab;
    tabDmsEl.classList.toggle("btn--primary", tab === "dms");
    tabGroupsEl.classList.toggle("btn--primary", tab === "groups");
    renderConversations();
  }
  tabDmsEl.addEventListener("click", () => setActiveTab("dms"));
  tabGroupsEl.addEventListener("click", () => setActiveTab("groups"));

  function fmtTime(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  async function getProfileCached(uid) {
    if (_profileCache[uid]) return _profileCache[uid];
    const p = await CC.getUserProfile(uid);
    if (p) _profileCache[uid] = p;
    return p;
  }

  function setChatPanelVisible(visible) {
    if (visible) {
      activeChatStateEl.style.display = "flex";
      noChatStateEl.style.display = "none";
      document.body.classList.add("chatOpen");
    } else {
      activeChatStateEl.style.display = "none";
      noChatStateEl.style.display = "grid";
      document.body.classList.remove("chatOpen");
    }
  }

  btnBackEl.addEventListener("click", () => {
    setChatPanelVisible(false);
    activeChat = null;
    if (unsubscribeChat) {
      unsubscribeChat();
      unsubscribeChat = null;
    }
  });

  // Conversations rendering
  function renderConversations() {
    const q = String(searchConvosEl.value || "").trim().toLowerCase();
    convoListEl.innerHTML = "";

    const filtered = allConvos.filter((c) => {
      if (activeTab === "dms" && c.type !== "dm") return false;
      if (activeTab === "groups" && c.type !== "group") return false;
      if (!q) return true;
      return String(c.name || "").toLowerCase().includes(q);
    });

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.style.padding = "10px";
      empty.textContent = activeTab === "dms" ? "No direct messages yet." : "No groups yet.";
      convoListEl.appendChild(empty);
      return;
    }

    filtered.forEach((c) => {
      const row = document.createElement("div");
      row.className = "row";
      if (activeChat && c.type === activeChat.type && c.id === activeChat.id) row.classList.add("active");

      const av = document.createElement("div");
      av.className = "avatar";
      av.textContent = c.avatar?.initials || (c.type === "group" ? "GR" : "DM");
      if (c.avatar?.color) av.style.background = `linear-gradient(180deg, ${c.avatar.color}20, ${c.avatar.color}05)`;

      const mid = document.createElement("div");
      const t = document.createElement("div");
      t.className = "rowTitle";
      t.textContent = c.name;
      const s = document.createElement("div");
      s.className = "rowSub";
      s.textContent = c.lastMessage ? String(c.lastMessage).slice(0, 40) : "";
      mid.appendChild(t);
      mid.appendChild(s);

      const meta = document.createElement("div");
      meta.className = "rowMeta";
      meta.textContent = fmtTime(c.lastTimestamp);

      row.appendChild(av);
      row.appendChild(mid);
      row.appendChild(meta);

      row.addEventListener("click", () => {
        if (c.type === "dm") openDM(c.otherUid, c.name);
        else openGroup(c.id, c.name);
      });

      convoListEl.appendChild(row);
    });
  }

  searchConvosEl.addEventListener("input", renderConversations);

  // Open DM
  async function openDM(otherUid, otherUsername) {
    if (unsubscribeChat) {
      unsubscribeChat();
      unsubscribeChat = null;
    }

    activeChat = { type: "dm", id: CC.getDMId(currentUser.uid, otherUid), otherUid, name: otherUsername };
    selectedMembers = [];
    selectiveMode = false;
    memberPickerEl.style.display = "none";

    chatTitleEl.textContent = otherUsername || "Direct message";
    chatSubEl.textContent = "Direct message";
    btnGroupInfoEl.style.display = "none";
    btnSelectiveEl.style.display = "none";

    // Header avatar
    const otherProfile = await getProfileCached(otherUid);
    const av = otherProfile?.avatar || CC.generateAvatar(otherUsername || "DM");
    chatAvatarEl.textContent = av.initials;
    chatAvatarEl.style.background = av.color ? `linear-gradient(180deg, ${av.color}25, ${av.color}08)` : "";

    setChatPanelVisible(true);

    unsubscribeChat = CC.listenDM(currentUser.uid, otherUid, (msgs) => renderMessages(msgs, "dm"));
    renderConversations();
  }

  // Open Group
  async function openGroup(groupId, groupName) {
    if (unsubscribeChat) {
      unsubscribeChat();
      unsubscribeChat = null;
    }

    const info = await CC.getGroupInfo(groupId);
    if (!info) {
      alert("Group not found.");
      return;
    }

    const members = info.members || [];
    const memberProfiles = [];
    for (const uid of members) {
      if (uid === currentUser.uid) continue;
      const p = await getProfileCached(uid);
      if (p) memberProfiles.push(p);
    }

    activeChat = {
      type: "group",
      id: groupId,
      name: info.name || groupName || "Group",
      members,
      memberProfiles,
      creatorUid: info.creatorUid,
      avatar: info.avatar || null,
    };

    selectedMembers = [];
    selectiveMode = false;
    memberPickerEl.style.display = "none";
    btnSelectiveEl.textContent = "🎯 Selective";

    chatTitleEl.textContent = activeChat.name;
    chatSubEl.textContent = `${members.length} members`;
    btnGroupInfoEl.style.display = "inline-grid";
    btnSelectiveEl.style.display = "inline-grid";

    const av = activeChat.avatar || CC.generateAvatar(activeChat.name);
    chatAvatarEl.textContent = av.initials;
    chatAvatarEl.style.background = av.color ? `linear-gradient(180deg, ${av.color}25, ${av.color}08)` : "";

    setChatPanelVisible(true);

    buildMemberPicker();

    unsubscribeChat = CC.listenGroupMessages(groupId, (msgs) => renderMessages(msgs, "group"));
    renderConversations();
  }

  function buildMemberPicker() {
    if (!activeChat || activeChat.type !== "group") return;
    memberListEl.innerHTML = "";
    const people = activeChat.memberProfiles || [];
    people.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memberItem";
      btn.textContent = p.username;
      btn.addEventListener("click", () => {
        const uid = p.uid;
        if (selectedMembers.includes(uid)) selectedMembers = selectedMembers.filter((x) => x !== uid);
        else selectedMembers = [...selectedMembers, uid];
        btn.classList.toggle("selected", selectedMembers.includes(uid));
      });
      memberListEl.appendChild(btn);
    });
  }

  btnSelectiveEl.addEventListener("click", () => {
    if (!activeChat || activeChat.type !== "group") return;
    selectiveMode = !selectiveMode;
    btnSelectiveEl.textContent = selectiveMode ? "🎯 Selective (on)" : "🎯 Selective";
    memberPickerEl.style.display = selectiveMode ? "grid" : "none";
    if (!selectiveMode) selectedMembers = [];
  });

  // Send message
  async function sendMessage() {
    if (!activeChat) return;
    const rawText = String(messageInputEl.value || "");
    const text = rawText.trim();
    if (!text) return;

    const cipherType = cipherSelectEl.value;
    const key = cipherKeyInputEl.value;

    if (cipherType && !key) {
      alert("This cipher requires a key.");
      return;
    }

    let ciphertext = text;
    let usedKey = null;

    if (cipherType) {
      ciphertext = CipherEngine.encrypt(cipherType, text, key);
      usedKey = key;
    }

    // Clear immediately for responsiveness
    messageInputEl.value = "";
    autoResizeTextarea();

    try {
      if (activeChat.type === "dm") {
        await CC.sendDM({
          fromUid: currentUser.uid,
          toUid: activeChat.otherUid,
          ciphertext,
          cipherType: cipherType || null,
          key: usedKey,
        });
      } else if (activeChat.type === "group") {
        const envelopes = {};
        const members = activeChat.members || [];
        if (usedKey) {
          if (selectiveMode && selectedMembers.length) {
            selectedMembers.forEach((uid) => (envelopes[uid] = usedKey));
          } else {
            members.forEach((uid) => (envelopes[uid] = usedKey));
          }
          // Always include sender
          envelopes[currentUser.uid] = usedKey;
        }

        await CC.sendGroupMessage({
          groupId: activeChat.id,
          fromUid: currentUser.uid,
          ciphertext,
          cipherType: cipherType || null,
          keyEnvelopes: envelopes,
        });
      }
    } catch (e) {
      alert(e?.message || String(e));
    }
  }

  btnSendEl.addEventListener("click", sendMessage);

  // Render messages
  async function renderMessages(msgs, type) {
    messagesEl.innerHTML = "";
    const list = Array.isArray(msgs) ? msgs : [];

    for (const m of list) {
      const isSent = m.fromUid === currentUser.uid;
      const row = document.createElement("div");
      row.className = "bubbleRow" + (isSent ? " sent" : "");

      const bubble = document.createElement("div");
      bubble.className = "bubble" + (isSent ? " sent" : "");

      const meta = document.createElement("div");
      meta.className = "bubbleMeta";

      const cipherBadge = document.createElement("span");
      cipherBadge.className = "badge";
      cipherBadge.textContent = m.cipherType ? String(m.cipherType) : "plaintext";

      let displayText = String(m.ciphertext || "");
      let lock = "";

      try {
        if (m.cipherType) {
          if (type === "dm") {
            // Sender and receiver can decrypt (key stored on message)
            if (m.key) {
              displayText = CipherEngine.decrypt(m.cipherType, m.ciphertext, m.key);
              lock = "🔓";
            } else {
              lock = "🔒";
            }
          } else {
            // group: check envelope
            const env = m.keyEnvelopes || {};
            const myKey = env[currentUser.uid];
            if (myKey) {
              displayText = CipherEngine.decrypt(m.cipherType, m.ciphertext, myKey);
              lock = "🔓";
            } else {
              lock = "🔒";
            }
          }
        }
      } catch {
        lock = "🔒";
      }

      const lockBadge = document.createElement("span");
      lockBadge.className = "badge accent";
      lockBadge.textContent = lock || "•";

      // Who (for groups, show sender)
      if (type === "group" && !isSent) {
        const p = await getProfileCached(m.fromUid);
        if (p?.username) {
          const who = document.createElement("span");
          who.className = "badge";
          who.textContent = p.username;
          meta.appendChild(who);
        }
      }

      meta.appendChild(cipherBadge);
      if (m.cipherType) meta.appendChild(lockBadge);

      const body = document.createElement("div");
      body.textContent = displayText;

      bubble.appendChild(meta);
      bubble.appendChild(body);
      row.appendChild(bubble);
      messagesEl.appendChild(row);
    }

    // Scroll bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // New DM modal
  btnNewDMEl.addEventListener("click", () => {
    selectedDMUser = null;
    dmResultsEl.innerHTML = "";
    dmErrorEl.textContent = "";
    dmSearchInputEl.value = "";
    openModal(newDmModalEl);
    setTimeout(() => dmSearchInputEl.focus(), 50);
  });

  function renderUserResults(list, container, onSelect, selectedUid) {
    container.innerHTML = "";
    list.forEach((u) => {
      if (!u || !u.uid) return;
      if (u.uid === currentUser.uid) return;

      const row = document.createElement("div");
      row.className = "resultRow" + (selectedUid === u.uid ? " selected" : "");
      const left = document.createElement("div");
      left.className = "left";

      const av = document.createElement("div");
      av.className = "avatar";
      const avatar = u.avatar || CC.generateAvatar(u.username);
      av.textContent = avatar.initials;
      if (avatar.color) av.style.background = `linear-gradient(180deg, ${avatar.color}25, ${avatar.color}08)`;

      const txt = document.createElement("div");
      txt.style.minWidth = "0";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = u.username;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = u.email || u.phone || "";
      txt.appendChild(name);
      txt.appendChild(sub);

      left.appendChild(av);
      left.appendChild(txt);

      row.appendChild(left);
      row.addEventListener("click", () => onSelect(u));
      container.appendChild(row);
    });
  }

  // Debounce timers (search handlers bound later for stable selection)
  let _dmSearchTimer = null;

  btnOpenDmEl.addEventListener("click", async () => {
    dmErrorEl.textContent = "";
    if (!selectedDMUser) {
      dmErrorEl.textContent = "Select a user first.";
      return;
    }
    closeModal(newDmModalEl);
    await openDM(selectedDMUser.uid, selectedDMUser.username);
  });

  // New Group modal
  btnNewGroupEl.addEventListener("click", () => {
    selectedGroupUsers = [];
    groupNameInputEl.value = "";
    groupUserSearchEl.value = "";
    groupResultsEl.innerHTML = "";
    groupSelectedChipsEl.innerHTML = "";
    groupErrorEl.textContent = "";
    openModal(newGroupModalEl);
    setTimeout(() => groupNameInputEl.focus(), 50);
  });

  function renderGroupChips() {
    groupSelectedChipsEl.innerHTML = "";
    selectedGroupUsers.forEach((u) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = u.username;
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "✕";
      x.addEventListener("click", () => {
        selectedGroupUsers = selectedGroupUsers.filter((p) => p.uid !== u.uid);
        renderGroupChips();
      });
      chip.appendChild(x);
      groupSelectedChipsEl.appendChild(chip);
    });
  }

  let _groupSearchTimer = null;
  groupUserSearchEl.addEventListener("input", () => {
    groupErrorEl.textContent = "";
    const q = String(groupUserSearchEl.value || "").trim().toLowerCase();
    clearTimeout(_groupSearchTimer);
    _groupSearchTimer = setTimeout(async () => {
      if (!q) {
        groupResultsEl.innerHTML = "";
        return;
      }
      try {
        const res = await CC.searchUsers(q);
        renderUserResults(
          res,
          groupResultsEl,
          (u) => {
            if (selectedGroupUsers.some((p) => p.uid === u.uid)) return;
            selectedGroupUsers = [...selectedGroupUsers, u];
            renderGroupChips();
          },
          null
        );
      } catch (e) {
        groupErrorEl.textContent = e?.message || String(e);
      }
    }, 180);
  });

  btnCreateGroupEl.addEventListener("click", async () => {
    groupErrorEl.textContent = "";
    try {
      const name = String(groupNameInputEl.value || "").trim();
      if (!name) throw new Error("Group name is required.");
      const memberUids = selectedGroupUsers.map((u) => u.uid);
      const groupId = await CC.createGroup({ name, creatorUid: currentUser.uid, memberUids });
      closeModal(newGroupModalEl);
      await refreshGroupsIntoConvos();
      await openGroup(groupId, name);
    } catch (e) {
      groupErrorEl.textContent = e?.message || String(e);
    }
  });

  // Group info modal
  btnGroupInfoEl.addEventListener("click", () => showGroupInfoModal());

  async function showGroupInfoModal() {
    if (!activeChat || activeChat.type !== "group") return;
    groupInfoErrorEl.textContent = "";
    groupMembersListEl.innerHTML = "";
    groupInfoTitleEl.textContent = activeChat.name;

    const memberUids = activeChat.members || [];
    for (const uid of memberUids) {
      const p = uid === currentUser.uid ? currentProfile : await getProfileCached(uid);
      const row = document.createElement("div");
      row.className = "memberLine";

      const left = document.createElement("div");
      left.className = "left";

      const av = document.createElement("div");
      av.className = "avatar";
      const avatar = p?.avatar || CC.generateAvatar(p?.username || "CC");
      av.textContent = avatar.initials;
      if (avatar.color) av.style.background = `linear-gradient(180deg, ${avatar.color}25, ${avatar.color}08)`;

      const name = document.createElement("div");
      name.style.display = "grid";
      const u = document.createElement("div");
      u.style.fontWeight = "700";
      u.textContent = p?.username || uid;
      const s = document.createElement("div");
      s.className = "muted";
      s.style.fontSize = "12px";
      s.textContent = p?.email || p?.phone || "";
      name.appendChild(u);
      name.appendChild(s);

      left.appendChild(av);
      left.appendChild(name);

      const right = document.createElement("div");
      if (uid === currentUser.uid) {
        const you = document.createElement("span");
        you.className = "youBadge";
        you.textContent = "you";
        right.appendChild(you);
      }

      row.appendChild(left);
      row.appendChild(right);
      groupMembersListEl.appendChild(row);
    }

    openModal(groupInfoModalEl);
  }

  btnOpenAddMemberEl.addEventListener("click", () => openAddMember());

  function openAddMember() {
    if (!activeChat || activeChat.type !== "group") return;
    closeModal(groupInfoModalEl);
    selectedAddMemberUser = null;
    addMemberErrorEl.textContent = "";
    addMemberResultsEl.innerHTML = "";
    addMemberSearchEl.value = "";
    addMemberTitleEl.textContent = `Add to ${activeChat.name}`;
    openModal(addMemberModalEl);
    setTimeout(() => addMemberSearchEl.focus(), 50);
  }

  let _addMemberTimer = null;

  btnConfirmAddMemberEl.addEventListener("click", async () => {
    addMemberErrorEl.textContent = "";
    try {
      if (!activeChat || activeChat.type !== "group") return;
      if (!selectedAddMemberUser) throw new Error("Select a user first.");
      await CC.addMemberToGroup(activeChat.id, selectedAddMemberUser.uid);

      // Refresh activeChat info
      const info = await CC.getGroupInfo(activeChat.id);
      activeChat.members = info?.members || activeChat.members;
      activeChat.memberProfiles = [];
      for (const uid of activeChat.members) {
        if (uid === currentUser.uid) continue;
        const p = await getProfileCached(uid);
        if (p) activeChat.memberProfiles.push(p);
      }
      chatSubEl.textContent = `${activeChat.members.length} members`;
      buildMemberPicker();
      await refreshGroupsIntoConvos();

      closeModal(addMemberModalEl);
      openModal(groupInfoModalEl);
      await showGroupInfoModal();
    } catch (e) {
      addMemberErrorEl.textContent = e?.message || String(e);
    }
  });

  // Auth + profile fetch logic with retries
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function resolveProfileWithRetries(uid) {
    for (let i = 0; i < 5; i++) {
      const p = await CC.getUserProfile(uid);
      if (p) return p;
      await sleep(800);
    }
    return null;
  }

  async function ensureProfile(user) {
    let p = await resolveProfileWithRetries(user.uid);
    if (p) return p;
    // Auto-create profile without logging out
    const email = user.email || null;
    const phone = user.phoneNumber || null;
    const fallback = (email ? email.split("@")[0] : phone ? phone.replace(/\D/g, "").slice(-6) : "user") || "user";
    const username = String(fallback).toLowerCase().slice(0, 20);
    try {
      p = await CC.createUserProfile(user.uid, { uid: user.uid, username, email, phone });
      return p;
    } catch (e) {
      return null;
    }
  }

  async function refreshGroupsIntoConvos() {
    const groups = await CC.getGroupsForUser(currentUser.uid);
    const existingDm = allConvos.filter((c) => c.type === "dm");
    const groupConvos = groups.map((g) => ({
      type: "group",
      id: g.groupId,
      name: g.name,
      lastMessage: "",
      lastTimestamp: 0,
      avatar: g.avatar || CC.generateAvatar(g.name),
    }));
    allConvos = [...existingDm, ...groupConvos];
    renderConversations();
  }

  async function init() {
    initCipherSelect();

    btnLogoutEl.addEventListener("click", async () => {
      await CC.logoutUser();
      window.location.replace("login.html");
    });

    CC.onAuthChange(async (user) => {
      if (authResolved) return;
      authResolved = true;

      if (!user) {
        window.location.replace("login.html");
        return;
      }

      currentUser = user;
      currentProfile = await ensureProfile(user);
      if (!currentProfile) {
        await CC.logoutUser();
        window.location.replace("login.html");
        return;
      }

      _profileCache[currentProfile.uid] = currentProfile;

      // Update user bar
      meUsernameEl.textContent = currentProfile.username;
      const av = currentProfile.avatar || CC.generateAvatar(currentProfile.username);
      meAvatarEl.textContent = av.initials;
      meAvatarEl.style.background = av.color ? `linear-gradient(180deg, ${av.color}25, ${av.color}08)` : "";

      // Listeners
      // DMs: conversations list from RTDB
      CC.listenConversations(currentUser.uid, async (convos) => {
        const dmConvos = [];
        for (const c of convos) {
          const otherUid = c.otherUid;
          try {
            const otherProfile = await getProfileCached(otherUid);
            dmConvos.push({
              type: "dm",
              id: c.id,
              otherUid,
              name: otherProfile?.username || "dm",
              lastMessage: c.lastMessage || "",
              lastTimestamp: c.lastTimestamp || 0,
              avatar: otherProfile?.avatar || CC.generateAvatar(otherProfile?.username || "dm"),
            });
          } catch {
        // Skip broken DM entries silently
          }
        }
        const groupConvos = allConvos.filter((x) => x.type === "group");
        allConvos = [...dmConvos, ...groupConvos];
        renderConversations();
      });

      // Groups: fetch from Firestore (no realtime needed for list)
      await refreshGroupsIntoConvos();
    });

    // Modal close on backdrop click
    document.querySelectorAll(".modalOverlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal(overlay);
      });
    });
  }

  // Fix: stable user-results selection rendering without arguments.callee
  function bindSelectableUserList({ results, container, onSelected }) {
    let selected = null;
    function render() {
      renderUserResults(
        results,
        container,
        (u) => {
          selected = u;
          render();
          if (onSelected) onSelected(u);
        },
        selected?.uid
      );
    }
    render();
    return () => selected;
  }

  // Replace the earlier selection logic by rebinding on each search.
  function patchSearchSelectionHandlers() {
    let getDmSel = null;
    dmSearchInputEl.addEventListener("input", () => {
      dmErrorEl.textContent = "";
      const q = String(dmSearchInputEl.value || "").trim().toLowerCase();
      clearTimeout(_dmSearchTimer);
      _dmSearchTimer = setTimeout(async () => {
        if (!q) {
          dmResultsEl.innerHTML = "";
          selectedDMUser = null;
          return;
        }
        try {
          const res = await CC.searchUsers(q);
          getDmSel = bindSelectableUserList({
            results: res,
            container: dmResultsEl,
            onSelected: (u) => (selectedDMUser = u),
          });
          selectedDMUser = getDmSel ? getDmSel() : null;
        } catch (e) {
          dmErrorEl.textContent = e?.message || String(e);
        }
      }, 180);
    });

    let getAddSel = null;
    addMemberSearchEl.addEventListener("input", () => {
      addMemberErrorEl.textContent = "";
      const q = String(addMemberSearchEl.value || "").trim().toLowerCase();
      clearTimeout(_addMemberTimer);
      _addMemberTimer = setTimeout(async () => {
        if (!q) {
          addMemberResultsEl.innerHTML = "";
          selectedAddMemberUser = null;
          return;
        }
        try {
          const res = await CC.searchUsers(q);
          const existing = new Set(activeChat?.members || []);
          const filtered = res.filter((u) => u && u.uid && !existing.has(u.uid));
          getAddSel = bindSelectableUserList({
            results: filtered,
            container: addMemberResultsEl,
            onSelected: (u) => (selectedAddMemberUser = u),
          });
          selectedAddMemberUser = getAddSel ? getAddSel() : null;
        } catch (e) {
          addMemberErrorEl.textContent = e?.message || String(e);
        }
      }, 180);
    });
  }

  // Run init
  init();
  // Override the earlier ad-hoc selection logic by attaching stable handlers last
  patchSearchSelectionHandlers();
})();

