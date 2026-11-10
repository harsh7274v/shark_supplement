import { Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden lg:flex flex-col w-64 bg-kinetic-ink text-white shrink-0">
        <div className="px-6 py-8">
          <div className="font-display font-black text-xl tracking-tight">KINETIC</div>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Admin Dashboard</p>
        </div>
        <nav className="flex-1 px-4 py-2 space-y-1">
          <a
            href="/admin"
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800 text-slate-200 font-bold text-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
            Overview
          </a>
          <a
            href="/admin/products"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-slate-200 font-bold text-sm transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 002 2h2"></path></svg>
            Products
          </a>
          <a
            href="/admin/orders"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-slate-200 font-bold text-sm transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l2 2m0 0l2-2m-2 2l-2-2m-2 2l-2 2m2-2l2 2"></path></svg>
            Orders
          </a>
        </nav>
      </aside>

      <div className="flex-1 overflow-auto bg-slate-50">
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
