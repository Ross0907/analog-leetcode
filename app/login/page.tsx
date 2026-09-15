import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircuitBoard, LockKeyhole, ShieldCheck } from "lucide-react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { getUser } from "../auth";
import { getSupabaseConfig } from "../../lib/supabase/config.server";
import { authMessage, safeReturnPath, signInPath, type AuthMode } from "../../lib/auth-policy";
import { AuthForm } from "./auth-form";
import styles from "./auth.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", description: "Sign in to save your AnaCode progress.", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const mode: AuthMode = query.mode === "signup" ? "signup" : query.mode === "reset" ? "reset" : "signin";
  const returnTo = safeReturnPath(query.return_to);
  const [config, user] = await Promise.all([getSupabaseConfig(), getUser()]);
  if (user && mode !== "reset" && !query.error && !query.message) redirect(returnTo);
  const error = authMessage(query.error);
  const message = authMessage(query.message);

  return <>
    <SiteHeader />
    <main className={styles.page}>
      <section className={styles.introduction}>
        <span className={styles.eyebrow}><CircuitBoard size={19} /> Your analog workspace</span>
        <h1>Build intuition.<br />Keep your progress.</h1>
        <p>Save your verified circuit solutions and pick up where you left off.</p>
        <div className={styles.benefit}><ShieldCheck size={21} /><div><strong>A record of what you have learned</strong><span>Your attempts, scores, and solved challenges in one place.</span></div></div>
        <Link href="/problems" className={styles.practice}>Continue practicing without an account <Arrow /></Link>
      </section>
      <section className={styles.card} aria-labelledby="auth-heading">
        <div className={styles.icon}><LockKeyhole size={24} /></div>
        <h2 id="auth-heading">{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back"}</h2>
        <p className={styles.description}>{mode === "signup" ? "Start building your circuit design track record." : mode === "reset" ? "We will email you a link to choose a new password." : "Sign in to your AnaCode account."}</p>
        {!config && <div className={styles.notice} role="status"><strong>Sign-in is not available yet.</strong><p>This site needs its Supabase project connected before accounts can be used. You can still explore every challenge and use the circuit lab.</p></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {message && <p className={styles.success} role="status">{message}</p>}
        <AuthForm key={mode} mode={mode} returnTo={returnTo} disabled={!config} />
        <div className={styles.links}>
          {mode === "signin" ? <><Link href={signInPath(returnTo, "reset")}>Forgot password?</Link><p>New to AnaCode? <Link href={signInPath(returnTo, "signup")}>Create an account</Link></p></> : <Link href={signInPath(returnTo)}>Back to sign in</Link>}
        </div>
        <p className={styles.provider}><ShieldCheck size={14} /> Accounts secured by Supabase</p>
      </section>
    </main>
    <SiteFooter />
  </>;
}

function Arrow() { return <span aria-hidden="true">→</span>; }
