import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCw, ExternalLink, Lock, MousePointer2 } from 'lucide-react';
import api from '../api';

const SiteView = ({ siteId, user, onExit }) => {
    const [site, setSite] = useState(null);
    const [botLoading, setBotLoading] = useState(false);
    const iframeRef = useRef(null);

    useEffect(() => {
        const loadSite = async () => {
            try {
                const res = await api.get('/sites');
                const target = res.data.find(s => s.id === parseInt(siteId));
                if (target) {
                    setSite(target);
                    // Register site in proxy session
                    await api.get(`/sites/${target.id}/open`);
                }
            } catch (e) {
                console.error("Yükleme Hatası", e);
            }
        };
        loadSite();
    }, [siteId]);

    const refreshPage = () => {
        if (iframeRef.current) {
            iframeRef.current.src = iframeRef.current.src;
        }
    };

    const runBot = () => {
        if (!iframeRef.current || !site) return;
        setBotLoading(true);

        try {
            const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
            if (!iframeDoc) throw new Error("Iframe içeriğine erişilemedi.");

            // Smart Login Script Injection (DOM-based)
            const userInp = iframeDoc.querySelector('input[type="text"], input[type="email"], input[name*="user" i], input[id*="user" i]');
            const passInp = iframeDoc.querySelector('input[type="password"], input[name*="pass" i], input[id*="pass" i]');

            if (userInp && passInp) {
                userInp.value = site.site_username;
                passInp.value = site.site_password;

                // Trigger events so React/Vue sites detect the change
                const event = new Event('input', { bubbles: true });
                userInp.dispatchEvent(event);
                passInp.dispatchEvent(event);

                // Small delay before clicking enter
                setTimeout(() => {
                    passInp.focus();
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true
                    });
                    passInp.dispatchEvent(enterEvent);
                }, 500);
            } else {
                alert("Giriş formu bulunamadı. Lütfen sayfayı kontrol edin.");
            }
        } catch (e) {
            console.error("Bot Hatası:", e);
            alert("Bot hatası: " + e.message);
        } finally {
            setBotLoading(false);
        }
    };

    if (!site) return <div className="h-screen bg-slate-950 flex items-center justify-center text-white font-black italic tracking-tighter text-2xl animate-pulse">YÜKLENİYOR...</div>;

    return (
        <div className="h-screen bg-slate-950 flex flex-col text-white overflow-hidden font-sans">
            {/* Minimal Header */}
            <div className="bg-slate-900 border-b border-slate-800 p-3 flex items-center gap-4 shadow-2xl z-10">
                <button onClick={onExit} className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all bg-slate-950/50 border border-slate-800">
                    <X size={18} />
                </button>

                <div className="flex gap-3 items-center bg-slate-950 border border-slate-800 rounded-2xl px-5 py-2.5 flex-grow mx-2">
                    <Lock size={14} className="text-green-500" />
                    <span className="text-sm font-bold text-slate-300 truncate max-w-xl">{site.url}</span>
                    <div className="flex-grow"></div>
                    <div className="flex items-center gap-2 pr-2">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">GÜVENLİ TÜNEL</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {site.requires_login && (
                        <button
                            onClick={runBot}
                            disabled={botLoading}
                            className={`flex items-center gap-2 ${botLoading ? 'bg-slate-800' : 'bg-indigo-600 hover:bg-indigo-500'} px-5 py-2.5 rounded-xl font-black text-xs transition-all shadow-lg shadow-indigo-500/20 active:scale-95`}
                        >
                            <MousePointer2 size={14} /> {botLoading ? 'YÜKLENİYOR...' : 'BİLGİLERİ DOLDUR'}
                        </button>
                    )}
                    <button onClick={refreshPage} className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-400 bg-slate-950/50 border border-slate-800 transition-all active:rotate-180">
                        <RotateCw size={18} />
                    </button>
                    <a href={site.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-xl font-bold text-xs transition-all">
                        <ExternalLink size={14} />
                    </a>
                </div>
            </div>

            {/* Pure Proxy Iframe Viewport */}
            <div className="flex-grow bg-white relative">
                <iframe
                    ref={iframeRef}
                    id="tunnel-iframe"
                    src={`/tunnel/${siteId}/`}
                    className="w-full h-full border-none bg-white"
                    title="Uzak Oturum"
                    sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
                />
            </div>

            {/* Info Footer */}
            <div className="bg-slate-900/50 px-6 py-2 border-t border-slate-800/50 flex justify-between items-center">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Oturum: {user.username} | {site.name}</p>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Portal Proxy v2.0</p>
            </div>
        </div>
    );
};

export default SiteView;
