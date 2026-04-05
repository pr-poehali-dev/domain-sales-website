import { useState, useEffect, useRef } from "react";
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

const POPULAR = [
  { label: "shop", hint: "Магазин" },
  { label: "store", hint: "Торговля" },
  { label: "pro", hint: "Профессионалам" },
  { label: "market", hint: "Маркетплейс" },
  { label: "studio", hint: "Студия" },
  { label: "club", hint: "Сообщество" },
];

type User = { id: number; email: string; name: string };
type SavedDomain = { id: number; domain: string; ext: string; price: number; savedAt: string };
type Order = { id: number; domain: string; ext: string; price: number; status: string; orderedAt: string };
type Tab = "home" | "cabinet" | "saved" | "support";
type AuthMode = "login" | "register";

export default function Index() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<typeof EXTENSIONS | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [savedDomains, setSavedDomains] = useState<SavedDomain[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [supportForm, setSupportForm] = useState({ name: "", email: "", message: "" });
  const [supportLoading, setSupportLoading] = useState(false);
  const [buyModal, setBuyModal] = useState<{ domain: string; ext: string; price: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getToken = () => localStorage.getItem("spaceruToken");

  useEffect(() => {
    const token = getToken();
    if (token) {
      fetch(AUTH_URL, { headers: { "X-Auth-Token": token } })
        .then(r => r.json())
        .then(d => { if (d.id) setUser(d); })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (tab === "saved" && user) loadSaved();
    if (tab === "cabinet" && user) loadOrders();
  }, [tab, user]);

  const loadSaved = async () => {
    const token = getToken();
    if (!token) return;
    const r = await fetch(`${DOMAINS_URL}/saved`, { headers: { "X-Auth-Token": token } });
    const d = await r.json();
    if (Array.isArray(d)) setSavedDomains(d);
  };

  const loadOrders = async () => {
    const token = getToken();
    if (!token) return;
    const r = await fetch(`${DOMAINS_URL}/orders`, { headers: { "X-Auth-Token": token } });
    const d = await r.json();
    if (Array.isArray(d)) setOrders(d);
  };

  const handleSearch = () => {
    const q = query.trim().replace(/\.(ru|net|org|space|me|online|com)$/i, "").toLowerCase();
    if (!q) return;
    setSearchQuery(q);
    setSearchResults(EXTENSIONS);
  };

  const handleAuth = async () => {
    setAuthLoading(true);
    const path = authMode === "login" ? "/login" : "/register";
    const body = authMode === "login"
      ? { email: authForm.email, password: authForm.password }
      : { email: authForm.email, password: authForm.password, name: authForm.name };
    try {
      const r = await fetch(`${AUTH_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.token) {
        localStorage.setItem("spaceruToken", d.token);
        setUser({ id: d.id, email: d.email, name: d.name });
        setAuthOpen(false);
        setAuthForm({ email: "", password: "", name: "" });
        toast({ title: authMode === "login" ? "Добро пожаловать!" : "Аккаунт создан!", description: `Привет, ${d.name}` });
      } else {
        toast({ title: "Ошибка", description: d.error || "Что-то пошло не так", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Нет соединения", variant: "destructive" });
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
    if (!user) { setAuthOpen(true); return; }
    const token = getToken();
    const r = await fetch(`${DOMAINS_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token! },
      body: JSON.stringify({ domain, ext, price }),
    });
    const d = await r.json();
    setBuyModal(null);
    if (d.ok) {
      toast({ title: "Заказ оформлен!", description: `${domain}.${ext} — ${price} ₽. Менеджер свяжется с вами.` });
    }
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

  const popularSearch = (word: string) => {
    setQuery(word);
    setSearchQuery(word);
    setSearchResults(EXTENSIONS);
    setTab("home");
  };

  const requireAuth = (action: () => void) => {
    if (!user) { setAuthOpen(true); return; }
    action();
  };

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
            {[
              { id: "home", label: "Поиск" },
              { id: "saved", label: "Сохранённые" },
              { id: "cabinet", label: "Кабинет" },
              { id: "support", label: "Поддержка" },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => requireAuth(() => setTab(id as Tab))}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === id ? "bg-gray-100 text-black" : "text-gray-500 hover:text-black hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 hidden md:block">{user.name}</span>
                <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-black transition-colors">
                  Выйти
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setAuthMode("register"); setAuthOpen(true); }}
                  className="text-sm text-gray-500 hover:text-black transition-colors hidden md:block"
                >
                  Регистрация
                </button>
                <button
                  onClick={() => { setAuthMode("login"); setAuthOpen(true); }}
                  className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition-all"
                >
                  Войти
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
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

            {/* Search bar */}
            <div className="flex gap-2 mb-6 shadow-sm border border-gray-200 rounded-xl overflow-hidden bg-white p-1.5">
              <div className="flex items-center gap-2 flex-1 px-3">
                <Icon name="Globe" size={18} className="text-gray-300 flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="Введите домен или слово"
                  className="flex-1 outline-none text-base text-gray-800 placeholder-gray-300 bg-transparent py-2.5"
                />
              </div>
              <button
                onClick={handleSearch}
                className="bg-black text-white px-8 py-3 rounded-lg font-semibold text-sm hover:bg-gray-800 active:scale-95 transition-all"
              >
                Подобрать
              </button>
            </div>

            {/* Popular */}
            {!searchResults && (
              <div className="mb-14">
                <p className="text-xs text-gray-400 mb-3 text-center">Популярные запросы</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {POPULAR.map(({ label, hint }) => (
                    <button
                      key={label}
                      onClick={() => popularSearch(label)}
                      className="px-4 py-2 rounded-full border border-gray-200 text-sm text-gray-600 hover:border-black hover:text-black transition-all"
                    >
                      {label} <span className="text-gray-300">— {hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search Results */}
            {searchResults && (
              <div className="mt-2 animate-slide-up">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-400">
                    Результаты для <span className="font-semibold text-black">«{searchQuery}»</span>
                  </p>
                  <button onClick={() => { setSearchResults(null); setQuery(""); }} className="text-xs text-gray-400 hover:text-black transition-colors">
                    Сбросить
                  </button>
                </div>
                <div className="space-y-2">
                  {searchResults.map(({ ext, price }, i) => (
                    <div
                      key={ext}
                      className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all bg-white group"
                      style={{ opacity: 0, animation: `fade-in 0.3s ease-out ${i * 50}ms forwards` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></div>
                        <span className="font-semibold text-gray-700 text-base md:text-lg">
                          {searchQuery}.<span className="text-black font-bold">{ext}</span>
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium hidden md:block">Свободен</span>
                      </div>
                      <div className="flex items-center gap-2 md:gap-3">
                        <span className="font-bold text-gray-900">{price} ₽<span className="text-xs font-normal text-gray-400">/год</span></span>
                        <button
                          onClick={() => handleSave(searchQuery, ext, price)}
                          title="Сохранить"
                          className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-black hover:border-black transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Icon name="Bookmark" size={15} />
                        </button>
                        <button
                          onClick={() => setBuyModal({ domain: searchQuery, ext, price })}
                          className="bg-black text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 active:scale-95 transition-all"
                        >
                          Купить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing Grid */}
            {!searchResults && (
              <div className="mt-12">
                <h2 className="text-2xl font-bold text-center mb-6">Цены на домены</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {EXTENSIONS.map(({ ext, price }) => (
                    <button
                      key={ext}
                      onClick={() => { setQuery(ext); inputRef.current?.focus(); }}
                      className="p-5 rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all text-center group"
                    >
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
                <button onClick={() => setTab("home")} className="mt-4 text-black underline text-sm font-medium">
                  Найти домен
                </button>
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
                      <button
                        onClick={() => setBuyModal({ domain: d.domain, ext: d.ext, price: d.price })}
                        className="bg-black text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-all"
                      >
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
                <h2 className="text-3xl font-black mb-1">{user.name}</h2>
                <p className="text-gray-400">{user.email}</p>
              </div>
              <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-black transition-colors border border-gray-200 px-4 py-2 rounded-lg">
                Выйти
              </button>
            </div>

            <h3 className="text-lg font-bold mb-4">История заказов</h3>
            {orders.length === 0 ? (
              <div className="text-center py-16 text-gray-300">
                <Icon name="ShoppingCart" size={48} className="mx-auto mb-4" />
                <p className="text-lg">Заказов пока нет</p>
                <button onClick={() => setTab("home")} className="mt-4 text-black underline text-sm font-medium">
                  Найти домен
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100">
                    <div>
                      <span className="font-semibold">{o.domain}.{o.ext}</span>
                      <p className="text-sm text-gray-400">{new Date(o.orderedAt).toLocaleDateString("ru-RU")}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs px-3 py-1 rounded-full bg-yellow-50 text-yellow-600 font-medium">
                        {o.status === "pending" ? "В обработке" : o.status}
                      </span>
                      <span className="font-bold">{o.price} ₽</span>
                    </div>
                  </div>
                ))}
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
              <input
                value={supportForm.name}
                onChange={e => setSupportForm({ ...supportForm, name: e.target.value })}
                placeholder="Ваше имя"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black transition-colors"
              />
              <input
                value={supportForm.email}
                onChange={e => setSupportForm({ ...supportForm, email: e.target.value })}
                placeholder="Email"
                type="email"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black transition-colors"
              />
              <textarea
                value={supportForm.message}
                onChange={e => setSupportForm({ ...supportForm, message: e.target.value })}
                placeholder="Опишите вашу проблему или вопрос"
                rows={5}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black transition-colors resize-none"
              />
              <button
                onClick={handleSupport}
                disabled={supportLoading}
                className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all disabled:opacity-50"
              >
                {supportLoading ? "Отправка..." : "Отправить сообщение"}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-40">
        {[
          { id: "home", icon: "Search", label: "Поиск" },
          { id: "saved", icon: "Bookmark", label: "Список" },
          { id: "cabinet", icon: "User", label: "Кабинет" },
          { id: "support", icon: "HelpCircle", label: "Помощь" },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => {
              if ((id === "saved" || id === "cabinet") && !user) { setAuthOpen(true); return; }
              setTab(id as Tab);
            }}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-all ${
              tab === id ? "text-black font-medium" : "text-gray-400"
            }`}
          >
            <Icon name={icon as "Search"} size={20} />
            {label}
          </button>
        ))}
      </nav>

      {/* Auth Modal */}
      {authOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setAuthOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <button onClick={() => setAuthOpen(false)} className="absolute top-4 right-4 text-gray-300 hover:text-black transition-colors">
              <Icon name="X" size={20} />
            </button>
            <h3 className="text-2xl font-black mb-1">
              {authMode === "login" ? "Вход" : "Регистрация"}
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              {authMode === "login" ? "Войдите в аккаунт SpaceRu" : "Создайте аккаунт SpaceRu"}
            </p>
            <div className="space-y-3">
              {authMode === "register" && (
                <input
                  value={authForm.name}
                  onChange={e => setAuthForm({ ...authForm, name: e.target.value })}
                  placeholder="Ваше имя"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black transition-colors"
                />
              )}
              <input
                value={authForm.email}
                onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                placeholder="Email"
                type="email"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black transition-colors"
              />
              <input
                value={authForm.password}
                onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                onKeyDown={e => e.key === "Enter" && handleAuth()}
                placeholder="Пароль (минимум 6 символов)"
                type="password"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black transition-colors"
              />
              <button
                onClick={handleAuth}
                disabled={authLoading}
                className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all disabled:opacity-50 active:scale-95"
              >
                {authLoading ? "Загрузка..." : authMode === "login" ? "Войти" : "Создать аккаунт"}
              </button>
            </div>
            <p className="text-center text-sm text-gray-400 mt-4">
              {authMode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?"}{" "}
              <button
                onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
                className="text-black font-semibold hover:underline"
              >
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
            <button onClick={() => setBuyModal(null)} className="absolute top-4 right-4 text-gray-300 hover:text-black transition-colors">
              <Icon name="X" size={20} />
            </button>
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
            <button
              onClick={() => handleBuy(buyModal.domain, buyModal.ext, buyModal.price)}
              className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all mb-3 active:scale-95"
            >
              Оформить заказ
            </button>
            <p className="text-center text-xs text-gray-400">После оформления наш менеджер свяжется с вами</p>
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
