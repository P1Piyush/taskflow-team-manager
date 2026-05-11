import axios from "axios";
import { clsx } from "clsx";
import { format, isPast } from "date-fns";
import {
  createContext, useContext, useState, useEffect, useRef,
  type ReactNode, type FormEvent,
} from "react";
import {
  BrowserRouter, Routes, Route, Navigate, NavLink,
  Link, useNavigate, useParams,
} from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────────────────
type MemberRole = "ADMIN" | "MEMBER";
type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type Priority   = "LOW" | "MEDIUM" | "HIGH";

interface User { id: string; email: string; name: string; createdAt: string }
interface ProjectMember {
  projectId: string; userId: string; role: MemberRole; joinedAt: string;
  user: Pick<User, "id" | "name" | "email">;
}
interface Task {
  id: string; title: string; description?: string | null;
  status: TaskStatus; priority: Priority;
  dueDate?: string | null; projectId: string;
  assigneeId?: string | null; creatorId: string;
  createdAt: string; updatedAt: string;
  assignee?: Pick<User, "id" | "name" | "email"> | null;
  creator?: Pick<User, "id" | "name" | "email">;
  project?: { id: string; name: string };
}
interface Project {
  id: string; name: string; description?: string | null;
  ownerId: string; createdAt: string; updatedAt: string;
  owner: Pick<User, "id" | "name" | "email">;
  members: ProjectMember[]; tasks?: Task[];
  _count?: { tasks: number };
}
interface DashboardData {
  stats: { projectCount: number; todo: number; inProgress: number; done: number; overdue: number; total: number };
  myTasks: Task[]; recentActivity: Task[];
}

// ── API client ────────────────────────────────────────────────────────────────
const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("ttm_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("ttm_token");
      localStorage.removeItem("ttm_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Auth context ──────────────────────────────────────────────────────────────
interface AuthCtx { user: User | null; token: string | null; isLoading: boolean; login(t: string, u: User): void; logout(): void }
const AuthContext = createContext<AuthCtx | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isLoading, setLoad]  = useState(true);

  useEffect(() => {
    const st = localStorage.getItem("ttm_token");
    const su = localStorage.getItem("ttm_user");
    if (st && su) {
      setToken(st); setUser(JSON.parse(su));
      api.get("/auth/me")
        .then((r) => { setUser(r.data); localStorage.setItem("ttm_user", JSON.stringify(r.data)); })
        .catch(() => { localStorage.removeItem("ttm_token"); localStorage.removeItem("ttm_user"); setToken(null); setUser(null); })
        .finally(() => setLoad(false));
    } else { setLoad(false); }
  }, []);

  function login(newToken: string, newUser: User) {
    localStorage.setItem("ttm_token", newToken);
    localStorage.setItem("ttm_user", JSON.stringify(newUser));
    setToken(newToken); setUser(newUser);
  }
  function logout() {
    localStorage.removeItem("ttm_token"); localStorage.removeItem("ttm_user");
    setToken(null); setUser(null);
  }
  return <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

// ── Badge components ──────────────────────────────────────────────────────────
const statusStyles: Record<TaskStatus, string> = {
  TODO: "bg-slate-700/60 text-slate-300 border-slate-600/50",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DONE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};
const statusLabels: Record<TaskStatus, string> = { TODO: "To Do", IN_PROGRESS: "In Progress", DONE: "Done" };
const priorityStyles: Record<Priority, string> = {
  LOW: "bg-slate-700/60 text-slate-400 border-slate-600/50",
  MEDIUM: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  HIGH: "bg-red-500/15 text-red-400 border-red-500/30",
};
const roleStyles: Record<MemberRole, string> = {
  ADMIN: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  MEMBER: "bg-slate-700/60 text-slate-400 border-slate-600/50",
};
const badgeCls = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border";
function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return <span className={clsx(badgeCls, statusStyles[status], className)}>{statusLabels[status]}</span>;
}
function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return <span className={clsx(badgeCls, priorityStyles[priority], className)}>{priority}</span>;
}
function RoleBadge({ role, className }: { role: MemberRole; className?: string }) {
  return <span className={clsx(badgeCls, roleStyles[role], className)}>{role}</span>;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const sizeMap = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };
function Modal({ title, onClose, children, size = "md" }: { title: string; onClose(): void; children: ReactNode; size?: "sm" | "md" | "lg" }) {
  const cbRef = useRef(onClose);
  cbRef.current = onClose;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") cbRef.current(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${sizeMap[size]} card p-6 shadow-2xl animate-slide-up`}>
        <div className="flex items-center justify-between mb-5">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const Logo = () => (
  <div className="flex items-center gap-2.5">
    <div className="w-7 h-7 bg-amber-500 rounded-md flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    </div>
    <span className="font-semibold text-slate-100 tracking-tight">TaskFlow</span>
  </div>
);

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-slate-900 border-r border-slate-800 flex flex-col z-40">
      <div className="px-5 py-5 border-b border-slate-800"><Logo /></div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {[
          { to: "/dashboard", label: "Dashboard", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm9.75-9.75c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v16.5c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 0112.75 19.875V3.375zm-9 5.25c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125H4.875A1.125 1.125 0 013.75 19.875V8.625z" /> },
          { to: "/projects", label: "Projects", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /> },
        ].map(({ to, label, icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => clsx(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
            isActive ? "bg-amber-500/15 text-amber-400 font-medium" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          )}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-slate-800 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300 flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button onClick={() => { logout(); navigate("/login"); }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
function Layout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

// ── Auth pages ────────────────────────────────────────────────────────────────
const BigLogo = () => (
  <div className="flex items-center gap-3 mb-10">
    <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center">
      <svg className="w-5 h-5 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    </div>
    <span className="text-xl font-semibold text-slate-100">TaskFlow</span>
  </div>
);

function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data.token, data.user); navigate("/dashboard");
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Login failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <BigLogo />
        <div className="card p-8">
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Welcome back</h1>
          <p className="text-sm text-slate-500 mb-7">Sign in to your workspace</p>
          {error && <div className="mb-5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="email">Email</label>
              <input id="email" type="email" className="input-base" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="password">Password</label>
              <input id="password" type="password" className="input-base" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /> : "Sign in"}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-slate-500 mt-6">
          No account?{" "}
          <Link to="/signup" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">Create one</Link>
        </p>
      </div>
    </div>
  );
}

function SignupPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm]       = useState({ name: "", email: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/signup", form);
      login(data.token, data.user); navigate("/dashboard");
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setError(typeof errData === "string" ? errData : "Signup failed. Please try again.");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <BigLogo />
        <div className="card p-8">
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Create account</h1>
          <p className="text-sm text-slate-500 mb-7">Start managing your team's work</p>
          {error && <div className="mb-5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="name">Full name</label>
              <input id="name" type="text" className="input-base" placeholder="Jane Smith" value={form.name} onChange={update("name")} required minLength={2} autoComplete="name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="email">Email</label>
              <input id="email" type="email" className="input-base" placeholder="you@company.com" value={form.email} onChange={update("email")} required autoComplete="email" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="password">Password</label>
              <input id="password" type="password" className="input-base" placeholder="Min. 8 characters" value={form.password} onChange={update("password")} required minLength={8} autoComplete="new-password" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /> : "Create account"}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card px-5 py-5">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-semibold ${accent ?? "text-slate-100"}`}>{value}</p>
    </div>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;

  const hr = new Date().getHours();
  const greeting = hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening";

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Good {greeting}, <span className="text-amber-400">{user?.name?.split(" ")[0]}</span></h1>
        <p className="text-slate-500 text-sm mt-1">Here's what's happening across your projects.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Projects"    value={data?.stats.projectCount ?? 0} />
        <StatCard label="To Do"       value={data?.stats.todo ?? 0} />
        <StatCard label="In Progress" value={data?.stats.inProgress ?? 0} accent="text-amber-400" />
        <StatCard label="Done"        value={data?.stats.done ?? 0}        accent="text-emerald-400" />
        <StatCard label="Overdue"     value={data?.stats.overdue ?? 0}     accent={data?.stats.overdue ? "text-red-400" : "text-slate-100"} />
      </div>
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h2 className="font-medium text-slate-200">My Tasks</h2>
          <Link to="/projects" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">View all projects →</Link>
        </div>
        <div className="p-2">
          {data?.myTasks.length === 0
            ? <div className="text-center py-12 text-slate-500 text-sm">No tasks assigned to you yet.</div>
            : data?.myTasks.map((task) => {
              const overdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "DONE";
              return (
                <Link key={task.id} to={`/projects/${task.projectId}`} className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate group-hover:text-white transition-colors">{task.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{task.project?.name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                    {task.dueDate && <span className={`text-xs ${overdue ? "text-red-400" : "text-slate-500"}`}>{format(new Date(task.dueDate), "MMM d")}</span>}
                  </div>
                </Link>
              );
            })
          }
        </div>
      </div>
      {(data?.recentActivity?.length ?? 0) > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-700/50"><h2 className="font-medium text-slate-200">Recent Activity</h2></div>
          <div className="p-2">
            {data?.recentActivity.map((task) => (
              <Link key={task.id} to={`/projects/${task.projectId}`} className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{task.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{task.project?.name} · updated {format(new Date(task.updatedAt), "MMM d, h:mm a")}</p>
                </div>
                <StatusBadge status={task.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Projects page ─────────────────────────────────────────────────────────────
function ProjectCard({ project, currentUserId }: { project: Project; currentUserId: string }) {
  const my = project.members.find((m) => m.userId === currentUserId);
  return (
    <Link to={`/projects/${project.id}`} className="card p-5 block hover:border-slate-600/50 hover:bg-slate-800/80 transition-all duration-150 group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-medium text-slate-100 group-hover:text-white transition-colors leading-snug">{project.name}</h3>
        {my && <RoleBadge role={my.role} />}
      </div>
      {project.description && <p className="text-sm text-slate-500 mb-4 line-clamp-2">{project.description}</p>}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
          </svg>
          {project._count?.tasks ?? 0} tasks
        </div>
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          {project.members.length} members
        </div>
        <span>Updated {format(new Date(project.updatedAt), "MMM d")}</span>
      </div>
    </Link>
  );
}

function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShow]   = useState(false);
  const [form, setForm]         = useState({ name: "", description: "" });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => { api.get("/projects").then((r) => setProjects(r.data)).finally(() => setLoading(false)); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault(); if (!form.name.trim()) return;
    setSaving(true); setError("");
    try {
      const { data } = await api.post("/projects", form);
      setProjects((p) => [data, ...p]); setShow(false); setForm({ name: "", description: "" });
    } catch { setError("Failed to create project"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Projects</h1>
          <p className="text-slate-500 text-sm mt-1">{projects.length} project{projects.length !== 1 ? "s" : ""} you're part of</p>
        </div>
        <button onClick={() => setShow(true)} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New project
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : projects.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <p className="text-slate-400 font-medium">No projects yet</p>
          <p className="text-slate-600 text-sm mt-1">Create one to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => <ProjectCard key={p.id} project={p} currentUserId={user!.id} />)}
        </div>
      )}

      {showCreate && (
        <Modal title="New project" onClose={() => setShow(false)} size="sm">
          {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Project name</label>
              <input className="input-base" placeholder="e.g. Marketing website" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Description <span className="text-slate-600">(optional)</span></label>
              <textarea className="input-base resize-none" rows={3} placeholder="What is this project about?" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /> : "Create project"}
              </button>
              <button type="button" onClick={() => setShow(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Project detail page ───────────────────────────────────────────────────────
interface TaskFormData { title: string; description: string; status: TaskStatus; priority: Priority; dueDate: string; assigneeId: string }
const defaultTask: TaskFormData = { title: "", description: "", status: "TODO", priority: "MEDIUM", dueDate: "", assigneeId: "" };

function TaskForm({ initial, members, onSave, onCancel, saving }: { initial: TaskFormData; members: Project["members"]; onSave(d: TaskFormData): void; onCancel(): void; saving: boolean }) {
  const [form, setForm] = useState(initial);
  function set<K extends keyof TaskFormData>(k: K, v: TaskFormData[K]) { setForm((f) => ({ ...f, [k]: v })); }
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Title</label>
        <input className="input-base" placeholder="Task title" value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Description <span className="text-slate-600">(optional)</span></label>
        <textarea className="input-base resize-none" rows={3} placeholder="Add details..." value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
          <select className="input-base" value={form.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
            <option value="TODO">To Do</option><option value="IN_PROGRESS">In Progress</option><option value="DONE">Done</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Priority</label>
          <select className="input-base" value={form.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
            <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Due date</label>
          <input type="date" className="input-base" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Assignee</label>
          <select className="input-base" value={form.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving ? <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /> : "Save task"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </form>
  );
}

function TaskCard({ task, canEdit, onEdit, onDelete, onStatusChange }: { task: Task; canEdit: boolean; onEdit(): void; onDelete(): void; onStatusChange(s: TaskStatus): void }) {
  const overdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "DONE";
  return (
    <div className="card px-4 py-4 hover:border-slate-600/60 transition-colors">
      <div className="flex items-start gap-3">
        <button onClick={() => onStatusChange(task.status === "DONE" ? "TODO" : "DONE")}
          className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border transition-all duration-150 ${task.status === "DONE" ? "bg-emerald-500 border-emerald-500" : "border-slate-600 hover:border-amber-500"}`} title="Toggle done">
          {task.status === "DONE" && <svg className="w-full h-full text-slate-950 p-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${task.status === "DONE" ? "line-through text-slate-500" : "text-slate-200"}`}>{task.title}</p>
          {task.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>}
          <div className="flex items-center flex-wrap gap-2 mt-2.5">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.assignee && <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-md border border-slate-700/50">{task.assignee.name}</span>}
            {task.dueDate && <span className={`text-xs ${overdue ? "text-red-400" : "text-slate-500"}`}>Due {format(new Date(task.dueDate), "MMM d")}{overdue && " · overdue"}</span>}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEdit} className="text-slate-600 hover:text-slate-300 p-1 rounded transition-colors" title="Edit">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
            </button>
            <button onClick={onDelete} className="text-slate-600 hover:text-red-400 p-1 rounded transition-colors" title="Delete">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type Filter = "ALL" | TaskStatus;

function ProjectDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [project, setProject]           = useState<Project | null>(null);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<Filter>("ALL");
  const [showTaskModal, setShowTask]    = useState(false);
  const [editingTask, setEditing]       = useState<Task | null>(null);
  const [showMemberModal, setShowMember] = useState(false);
  const [memberEmail, setMemberEmail]   = useState("");
  const [memberRole, setMemberRole]     = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [saving, setSaving]             = useState(false);
  const [memberError, setMemberError]   = useState("");

  useEffect(() => {
    if (!id) return;
    api.get(`/projects/${id}`).then((r) => setProject(r.data)).catch(() => navigate("/projects")).finally(() => setLoading(false));
  }, [id, navigate]);

  const myMembership = project?.members.find((m) => m.userId === user?.id);
  const isAdmin      = myMembership?.role === "ADMIN";
  const filteredTasks = filter === "ALL" ? (project?.tasks ?? []) : (project?.tasks ?? []).filter((t) => t.status === filter);

  async function handleSaveTask(fd: TaskFormData) {
    if (!id) return; setSaving(true);
    try {
      const payload = { title: fd.title, description: fd.description || undefined, status: fd.status, priority: fd.priority, dueDate: fd.dueDate ? new Date(fd.dueDate).toISOString() : null, assigneeId: fd.assigneeId || null };
      if (editingTask) {
        const { data } = await api.put(`/projects/${id}/tasks/${editingTask.id}`, payload);
        setProject((p) => p ? { ...p, tasks: (p.tasks ?? []).map((t) => t.id === data.id ? data : t) } : p);
      } else {
        const { data } = await api.post(`/projects/${id}/tasks`, payload);
        setProject((p) => p ? { ...p, tasks: [data, ...(p.tasks ?? [])] } : p);
      }
      setShowTask(false); setEditing(null);
    } finally { setSaving(false); }
  }

  async function handleDeleteTask(taskId: string) {
    if (!id || !confirm("Delete this task?")) return;
    await api.delete(`/projects/${id}/tasks/${taskId}`);
    setProject((p) => p ? { ...p, tasks: (p.tasks ?? []).filter((t) => t.id !== taskId) } : p);
  }

  async function handleStatusChange(task: Task, status: TaskStatus) {
    if (!id) return;
    const { data } = await api.put(`/projects/${id}/tasks/${task.id}`, { status });
    setProject((p) => p ? { ...p, tasks: (p.tasks ?? []).map((t) => t.id === data.id ? data : t) } : p);
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault(); setMemberError(""); setSaving(true);
    try {
      await api.post(`/projects/${id}/members`, { email: memberEmail, role: memberRole });
      const { data } = await api.get(`/projects/${id}`);
      setProject(data); setShowMember(false); setMemberEmail("");
    } catch (err: unknown) {
      setMemberError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to add member");
    } finally { setSaving(false); }
  }

  async function handleRemoveMember(memberId: string) {
    if (!id || !confirm("Remove this member?")) return;
    await api.delete(`/projects/${id}/members/${memberId}`);
    setProject((p) => p ? { ...p, members: p.members.filter((m) => m.userId !== memberId) } : p);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!project) return null;

  const counts = {
    ALL: project.tasks?.length ?? 0,
    TODO: project.tasks?.filter((t) => t.status === "TODO").length ?? 0,
    IN_PROGRESS: project.tasks?.filter((t) => t.status === "IN_PROGRESS").length ?? 0,
    DONE: project.tasks?.filter((t) => t.status === "DONE").length ?? 0,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <button onClick={() => navigate("/projects")} className="hover:text-slate-300 transition-colors">Projects</button>
            <span>/</span><span className="text-slate-300">{project.name}</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-100">{project.name}</h1>
          {project.description && <p className="text-slate-500 text-sm mt-1">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && (
            <button onClick={() => setShowMember(true)} className="btn-ghost text-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>
              Add member
            </button>
          )}
          <button onClick={() => { setEditing(null); setShowTask(true); }} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1 w-fit">
            {(["ALL", "TODO", "IN_PROGRESS", "DONE"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${filter === f ? "bg-slate-700 text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>
                {f === "ALL" ? "All" : f === "IN_PROGRESS" ? "In Progress" : f === "TODO" ? "To Do" : "Done"}
                <span className="ml-1.5 text-slate-600">{counts[f]}</span>
              </button>
            ))}
          </div>
          {filteredTasks.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <p className="text-slate-500 text-sm">No tasks here yet.</p>
              <button onClick={() => setShowTask(true)} className="mt-3 text-amber-400 hover:text-amber-300 text-sm transition-colors">Create the first task →</button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskCard key={task.id} task={task}
                  canEdit={isAdmin || task.creatorId === user?.id || task.assigneeId === user?.id}
                  onEdit={() => { setEditing(task); setShowTask(true); }}
                  onDelete={() => handleDeleteTask(task.id)}
                  onStatusChange={(status) => handleStatusChange(task, status)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="card">
            <div className="px-4 py-3 border-b border-slate-700/50"><h3 className="text-sm font-medium text-slate-300">Team</h3></div>
            <div className="p-3 space-y-1">
              {project.members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-slate-700/30 transition-colors group">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-300 flex-shrink-0">{m.user.name.charAt(0).toUpperCase()}</div>
                    <p className="text-xs font-medium text-slate-300 truncate">{m.user.name}{m.userId === user?.id && <span className="text-slate-600 ml-1">(you)</span>}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <RoleBadge role={m.role} />
                    {isAdmin && m.userId !== project.ownerId && m.userId !== user?.id && (
                      <button onClick={() => handleRemoveMember(m.userId)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 p-0.5 rounded transition-all">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showTaskModal && (
        <Modal title={editingTask ? "Edit task" : "New task"} onClose={() => { setShowTask(false); setEditing(null); }} size="lg">
          <TaskForm
            initial={editingTask ? { title: editingTask.title, description: editingTask.description ?? "", status: editingTask.status, priority: editingTask.priority, dueDate: editingTask.dueDate ? format(new Date(editingTask.dueDate), "yyyy-MM-dd") : "", assigneeId: editingTask.assigneeId ?? "" } : defaultTask}
            members={project.members} onSave={handleSaveTask}
            onCancel={() => { setShowTask(false); setEditing(null); }} saving={saving}
          />
        </Modal>
      )}

      {showMemberModal && (
        <Modal title="Add team member" onClose={() => { setShowMember(false); setMemberError(""); }} size="sm">
          {memberError && <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{memberError}</div>}
          <form onSubmit={handleAddMember} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email address</label>
              <input type="email" className="input-base" placeholder="teammate@company.com" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Role</label>
              <select className="input-base" value={memberRole} onChange={(e) => setMemberRole(e.target.value as "ADMIN" | "MEMBER")}>
                <option value="MEMBER">Member</option><option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /> : "Add member"}
              </button>
              <button type="button" onClick={() => setShowMember(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/dashboard"    element={<Layout><DashboardPage /></Layout>} />
          <Route path="/projects"     element={<Layout><ProjectsPage /></Layout>} />
          <Route path="/projects/:id" element={<Layout><ProjectDetailPage /></Layout>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
