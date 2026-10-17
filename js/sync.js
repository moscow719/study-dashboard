(function () {
  const SUPABASE_URL = "https://czcdwxfspywgtqdqdfyt.supabase.co";
  const SUPABASE_KEY = "sb_publishable_b_gB_7oWGovqnCC7ZrpFhw_eLGVnbjm";
  const DIRTY_KEY = "study-dashboard-dirty";
  const SKIP_KEY = "study-dashboard-skip-login";

  if (!window.supabase || typeof saveData !== "function") return;

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  let user = null;
  let pushTimer = null;
  let pushing = false;
  let statusText = "";

  const originalSave = saveData;

  function setDirty(value) {
    try {
      if (value) localStorage.setItem(DIRTY_KEY, "1");
      else localStorage.removeItem(DIRTY_KEY);
    } catch (error) {}
  }

  function isDirty() {
    try {
      return localStorage.getItem(DIRTY_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function payload() {
    return { subjects: subjects, termId: currentTermId };
  }

  function setStatus(text) {
    statusText = text;
    renderAccount();
  }

  async function push() {
    if (!user || pushing) return;
    pushing = true;
    setStatus("جاري الحفظ...");
    try {
      const { error } = await client.from("dashboards").upsert({
        user_id: user.id,
        data: payload(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setDirty(false);
      setStatus("تم الحفظ في السحابة ✓");
    } catch (error) {
      setStatus("مش متصل — هيتحفظ لما النت يرجع");
    }
    pushing = false;
  }

  function schedulePush() {
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 700);
  }

  saveData = function () {
    originalSave();
    setDirty(true);
    schedulePush();
  };

  async function pull() {
    if (!user) return;
    setStatus("جاري المزامنة...");
    try {
      const { data, error } = await client
        .from("dashboards")
        .select("data")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      const remote = data && data.data;
      const hasRemote = remote && Array.isArray(remote.subjects) && remote.subjects.length > 0;
      if (!hasRemote || isDirty()) {
        await push();
        return;
      }
      subjects.splice(0, subjects.length, ...remote.subjects);
      if (terms.some((t) => t.id === remote.termId)) currentTermId = remote.termId;
      originalSave();
      renderAll();
      setStatus("تم الحفظ في السحابة ✓");
    } catch (error) {
      setStatus("مش متصل — شغال على نسخة الجهاز");
    }
  }

  function authModal() {
    let el = document.getElementById("authModal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "authModal";
    el.className = "auth-modal hidden";
    el.innerHTML = `
      <form class="auth-card" id="authForm" novalidate>
        <div class="auth-logo">📚</div>
        <h2 id="authTitle">تسجيل الدخول</h2>
        <p class="auth-sub">سجّل دخولك عشان بياناتك تتزامن بين الموبايل واللاب</p>
        <input id="authEmail" type="email" placeholder="الإيميل" autocomplete="email" required />
        <input id="authPass" type="password" placeholder="الباسورد (6 حروف على الأقل)" autocomplete="current-password" required />
        <p class="auth-error hidden" id="authError"></p>
        <button class="auth-primary" id="authSubmit" type="submit">دخول</button>
        <button class="auth-link" id="authToggle" type="button">معنديش حساب — إنشاء حساب جديد</button>
        <button class="auth-link muted" id="authSkip" type="button">متابعة بدون حساب</button>
      </form>`;
    document.body.appendChild(el);
    return el;
  }

  let mode = "signin";

  function applyMode() {
    const signin = mode === "signin";
    document.getElementById("authTitle").textContent = signin ? "تسجيل الدخول" : "إنشاء حساب جديد";
    document.getElementById("authSubmit").textContent = signin ? "دخول" : "إنشاء الحساب";
    document.getElementById("authToggle").textContent = signin
      ? "معنديش حساب — إنشاء حساب جديد"
      : "عندي حساب — تسجيل الدخول";
    document.getElementById("authPass").autocomplete = signin ? "current-password" : "new-password";
  }

  function showAuth() {
    authModal().classList.remove("hidden");
    applyMode();
  }

  function hideAuth() {
    authModal().classList.add("hidden");
  }

  function showError(message) {
    const box = document.getElementById("authError");
    box.textContent = message;
    box.classList.toggle("hidden", !message);
  }

  function friendlyError(error) {
    const text = String((error && error.message) || "").toLowerCase();
    if (text.includes("invalid login")) return "الإيميل أو الباسورد غلط";
    if (text.includes("already registered")) return "الإيميل ده مسجل قبل كده، جرب تسجل دخول";
    if (text.includes("password")) return "الباسورد لازم يكون 6 حروف على الأقل";
    if (text.includes("valid email") || text.includes("invalid email")) return "اكتب إيميل صحيح";
    if (text.includes("rate limit")) return "محاولات كتير، استنى شوية وجرب تاني";
    if (text.includes("fetch") || text.includes("network")) return "مفيش نت، جرب تاني";
    return "حصلت مشكلة، جرب تاني";
  }

  async function submitAuth(event) {
    event.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPass").value;
    if (!email || !password) return showError("اكتب الإيميل والباسورد");
    const button = document.getElementById("authSubmit");
    button.disabled = true;
    showError("");
    const result =
      mode === "signin"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password });
    button.disabled = false;
    if (result.error) return showError(friendlyError(result.error));
    if (!result.data.session) {
      return showError("الحساب اتعمل بس محتاج تأكيد — اقفل Confirm email من Supabase");
    }
    document.getElementById("authPass").value = "";
  }

  function renderAccount() {
    const nav = document.querySelector(".drawer-nav");
    if (!nav) return;
    let box = document.getElementById("accountBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "accountBox";
      nav.insertBefore(box, nav.firstChild);
    }
    if (user) {
      box.innerHTML = `
        <div class="account-info">
          <strong>${esc(user.email)}</strong>
          <small>${esc(statusText)}</small>
        </div>
        <button class="drawer-item" data-account="sync"><span>🔄</span>مزامنة الآن</button>
        <button class="drawer-item" data-account="logout"><span>🚪</span>تسجيل الخروج</button>
        <div class="drawer-sep"></div>`;
    } else {
      box.innerHTML = `
        <button class="drawer-item" data-account="login"><span>🔐</span>تسجيل الدخول للمزامنة</button>
        <div class="drawer-sep"></div>`;
    }
  }

  async function onSession(session) {
    const nextUser = session ? session.user : null;
    const changed = (nextUser && nextUser.id) !== (user && user.id);
    user = nextUser;
    renderAccount();
    if (!user) return;
    hideAuth();
    if (changed) await pull();
  }

  document.addEventListener(
    "click",
    async (event) => {
      const btn = event.target.closest("[data-account]");
      if (!btn) return;
      const action = btn.dataset.account;
      if (action === "login") {
        try {
          localStorage.removeItem(SKIP_KEY);
        } catch (error) {}
        document.getElementById("backdrop").click();
        showAuth();
      }
      if (action === "sync") {
        if (isDirty()) await push();
        else await pull();
      }
      if (action === "logout") {
        await client.auth.signOut();
        document.getElementById("backdrop").click();
        showAuth();
      }
    },
    true
  );

  authModal();
  document.getElementById("authForm").addEventListener("submit", submitAuth);
  document.getElementById("authToggle").addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    showError("");
    applyMode();
  });
  document.getElementById("authSkip").addEventListener("click", () => {
    try {
      localStorage.setItem(SKIP_KEY, "1");
    } catch (error) {}
    hideAuth();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && user && !isDirty()) pull();
  });
  window.addEventListener("online", () => {
    if (user && isDirty()) push();
  });

  renderAccount();

  client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => onSession(session), 0);
  });

  client.auth.getSession().then(({ data }) => {
    if (!data.session) {
      let skipped = false;
      try {
        skipped = localStorage.getItem(SKIP_KEY) === "1";
      } catch (error) {}
      if (!skipped) showAuth();
    }
  });
})();