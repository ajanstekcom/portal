import React, { useState, useEffect } from 'react';
import api from '../api';
import { Plus, Globe, LogOut, RefreshCw, ExternalLink, X, Shield, Lock, Eye, EyeOff, Copy, Check, Wand2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Dashboard = ({ user, onLogout, onOpenSite }) => {
    const [sites, setSites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showFocusModal, setShowFocusModal] = useState(false);
    const [focusSite, setFocusSite] = useState(null);
    const [copyStatus, setCopyStatus] = useState({});

    const [newSiteName, setNewSiteName] = useState('');
    const [newSiteUrl, setNewSiteUrl] = useState('');
    const [requiresLogin, setRequiresLogin] = useState(false);
    const [siteUsername, setSiteUsername] = useState('');
    const [sitePassword, setSitePassword] = useState('');
    const [showPasswordMap, setShowPasswordMap] = useState({});

    const fetchSites = async () => {
        try {
            const response = await api.get('/sites');
            setSites(response.data);
        } catch (err) {
            console.error('Siteler yüklenemedi', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSites();
    }, []);

    const handleAddSite = async (e) => {
        e.preventDefault();
        try {
            await api.post('/sites', {
                name: newSiteName,
                url: newSiteUrl,
                requires_login: requiresLogin,
                site_username: siteUsername,
                site_password: sitePassword
            });
            setShowAddModal(false);
            setNewSiteName('');
            setNewSiteUrl('');
            setRequiresLogin(false);
            setSiteUsername('');
            setSitePassword('');
            fetchSites();
        } catch (err) {
            alert('Site eklenirken hata oluştu');
        }
    };

    const handleCopy = (text, key) => {
        navigator.clipboard.writeText(text);
        setCopyStatus({ ...copyStatus, [key]: true });
        setTimeout(() => setCopyStatus({ ...copyStatus, [key]: false }), 2000);
    };

    const handleSiteClick = (site) => {
        setFocusSite(site);
        setShowFocusModal(true);
    };

    const handleDeleteSite = async (id) => {
        if (!window.confirm('Bu siteyi silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/sites/${id}`);
            setSites(sites.filter(s => s.id !== id));
            setShowFocusModal(false);
            setFocusSite(null);
        } catch (err) {
            alert('Site silinirken hata oluştu');
        }
    };

    const togglePassword = (e, id) => {
        e.stopPropagation();
        setShowPasswordMap(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 font-sans selection:bg-primary-500/30">
            {/* Header */}
            <header className="max-w-7xl mx-auto flex justify-between items-center mb-12">
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                    <h1 className="text-4xl font-black gradient-text tracking-tighter">PORTAL</h1>
                    <p className="text-slate-500 font-medium">Hoş geldin, {user.username}</p>
                </motion.div>

                <div className="flex gap-4">
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 px-6 py-3 rounded-xl font-bold transition-all shadow-xl shadow-primary-500/20 active:scale-95 border border-primary-400/20"
                    >
                        <Plus size={20} /> Site Ekle
                    </button>
                    <button
                        onClick={onLogout}
                        className="p-3 bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-800 active:scale-95"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto">
                {loading ? (
                    <div className="flex justify-center py-32"><RefreshCw className="animate-spin text-primary-500" size={40} /></div>
                ) : sites.length === 0 ? (
                    <div className="text-center py-32 glass rounded-3xl border-dashed">
                        <Globe className="w-12 h-12 text-slate-700 mx-auto mb-6" />
                        <h2 className="text-2xl font-bold text-slate-300 mb-2">Henüz site eklenmemiş</h2>
                        <button onClick={() => setShowAddModal(true)} className="text-primary-400 hover:text-primary-300 font-bold flex items-center gap-2 mx-auto mt-4">
                            <Plus size={20} /> İlk Siteni Ekle
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {sites.map((site) => (
                            <motion.div
                                key={site.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => handleSiteClick(site)}
                                className="glass rounded-3xl overflow-hidden group hover:border-primary-500/50 transition-all duration-500 shadow-2xl cursor-pointer flex flex-col border border-slate-800/50 active:scale-[0.98]"
                            >
                                <div className="p-8 flex flex-col items-center justify-center bg-slate-900 aspect-video group-hover:bg-slate-800 transition-colors">
                                    <Globe className="text-slate-700 group-hover:text-primary-500 transition-colors mb-4" size={48} />
                                    <h3 className="font-black text-xl text-center leading-tight group-hover:text-white transition-colors">{site.name}</h3>
                                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-2 truncate w-full text-center">{site.url.replace(/^https?:\/\//, '')}</p>
                                </div>
                                <div className="p-4 bg-slate-950/50 border-t border-slate-800/50 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">AKTİF</span>
                                    </div>
                                    {site.requires_login && <Lock size={12} className="text-slate-600" />}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </main>

            {/* Modals */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="glass p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl relative border border-slate-800">
                            <button onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"><X size={24} /></button>
                            <div className="mb-8">
                                <h2 className="text-3xl font-black gradient-text tracking-tighter mb-2 uppercase">SİTE EKLE</h2>
                                <p className="text-slate-500 font-medium text-sm">Giriş bilgilerini ekleyin, portal üzerinden güvenle erişin.</p>
                            </div>
                            <form onSubmit={handleAddSite} className="space-y-6">
                                <div className="space-y-4">
                                    <input type="text" className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all text-white placeholder:text-slate-700 font-bold" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} required placeholder="Bağlantı Adı" />
                                    <input type="text" className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all text-white placeholder:text-slate-700 font-bold" value={newSiteUrl} onChange={(e) => setNewSiteUrl(e.target.value)} required placeholder="URL (google.com)" />
                                </div>
                                <div className="bg-slate-900/50 rounded-3xl p-6 border border-slate-800">
                                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setRequiresLogin(!requiresLogin)}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${requiresLogin ? 'bg-primary-500/20 text-primary-400' : 'bg-slate-800 text-slate-600'}`}><Lock size={18} /></div>
                                            <p className="text-sm font-bold text-slate-200">Giriş Gerekli mi?</p>
                                        </div>
                                        <div className={`w-12 h-6 rounded-full transition-colors relative ${requiresLogin ? 'bg-primary-600' : 'bg-slate-800'}`}>
                                            <motion.div animate={{ x: requiresLogin ? 26 : 4 }} className="absolute top-1 w-4 h-4 bg-white rounded-full" />
                                        </div>
                                    </div>
                                    {requiresLogin && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="pt-6 space-y-4">
                                            <input type="text" className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm font-mono" value={siteUsername} onChange={(e) => setSiteUsername(e.target.value)} placeholder="Kullanıcı Adı" />
                                            <input type="password" size="1" className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm font-mono" value={sitePassword} onChange={(e) => setSitePassword(e.target.value)} placeholder="Şifre" />
                                        </motion.div>
                                    )}
                                </div>
                                <button type="submit" className="w-full bg-white text-black hover:bg-slate-100 font-black py-5 rounded-2xl text-lg active:scale-95 transition-all">SİTEYİ KAYDET</button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showFocusModal && focusSite && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-slate-950/95 backdrop-blur-3xl">
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col p-12 relative">
                            <div className="absolute top-12 right-12 flex gap-4">
                                <button onClick={() => handleDeleteSite(focusSite.id)} className="p-3 bg-slate-800 rounded-full hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={24} /></button>
                                <button onClick={() => setShowFocusModal(false)} className="p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors"><X size={24} /></button>
                            </div>

                            <div className="mb-12">
                                <h2 className="text-5xl font-black gradient-text tracking-tighter mb-4">{focusSite.name}</h2>
                                <div className="flex items-center gap-2 text-slate-500 text-lg font-bold">
                                    <Globe size={18} /> {focusSite.url.replace(/^https?:\/\//, '')}
                                </div>
                            </div>

                            <div className="space-y-10 flex-grow">
                                {focusSite.requires_login ? (
                                    <div className="space-y-6">
                                        <h4 className="text-xs font-black text-slate-600 uppercase tracking-[0.2em]">Otomatik Giriş Bilgileri</h4>
                                        <div className="space-y-4">
                                            <div className="bg-slate-950 border border-slate-800 p-6 rounded-3xl flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] text-slate-600 font-black mb-1 uppercase tracking-widest">KULLANICI</p>
                                                    <p className="font-mono text-xl text-slate-200">{focusSite.site_username}</p>
                                                </div>
                                                <button onClick={() => handleCopy(focusSite.site_username, 'user')} className="p-4 hover:bg-slate-900 rounded-2xl text-slate-500 transition-all">
                                                    {copyStatus['user'] ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                                                </button>
                                            </div>
                                            <div className="bg-slate-950 border border-slate-800 p-6 rounded-3xl flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] text-slate-600 font-black mb-1 uppercase tracking-widest">ŞİFRE</p>
                                                    <p className="font-mono text-xl text-slate-200">{showPasswordMap[focusSite.id] ? focusSite.site_password : '••••••••'}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={(e) => togglePassword(e, focusSite.id)} className="p-4 hover:bg-slate-900 rounded-2xl text-slate-500 transition-all">{showPasswordMap[focusSite.id] ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                                                    <button onClick={() => handleCopy(focusSite.site_password, 'pass')} className="p-4 hover:bg-slate-900 rounded-2xl text-slate-500 transition-all">
                                                        {copyStatus['pass'] ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[3rem]">
                                        <Shield className="mx-auto mb-4 text-slate-800" size={48} />
                                        <p className="text-lg text-slate-600 font-black uppercase tracking-widest">Güvenli Tünel Aktif</p>
                                    </div>
                                )}
                            </div>

                            <button
                                disabled={actionLoading === focusSite.id}
                                onClick={async () => {
                                    setActionLoading(focusSite.id);
                                    try {
                                        await api.get(`/sites/${focusSite.id}/open`);
                                        onOpenSite(focusSite.id);
                                    } catch (err) {
                                        alert('Site tüneli başlatılamadı');
                                    } finally {
                                        setActionLoading(null);
                                    }
                                }}
                                className={`w-full ${actionLoading === focusSite.id ? 'bg-slate-800 text-white' : 'bg-white text-black'} hover:bg-primary-500 hover:text-white font-black py-6 rounded-3xl flex items-center justify-center gap-4 transition-all mt-12 active:scale-95 text-xl tracking-tighter`}
                            >
                                {actionLoading === focusSite.id ? (
                                    <>BAĞLANILIYOR... <RefreshCw className="animate-spin" size={24} /></>
                                ) : (
                                    <>SİTEYİ PENCEREDE AÇ <ExternalLink size={24} /></>
                                )}
                            </button>

                            <p className="text-[10px] text-slate-600 text-center font-black uppercase tracking-[0.3em] mt-8">
                                Güvenli Iframe Tüneli | Portal v2.0
                            </p>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Dashboard;
