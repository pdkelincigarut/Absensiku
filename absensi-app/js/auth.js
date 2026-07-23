/* ============================================================
   auth.js — Login, logout, session helpers
   ============================================================ */

const Auth = {
  login(username, password, role) {
    const account = Storage.getAccounts().find(
      a => a.username.toLowerCase() === username.trim().toLowerCase() && a.password === password
    );
    if (!account) return { ok: false, message: 'Username atau password salah.' };
    if (account.role !== role) {
      return { ok: false, message: `Akun ini terdaftar sebagai ${account.role === 'owner' ? 'Owner/Admin' : 'HR Admin'}, bukan ${role === 'owner' ? 'Owner/Admin' : 'HR Admin'}.` };
    }
    Storage.setSession(account.id);
    return { ok: true, account };
  },

  logout() {
    Storage.clearSession();
  },

  currentAccount() {
    const id = Storage.getSession();
    if (!id) return null;
    return Storage.getAccountById(id);
  }
};
