import React, { useState, useEffect } from 'react';
import { 
  Users, ShieldCheck, Mail, Building, CheckCircle, XCircle, 
  Search, Filter, Edit3, Trash2, Key, RefreshCw, UserPlus, AlertCircle 
} from 'lucide-react';
import api from '../../utils/api';
import Modal from '../../components/Modal';

export default function UserManagement({ addToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal states
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editRole, setEditRole] = useState('');
  const [editDepartment, setEditDepartment] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      if (addToast) addToast('Failed to load user directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleVerification = async (userId, currentStatus) => {
    try {
      await api.post(`/users/${userId}/toggle-verification`, {});
      if (addToast) addToast(`User verification status updated!`, 'success');
      fetchUsers();
    } catch (err) {
      if (addToast) addToast(err.message || 'Failed to update verification', 'error');
    }
  };

  const handleOpenEditModal = (user) => {
    setSelectedUser(user);
    setEditRole(user.role || 'program_chair');
    setEditDepartment(user.department || '');
    setIsEditModalOpen(true);
  };

  const handleSaveUserEdit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await api.put(`/users/${selectedUser.id}`, {
        role: editRole,
        department: editDepartment
      });
      if (addToast) addToast(`Updated user profile for ${selectedUser.name || selectedUser.email}`, 'success');
      setIsEditModalOpen(false);
      fetchUsers();
    } catch (err) {
      if (addToast) addToast(err.message || 'Failed to update user', 'error');
    }
  };

  const handleDeleteUser = async (user) => {
    if (window.confirm(`Are you sure you want to delete user "${user.name || user.email}"? This action cannot be undone.`)) {
      try {
        await api.delete(`/users/${user.id}`);
        if (addToast) addToast('User deleted successfully', 'success');
        fetchUsers();
      } catch (err) {
        if (addToast) addToast(err.message || 'Failed to delete user', 'error');
      }
    }
  };

  // Filter Users
  const filteredUsers = users.filter(u => {
    const fullName = `${u.first_name || ''} ${u.last_name || ''} ${u.name || ''}`.toLowerCase();
    const email = (u.email || '').toLowerCase();
    const dept = (u.department || '').toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase()) || 
                          email.includes(searchQuery.toLowerCase()) || 
                          dept.includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'verified' && u.is_verified) || 
                          (statusFilter === 'unverified' && !u.is_verified);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalCount = users.length;
  const verifiedCount = users.filter(u => u.is_verified).length;
  const chairsCount = users.filter(u => u.role === 'program_chair').length;
  const coordinatorsCount = users.filter(u => u.role === 'coordinator').length;

  return (
    <div className="p-8 animate-in fade-in duration-700">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-emerald-100 p-2.5 rounded-xl shadow-sm">
              <ShieldCheck className="w-6 h-6 text-emerald-800" />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">User Governance</h2>
          </div>
          <p className="text-slate-500 font-bold text-sm">Manage registered Program Chairs, Coordinators, and System Accounts</p>
        </div>

        <button 
          onClick={fetchUsers}
          className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg hover:shadow-slate-200"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Directory
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Total Users</p>
            <p className="text-3xl font-black text-slate-900">{totalCount}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Verified Accounts</p>
            <p className="text-3xl font-black text-slate-900">{verifiedCount}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Program Chairs</p>
            <p className="text-3xl font-black text-slate-900">{chairsCount}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Coordinators</p>
            <p className="text-3xl font-black text-slate-900">{coordinatorsCount}</p>
          </div>
        </div>
      </div>

      {/* Directory Filter Bar */}
      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search users by name, email, or department..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <select
            className="px-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="program_chair">Program Chairs</option>
            <option value="coordinator">Coordinators</option>
            <option value="admin">Administrators</option>
          </select>

          <select
            className="px-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="verified">Verified Only</option>
            <option value="unverified">Unverified Only</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-bold text-sm">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
            Loading user directory...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-800 font-bold text-base mb-1">No matching users found</p>
            <p className="text-slate-400 text-xs font-medium">Try broadening your search query or role filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-5 px-6">User / Account</th>
                  <th className="py-5 px-6">Role</th>
                  <th className="py-5 px-6">Department Scope</th>
                  <th className="py-5 px-6">Status</th>
                  <th className="py-5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                {filteredUsers.map((user) => {
                  const displayName = user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
                  const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-emerald-900 text-white font-black text-xs flex items-center justify-center shadow-md">
                            {initials}
                          </div>
                          <div>
                            <p className="font-black text-slate-900 text-sm leading-tight">{displayName}</p>
                            <p className="text-slate-400 font-bold text-[11px]">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <span className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider ${
                          user.role === 'admin'
                            ? 'bg-rose-100 text-rose-700'
                            : user.role === 'coordinator'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {user.role ? user.role.replace('_', ' ') : 'N/A'}
                        </span>
                      </td>

                      <td className="py-4 px-6 max-w-xs truncate text-slate-600 font-semibold">
                        {user.department || 'General'}
                      </td>

                      <td className="py-4 px-6">
                        {user.is_verified ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full font-bold text-[11px]">
                            <CheckCircle className="w-3.5 h-3.5" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full font-bold text-[11px]">
                            <AlertCircle className="w-3.5 h-3.5" /> Pending OTP
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleToggleVerification(user.id, user.is_verified)}
                          title={user.is_verified ? "Revoke Verification" : "Mark Verified"}
                          className={`p-2 rounded-xl border transition-all ${
                            user.is_verified 
                              ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' 
                              : 'border-slate-200 text-slate-400 hover:border-emerald-500 hover:text-emerald-600'
                          }`}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenEditModal(user)}
                          title="Edit User Role / Department"
                          className="p-2 border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800 rounded-xl transition-all"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteUser(user)}
                          title="Delete User"
                          className="p-2 border border-rose-100 text-rose-400 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit User: ${selectedUser?.name || selectedUser?.email}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveUserEdit} className="space-y-6 pt-2">
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">User Role</label>
            <select
              className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-600"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
            >
              <option value="program_chair">Program Chair</option>
              <option value="coordinator">Coordinator</option>
              <option value="admin">System Administrator</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Department Scope / Code</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-600"
              value={editDepartment}
              onChange={(e) => setEditDepartment(e.target.value)}
              placeholder="e.g. CAST - Computer Science"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3.5 bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-900 transition-all shadow-lg shadow-emerald-900/20"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
