/* ============================================================
   auth.js — Login, logout, sesi (lewat cookie sesi dari server)
   ============================================================ */

const Auth = {
  async login(username, password, role) {
    try {
      const data = await apiRequest('POST', '/api/login', { username, password, role });
      return { ok: true, account: data.account };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  },

  async logout() {
    await apiRequest('POST', '/api/logout');
  },

  async currentAccount() {
    try {
      return await apiRequest('GET', '/api/me');
    } catch (err) {
      if (err.status === 401) return null;
      throw err;
    }
  }
};
