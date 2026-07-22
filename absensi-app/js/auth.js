/* ============================================================
   auth.js — Login, logout, session helpers
   ============================================================ */

const Auth = {
  login(username, password, role) {
    const user = Storage.getUsers().find(
      u => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
    );
    if (!user) return { ok: false, message: 'Username atau password salah.' };
    if (user.role !== role) {
      return { ok: false, message: `Akun ini terdaftar sebagai ${user.role === 'owner' ? 'Owner/Admin' : 'Karyawan'}, bukan ${role === 'owner' ? 'Owner/Admin' : 'Karyawan'}.` };
    }
    Storage.setSession(user.id);
    return { ok: true, user };
  },

  logout() {
    Storage.clearSession();
  },

  currentUser() {
    const id = Storage.getSession();
    if (!id) return null;
    return Storage.getUserById(id);
  }
};
