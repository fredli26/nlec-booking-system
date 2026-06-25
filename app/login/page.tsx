"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

type Mode = "choose" | "sso" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");

  // Access code state
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);

  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState("");
  const [ssoLocked, setSsoLocked] = useState(false); // true = was SSO user, must re-authenticate via SSO

  useEffect(() => {
    const hasSso = document.cookie.split("; ").some((c) => c.startsWith("nlec_sso_email="));
    if (hasSso) {
      setMode("sso");
      setSsoLocked(true);
    }
  }, []);

  const handleCodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeLoading(true);
    setCodeError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: code }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      router.push("/");
      router.refresh();
    } catch {
      setCodeError("Invalid access code. Please try again.");
    } finally {
      setCodeLoading(false);
    }
  };

  const handleSsoLogin = async () => {
    setSsoLoading(true);
    setSsoError("");
    try {
      await signIn("microsoft-entra-id", { callbackUrl: "/api/auth/sso-bridge" });
    } catch {
      setSsoError("Sign in failed. Please try again.");
      setSsoLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "#f0fafa" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex flex-col items-center py-8 px-6" style={{ background: "#088a97" }}>
          <img src="/nlec-icon.png" alt="NLEC" className="h-20 w-20 object-contain" />
        </div>

        <div className="px-8 py-8">
          <h2
            className="text-center text-lg font-semibold mb-6"
            style={{ color: "#003462", fontFamily: "Montserrat, sans-serif" }}
          >
            NLEC Room Booking System
          </h2>

          {/* ── Choose mode ── */}
          {mode === "choose" && (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setMode("sso")}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: "#003462", fontFamily: "Montserrat, sans-serif" }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Sign in with NLEC Email
              </button>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px" style={{ background: "#e5e7eb" }} />
                <span className="text-xs" style={{ color: "#768081" }}>or</span>
                <div className="flex-1 h-px" style={{ background: "#e5e7eb" }} />
              </div>

              <button
                onClick={() => setMode("code")}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: "#e8f7f6", color: "#088a97", border: "2px solid #66c6bb", fontFamily: "Montserrat, sans-serif" }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Use Access Code
              </button>
            </div>
          )}

          {/* ── SSO ── */}
          {mode === "sso" && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-center" style={{ color: "#768081", fontFamily: "Montserrat, sans-serif" }}>
                You will be redirected to Microsoft to sign in with your <strong>@nlec.org.au</strong> account.
              </p>

              {ssoError && (
                <p className="text-xs text-red-500 text-center bg-red-50 rounded-lg py-2 px-3">{ssoError}</p>
              )}

              <button
                onClick={handleSsoLogin}
                disabled={ssoLoading}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: "#003462", fontFamily: "Montserrat, sans-serif" }}
              >
                {ssoLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Redirecting…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 23 23" fill="none">
                      <rect x="1" y="1" width="10" height="10" fill="#f25022"/>
                      <rect x="12" y="1" width="10" height="10" fill="#7fba00"/>
                      <rect x="1" y="12" width="10" height="10" fill="#00a4ef"/>
                      <rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
                    </svg>
                    Sign in with Microsoft
                  </>
                )}
              </button>

              {ssoLocked ? (
                <button type="button" onClick={() => { setMode("code"); setSsoLocked(false); setSsoError(""); }}
                  className="text-xs text-center transition-opacity hover:opacity-50"
                  style={{ color: "#c4c9ca", fontFamily: "Montserrat, sans-serif" }}>
                  Use access code instead
                </button>
              ) : (
                <button type="button" onClick={() => { setMode("choose"); setSsoError(""); }}
                  className="text-xs text-center transition-opacity hover:opacity-70"
                  style={{ color: "#768081", fontFamily: "Montserrat, sans-serif" }}>
                  ← Back
                </button>
              )}
            </div>
          )}

          {/* ── Access code form ── */}
          {mode === "code" && (
            <form onSubmit={handleCodeLogin} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#088a97", fontFamily: "Montserrat, sans-serif" }}>
                  Access Code
                </label>
                <input
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter your access code"
                  autoFocus
                  className="w-full border-2 rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "#66c6bb", color: "#003462", fontFamily: "Montserrat, sans-serif" }}
                />
              </div>

              {codeError && (
                <p className="text-xs text-red-500 text-center bg-red-50 rounded-lg py-2 px-3">
                  {codeError}
                </p>
              )}

              <button
                type="submit"
                disabled={codeLoading || !code}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "#088a97", fontFamily: "Montserrat, sans-serif" }}
              >
                {codeLoading ? "Signing in…" : "Sign In"}
              </button>

              <button type="button" onClick={() => { setMode("choose"); setCode(""); setCodeError(""); }}
                className="text-xs text-center transition-opacity hover:opacity-70"
                style={{ color: "#768081", fontFamily: "Montserrat, sans-serif" }}>
                ← Back
              </button>
            </form>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs" style={{ color: "#768081" }}>
        New Life Evangelical Church © {new Date().getFullYear()}
      </p>
    </div>
  );
}
