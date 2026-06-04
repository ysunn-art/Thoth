import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, UserPlus, Shield } from "lucide-react";
import { api, isLoggedIn } from "../api/client";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAdminReg, setIsAdminReg] = useState(false);

  if (isLoggedIn()) {
    navigate("/", { replace: true });
    return null;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      await api.login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      if (isAdminReg) {
        const result = await api.registerAdmin(email.trim(), password);
        setSuccess(`Admin account created for ${result.user.email}. Logging in...`);
        setTimeout(() => navigate("/", { replace: true }), 800);
      } else {
        const user = await api.register(email.trim(), password);
        if (user.is_sme) {
          setSuccess("SME account linked. Logging in...");
          await api.login(email.trim(), password);
          setTimeout(() => navigate("/", { replace: true }), 800);
        } else {
          setSuccess("Account created! Redirecting to login...");
          setMode("login");
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#fafafa]">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/Tmobile_LOGO.png" alt="T-Mobile" className="mx-auto h-14 w-auto" />
          <h1 className="mt-4 text-2xl font-bold text-neutral-900">
            Project Thoth
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            T-Mobile Knowledge Management System
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="mb-6 flex rounded-lg bg-muted p-1">
            <button
              onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                mode === "login"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <LogIn size={15} />
              Login
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); setSuccess(""); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                mode === "register"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <UserPlus size={15} />
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {success}
            </div>
          )}

          <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
            <label className="block">
              <span className="text-sm font-medium text-neutral-900">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="mt-1.5 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-magenta focus:bg-white"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-neutral-900">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Min 6 characters" : "Your password"}
                required
                minLength={6}
                className="mt-1.5 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-magenta focus:bg-white"
              />
            </label>

            {mode === "register" && (
              <label className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-neutral-50 p-3 cursor-pointer hover:border-magenta/40">
                <input
                  type="checkbox"
                  checked={isAdminReg}
                  onChange={(e) => setIsAdminReg(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-magenta accent-magenta"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Shield size={13} className="text-blue-600" />
                    <span className="text-sm font-medium text-neutral-900">
                      Register as administrator
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Requires BENCHMARK_API_KEY set in .env.local
                  </p>
                </div>
              </label>
            )}

            {mode === "register" && !isAdminReg && (
              <div className="mt-4 rounded-lg border border-green-100 bg-green-50 p-3">
                <p className="text-xs text-green-700">
                  If your email matches an existing SME profile, your account will
                  be automatically linked and you will be logged in directly after
                  registration.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-magenta px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-magenta/90 disabled:cursor-not-allowed disabled:bg-magenta/40"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Sign in"
                  : isAdminReg
                    ? "Create admin account"
                    : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-neutral-400">
          {mode === "register"
            ? "Already have an account? "
            : "Need to create an account? "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setSuccess("");
              setIsAdminReg(false);
            }}
            className="font-medium text-magenta hover:underline"
          >
            {mode === "login" ? "Register here" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
