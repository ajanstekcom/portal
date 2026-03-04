import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { ChevronLeft, ChevronRight, RotateCw, Monitor, Shield, X, Maximize2, MousePointer2, Keyboard } from 'lucide-react';
import api from '../api';

const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin);

const SiteView = ({ siteId, user, onExit }) => {
    const [site, setSite] = useState(null);
    const [liveFrame, setLiveFrame] = useState(null);
    const [status, setStatus] = useState('Başlatılıyor...');
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
        const frameEvent = `site-frame-${siteId}`;
        const statusEvent = `site-status-${siteId}`;

        socket.on(frameEvent, (data) => {
            setLiveFrame(`data:image/jpeg;base64,${data.image}`);
        });
        socket.on(statusEvent, (data) => {
            setStatus(data.status);
        });

        return () => {
            socket.off(frameEvent);
            socket.off(statusEvent);
        };
    }, [siteId]);

    const handleInteraction = (type, e) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();

        if (type === 'click') {
            socket.emit('site-interaction', {
                id: siteId,
                type: 'click',
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                width: rect.width,
                height: rect.height
            });
        }
    };

    const handleKey = (e) => {
        if (e.key.length === 1) {
            socket.emit('site-interaction', { id: siteId, type: 'type', text: e.key });
        } else {
            socket.emit('site-interaction', { id: siteId, type: 'key', key: e.key });
        }
    };

    const refreshPage = () => {
        socket.emit('site-interaction', { id: siteId, type: 'refresh' });
    };

    if (!site) return <div className="h-screen bg-slate-950 flex items-center justify-center text-white">Yükleniyor...</div>;

    return (
        <div className="h-screen bg-slate-950 flex flex-col text-white overflow-hidden font-sans">
            {/* Browser Header Overlay */}
            <div className="bg-slate-900 border-b border-slate-800 p-2 flex items-center gap-4 shadow-2xl z-10">
                <div className="flex gap-1 ml-2">
                    <button onClick={onExit} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-all"><X size={18} /></button>
                </div>

                <div className="flex gap-2 items-center bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 flex-grow mx-4">
                    <Shield size={14} className="text-primary-500" />
                    <span className="text-xs font-bold text-slate-400 truncate max-w-sm">{site.url}</span>
                    <div className="flex-grow"></div>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${status === 'Tamamlandı' ? 'bg-green-500' : 'bg-primary-500 animate-pulse'}`}></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{status}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 mr-4">
                    <button onClick={refreshPage} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><RotateCw size={18} /></button>
                </div>
            </div>

            {/* Sub-Header / Tooltip */}
            <div className="bg-primary-600/10 border-b border-primary-500/20 px-4 py-1 flex items-center justify-center gap-6">
                <div className="flex items-center gap-2 text-[10px] font-bold text-primary-400 uppercase tracking-widest">
                    <MousePointer2 size={12} /> Tıklama Aktif
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-primary-400 uppercase tracking-widest border-l border-primary-500/20 pl-6">
                    <Keyboard size={12} /> Klavye Aktif
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-primary-400 uppercase tracking-widest border-l border-primary-500/20 pl-6">
                    <Monitor size={12} /> CANLI YAYIN (VNC)
                </div>
            </div>

            {/* Browser Viewport */}
            <div
                ref={containerRef}
                className="flex-grow bg-black relative flex items-center justify-center overflow-hidden cursor-crosshair group focus:outline-none"
                onClick={(e) => handleInteraction('click', e)}
                onKeyDown={handleKey}
                tabIndex="0"
            >
                {liveFrame ? (
                    <img
                        src={liveFrame}
                        alt="Remote Browser"
                        className="w-full h-full object-contain pointer-events-none transition-opacity duration-300"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-6">
                        <div className="w-20 h-20 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-black uppercase tracking-widest">Görüntü Bekleniyor...</p>
                    </div>
                )}

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
        </div>
    );
};

export default SiteView;
