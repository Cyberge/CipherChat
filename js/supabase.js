const SUPABASE_URL = "https://ivaxurwvbnwdierpzulq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2YXh1cnd2Ym53ZGllcnB6dWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Njk3MTgsImV4cCI6MjA5NDU0NTcxOH0.pdgTQx89e7KLir9PVfeOOCsgcmuuutth5k93yaSGTog";

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function generateAvatar(name) {
  const colors = ["#1a6b4a", "#8b3a3a", "#2c5f8a", "#6b4a8b", "#8b6a1a", "#3a6b6b", "#6b3a5a"];
  const n = String(name || "?");
  return { initials: n.slice(0, 2).toUpperCase(), color: colors[n.charCodeAt(0) % colors.length] };
}

const CC = {

  async registerUser({ email, username, password }) {
    username = username.toLowerCase().trim();
    if (username.length < 3) throw new Error("Username must be at least 3 characters.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    const { data: existing } = await _sb.from("users").select("uid").eq("username", username).maybeSingle();
    if (existing) throw new Error("Username already taken.");
    const { data, error } = await _sb.auth.signUp({ email, password });
    if (error) throw error;
    const uid = data.user.id;
    const av = generateAvatar(username);
    await _sb.from("users").insert({ uid, username, email, avatar_initials: av.initials, avatar_color: av.color });
    return data.user;
  },

  async loginWithEmail(email, password) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) {
      const { data: u } = await _sb.from("users").select("uid").eq("email", email.trim()).maybeSingle();
      if (!u) throw new Error("USER_NOT_FOUND");
      throw new Error("WRONG_PASSWORD");
    }
    return data.user;
  },

  async loginWithUsername(username, password) {
    username = username.toLowerCase().trim();
    const { data: u } = await _sb.from("users").select("email").eq("username", username).maybeSingle();
    if (!u) throw new Error("USER_NOT_FOUND");
    return this.loginWithEmail(u.email, password);
  },

  async logoutUser() { await _sb.auth.signOut(); },

  onAuthChange(callback) {
    _sb.auth.onAuthStateChange((_e, session) => callback(session?.user || null));
  },

  async getUserProfile(uid) {
    const { data } = await _sb.from("users").select("*").eq("uid", uid).maybeSingle();
    return data ? this._mapUser(data) : null;
  },

  async createUserProfile(uid, { username, email, phone }) {
    username = (username || "user").toLowerCase().slice(0, 20);
    const av = generateAvatar(username);
    await _sb.from("users").upsert({ uid, username, email: email || null, phone: phone || null, avatar_initials: av.initials, avatar_color: av.color });
    return this.getUserProfile(uid);
  },

  async searchUsers(query) {
    if (!query) return [];
    const { data } = await _sb.from("users").select("*").ilike("username", `${query}%`).limit(10);
    return (data || []).map(u => this._mapUser(u));
  },

  async getEmailByPhone(phone) {
    const { data } = await _sb.from("users").select("email").eq("phone", phone.trim()).maybeSingle();
    return data?.email || null;
  },

  _mapUser(u) {
    return { uid: u.uid, username: u.username, email: u.email || null, phone: u.phone || null, avatar: { initials: u.avatar_initials, color: u.avatar_color } };
  },

  generateAvatar,

  getDMId(uid1, uid2) { return [uid1, uid2].sort().join("_"); },

  async sendDM({ fromUid, toUid, ciphertext, cipherType, key }) {
    const { error } = await _sb.from("direct_messages").insert({
      id: crypto.randomUUID(), dm_id: this.getDMId(fromUid, toUid),
      from_uid: fromUid, to_uid: toUid,
      ciphertext, cipher_type: cipherType || null, key: key || null, timestamp: Date.now()
    });
    if (error) throw error;
  },

  listenDM(uid1, uid2, callback) {
    const dmId = this.getDMId(uid1, uid2);
    const load = () => _sb.from("direct_messages").select("*").eq("dm_id", dmId).order("timestamp")
      .then(({ data }) => callback(this._mapDMs(data)));
    load();
    const ch = _sb.channel(`dm:${dmId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `dm_id=eq.${dmId}` }, load)
      .subscribe();
    return () => _sb.removeChannel(ch);
  },

  _mapDMs(rows) {
    return (rows || []).map(r => ({ id: r.id, fromUid: r.from_uid, toUid: r.to_uid, ciphertext: r.ciphertext, cipherType: r.cipher_type, key: r.key, timestamp: r.timestamp }));
  },

  listenConversations(uid, callback) {
    const load = async () => {
      const { data } = await _sb.from("direct_messages").select("*")
        .or(`from_uid.eq.${uid},to_uid.eq.${uid}`).order("timestamp", { ascending: false });
      const seen = new Set();
      const convos = [];
      for (const r of (data || [])) {
        const otherUid = r.from_uid === uid ? r.to_uid : r.from_uid;
        if (seen.has(otherUid)) continue;
        seen.add(otherUid);
        convos.push({ id: r.dm_id, otherUid, lastMessage: r.ciphertext, lastTimestamp: r.timestamp });
      }
      callback(convos);
    };
    load();
    const ch = _sb.channel(`convos:${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, load)
      .subscribe();
    return () => _sb.removeChannel(ch);
  },

  async createGroup({ name, creatorUid, memberUids }) {
    const groupId = crypto.randomUUID();
    const av = generateAvatar(name);
    const { error } = await _sb.from("groups").insert({
      group_id: groupId, name, creator_uid: creatorUid,
      members: [...new Set([creatorUid, ...memberUids])],
      avatar_initials: av.initials, avatar_color: av.color
    });
    if (error) throw error;
    return groupId;
  },

  async getGroupInfo(groupId) {
    const { data } = await _sb.from("groups").select("*").eq("group_id", groupId).maybeSingle();
    return data ? this._mapGroup(data) : null;
  },

  async getGroupsForUser(uid) {
    const { data } = await _sb.from("groups").select("*").contains("members", [uid]);
    return (data || []).map(g => this._mapGroup(g));
  },

  async addMemberToGroup(groupId, newUid) {
    const info = await this.getGroupInfo(groupId);
    if (!info) throw new Error("Group not found.");
    const members = [...new Set([...info.members, newUid])];
    const { error } = await _sb.from("groups").update({ members }).eq("group_id", groupId);
    if (error) throw error;
  },

  _mapGroup(g) {
    return { groupId: g.group_id, name: g.name, creatorUid: g.creator_uid, members: g.members || [], avatar: { initials: g.avatar_initials, color: g.avatar_color } };
  },

  async sendGroupMessage({ groupId, fromUid, ciphertext, cipherType, keyEnvelopes }) {
    const { error } = await _sb.from("group_messages").insert({
      id: crypto.randomUUID(), group_id: groupId, from_uid: fromUid,
      ciphertext, cipher_type: cipherType || null, key_envelopes: keyEnvelopes || {}, timestamp: Date.now()
    });
    if (error) throw error;
  },

  listenGroupMessages(groupId, callback) {
    const load = () => _sb.from("group_messages").select("*").eq("group_id", groupId).order("timestamp")
      .then(({ data }) => callback(this._mapGroupMsgs(data)));
    load();
    const ch = _sb.channel(`group:${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, load)
      .subscribe();
    return () => _sb.removeChannel(ch);
  },

  _mapGroupMsgs(rows) {
    return (rows || []).map(r => ({ id: r.id, fromUid: r.from_uid, groupId: r.group_id, ciphertext: r.ciphertext, cipherType: r.cipher_type, keyEnvelopes: r.key_envelopes || {}, timestamp: r.timestamp }));
  },
};

window.CC = CC;
