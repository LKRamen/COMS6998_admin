import Link from "next/link";
import { requireAdmin } from "../../lib/auth";
import Nav from "../components/nav";
import LiveUpdates from "../components/live-updates";
import { logout } from "../auth/actions";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, client } = await requireAdmin();
  const { data: signal } = await client.from('admin_live_signal').select('revision').eq('id', true).single();
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">q.</span>
          <div>
            quip<small>CONTROL ROOM</small>
          </div>
        </Link>
        <span className="side-label">WORKSPACE</span>
        <Nav />
        <div className="sidebar-bottom">
          <a
            className="live-app"
            href="https://coms-6998-theta.vercel.app"
            target="_blank"
            rel="noreferrer"
          >
            Open Quip <span>↗</span>
          </a>
          <div className="admin-account">
            <span className="account-icon">L</span>
            <div>
              <b>Superadmin</b>
              <small title={user.email}>{user.email}</small>
            </div>
          </div>
          <form action={logout}>
            <button className="sign-out">
              Sign out <span>↗</span>
            </button>
          </form>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <span>
            Workspace <b>/</b> Quip administration
          </span>
          <span className="secure">
            <i />
            Google · Superadmin
          </span>
          <form className="mobile-signout" action={logout}>
            <button>Sign out</button>
          </form>
        </div>
        <main className="main-content"><LiveUpdates initialRevision={String(signal?.revision ?? 0)} />{children}</main>
        <footer>
          Quip Control <span>Real data. Human judgment.</span>
        </footer>
      </div>
    </div>
  );
}
