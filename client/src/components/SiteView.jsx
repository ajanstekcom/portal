import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { ChevronLeft, ChevronRight, RotateCw, Monitor, Shield, X, Maximize2, MousePointer2, Keyboard, ExternalLink, Lock } from 'lucide-react';
import api from '../api';

const socket = io({
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    autoConnect: true
});

const SiteView = ({ siteId, user, onExit }) => {
    const [site, setSite] = useState(null);
    const [liveFrame, setLiveFrame] = useState(null);
    const [status, setStatus] = useState('Başlatılıyor...');
    const [botLoading, setBotLoading] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const loadSite = async () => {
            try {
                const res = await api.get('/sites');
                const target = res.data.find(s => s.id === parseInt(siteId));
                if (target) {
                    setSite(target);
                    // Sunucuda tarayıcıyı zorla aç/hazırla
                    api.get(`/sites/${target.id}/open`);
                }
            } catch (e) {
                setStatus('Yükleme Hatası');
            }
        };
        loadSite();
    }, [siteId]);

    useEffect(() => {
        const statusEvent = `site-status-${siteId}`;
        socket.on(statusEvent, (data) => {
            setStatus(data.status);
        });
        return () => {
            socket.off(statusEvent);
        };
    }, [siteId]);

    useEffect(() => {
        const iframe = document.getElementById('tunnel-iframe');
        if (!iframe) return;

        const handleLoad = () => {
            console.log("[PORTAL] Iframe yüklendi.");
        };
        iframe.addEventListener('load', handleLoad);

        return () => iframe.removeEventListener('load', handleLoad);
    }, [siteId]);

    const refreshPage = () => {
        const iframe = document.getElementById('tunnel-iframe');
        if (iframe) iframe.src = iframe.src;
    };

    const runBot = async () => {
        setBotLoading(true);
        try {
            await api.get(`/sites/${siteId}/run-bot`);
        } catch (e) {
            alert('Bot başlatılamadı: ' + (e.response?.data?.error || e.message));
        } finally {
            setBotLoading(false);
        }
    };

    if (!site) return <div className="h-screen bg-slate-950 flex items-center justify-center text-white">Yükleniyor...</div>;

    return (
        <div className="h-screen bg-slate-950 flex flex-col text-white overflow-hidden font-sans">
            {/* Browser Header Overlay */}
            <div className="bg-slate-900 border-b border-slate-800 p-3 flex items-center gap-4 shadow-2xl z-10">
                <div className="flex gap-2">
                    <button onClick={onExit} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-all bg-slate-950/50 border border-slate-800">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex gap-3 items-center bg-slate-950 border border-slate-800 rounded-2xl px-5 py-2.5 flex-grow mx-2">
                    <Lock size={14} className="text-green-500" />
                    <span className="text-sm font-bold text-slate-300 truncate max-w-xl">{site.url}</span>
                    <div className="flex-grow"></div>
                    <div className="flex items-center gap-2 pr-2">
                        <div className={`w-2 h-2 rounded-full ${status === 'Tamamlandı' ? 'bg-green-500' : 'bg-primary-500 animate-pulse'}`}></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {status === 'Tamamlandı' ? 'GÜVENLİ BAĞLANTI' : status}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 mr-2">
                    <button
                        onClick={runBot}
                        disabled={botLoading}
                        className={`flex items-center gap-2 ${botLoading ? 'bg-slate-800' : 'bg-indigo-600 hover:bg-indigo-500'} px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg shadow-indigo-500/20`}
                        title="Botu Manuel Çalıştır"
                    >
                        <MousePointer2 size={14} /> {botLoading ? 'Çalışıyor...' : 'Botu Çalıştır'}
                    </button>
                    <button onClick={refreshPage} className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-400 bg-slate-950/50 border border-slate-800">
                        <RotateCw size={18} />
                    </button>
                    <a href={site.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 px-4 py-2.5 rounded-xl font-bold text-xs transition-all">
                        <ExternalLink size={14} /> Sitede Gör
                    </a>
                </div>
            </div>

            {/* Browser Viewport */}
            <div className="flex-grow bg-white relative overflow-hidden">
                <iframe
                    id="tunnel-iframe"
                    src={`/tunnel/${siteId}`}
                    className="w-full h-full border-none bg-white"
                    title="Remote Session"
                    sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
                />

                {/* Status Overlay (Fade out if connected) */}
                {/* [USER REMOVED]: Artık siteyi asla kapatmıyoruz, direkt açılıyor. */}
            </div>

            {/* User Info Overlay (Bottom Right) */}
            <div className="absolute bottom-8 right-8 bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">OTURUM BİLGİSİ</p>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center font-bold text-xs">{user.username[0].toUpperCase()}</div>
                    <div>
                        <p className="font-bold text-xs">{user.username}</p>
                        <p className="text-[9px] text-slate-400 font-mono">REMOTE-VNC-SECURE</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SiteView;
