import React, { useState, useEffect } from 'react';
import api from '../api';
import { Plus, Globe, LogOut, RefreshCw, ExternalLink, X, Shield, Lock, Eye, EyeOff, CheckCircle, Smartphone, Copy, Check, MousePointer2, Wand2, Trash2, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';

const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin);

const Dashboard = ({ user, onLogout, onOpenSite }) => {
    const [sites, setSites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [serverEnv, setServerEnv] = useState({ isDesktop: false });
    const [selectedSiteId, setSelectedSiteId] = useState(null);
    const [showFocusModal, setShowFocusModal] = useState(false);
    const [focusSite, setFocusSite] = useState(null);
    const [copyStatus, setCopyStatus] = useState({});
    const [liveFrame, setLiveFrame] = useState(null);

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

            if (selectedSiteId) {
                const added = response.data.find(s => s.id === selectedSiteId);
                if (added && added.screenshot_path) {
                    setTimeout(() => {
                        setShowProgressModal(false);
                        setSelectedSiteId(null);
                    }, 3000);
                }
            }
        } catch (err) {
            console.error('Siteler yüklenemedi', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchHealth = async () => {
        try {
            const res = await api.get('/health');
            setServerEnv(res.data.env);
        } catch (e) { }
    };

    useEffect(() => {
        fetchHealth();
    }, []);

    useEffect(() => {
        fetchSites();
        const interval = setInterval(fetchSites, 2000);

        socket.on('site-status-updated', fetchSites);

        return () => {
            clearInterval(interval);
            socket.off('site-status-updated');
        };
    }, [selectedSiteId]);

    useEffect(() => {
        if (actionLoading) {
            const frameEvent = `site-frame-${actionLoading}`;
            const statusEvent = `site-status-${actionLoading}`;

            socket.on(frameEvent, (data) => {
                setLiveFrame(`data:image/jpeg;base64,${data.image}`);
            });
            socket.on(statusEvent, (data) => {
                fetchSites();
            });

            return () => {
                socket.off(frameEvent);
                socket.off(statusEvent);
            };
        }
    }, [actionLoading]);

    const handleAddSite = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/sites', {
                name: newSiteName,
                url: newSiteUrl,
                requires_login: requiresLogin,
                site_username: siteUsername,
                site_password: sitePassword
            });
            setSelectedSiteId(res.data.id);
            setShowAddModal(false);
            setShowProgressModal(true);

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
        setLiveFrame(null);
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

    const currentTrackingSite = sites.find(s => s.id === selectedSiteId);

    return (
        <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 font-sans selection:bg-primary-500/30">
            {/* Header */}
            <header className="max-w-7xl mx-auto flex justify-between items-center mb-12">
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                    <h1 className="text-4xl font-black gradient-text tracking-tighter">PORTAL</h1>
                    <p className="text-slate-500 font-medium">Hoş geldin, {user.username}</p>
                </motion.div>

                <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex gap-4">
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
                </motion.div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto">
                {!loading && sites.length === 0 ? (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-32 glass rounded-3xl border-dashed">
                        <div className="bg-slate-900 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Globe className="w-12 h-12 text-slate-700" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-300 mb-2">Henüz site eklenmemiş</h2>
                        <p className="text-slate-500 mb-8 max-w-sm mx-auto">Erişmek istediğin siteleri ekle, giriş bilgilerini otomatik yönetelim.</p>
                        <button onClick={() => setShowAddModal(true)} className="text-primary-400 hover:text-primary-300 font-bold flex items-center gap-2 mx-auto">
                            <Plus size={20} /> İlk Siteni Ekle
                        </button>
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        <AnimatePresence mode="popLayout">
                            {sites.map((site) => (
                                <motion.div
                                    key={site.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => handleSiteClick(site)}
                                    className="glass rounded-3xl overflow-hidden group hover:border-primary-500/50 transition-all duration-500 shadow-2xl cursor-pointer flex flex-col border border-slate-800/50 active:scale-[0.98]"
                                >
                                    <div className="relative aspect-[16/10] bg-slate-900 border-b border-slate-800/50 overflow-hidden">
                                        {site.screenshot_path ? (
                                            <img
                                                src={site.screenshot_path}
                                                alt={site.name}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/80 p-6 text-center">
                                                <RefreshCw className="animate-spin mb-4 text-primary-500 w-8 h-8" />
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                                                    {site.status || 'İşleniyor...'}
                                                </span>
                                            </div>
                                        )}
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all">
                                            <div className="bg-white/10 backdrop-blur-md p-2 rounded-lg text-white">
                                                <ExternalLink size={18} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 flex flex-col gap-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-xl leading-tight group-hover:text-primary-400 transition-colors">{site.name}</h3>
                                                <p className="text-slate-500 text-xs font-medium truncate max-w-[180px]">{site.url.replace(/^https?:\/\//, '')}</p>
                                            </div>
                                            {site.requires_login && <Wand2 size={16} className="text-primary-500/60" />}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
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
                                <p className="text-slate-500 font-medium text-sm">Botumuz siteye otomatik giriş yapıp önizleme oluşturacak.</p>
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
                                <button type="submit" className="w-full bg-white text-black hover:bg-slate-100 font-black py-5 rounded-2xl text-lg active:scale-95 transition-all">EKLE VE BAŞLAT</button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showProgressModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
                        <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900 border border-slate-800 p-12 rounded-[3.5rem] w-full max-w-md shadow-2xl text-center relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
                                <motion.div animate={{ x: ['-100%', '100%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="w-1/2 h-full bg-primary-500" />
                            </div>
                            <div className="w-24 h-24 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-primary-500/20">
                                <RefreshCw className="w-10 h-10 text-primary-500 animate-spin" />
                            </div>
                            <h2 className="text-2xl font-black mb-1 uppercase tracking-tighter">BAĞLANILIYOR</h2>
                            <p className="text-slate-500 text-sm font-medium mb-10">Site önizlemesi hazırlanıyor...</p>
                            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 mb-8">
                                <p className="text-primary-400 font-mono font-bold text-lg animate-pulse">{currentTrackingSite?.status || 'Bağlanıyor...'}</p>
                            </div>
                            <button onClick={() => setShowProgressModal(false)} className="text-slate-500 hover:text-white underline font-bold">Arka Planda Devam Et</button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showFocusModal && focusSite && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-slate-950/95 backdrop-blur-3xl">
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
                            {/* Visual Preview */}
                            <div className="flex-grow bg-slate-950 p-4 overflow-hidden flex items-center justify-center relative min-h-[400px]">
                                {liveFrame ? (
                                    <div
                                        className="relative w-full h-full cursor-crosshair group/vnc"
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = e.clientX - rect.left;
                                            const y = e.clientY - rect.top;
                                            socket.emit('site-interaction', {
                                                id: focusSite.id,
                                                type: 'click',
                                                x, y,
                                                width: rect.width,
                                                height: rect.height
                                            });
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key.length === 1) {
                                                socket.emit('site-interaction', { id: focusSite.id, type: 'type', text: e.key });
                                            } else {
                                                socket.emit('site-interaction', { id: focusSite.id, type: 'key', key: e.key });
                                            }
                                        }}
                                        tabIndex="0" // Klavyeyi yakalamak için gerekli
                                    >
                                        <img src={liveFrame} alt="Live Stream" className="w-full h-full object-contain rounded-2xl shadow-2xl pointer-events-none" />
                                        <div className="absolute top-4 right-4 bg-red-600 px-3 py-1 rounded-full text-[10px] font-black animate-pulse flex items-center gap-1">
                                            <Monitor size={12} /> CANLI YAYIN (ETKİLEŞİMLİ)
                                        </div>
                                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/40 backdrop-blur-sm px-4 py-2 rounded-full text-[10px] font-bold text-slate-400 opacity-0 group-hover/vnc:opacity-100 transition-opacity">
                                            IPUÇU: Tıkla ve Yazmaya Başla (Enter, Backspace desteklenir)
                                        </div>
                                    </div>
                                ) : focusSite.screenshot_path ? (
                                    <img src={focusSite.screenshot_path} alt={focusSite.name} className="w-full h-full object-contain rounded-2xl shadow-2xl" />
                                ) : (
                                    <div className="text-center">
                                        <RefreshCw className="animate-spin text-primary-500 mx-auto mb-4" size={40} />
                                        <p className="text-slate-600 font-bold uppercase tracking-widest text-xs tracking-[0.2em]">Hazırlanıyor...</p>
                                    </div>
                                )}
                                <div className="absolute top-8 left-8 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700/50 flex items-center gap-2">
                                    <Shield size={14} className="text-primary-500" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Güvenli Oturum</span>
                                </div>
                            </div>

                            {/* Control Panel */}
                            <div className="w-full md:w-[420px] p-8 md:p-12 flex flex-col border-l border-slate-800 bg-slate-900/50 relative">
                                <div className="absolute top-8 right-8 flex gap-2">
                                    <button onClick={() => handleDeleteSite(focusSite.id)} className="p-3 bg-slate-800 rounded-full hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={20} /></button>
                                    <button onClick={() => setShowFocusModal(false)} className="p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors"><X size={20} /></button>
                                </div>

                                <div className="mb-10">
                                    <h2 className="text-4xl font-black gradient-text tracking-tighter mb-2">{focusSite.name}</h2>
                                    <div className="flex items-center gap-2 text-slate-500 text-sm font-bold truncate">
                                        <Globe size={14} /> {focusSite.url.replace(/^https?:\/\//, '')}
                                    </div>
                                </div>

                                <div className="space-y-8 flex-grow">
                                    {focusSite.requires_login ? (
                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4">Otomatik Giriş Bilgileri</h4>
                                            <div className="space-y-3">
                                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
                                                    <div>
                                                        <p className="text-[10px] text-slate-600 font-black mb-1 text-xs">KULLANICI</p>
                                                        <p className="font-mono text-slate-200">{focusSite.site_username}</p>
                                                    </div>
                                                    <button onClick={() => handleCopy(focusSite.site_username, 'user')} className="p-3 hover:bg-slate-900 rounded-xl text-slate-600 transition-all">
                                                        {copyStatus['user'] ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                                                    </button>
                                                </div>
                                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
                                                    <div>
                                                        <p className="text-[10px] text-slate-600 font-black mb-1 text-xs">ŞİFRE</p>
                                                        <p className="font-mono text-slate-200">{showPasswordMap[focusSite.id] ? focusSite.site_password : '••••••••'}</p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button onClick={(e) => togglePassword(e, focusSite.id)} className="p-3 hover:bg-slate-900 rounded-xl text-slate-600 transition-all">{showPasswordMap[focusSite.id] ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                                                        <button onClick={() => handleCopy(focusSite.site_password, 'pass')} className="p-3 hover:bg-slate-900 rounded-xl text-slate-600 transition-all">
                                                            {copyStatus['pass'] ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[2.5rem]">
                                            <Globe className="mx-auto mb-4 text-slate-800" size={32} />
                                            <p className="text-sm text-slate-600 font-bold">Hızlı Erişim Modu</p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    disabled={actionLoading === focusSite.id}
                                    onClick={async () => {
                                        const isLocal = serverEnv.isDesktop;
                                        setActionLoading(focusSite.id);
                                        setLiveFrame(null);
                                        try {
                                            await api.get(`/sites/${focusSite.id}/open`);
                                            const interval = setInterval(async () => {
                                                const res = await api.get('/sites');
                                                const updatedSite = res.data.find(s => s.id === focusSite.id);
                                                if (['Tamamlandı', 'Hata Oluştu', 'Form Bulunamadı'].includes(updatedSite.status)) {
                                                    clearInterval(interval);
                                                    fetchSites();
                                                    setActionLoading(null);

                                                    // Sadece uzak sunucuda (Linux vb) sekme aç
                                                    if (!isLocal) {
                                                        window.open(`/?view=${focusSite.id}`, '_blank');
                                                        setActionLoading(null);
                                                    } else {
                                                        // Yerelde zaten bot penceresi açıldı, kullanıcıyı oraya yönlendir
                                                        alert('Otomatik giriş bot penceresinde başarıyla yapıldı! Lütfen o pencereyi kontrol et.');
                                                    }
                                                }
                                            }, 2000);
                                        } catch (err) {
                                            setActionLoading(null);
                                        }
                                    }}
                                    className={`w-full ${actionLoading === focusSite.id ? 'bg-slate-800 text-white' : 'bg-white text-black'} hover:bg-slate-100 font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all mt-8 active:scale-95`}
                                >
                                    {actionLoading === focusSite.id ? (
                                        <>GİRİŞ YAPILIYOR... <RefreshCw className="animate-spin" size={20} /></>
                                    ) : (
                                        <>SİTEYİ AÇ (OTOMATİK GİRİŞ) <ExternalLink size={20} /></>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Dashboard;
