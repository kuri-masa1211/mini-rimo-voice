"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { LogOut, ShieldCheck, UserCheck, UserX, Activity } from 'lucide-react';

type Profile = {
  id: string;
  email: string;
  role: string;
  is_allowed: boolean;
  created_at: string;
};

type UsageLog = {
  id: string;
  user_email: string;
  action: string;
  created_at: string;
};

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/';
      return;
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profile?.role === 'admin') {
      setIsAdmin(true);
      fetchData();
    } else {
      window.location.href = '/';
    }
  };

  const fetchData = async () => {
    setLoading(true);
    // Fetch users
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (usersData) setProfiles(usersData);

    // Fetch logs
    const { data: logsData } = await supabase
      .from('usage_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (logsData) setLogs(logsData);
    
    setLoading(false);
  };

  const toggleAllow = async (id: string, currentStatus: boolean) => {
    // Optimistic UI update
    setProfiles(profiles.map(p => p.id === id ? { ...p, is_allowed: !currentStatus } : p));
    
    await supabase
      .from('profiles')
      .update({ is_allowed: !currentStatus })
      .eq('id', id);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  if (loading && !isAdmin) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">読み込み中...</div>;
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">管理者ダッシュボード</h1>
              <p className="text-sm text-gray-500">ユーザーの権限管理と利用履歴を確認できます</p>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            ログアウト
          </button>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all ${activeTab === 'users' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            <UserCheck className="w-5 h-5" />
            ユーザー管理
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all ${activeTab === 'logs' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            <Activity className="w-5 h-5" />
            利用ログ
          </button>
        </div>

        {activeTab === 'users' ? (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-gray-500 text-sm">
                  <th className="py-4 px-6 font-medium">メールアドレス</th>
                  <th className="py-4 px-6 font-medium">権限 (Role)</th>
                  <th className="py-4 px-6 font-medium">登録日時</th>
                  <th className="py-4 px-6 font-medium">利用許可設定</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.map(profile => (
                  <tr key={profile.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 font-medium">{profile.email}</td>
                    <td className="py-4 px-6">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${profile.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {profile.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {new Date(profile.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="py-4 px-6">
                      <button
                        onClick={() => toggleAllow(profile.id, profile.is_allowed)}
                        disabled={profile.role === 'admin'}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${profile.is_allowed ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'} ${profile.role === 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {profile.is_allowed ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                        {profile.is_allowed ? '利用を許可中' : '利用を禁止中'}
                      </button>
                    </td>
                  </tr>
                ))}
                {profiles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">ユーザーが見つかりません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-gray-500 text-sm">
                  <th className="py-4 px-6 font-medium">日時</th>
                  <th className="py-4 px-6 font-medium">ユーザー</th>
                  <th className="py-4 px-6 font-medium">実行アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {new Date(log.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="py-4 px-6 font-medium">{log.user_email || '不明なユーザー'}</td>
                    <td className="py-4 px-6">
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">
                        {log.action}
                      </span>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-gray-500">ログがありません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
