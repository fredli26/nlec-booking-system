"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      router.push("/");
      router.refresh();
    } catch {
      setError("Invalid password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "#f0fafa" }}
    >
      {/* Card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex flex-col items-center py-8 px-6" style={{ background: "#088a97" }}>
          <img src="/nlec-icon.png" alt="NLEC" className="h-20 w-20 object-contain" />
        </div>

        {/* Form */}
        <div className="px-8 py-8">
          <h2
            className="text-center text-lg font-semibold mb-6"
            style={{ color: "#003462", fontFamily: "Montserrat, sans-serif" }}
          >
            NLEC Room Booking System
          </h2>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-xs font-semibold mb-1"
                style={{ color: "#088a97", fontFamily: "Montserrat, sans-serif" }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
                className="w-full border-2 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                style={{
                  borderColor: "#66c6bb",
                  color: "#003462",
                  fontFamily: "Montserrat, sans-serif",
                }}
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 text-center bg-red-50 rounded-lg py-2 px-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
              style={{ background: "#088a97", fontFamily: "Montserrat, sans-serif" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>

      <p className="mt-6 text-xs" style={{ color: "#768081" }}>
        New Life Evangelical Church © {new Date().getFullYear()}
      </p>
    </div>
  );
}
