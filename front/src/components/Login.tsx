import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        throw new Error("Неверный логин или пароль");
      }

      const data = await res.json();
      
      const token = data.token || data.accessToken;
      const role = data.role || data.user?.role;

      localStorage.setItem("staff_token", token);
      localStorage.setItem("staff_role", role);

      if (role === "ADMIN") navigate("/admin");
      else if (role === "COOK") navigate("/kitchen");
      else if (role === "WAITER") navigate("/waiter");
      else navigate("/");

    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h2 className="login-title">Вход для персонала</h2>
        
        {error && <div className="login-error">{error}</div>}
        
        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field">
            <label className="login-label">Логин</label>
            <input
              type="text"
              placeholder="admin, cook, waiter"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="login-input"
            />
          </div>
          
          <div className="login-field">
            <label className="login-label">Пароль</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="login-input"
            />
          </div>

          <button type="submit" className="login-submit">
            Войти
          </button>
        </form>
      </div>
    </div>
  );
};