"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { AuthMode } from "../../lib/auth-policy";
import styles from "./auth.module.css";

export function AuthForm({ mode, returnTo, disabled = false }: { mode: AuthMode | "update"; returnTo: string; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const creatingPassword = mode === "signup" || mode === "update";
  const action = mode === "reset" ? "reset-password" : mode === "update" ? "update-password" : mode;
  const title = mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : mode === "update" ? "Save new password" : "Sign in";

  function submit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    if (creatingPassword && data.get("password") !== data.get("confirm_password")) {
      event.preventDefault();
      setError("The passwords do not match.");
      return;
    }
    setError("");
    setPending(true);
  }

  return (
    <form action={`/auth/actions/${action}`} method="post" onSubmit={submit} className={styles.form}>
      <input type="hidden" name="return_to" value={returnTo} />
      {mode === "signup" && <label>Full name<input name="full_name" autoComplete="name" maxLength={120} required disabled={disabled} placeholder="Your name" /></label>}
      {mode !== "update" && <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required disabled={disabled} placeholder="you@example.com" /></label>}
      {mode !== "reset" && <label>{creatingPassword ? "New password" : "Password"}<input name="password" type="password" autoComplete={creatingPassword ? "new-password" : "current-password"} minLength={creatingPassword ? 12 : undefined} maxLength={128} required disabled={disabled} aria-describedby={creatingPassword ? "password-help" : undefined} /></label>}
      {creatingPassword && <>
        <p id="password-help" className={styles.hint}>Use at least 12 characters. A unique passphrase works well.</p>
        <label>Confirm password<input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={disabled} /></label>
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="submit" className="button button-primary" disabled={disabled || pending} aria-busy={pending}>
        {pending ? <><LoaderCircle size={17} className={styles.spinner} /> Please wait…</> : <>{title}<ArrowRight size={17} /></>}
      </button>
    </form>
  );
}
