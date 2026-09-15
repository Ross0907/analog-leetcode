import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { SiteHeader } from "../../components/site-header";
import { SiteFooter } from "../../components/site-footer";
import { getUser } from "../../auth";
import { authMessage, signInPath } from "../../../lib/auth-policy";
import { AuthForm } from "../../login/auth-form";
import styles from "../../login/auth.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Update password", robots: { index: false, follow: false } };

export default async function UpdatePasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getUser();
  const query = await searchParams;
  const error = authMessage(query.error);
  return <><SiteHeader /><main className={styles.centered}>
    <section className={styles.card} aria-labelledby="password-title">
      <div className={styles.icon}><LockKeyhole size={24} /></div>
      <h1 id="password-title">Choose a new password</h1>
      {user ? <>
        <p className={styles.description}>Update the password for {user.email}.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <AuthForm mode="update" returnTo="/profile" />
      </> : <>
        <p className={styles.description}>Open your password reset email in the same browser where you requested it. The link creates a verified session for this step.</p>
        <Link className="button button-primary" href={signInPath("/profile", "reset")}>Request a new reset link</Link>
      </>}
      <div className={styles.links}><Link href={user ? "/profile" : "/login"}>{user ? "Back to profile" : "Back to sign in"}</Link></div>
    </section>
  </main><SiteFooter /></>;
}
