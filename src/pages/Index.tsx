import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

const AUTH_URL = "https://functions.poehali.dev/169c022e-b3d7-4904-8594-ebe13bafa4a0";
const DOMAINS_URL = "https://functions.poehali.dev/e2f96130-cc15-4cba-903e-300302d2fe41";

const EXTENSIONS = [
  { ext: "ru", price: 169 },
  { ext: "net", price: 149 },
  { ext: "org", price: 189 },
  { ext: "space", price: 159 },
  { ext: "me", price: 149 },
  { ext: "online", price: 229 },
  { ext: "com", price: 199 },
];

type User = { id: number; email: string; name: string; lastName: string; middleName: string; phone: string };
type SavedDomain = { id: number; domain: string; ext: string; price: number; savedAt: string };
type Order = {
  id: number; domain: string; ext: string; price: number; status: string; orderedAt: string;
  domainStatus: string; verifiedAt: string | null; connectedIp: string; connectionStatus: string;
};
type Tab = "home" | "cabinet" | "saved" | "support";
type AuthMode = "login" | "register";

const CONN_STEPS: Record<string, { label: string; color: string; icon: string }> = {
  none: { label: "Не привязан", color: "text-gray-400", icon: "Unlink" },
  connecting: { label: "Подключение...", color: "text-yellow-500", icon: "Loader" },
  dns: { label: "Подключаю DNS...", color: "text-blue-500", icon: "Globe" },
  connected: { label: "Привязан", color: "text-green-500", icon: "CheckCircle" },
};

const DOMAIN_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  verifying: { label: "Верификация...", color: "text-yellow-600", bg: "bg-yellow-50" },
  active: { label: "Активен", color: "text-green-600", bg: "bg-green-50" },
  pending: { label: "Ожидание", color: "text-gray-500", bg: "bg-gray-50" },
};

export default function Index() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [selectedExt, setSelectedExt] = useState("ru");
  const [extDropOpen, setExtDropOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<typeof EXTENSIONS | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "", lastName: "", middleName: "", phone: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [savedDomains, setSavedDomains] = useState<SavedDomain[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [supportForm, setSupportForm] = useState({ name: "", email: "", message: "" });
  const [supportLoading, setSupportLoading] = useState(false);
  const [buyModal, setBuyModal] = useState<{ domain: string; ext: string; price: number } | null>(null);
  const [connectModal, setConnectModal] = useState<Order | null>(null);
  const [connectForm, setConnectForm] = useState({ apiKey: "", ipAddress: "" });
  const [connectStep, setConnectStep] = useState<"form" | "connecting" | "dns" | "done">("form");
  const inputRef = useRef<HTMLInputElement>(null);
  const extRef = useRef<HTMLDivElement>(null);

  const getToken = () => localStorage.getItem("spaceruToken");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (extRef.current && !extRef.current.contains(e.target as Node)) setExtDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (token) {
      fetch(AUTH_URL, { headers: { "X-Auth-Token": token } })
        .then(r => r.json())
        .then(d => { if (d.id) setUser(d); })
        .catch(() => {});
    }
  }, []);

  const loadSaved = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const r = await fetch(`${DOMAINS_URL}/saved`, { headers: { "X-Auth-Token": token } });
    const d = await r.json();
    if (Array.isArray(d)) setSavedDomains(d);
  }, []);

  const loadOrders = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const r = await fetch(`${DOMAINS_URL}/orders`, { headers: { "X-Auth-Token": token } });
    const d = await r.json();
    if (Array.isArray(d)) setOrders(d);
  }, []);

  useEffect(() => {
    if (tab === "saved" && user) loadSaved();
    if (tab === "cabinet" && user) loadOrders();
  }, [tab, user, loadSaved, loadOrders]);

  // Опрос статуса верификации каждые 5 сек пока есть "verifying"
  useEffect(() => {
    if (tab !== "cabinet" || !user) return;
    const hasVerifying = orders.some(o => o.domainStatus === "verifying");
    if (!hasVerifying) return;
    const timer = setInterval(loadOrders, 5000);
    return () => clearInterval(timer);
  }, [tab, orders, user, loadOrders]);

  const handleSearch = () => {
    const q = query.trim().replace(/\.(ru|net|org|space|me|online|com)$/i, "").toLowerCase();
    if (!q) return;
    setSearchQuery(q);
    setSearchResults(EXTENSIONS);
    setExtDropOpen(false);
  };

  const handleAuth = async () => {
    if (authMode === "register") {
      if (!authForm.name || !authForm.lastName || !authForm.email || !authForm.password || !authForm.phone) {
        toast({ title: "Заполните все обязательные поля", variant: "destructive" }); return;
      }
    }
    setAuthLoading(true);
    const path = authMode === "login" ? "/login" : "/register";
    const body = authMode === "login"
      ? { email: authForm.email, password: authForm.password }
      : { email: authForm.email, password: authForm.password, name: authForm.name, lastName: authForm.lastName, middleName: authForm.middleName, phone: authForm.phone };
    try {
      const r = await fetch(`${AUTH_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.token) {
        localStorage.setItem("spaceruToken", d.token);
        setUser({ id: d.id, email: d.email, name: d.name, lastName: d.lastName || "", middleName: d.middleName || "", phone: d.phone || "" });
        setAuthOpen(false);
        setAuthForm({ email: "", password: "", name: "", lastName: "", middleName: "", phone: "" });
        toast({ title: authMode === "login" ? "Добро пожаловать!" : "Аккаунт создан!", description: `Привет, ${d.lastName || ""} ${d.name}` });
      } else {
        toast({ title: "Ошибка", description: d.error || "Что-то пошло не так", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Нет соединения с сервером", variant: "destructive" });
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    const token = getToken();
    if (token) await fetch(`${AUTH_URL}/logout`, { method: "POST", headers: { "X-Auth-Token": token } });
    localStorage.removeItem("spaceruToken");
    setUser(null);
    setTab("home");
    toast({ title: "Вы вышли из аккаунта" });
  };

  const handleSave = async (domain: string, ext: string, price: number) => {
    if (!user) { setAuthOpen(true); return; }
    const token = getToken();
    const r = await fetch(`${DOMAINS_URL}/saved`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token! },
      body: JSON.stringify({ domain, ext, price }),
    });
    const d = await r.json();
    if (d.ok) toast({ title: "Сохранено!", description: `${domain}.${ext} добавлен в список` });
    else toast({ title: "Уже сохранён", description: `${domain}.${ext}` });
  };

  const handleBuy = async (domain: string, ext: string, price: number) => {
    if (!user) { setAuthOpen(true); setBuyModal(null); return; }
    const token = getToken();
    const r = await fetch(`${DOMAINS_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token! },
      body: JSON.stringify({ domain, ext, price }),
    });
    const d = await r.json();
    setBuyModal(null);
    if (d.ok) {
      toast({ title: "Заказ оформлен!", description: `${domain}.${ext} — верификация займёт 1–24 часа` });
      setTab("cabinet");
      setTimeout(loadOrders, 500);
    }
  };

  const handleConnect = async () => {
    if (!connectModal || !connectForm.apiKey || !connectForm.ipAddress) {
      toast({ title: "Заполните API ключ и IP адрес", variant: "destructive" }); return;
    }
    const token = getToken();
    setConnectStep("connecting");
    await fetch(`${DOMAINS_URL}/orders/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token! },
      body: JSON.stringify({ orderId: connectModal.id, apiKey: connectForm.apiKey, ipAddress: connectForm.ipAddress }),
    });
    // Шаг DNS через 2 сек
    setTimeout(async () => {
      setConnectStep("dns");
      await fetch(`${DOMAINS_URL}/orders/dns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Auth-Token": token! },
        body: JSON.stringify({ orderId: connectModal.id }),
      });
      // Завершение через 2.5 сек
      setTimeout(async () => {
        await fetch(`${DOMAINS_URL}/orders/connected`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Auth-Token": token! },
          body: JSON.stringify({ orderId: connectModal.id }),
        });
        setConnectStep("done");
        await loadOrders();
      }, 2500);
    }, 2000);
  };

  const handleDisconnect = async (orderId: number) => {
    const token = getToken();
    await fetch(`${DOMAINS_URL}/orders/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token! },
      body: JSON.stringify({ orderId }),
    });
    toast({ title: "Домен отвязан" });
    loadOrders();
  };

  const handleSupport = async () => {
    if (!supportForm.name || !supportForm.email || !supportForm.message) {
      toast({ title: "Заполните все поля", variant: "destructive" }); return;
    }
    setSupportLoading(true);
    const r = await fetch(`${DOMAINS_URL}/support`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(supportForm),
    });
    const d = await r.json();
    setSupportLoading(false);
    if (d.ok) {
      toast({ title: "Отправлено!", description: "Мы ответим в течение рабочего дня" });
      setSupportForm({ name: "", email: "", message: "" });
    }
  };

  const requireAuth = (action: () => void) => {
    if (!user) { setAuthOpen(true); return; }
    action();
  };

  const inp = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black transition-colors";

  return (
    <div className="min-h-screen bg-white font-sans">
      <Toaster />

      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => setTab("home")} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Icon name="Globe" size={16} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">SpaceRu</span>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            {([
              { id: "home", label: "Поиск" },
              { id: "saved", label: "Сохранённые" },
              { id: "cabinet", label: "Кабинет" },
              { id: "support", label: "Поддержка" },
            ] as { id: Tab; label: string }[]).map(({ id, label }) => (
              <button key={id}
                onClick={() => id === "home" || id === "support" ? setTab(id) : requireAuth(() => setTab(id))}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === id ? "bg-gray-100 text-black" : "text-gray-500 hover:text-black hover:bg-gray-50"}`}>
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 hidden md:block">{user.lastName} {user.name}</span>
                <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-black transition-colors">Выйти</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => { setAuthMode("register"); setAuthOpen(true); }} className="text-sm text-gray-500 hover:text-black transition-colors hidden md:block">Регистрация</button>
                <button onClick={() => { setAuthMode("login"); setAuthOpen(true); }} className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition-all">Войти</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 pb-24 md:pb-12">

        {/* HOME */}
        {tab === "home" && (
          <div className="animate-fade-in">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-black mb-4 leading-tight">
                Найдите домен<br />для вашего сайта
              </h1>
              <p className="text-gray-400 text-lg">Регистрация доменов от 149 ₽ в год</p>
            </div>

            {/* Search */}
            <div className="flex gap-2 mb-6 shadow-sm border border-gray-200 rounded-xl bg-white p-1.5">
              <div className="flex items-center flex-1 px-3 gap-0">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="Название сайта"
                  className="flex-1 outline-none text-base text-gray-800 placeholder-gray-300 bg-transparent py-2.5 min-w-0"
                />
                <div className="relative flex-shrink-0" ref={extRef}>
                  <button
                    onClick={() => setExtDropOpen(v => !v)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-50 transition-all text-gray-700 font-semibold text-base border border-gray-200 ml-1"
                  >
                    <span className="text-gray-400 font-normal">.</span>{selectedExt}
                    <Icon name="ChevronDown" size={14} className={`text-gray-400 transition-transform ${extDropOpen ? "rotate-180" : ""}`} />
                  </button>
                  {extDropOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1 min-w-[130px]">
                      {EXTENSIONS.map(({ ext, price }) => (
                        <button key={ext} onClick={() => { setSelectedExt(ext); setExtDropOpen(false); }}
                          className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50 transition-all ${selectedExt === ext ? "font-semibold text-black" : "text-gray-600"}`}>
                          <span>.{ext}</span>
                          <span className="text-gray-400 text-xs">{price} ₽</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={handleSearch} className="bg-black text-white px-6 py-3 rounded-lg font-semibold text-sm hover:bg-gray-800 active:scale-95 transition-all flex-shrink-0">
                Подобрать
              </button>
            </div>

            {/* Results */}
            {searchResults && (
              <div className="mt-2 animate-slide-up">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-400">Результаты для <span className="font-semibold text-black">«{searchQuery}»</span></p>
                  <button onClick={() => { setSearchResults(null); setQuery(""); }} className="text-xs text-gray-400 hover:text-black transition-colors">Сбросить</button>
                </div>
                <div className="space-y-2">
                  {searchResults.map(({ ext, price }, i) => (
                    <div key={ext}
                      className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all bg-white group"
                      style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${i * 50}ms forwards` }}>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                        <span className="font-semibold text-gray-700 text-base md:text-lg">
                          {searchQuery}.<span className="text-black font-bold">{ext}</span>
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium hidden md:block">Свободен</span>
                      </div>
                      <div className="flex items-center gap-2 md:gap-3">
                        <span className="font-bold text-gray-900">{price} ₽<span className="text-xs font-normal text-gray-400">/год</span></span>
                        <button onClick={() => handleSave(searchQuery, ext, price)} title="Сохранить"
                          className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-black hover:border-black transition-all opacity-0 group-hover:opacity-100">
                          <Icon name="Bookmark" size={15} />
                        </button>
                        <button onClick={() => setBuyModal({ domain: searchQuery, ext, price })}
                          className="bg-black text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 active:scale-95 transition-all">
                          Купить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prices */}
            {!searchResults && (
              <div className="mt-12">
                <h2 className="text-2xl font-bold text-center mb-6">Цены на домены</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {EXTENSIONS.map(({ ext, price }) => (
                    <button key={ext} onClick={() => { setSelectedExt(ext); inputRef.current?.focus(); }}
                      className="p-5 rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all text-center group">
                      <div className="text-2xl font-black mb-1 group-hover:scale-105 transition-transform inline-block">.{ext}</div>
                      <div className="text-gray-400 text-sm">от <span className="font-bold text-black">{price} ₽</span>/год</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SAVED */}
        {tab === "saved" && user && (
          <div className="animate-fade-in">
            <h2 className="text-3xl font-black mb-2">Сохранённые домены</h2>
            <p className="text-gray-400 mb-8">Домены, которые вы отложили на потом</p>
            {savedDomains.length === 0 ? (
              <div className="text-center py-20 text-gray-300">
                <Icon name="Bookmark" size={48} className="mx-auto mb-4" />
                <p className="text-lg">Нет сохранённых доменов</p>
                <button onClick={() => setTab("home")} className="mt-4 text-black underline text-sm font-medium">Найти домен</button>
              </div>
            ) : (
              <div className="space-y-2">
                {savedDomains.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-all">
                    <div>
                      <span className="font-semibold text-lg">{d.domain}.{d.ext}</span>
                      <p className="text-sm text-gray-400">Сохранено {new Date(d.savedAt).toLocaleDateString("ru-RU")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{d.price} ₽<span className="text-sm font-normal text-gray-400">/год</span></span>
                      <button onClick={() => setBuyModal({ domain: d.domain, ext: d.ext, price: d.price })}
                        className="bg-black text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-all">
                        Купить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CABINET */}
        {tab === "cabinet" && user && (
          <div className="animate-fade-in">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-3xl font-black mb-1">{user.lastName} {user.name} {user.middleName}</h2>
                <p className="text-gray-400">{user.email}</p>
                {user.phone && <p className="text-gray-400 text-sm">{user.phone}</p>}
              </div>
              <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-black transition-colors border border-gray-200 px-4 py-2 rounded-lg">
                Выйти
              </button>
            </div>

            <h3 className="text-lg font-bold mb-4">Мои домены</h3>
            {orders.length === 0 ? (
              <div className="text-center py-16 text-gray-300">
                <Icon name="ShoppingCart" size={48} className="mx-auto mb-4" />
                <p className="text-lg">Заказов пока нет</p>
                <button onClick={() => setTab("home")} className="mt-4 text-black underline text-sm font-medium">Найти домен</button>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(o => {
                  const ds = DOMAIN_STATUS[o.domainStatus] || DOMAIN_STATUS.pending;
                  const cs = CONN_STEPS[o.connectionStatus] || CONN_STEPS.none;
                  return (
                    <div key={o.id} className="p-5 rounded-xl border border-gray-100 hover:border-gray-200 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-bold text-lg">{o.domain}.{o.ext}</span>
                          <p className="text-sm text-gray-400">{new Date(o.orderedAt).toLocaleDateString("ru-RU")} · {o.price} ₽/год</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <span className={`text-xs px-3 py-1 rounded-full font-medium ${ds.bg} ${ds.color}`}>{ds.label}</span>
                          <span className="font-bold text-gray-800">{o.price} ₽</span>
                        </div>
                      </div>

                      {/* Верификация */}
                      {o.domainStatus === "verifying" && (
                        <div className="mt-3 p-3 bg-yellow-50 rounded-lg text-sm text-yellow-700 border border-yellow-100">
                          <p className="font-medium mb-0.5">We are verifying that your domain is pointing to Cloudflare.</p>
                          <p className="text-yellow-600 text-xs">This typically takes 1–2 hours but may take up to 24 hours, depending on your registrar. We are checking your status periodically.</p>
                        </div>
                      )}

                      {/* Активен — можно привязывать */}
                      {o.domainStatus === "active" && (
                        <div className="mt-3 flex items-center justify-between">
                          <div className={`flex items-center gap-1.5 text-sm font-medium ${cs.color}`}>
                            <Icon name={cs.icon as "Globe"} size={14} />
                            {cs.label}
                            {o.connectedIp && o.connectionStatus === "connected" && (
                              <span className="text-gray-400 font-normal ml-1 text-xs">— {o.connectedIp}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {o.connectionStatus !== "connected" && (
                              <button onClick={() => { setConnectModal(o); setConnectForm({ apiKey: "", ipAddress: "" }); setConnectStep("form"); }}
                                className="text-xs px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-all font-medium">
                                Привязать домен
                              </button>
                            )}
                            {o.connectionStatus === "connected" && (
                              <button onClick={() => handleDisconnect(o.id)}
                                className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-all font-medium">
                                Отвязать
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUPPORT */}
        {tab === "support" && (
          <div className="animate-fade-in max-w-lg mx-auto">
            <h2 className="text-3xl font-black mb-2">Поддержка</h2>
            <p className="text-gray-400 mb-8">Ответим в течение рабочего дня</p>
            <div className="grid gap-3 mb-8 grid-cols-2">
              <a href="mailto:support@spaceru.ru" className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-all group">
                <Icon name="Mail" size={20} className="text-gray-400 mb-2 group-hover:text-black transition-colors" />
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm font-medium">support@spaceru.ru</p>
              </a>
              <a href="tel:+74951234567" className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-all group">
                <Icon name="Phone" size={20} className="text-gray-400 mb-2 group-hover:text-black transition-colors" />
                <p className="text-xs text-gray-400">Телефон</p>
                <p className="text-sm font-medium">+7 (495) 123-45-67</p>
              </a>
            </div>
            <div className="space-y-3">
              <input value={supportForm.name} onChange={e => setSupportForm({ ...supportForm, name: e.target.value })} placeholder="Ваше имя" className={inp} />
              <input value={supportForm.email} onChange={e => setSupportForm({ ...supportForm, email: e.target.value })} placeholder="Email" type="email" className={inp} />
              <textarea value={supportForm.message} onChange={e => setSupportForm({ ...supportForm, message: e.target.value })} placeholder="Опишите вашу проблему или вопрос" rows={5} className={`${inp} resize-none`} />
              <button onClick={handleSupport} disabled={supportLoading} className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all disabled:opacity-50">
                {supportLoading ? "Отправка..." : "Отправить сообщение"}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-40">
        {([
          { id: "home", icon: "Search", label: "Поиск" },
          { id: "saved", icon: "Bookmark", label: "Список" },
          { id: "cabinet", icon: "User", label: "Кабинет" },
          { id: "support", icon: "HelpCircle", label: "Помощь" },
        ] as { id: Tab; icon: string; label: string }[]).map(({ id, icon, label }) => (
          <button key={id}
            onClick={() => id === "home" || id === "support" ? setTab(id) : requireAuth(() => setTab(id))}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-all ${tab === id ? "text-black font-medium" : "text-gray-400"}`}>
            <Icon name={icon as "Search"} size={20} />
            {label}
          </button>
        ))}
      </nav>

      {/* Auth Modal */}
      {authOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setAuthOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <button onClick={() => setAuthOpen(false)} className="absolute top-4 right-4 text-gray-300 hover:text-black transition-colors">
              <Icon name="X" size={20} />
            </button>
            <h3 className="text-2xl font-black mb-1">{authMode === "login" ? "Вход" : "Регистрация"}</h3>
            <p className="text-gray-400 text-sm mb-5">{authMode === "login" ? "Войдите в аккаунт SpaceRu" : "Укажите настоящие данные"}</p>
            <div className="space-y-3">
              {authMode === "register" && (
                <>
                  <input value={authForm.lastName} onChange={e => setAuthForm({ ...authForm, lastName: e.target.value })} placeholder="Фамилия *" className={inp} />
                  <input value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Имя *" className={inp} />
                  <input value={authForm.middleName} onChange={e => setAuthForm({ ...authForm, middleName: e.target.value })} placeholder="Отчество (необязательно)" className={inp} />
                  <input value={authForm.phone} onChange={e => setAuthForm({ ...authForm, phone: e.target.value })} placeholder="Номер телефона * (+7...)" type="tel" className={inp} />
                </>
              )}
              <input value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="Email *" type="email" className={inp} />
              <input value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={e => e.key === "Enter" && handleAuth()} placeholder="Пароль (минимум 6 символов) *" type="password" className={inp} />
              {authMode === "register" && (
                <p className="text-xs text-gray-400">* Поля обязательны для заполнения. Данные используются только для регистрации домена.</p>
              )}
              <button onClick={handleAuth} disabled={authLoading}
                className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all disabled:opacity-50 active:scale-95">
                {authLoading ? "Загрузка..." : authMode === "login" ? "Войти" : "Создать аккаунт"}
              </button>
            </div>
            <p className="text-center text-sm text-gray-400 mt-4">
              {authMode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?"}{" "}
              <button onClick={() => setAuthMode(authMode === "login" ? "register" : "login")} className="text-black font-semibold hover:underline">
                {authMode === "login" ? "Зарегистрироваться" : "Войти"}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Buy Modal */}
      {buyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setBuyModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <button onClick={() => setBuyModal(null)} className="absolute top-4 right-4 text-gray-300 hover:text-black transition-colors"><Icon name="X" size={20} /></button>
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mb-4">
              <Icon name="Globe" size={24} className="text-green-500" />
            </div>
            <h3 className="text-2xl font-black mb-1">Купить домен</h3>
            <p className="text-gray-400 text-sm mb-6">Оформление заявки на регистрацию</p>
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <p className="font-bold text-xl">{buyModal.domain}.{buyModal.ext}</p>
              <p className="text-gray-400 text-sm">Стоимость регистрации на 1 год</p>
              <p className="text-2xl font-black mt-1">{buyModal.price} ₽</p>
            </div>
            <button onClick={() => handleBuy(buyModal.domain, buyModal.ext, buyModal.price)}
              className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all mb-3 active:scale-95">
              Оформить заказ
            </button>
            <p className="text-center text-xs text-gray-400">После оплаты домен будет активирован в течение 1–24 часов</p>
          </div>
        </div>
      )}

      {/* Connect Modal */}
      {connectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => connectStep === "form" && setConnectModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            {connectStep === "form" && (
              <>
                <button onClick={() => setConnectModal(null)} className="absolute top-4 right-4 text-gray-300 hover:text-black transition-colors"><Icon name="X" size={20} /></button>
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon name="Link" size={24} className="text-blue-500" />
                </div>
                <h3 className="text-2xl font-black mb-1">Привязать домен</h3>
                <p className="text-gray-500 text-sm mb-1 font-medium">{connectModal.domain}.{connectModal.ext}</p>
                <p className="text-gray-400 text-xs mb-5">Введите API ключ и IP-адрес сервера для привязки</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">API ключ</label>
                    <input value={connectForm.apiKey} onChange={e => setConnectForm({ ...connectForm, apiKey: e.target.value })} placeholder="Например: cf_api_xxxx..." className={inp} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">IP адрес сервера</label>
                    <input value={connectForm.ipAddress} onChange={e => setConnectForm({ ...connectForm, ipAddress: e.target.value })} placeholder="Например: 1.2.3.4" className={inp} />
                  </div>
                  <button onClick={handleConnect} className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all active:scale-95">
                    Подключить
                  </button>
                </div>
              </>
            )}

            {connectStep === "connecting" && (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Icon name="Loader" size={28} className="text-yellow-500" />
                </div>
                <h3 className="text-xl font-black mb-2">Идёт подключение...</h3>
                <p className="text-gray-400 text-sm">Устанавливаем соединение с сервером</p>
              </div>
            )}

            {connectStep === "dns" && (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Icon name="Globe" size={28} className="text-blue-500" />
                </div>
                <h3 className="text-xl font-black mb-2">Подключаю DNS...</h3>
                <p className="text-gray-400 text-sm">Настраиваем DNS записи для вашего домена</p>
              </div>
            )}

            {connectStep === "done" && (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon name="CheckCircle" size={28} className="text-green-500" />
                </div>
                <h3 className="text-xl font-black mb-2">Домен привязан!</h3>
                <p className="text-gray-400 text-sm mb-5">{connectModal.domain}.{connectModal.ext} успешно подключён к IP {connectForm.ipAddress}</p>
                <button onClick={() => { setConnectModal(null); setConnectStep("form"); }}
                  className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all">
                  Готово
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 mt-8 hidden md:block">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-black rounded-md flex items-center justify-center">
              <Icon name="Globe" size={12} className="text-white" />
            </div>
            <span className="font-semibold text-black">SpaceRu</span>
            <span>— регистрация доменов</span>
          </div>
          <p>© 2024 SpaceRu. Все права защищены.</p>
        </div>
      </footer>
    </div>
  );
}
