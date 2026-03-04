import React, { useState } from 'react';
import api from '../api';
import { UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';

const Register = ({ onBackToLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');
        try {
            await api.post('/auth/register', { username, password });
            setMessage('Kayıt başarılı! Giriş yapabilirsiniz.');
            setTimeout(onBackToLogin, 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Kayıt başarısız');
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full"
        >
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-indigo-500/20 rounded-lg">
                        <UserPlus className="w-6 h-6 text-indigo-400" />
                    </div>
                    <h2 className="text-3xl font-black tracking-tighter uppercase italic">Hesap Oluştur</h2>
                </div>
                <p className="text-slate-400 font-medium text-sm">Sisteme erişmek için yeni bir hesap oluşturun.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Kullanıcı Adı</label>
                        <input
                            type="text"
                            className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-bold placeholder:text-slate-700"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="yeni_kullanici"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Şifre</label>
                        <input
                            type="password"
                            className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-bold placeholder:text-slate-700"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                {error && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm font-bold bg-red-400/10 p-3 rounded-xl border border-red-400/20">
                        {error === 'Registration failed' ? 'Kayıt başarısız, lütfen tekrar deneyin.' : error}
                    </motion.p>
                )}
                {message && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-green-400 text-sm font-bold bg-green-400/10 p-3 rounded-xl border border-green-400/20">
                        {message === 'Registration successful! You can now login.' ? 'Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz...' : message}
                    </motion.p>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-white text-black hover:bg-slate-100 font-black py-5 rounded-2xl text-lg active:scale-95 transition-all shadow-xl shadow-white/5 disabled:opacity-50"
                >
                    {loading ? 'Kaydediliyor...' : 'KAYIT OL'}
                </button>
            </form>

            <div className="mt-12 pt-8 border-t border-slate-900 text-center">
                <p className="text-slate-500 font-medium">
                    Zaten bir hesabın var mı?{' '}
                    <button onClick={onBackToLogin} className="text-indigo-400 hover:text-indigo-300 font-black ml-1 transition-colors">
                        Giriş Yap
                    </button>
                </p>
            </div>
        </motion.div>
    );
};

export default Register;
